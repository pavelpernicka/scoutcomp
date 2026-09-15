from sqlalchemy import create_engine, inspect, text

from app.migrations import _create_scout_event_teams


def test_event_team_migration_backfills_legacy_targets_idempotently():
    engine = create_engine("sqlite:///:memory:", future=True)
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE teams (id INTEGER PRIMARY KEY)"))
        connection.execute(text(
            "CREATE TABLE scout_events (id INTEGER PRIMARY KEY, team_id INTEGER REFERENCES teams(id))"
        ))
        connection.execute(text("INSERT INTO teams (id) VALUES (1), (2)"))
        connection.execute(text(
            "INSERT INTO scout_events (id, team_id) VALUES (10, 1), (11, NULL)"
        ))

        _create_scout_event_teams(connection)
        _create_scout_event_teams(connection)

        assert "scout_event_teams" in inspect(connection).get_table_names()
        assert connection.execute(text(
            "SELECT event_id, team_id FROM scout_event_teams ORDER BY event_id, team_id"
        )).all() == [(10, 1)]

    engine.dispose()


def test_event_team_migration_tolerates_pre_team_event_schema():
    engine = create_engine("sqlite:///:memory:", future=True)
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE teams (id INTEGER PRIMARY KEY)"))
        connection.execute(text("CREATE TABLE scout_events (id INTEGER PRIMARY KEY)"))

        _create_scout_event_teams(connection)

        assert "scout_event_teams" in inspect(connection).get_table_names()

    engine.dispose()
