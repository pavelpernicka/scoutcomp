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

from fastapi import APIRouter, Depends, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session
from unidecode import unidecode
from html import escape as html_escape

from ..config import settings
from ..dependencies import get_current_active_user, get_db
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
    restore_revision as restore_page_revision_service,
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
MAX_MEDIA_SIZE = 10 * 1024 * 1024
ALLOWED_MEDIA_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/avif": ".avif",
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
