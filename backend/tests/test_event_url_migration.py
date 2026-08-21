from sqlalchemy import create_engine, text

from app.migrations import _generalize_public_event_settings


def _config_connection(legacy_url: str):
    engine = create_engine("sqlite:///:memory:", future=True)
    connection = engine.connect()
    connection.execute(text(
        "CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT NOT NULL, "
        "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
    ))
    connection.execute(text(
        "INSERT INTO config (key, value) VALUES "
        "('web.meeting_url_pattern', :url), "
        "('web.meeting_detail_template_id', '42')"
    ), {"url": legacy_url})
    return engine, connection


def test_event_settings_migration_preserves_custom_legacy_values_and_is_idempotent():
    engine, connection = _config_connection("/schuzky/{id}")
    try:
        _generalize_public_event_settings(connection)
        _generalize_public_event_settings(connection)
        rows = dict(connection.execute(text(
            "SELECT key, value FROM config WHERE key LIKE 'web.event_%'"
        )).all())
        assert rows == {
            "web.event_detail_template_id": "42",
            "web.event_url_pattern": "/schuzky/{id}",
        }
    finally:
        connection.close()
        engine.dispose()


def test_event_settings_migration_replaces_only_the_legacy_default():
    engine, connection = _config_connection("/meeting/{id}")
    try:
        _generalize_public_event_settings(connection)
        value = connection.execute(text(
            "SELECT value FROM config WHERE key = 'web.event_url_pattern'"
        )).scalar_one()
        assert value == "/event/{id}"
    finally:
        connection.close()
        engine.dispose()
