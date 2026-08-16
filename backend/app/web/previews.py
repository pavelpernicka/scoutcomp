"""Preview artifact generation using browser rendering or structural fallback.

When playwright is available, generates real PNG screenshots; otherwise
renders a styled HTML fragment suitable for an iframe preview.
"""
from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from ..models import WebPreviewArtifact, WebMedia

logger = logging.getLogger(__name__)

PREVIEW_DATA_DIR = Path("data/previews")
PREVIEW_VIEWPORT = "1280x720"
PREVIEW_FORMAT = "png"
MAX_RETRIES = 3


def _source_hash(project_data: dict[str, Any] | None, css: str = "") -> str:
    """Deterministic hash of project data + CSS for cache validation."""
    payload = json.dumps({"project": project_data, "css": css}, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode()).hexdigest()


def _preview_storage_path(resource_kind: str, resource_id: int, hash_value: str) -> str:
    return f"previews/{resource_kind}/{resource_id}/{hash_value}.png"


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
    return {
        "url": f"/api/web/preview-artifacts/{artifact.id}/file",
        "width": artifact.width,
        "height": artifact.height,
        "mime": artifact.mime,
        "status": artifact.status,
    }


def render_html_preview(
    project_data: dict[str, Any],
    css: str = "",
    *,
    base_css: str = "",
    tokens: dict[str, Any] | None = None,
) -> str:
    """Generate a self-contained HTML document suitable for iframe preview."""
    from .renderer import compile_project, render_document, render_project

    compiled = compile_project(project_data)
    body = render_project(
        db=None,  # no DB for preview; linked resources render as empty
        compiled_tree=compiled.tree,
        published_resources=False,
    )
    return render_document(
        body,
        title="Preview",
        css=f"{base_css}\n{css}\n{compiled.css}",
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
) -> dict[str, Any]:
    """Build a new preview artifact synchronously (HTML-only; no Playwright yet).

    Atomically marks old artifacts as stale, creates a new one, and returns
    its metadata. Callers should handle the structural SVG fallback when this
    returns None or the artifact has status=failed.
    """
    target_hash = _source_hash(project_data, css)

    # Mark existing current as stale
    db.query(WebPreviewArtifact).filter(
        WebPreviewArtifact.resource_kind == resource_kind,
        WebPreviewArtifact.resource_id == resource_id,
        WebPreviewArtifact.status == "current",
    ).update({"status": "stale"}, synchronize_session=False)

    # Check if a current artifact with this hash already exists
    existing = db.query(WebPreviewArtifact).filter(
        WebPreviewArtifact.resource_kind == resource_kind,
        WebPreviewArtifact.resource_id == resource_id,
        WebPreviewArtifact.source_hash == target_hash,
        WebPreviewArtifact.status == "current",
    ).first()
    if existing:
        return {
            "url": f"/api/web/preview-artifacts/{existing.id}/file",
            "width": existing.width,
            "height": existing.height,
            "mime": existing.mime,
            "status": "current",
        }

    # Attempt real PNG screenshot via Playwright; fall back to SVG marker.
    html = render_html_preview(project_data, css, base_css=base_css, tokens=tokens)
    png_bytes = render_png_preview(html)
    mime = "image/png" if png_bytes else "image/svg+xml"
    storage_path = _preview_storage_path(resource_kind, resource_id, target_hash)

    if png_bytes:
        path = Path(storage_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(png_bytes)

    artifact = WebPreviewArtifact(
        resource_kind=resource_kind,
        resource_id=resource_id,
        source_hash=target_hash,
        viewport=PREVIEW_VIEWPORT,
        format=PREVIEW_FORMAT if png_bytes else "svg",
        storage_path=storage_path,
        mime=mime,
        status="current",
        width=1280 if png_bytes else None,
        height=720 if png_bytes else None,
    )
    db.add(artifact)
    db.flush()

    return {
        "url": f"/api/web/preview-artifacts/{artifact.id}/file",
        "width": artifact.width,
        "height": artifact.height,
        "mime": artifact.mime,
        "status": "current",
    }


def project_preview_svg(project_data, *, title="", width=400, height=300):
    """Structural SVG wireframe fallback for a single project/document.

    Returns a data-URI SVG. This is a synchronous placeholder only; real
    browser-rendered previews are produced by the preview artifact pipeline.
    """
    from urllib.parse import quote

    label = (title or "Preview").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    svg = (
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
