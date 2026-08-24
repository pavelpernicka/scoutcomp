"""Authenticated CMS HTTP endpoints.

The route handlers are grouped into domain subrouters at the bottom of this
module. Domain behaviour lives in the adjacent services (pages, renderer,
data_sources, and theme_package); this module owns HTTP validation only.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, urlparse
from xml.etree import ElementTree

from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session
from unidecode import unidecode
from html import escape as html_escape

from ..config import settings
from ..dependencies import get_current_active_user, get_db, get_optional_current_active_user
from ..models import (
    Config,
    RegisteredModule,
    ScoutAttendance,
    ScoutEvent,
    User,
    WebMedia,
    WebMediaFolder,
    WebMenu,
    WebMenuItem,
    WebMenuRevision,
    WebPage,
    WebPageRevision,
    WebPost,
    WebPostRevision,
    WebReusableComponent,
    WebSection,
    WebPattern,
    WebSiteStyle,
    WebTemplate,
    WebTheme,
    WebThemeVersion,
)
from ..modules import registry
from ..permissions import permission_keys
from ..routers.config import get_config_value, set_config_value
from ..web_defaults import DEFAULT_PAGES, DEFAULT_TEMPLATES
from ..web.pages import (
    _project_root_component,
    _project_assets,
    _project_styles,
    build_path,
    compile_draft,
    project_data as canonical_project_data,
    publish_page,
    normalise_path_segment,
    rebuild_published_page_artifacts,
    restore_revision as restore_page_revision_service,
    restore_trashed_page,
    save_draft,
    serialize_page as serialize_cms_page,
    slugify as cms_slugify,
    trash_page,
    unique_legacy_slug,
    unique_segment,
    validate_parent,
    validate_template_usage,
)
from ..web.renderer import CompileError, compile_project, render_document, render_project
from ..web_render import render_article_body

COMPONENT_TAG = "scoutcomp-web-component"
MAX_MEDIA_SIZE = 15 * 1024 * 1024
ALLOWED_MEDIA_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/avif": ".avif",
    "image/svg+xml": ".svg",
    "application/pdf": ".pdf",
    "application/zip": ".zip",
    "text/csv": ".csv",
    "text/plain": ".txt",
}

_MEDIA_TYPE_ALIASES = {
    "application/x-zip": "application/zip",
    "application/x-zip-compressed": "application/zip",
    "application/vnd.ms-excel": "text/csv",
    "image/svg": "image/svg+xml",
    "text/comma-separated-values": "text/csv",
}
_SVG_FORBIDDEN_ELEMENTS = {
    "audio", "embed", "foreignobject", "iframe", "object", "script", "video",
}


def _sniff_image(content: bytes) -> str | None:
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if content.startswith(b"RIFF") and content[8:12] == b"WEBP":
        return "image/webp"
    if len(content) >= 12 and content[4:12] in {b"ftypavif", b"ftypavis"}:
        return "image/avif"
    return None


def _is_safe_svg(content: bytes) -> bool:
    """Accept passive SVG images while rejecting executable/external content."""
    lowered = content[:4096].lower()
    if b"<!doctype" in lowered or b"<!entity" in lowered:
        return False
    try:
        root = ElementTree.fromstring(content)
    except (ElementTree.ParseError, ValueError):
        return False
    if root.tag.rsplit("}", 1)[-1].lower() != "svg":
        return False
    for element in root.iter():
        local_name = element.tag.rsplit("}", 1)[-1].lower()
        if local_name in _SVG_FORBIDDEN_ELEMENTS:
            return False
        if local_name == "style":
            style_text = "".join(element.itertext()).lower()
            if "url(" in style_text or "@import" in style_text:
                return False
        for raw_name, raw_value in element.attrib.items():
            name = raw_name.rsplit("}", 1)[-1].lower()
            value = str(raw_value).strip().lower()
            if name.startswith("on"):
                return False
            if name in {"href", "src"} and value and not value.startswith("#"):
                return False
            if name == "style" and ("url(" in value or "@import" in value):
                return False
    return True


def _sniff_media(content: bytes) -> str | None:
    image_type = _sniff_image(content)
    if image_type:
        return image_type
    if content.startswith(b"%PDF-"):
        return "application/pdf"
    if content.startswith((b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")):
        return "application/zip"
    stripped = content.lstrip(b"\xef\xbb\xbf\t\r\n ")
    if stripped.startswith(b"<") and _is_safe_svg(content):
        return "image/svg+xml"
    try:
        text_content = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        return None
    if any(ord(character) < 32 and character not in "\t\r\n" for character in text_content):
        return None
    return "text/plain"


def _resolve_media_type(content: bytes, announced: str, filename: str | None) -> str | None:
    """Match browser metadata to a content signature without trusting filenames."""
    detected = _sniff_media(content)
    announced = _MEDIA_TYPE_ALIASES.get(announced, announced)
    suffix = Path(filename or "").suffix.lower()
    if detected == "text/plain":
        if announced == "text/csv" or suffix == ".csv":
            return (
                "text/csv"
                if announced in {"text/csv", "text/plain", "application/octet-stream"}
                else None
            )
        return "text/plain" if announced in {"text/plain", "application/octet-stream"} else None
    if detected == "image/svg+xml":
        return (
            detected
            if announced
            in {
                "image/svg+xml",
                "text/xml",
                "application/xml",
                "text/plain",
                "application/octet-stream",
            }
            else None
        )
    if detected == "application/pdf":
        return detected if announced == detected or (
            announced == "application/octet-stream" and suffix == ".pdf"
        ) else None
    if detected == "application/zip":
        return detected if announced == detected or (
            announced == "application/octet-stream" and suffix == ".zip"
        ) else None
    return detected if detected and detected == announced else None


def _stored_media_path(record: WebMedia) -> Path:
    root = _media_dir()
    candidate = (root / record.path).resolve()
    if not candidate.is_relative_to(root) or candidate.is_symlink():
        raise HTTPException(404, "Media file is missing")
    return candidate

SITE_SETTING_KEYS = (
    "web.site_title",
    "web.site_tagline",
    "web.site_meta",
    "web.site_logo",
    "web.contact_address",
    "web.contact_phone",
    "web.contact_email",
    "web.contact_meeting_time",
    "web.social_facebook",
    "web.social_instagram",
    "web.social_whatsapp",
    "web.post_url_pattern",
    "web.event_url_pattern",
    "web.meeting_url_pattern",
    "web.post_detail_template_id",
    "web.event_detail_template_id",
    "web.meeting_detail_template_id",
)

def _slugify(value: str) -> str:
    value = unidecode(value.strip().lower())
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = value.strip("-")
    return value or "stranka"


def _media_dir() -> Path:
    path = Path(settings.app.web_media_dir).expanduser().resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path


def _require_read(db: Session, user: User) -> None:
    if "web.read" not in permission_keys(db, user):
        raise HTTPException(403, "Missing permission")


def _require_manage(db: Session, user: User) -> None:
    if "web.manage" not in permission_keys(db, user):
        raise HTTPException(403, "Missing permission")


def _require_action(db: Session, user: User, action: str) -> None:
    """Enforce an explicit CMS action.

    Cross-module compatibility must be handled by the route that owns the
    resource.  In particular, ``web.publish`` also grants page publication and
    must never be implied by the narrower post-publishing permission.
    """
    if action not in permission_keys(db, user):
        raise HTTPException(403, f"Missing {action}")


def _serialize_page(page: WebPage) -> dict:
    return serialize_cms_page(page)


def _list_web_components(db: Session, user: User, enabled_only: bool = True) -> list[dict]:
    """Components declared by enabled modules, filtered by the caller's permissions."""
    registry.seed(db)
    permissions = permission_keys(db, user)
    records = {m.code: m for m in db.query(RegisteredModule).filter_by(enabled=True, installed=True)}
    result = []
    for manifest in registry.manifests():
        if enabled_only and manifest.code not in records:
            continue
        for item in manifest.web_components:
            if item.get("permission") and item["permission"] not in permissions:
                continue
            result.append(dict(item, id=item.get("id") or f"{manifest.code}.{item.get('component')}", module=manifest.code))
    return result


def _extract_components(html: str | None) -> list[dict]:
    if not html:
        return []
    pattern = re.compile(
        rf"<{COMPONENT_TAG}([^>]*)>\s*</{COMPONENT_TAG}>", re.IGNORECASE
    )
    components = []
    for match in pattern.finditer(html):
        attributes = match.group(1)
        component = re.search(r'data-component="([^"]+)"', attributes)
        if not component:
            continue
        params: dict[str, str] = {}
        for key, value in re.findall(r'data-([a-zA-Z0-9_-]+)="([^"]*)"', attributes):
            if key in {"component"}:
                continue
            params[key.replace("-", "_")] = value
        components.append({"component": component.group(1), "params": params})
    return components



__all__ = [name for name in globals() if not name.startswith("__")]
