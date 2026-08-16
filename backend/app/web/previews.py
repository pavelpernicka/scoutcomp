"""Preview artifact generation using browser rendering or structural fallback.

When playwright is available, generates real PNG screenshots; otherwise
renders a styled HTML fragment suitable for an iframe preview.
"""
from __future__ import annotations

import hashlib
import html as html_lib
import json
import logging
import os
import uuid
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from ..config import settings
from ..models import WebPreviewArtifact

logger = logging.getLogger(__name__)

PREVIEW_DATA_DIR = Path(settings.app.web_media_dir).expanduser().resolve().parent / "previews"
PREVIEW_VIEWPORT = "1280x720"
PREVIEW_FORMAT = "png"
MAX_RETRIES = 3


def _source_hash(
    project_data: dict[str, Any] | None,
    css: str = "",
    *,
    base_css: str = "",
    tokens: dict[str, Any] | None = None,
    title: str = "",
) -> str:
    """Deterministic hash of project data + CSS for cache validation."""
    payload = json.dumps(
        {
            "project": project_data,
            "css": css,
            "base_css": base_css,
            "tokens": tokens or {},
            "title": title,
        },
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def _preview_storage_path(
    resource_kind: str,
    resource_id: int,
    hash_value: str,
    extension: str,
) -> str:
    return f"{resource_kind}/{resource_id}/{hash_value}.{extension}"


def stored_preview_path(storage_path: str, *, create_parent: bool = False) -> Path:
    """Resolve an artifact path inside the dedicated preview storage root."""
    relative = Path(storage_path)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError("Preview artifact path escapes its storage root")
    root = PREVIEW_DATA_DIR.expanduser().resolve()
    candidate = (root / relative).resolve()
    if not candidate.is_relative_to(root):
        raise ValueError("Preview artifact path escapes its storage root")
    if create_parent:
        candidate.parent.mkdir(parents=True, exist_ok=True)
    return candidate


def _persist_preview(storage_path: str, content: bytes) -> Path:
    """Atomically persist preview bytes before exposing the DB artifact."""
    path = stored_preview_path(storage_path, create_parent=True)
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        temporary.write_bytes(content)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)
    return path


def _artifact_out(artifact: WebPreviewArtifact) -> dict[str, Any]:
    return {
        "url": f"/api/web/preview-artifacts/{artifact.id}/file",
        "width": artifact.width,
        "height": artifact.height,
        "mime": artifact.mime,
        "status": artifact.status,
    }


def get_current_preview(
    db: Session,
    resource_kind: str,
    resource_id: int,
    *,
    source_hash: str | None = None,
) -> dict[str, Any] | None:
    """Return the latest usable preview artifact, or None."""
    query = db.query(WebPreviewArtifact).filter(
        WebPreviewArtifact.resource_kind == resource_kind,
        WebPreviewArtifact.resource_id == resource_id,
        WebPreviewArtifact.status == "current",
    )
    if source_hash is not None:
        query = query.filter(WebPreviewArtifact.source_hash == source_hash)
    artifact = query.order_by(WebPreviewArtifact.created_at.desc()).first()
    if artifact is None:
        return None
    try:
        path = stored_preview_path(artifact.storage_path)
    except ValueError:
        return None
    if not path.is_file():
        return None
    return _artifact_out(artifact)


def render_html_preview(
    db: Session,
    project_data: dict[str, Any],
    css: str = "",
    *,
    base_css: str = "",
    tokens: dict[str, Any] | None = None,
    title: str = "Preview",
) -> str:
    """Generate a self-contained HTML document suitable for iframe preview."""
    from .renderer import compile_project, render_document, render_project

    compiled = compile_project(project_data)
    linked_css: list[str] = []
    body = render_project(
        db=db,
        compiled_tree=compiled.tree,
        css_layers=linked_css,
        published_resources=False,
    )
    linked_css_text = "\n".join(linked_css)
    return render_document(
        body,
        title=title,
        css=f"{css}\n{compiled.css}\n{linked_css_text}",
        base_css=base_css,
        tokens=tokens or {},
    )


def build_preview(
    db: Session,
    resource_kind: str,
    resource_id: int,
    project_data: dict[str, Any],
    css: str = "",
    *,
    base_css: str = "",
    tokens: dict[str, Any] | None = None,
    title: str = "",
    force: bool = False,
) -> dict[str, Any]:
    """Build and persist a preview artifact synchronously.

    A browser-rendered PNG is preferred. When Playwright is unavailable, a
    structural SVG is persisted instead, so every returned artifact URL is
    physically servable. The caller owns the surrounding database transaction.
    """
    target_hash = _source_hash(
        project_data, css, base_css=base_css, tokens=tokens, title=title,
    )

    # Cache lookup must happen before current artifacts are invalidated.
    if not force:
        existing = db.query(WebPreviewArtifact).filter(
            WebPreviewArtifact.resource_kind == resource_kind,
            WebPreviewArtifact.resource_id == resource_id,
            WebPreviewArtifact.source_hash == target_hash,
            WebPreviewArtifact.status == "current",
        ).order_by(WebPreviewArtifact.created_at.desc()).first()
        if existing is not None:
            try:
                existing_path = stored_preview_path(existing.storage_path)
            except ValueError:
                existing_path = None
            if existing_path is not None and existing_path.is_file():
                return _artifact_out(existing)

    # Attempt real PNG screenshot via Playwright; fall back to SVG marker.
    try:
        preview_html = render_html_preview(
            db, project_data, css, base_css=base_css, tokens=tokens, title=title or "Preview",
        )
        png_bytes = render_png_preview(preview_html)
    except Exception as exc:  # noqa: BLE001 - structural SVG remains available
        logger.warning("HTML preview rendering failed, using SVG fallback: %s", exc)
        png_bytes = None
    if png_bytes:
        content = png_bytes
        extension = "png"
        mime = "image/png"
        width, height = 1280, 720
    else:
        content = _project_preview_svg(project_data, title=title).encode("utf-8")
        extension = "svg"
        mime = "image/svg+xml"
        width, height = 400, 300

    storage_path = _preview_storage_path(resource_kind, resource_id, target_hash, extension)
    _persist_preview(storage_path, content)

    # Only invalidate the old pointer once a replacement file exists.
    db.query(WebPreviewArtifact).filter(
        WebPreviewArtifact.resource_kind == resource_kind,
        WebPreviewArtifact.resource_id == resource_id,
        WebPreviewArtifact.status == "current",
    ).update({"status": "stale"}, synchronize_session=False)

    artifact = WebPreviewArtifact(
        resource_kind=resource_kind,
        resource_id=resource_id,
        source_hash=target_hash,
        viewport=PREVIEW_VIEWPORT,
        format=extension,
        storage_path=storage_path,
        mime=mime,
        status="current",
        width=width,
        height=height,
    )
    db.add(artifact)
    db.flush()

    return _artifact_out(artifact)


def _project_preview_svg(project_data, *, title="", width=400, height=300) -> str:
    del project_data  # Reserved for a richer structural renderer.
    label = html_lib.escape(title or "Preview")
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}">'
        f'<rect width="100%" height="100%" fill="#f3f4f6"/>'
        f'<rect x="16" y="16" width="368" height="40" rx="4" fill="#1e3a6e"/>'
        f'<text x="24" y="41" fill="#ffffff" font-family="system-ui, sans-serif" '
        f'font-size="14" font-weight="600">{label}</text>'
        f'<rect x="16" y="72" width="368" height="120" rx="4" fill="#e5e7eb"/>'
        f'<rect x="16" y="208" width="176" height="64" rx="4" fill="#d1d5db"/>'
        f'<rect x="208" y="208" width="176" height="64" rx="4" fill="#d1d5db"/>'
        f'</svg>'
    )


def project_preview_svg(project_data, *, title="", width=400, height=300):
    """Structural SVG wireframe fallback for a single project/document.

    Returns a data-URI SVG. This is a synchronous placeholder only; real
    browser-rendered previews are produced by the preview artifact pipeline.
    """
    from urllib.parse import quote

    svg = _project_preview_svg(project_data, title=title, width=width, height=height)
    return "data:image/svg+xml;charset=utf-8," + quote(svg)


def theme_preview_svg(templates, *, name="Theme", width=400, height=300):
    """Structural SVG wireframe fallback for a theme (one card per template)."""
    from urllib.parse import quote

    label = (name or "Theme").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    count = max(1, min(3, len(templates or [])))
    cards = ""
    card_width = int((width - 16 * (count + 1)) / count)
    for i in range(count):
        x = 16 + i * (card_width + 16)
        cards += (
            f'<rect x="{x}" y="64" width="{card_width}" height="120" rx="4" fill="#e5e7eb"/>'
            f'<rect x="{x}" y="192" width="{card_width}" height="32" rx="4" fill="#d1d5db"/>'
        )
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}">'
        f'<rect width="100%" height="100%" fill="#f3f4f6"/>'
        f'<text x="16" y="40" fill="#1e3a6e" font-family="system-ui, sans-serif" '
        f'font-size="16" font-weight="600">{label}</text>'
        f'{cards}'
        f'</svg>'
    )
    return "data:image/svg+xml;charset=utf-8," + quote(svg)


def render_png_preview(
    html: str,
    *,
    viewport: tuple[int, int] = (1280, 720),
    timeout_ms: int = 15000,
) -> bytes | None:
    """Render HTML to a PNG screenshot using Playwright.

    Returns PNG bytes, or None when Playwright/browsers are unavailable.
    This is a synchronous helper; callers should run it in a worker/queue
    for generation-safe, non-blocking previews.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return None

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                chromium_sandbox=False,
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
            )
            try:
                page = browser.new_page(viewport={"width": viewport[0], "height": viewport[1]})
                page.set_content(html, wait_until="networkidle")
                page.wait_for_timeout(250)
                return page.screenshot(type="png", full_page=False)
            finally:
                browser.close()
    except Exception as exc:  # noqa: BLE001 - preview is best-effort
        logger.warning("Playwright screenshot failed: %s", exc)
        return None
