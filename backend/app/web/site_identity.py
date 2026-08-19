"""Validated public-site identity helpers shared by admin and rendering."""
from __future__ import annotations

import re


DEFAULT_TITLE_PATTERN = "{page} | {site}"
_TITLE_TOKEN = re.compile(r"\{([a-z_][a-z0-9_]*)\}", re.I)
_ALLOWED_TITLE_TOKENS = {"page", "site"}


def validate_title_pattern(value: str | None) -> str:
    pattern = (value or DEFAULT_TITLE_PATTERN).strip()
    if not pattern or len(pattern) > 160 or any(ord(char) < 32 for char in pattern):
        raise ValueError("Page title pattern must contain 1 to 160 printable characters")
    tokens = set(_TITLE_TOKEN.findall(pattern))
    unknown = tokens - _ALLOWED_TITLE_TOKENS
    if unknown:
        raise ValueError(f"Unknown page title placeholder: {{{sorted(unknown)[0]}}}")
    # Reject unmatched braces as well as a static value that would give every
    # page the same browser title.
    stripped = _TITLE_TOKEN.sub("", pattern)
    if "{" in stripped or "}" in stripped or not tokens:
        raise ValueError("Page title pattern must use {page} and/or {site}")
    return pattern


def format_document_title(page_title: str, site_title: str, pattern: str | None) -> str:
    try:
        clean_pattern = validate_title_pattern(pattern)
    except ValueError:
        clean_pattern = DEFAULT_TITLE_PATTERN
    values = {"page": (page_title or site_title).strip(), "site": site_title.strip()}
    rendered = _TITLE_TOKEN.sub(lambda match: values[match.group(1).lower()], clean_pattern)
    return re.sub(r"\s+", " ", rendered).strip()[:300] or values["page"] or "ScoutComp"


def public_asset_url(value: str | None) -> str:
    """Map an authenticated media picker URL to its public equivalent."""
    return (value or "").strip().replace("/api/web/media/", "/media/")
