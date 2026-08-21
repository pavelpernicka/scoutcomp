"""Shared conversion helpers for the application's UTC storage contract."""
from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .config import settings


def application_timezone() -> ZoneInfo:
    """Return the configured IANA timezone, failing safely to Europe/Prague."""
    name = getattr(settings.app, "timezone", "Europe/Prague")
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("Europe/Prague")


def utc_storage_to_local(value: datetime | None) -> datetime | None:
    """Interpret naive database datetimes as UTC and convert them for display."""
    if value is None:
        return None
    source = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
    return source.astimezone(application_timezone())


def local_to_utc_storage(value: datetime | None) -> datetime | None:
    """Convert a local wall-clock boundary to the naive UTC database format."""
    if value is None:
        return None
    source = value.replace(tzinfo=application_timezone()) if value.tzinfo is None else value
    return source.astimezone(timezone.utc).replace(tzinfo=None)
