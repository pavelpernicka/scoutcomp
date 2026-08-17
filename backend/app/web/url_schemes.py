"""Validated, site-configurable URL schemes for public CMS content."""
from __future__ import annotations

import re
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..routers.config import get_config_value


DEFAULT_POST_URL_PATTERN = "/post/{slug}"
DEFAULT_MEETING_URL_PATTERN = "/meeting/{id}"
_STATIC_SEGMENT = re.compile(r"^[A-Za-z0-9_./{}-]{1,300}$")


def validate_url_pattern(value: str | None, placeholder: str, *, label: str) -> str:
    pattern = (value or "").strip() or (DEFAULT_POST_URL_PATTERN if placeholder == "slug" else DEFAULT_MEETING_URL_PATTERN)
    token = "{" + placeholder + "}"
    if not pattern.startswith("/") or pattern.count(token) != 1 or not _STATIC_SEGMENT.fullmatch(pattern):
        raise HTTPException(422, f"{label} URL schema is invalid")
    if "//" in pattern or any(item in pattern for item in ("?", "#", "..")):
        raise HTTPException(422, f"{label} URL schema is invalid")
    return pattern


def _pattern(db: Session, key: str, default: str, placeholder: str, label: str) -> str:
    configured = get_config_value(db, key)
    return validate_url_pattern(configured or default, placeholder, label=label)


def post_url(db: Session, slug: str) -> str:
    return _pattern(db, "web.post_url_pattern", DEFAULT_POST_URL_PATTERN, "slug", "Article").replace("{slug}", slug)


def meeting_url(db: Session, event_id: int) -> str:
    return _pattern(db, "web.meeting_url_pattern", DEFAULT_MEETING_URL_PATTERN, "id", "Meeting").replace("{id}", str(event_id))


def match_pattern(db: Session, key: str, default: str, placeholder: str, path: str, *, label: str) -> str | None:
    pattern = _pattern(db, key, default, placeholder, label)
    token = "{" + placeholder + "}"
    before, after = pattern.split(token)
    if not path.startswith(before) or not path.endswith(after):
        return None
    value = path[len(before):len(path) - len(after) if after else None]
    if not value or "/" in value:
        return None
    if placeholder == "id" and not value.isdigit():
        return None
    if placeholder == "slug" and not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,199}", value):
        return None
    return value
