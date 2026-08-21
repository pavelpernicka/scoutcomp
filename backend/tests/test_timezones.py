from datetime import datetime

from app.timezones import local_to_utc_storage, utc_storage_to_local


def test_utc_storage_uses_prague_dst_for_public_display():
    winter = utc_storage_to_local(datetime(2026, 1, 20, 18, 0))
    summer = utc_storage_to_local(datetime(2026, 8, 20, 22, 0))

    assert winter.isoformat() == "2026-01-20T19:00:00+01:00"
    assert summer.isoformat() == "2026-08-21T00:00:00+02:00"


def test_local_calendar_boundaries_are_compared_as_utc_storage_values():
    assert local_to_utc_storage(datetime(2026, 8, 1, 0, 0)) == datetime(2026, 7, 31, 22, 0)
