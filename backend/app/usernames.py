"""Shared username invariant and legacy-data normalization."""
from __future__ import annotations

import re

USERNAME_PATTERN = r"^[a-z0-9._-]{3,64}$"
USERNAME_RE = re.compile(USERNAME_PATTERN)
USERNAME_HELP = "Username may contain only lowercase letters, numbers, dots, hyphens and underscores"


def is_canonical_username(value: str | None) -> bool:
    return bool(value and USERNAME_RE.fullmatch(value))


def normalize_legacy_username(value: str | None, user_id: int | None = None) -> str:
    """Make a stored legacy value safe for the current username contract.

    This deliberately follows the client-side member-directory normalization:
    lowercase ASCII characters plus ``.``/``_``/``-`` are retained, all other
    characters are removed.  The ID fallback keeps even an empty legacy value
    usable in API responses and data migrations.
    """
    normalized = re.sub(r"[^a-z0-9._-]", "", (value or "").lower())[:64]
    if len(normalized) >= 3:
        return normalized
    return f"user-{user_id}" if user_id is not None else "user"
