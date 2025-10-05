from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Callable, List

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.exc import OperationalError, ProgrammingError

logger = logging.getLogger(__name__)

MigrationFn = Callable[[Connection], None]


class Migration:
    def __init__(self, identifier: str, handler: MigrationFn, description: str) -> None:
        self.identifier = identifier
        self.handler = handler
        self.description = description


def _ensure_migrations_table(conn: Connection) -> None:
    conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id TEXT PRIMARY KEY,
                applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
    )


def _migration_applied(conn: Connection, identifier: str) -> bool:
    result = conn.execute(
        text("SELECT 1 FROM schema_migrations WHERE id = :id"), {"id": identifier}
    ).fetchone()
    return result is not None


def _record_migration(conn: Connection, identifier: str) -> None:
    conn.execute(
        text("INSERT INTO schema_migrations (id, applied_at) VALUES (:id, :ts)"),
        {"id": identifier, "ts": datetime.now(timezone.utc)},
    )


def _add_completion_count_column(conn: Connection) -> None:
    inspector = inspect(conn)
    columns = {col["name"] for col in inspector.get_columns("completions")}
    if "count" in columns:
        logger.debug("Column 'count' already present on completions table")
        return
    logger.info("Adding 'count' column to completions table")
    conn.execute(text("ALTER TABLE completions ADD COLUMN count INTEGER NOT NULL DEFAULT 1"))
    conn.execute(text("UPDATE completions SET count = 1 WHERE count IS NULL"))


def _add_notification_sender_column(conn: Connection) -> None:
    inspector = inspect(conn)
    if "notifications" not in inspector.get_table_names():
        return
    columns = {col["name"] for col in inspector.get_columns("notifications")}
    if "sender_id" in columns:
        logger.debug("Column 'sender_id' already present on notifications table")
        return
    logger.info("Adding 'sender_id' column to notifications table")
    conn.execute(text("ALTER TABLE notifications ADD COLUMN sender_id INTEGER"))


def _create_group_admin_table(conn: Connection) -> None:
    inspector = inspect(conn)
    if "group_admin_teams" in inspector.get_table_names():
        logger.debug("Table 'group_admin_teams' already exists")
        return
    logger.info("Creating 'group_admin_teams' table")
    conn.execute(
        text(
            """
            CREATE TABLE group_admin_teams (
                user_id INTEGER NOT NULL,
                team_id INTEGER NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, team_id),
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE
            )
            """
        )
    )


def _create_dashboard_messages_table(conn: Connection) -> None:
    inspector = inspect(conn)
    if "dashboard_messages" in inspector.get_table_names():
        logger.debug("Table 'dashboard_messages' already exists")
        return
    logger.info("Creating 'dashboard_messages' table")
    conn.execute(
        text(
            """
            CREATE TABLE dashboard_messages (
                id INTEGER PRIMARY KEY,
                title TEXT,
                body TEXT NOT NULL,
                team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
                created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
    )


def _create_static_pages_table(conn: Connection) -> None:
    inspector = inspect(conn)
    if "static_pages" in inspector.get_table_names():
        logger.debug("Table 'static_pages' already exists")
        return
    logger.info("Creating 'static_pages' table")
    conn.execute(
        text(
            """
            CREATE TABLE static_pages (
                id INTEGER PRIMARY KEY,
                slug TEXT NOT NULL UNIQUE,
                content TEXT NOT NULL DEFAULT '',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
    )
    conn.execute(
        text(
            "INSERT INTO static_pages (slug, content) VALUES (:slug, :content)"
        ),
        {"slug": "rules", "content": ""},
    )


def _create_stat_categories_tables(conn: Connection) -> None:
    inspector = inspect(conn)
    tables = set(inspector.get_table_names())
    if "stat_categories" not in tables:
        logger.info("Creating 'stat_categories' table")
        conn.execute(
            text(
                """
                CREATE TABLE stat_categories (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL UNIQUE,
                    description TEXT,
                    icon TEXT,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
    else:
        logger.debug("Table 'stat_categories' already exists")
        columns = {col["name"] for col in inspector.get_columns("stat_categories")}
        if "icon" not in columns:
            logger.info("Adding 'icon' column to 'stat_categories'")
            conn.execute(text("ALTER TABLE stat_categories ADD COLUMN icon TEXT"))

    if "stat_category_components" not in tables:
        logger.info("Creating 'stat_category_components' table")
        conn.execute(
            text(
                """
                CREATE TABLE stat_category_components (
                    id INTEGER PRIMARY KEY,
                    category_id INTEGER NOT NULL REFERENCES stat_categories(id) ON DELETE CASCADE,
                    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                    metric TEXT NOT NULL DEFAULT 'points',
                    weight REAL NOT NULL DEFAULT 1.0,
                    position INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
    else:
        logger.debug("Table 'stat_category_components' already exists")


def _add_stat_category_icon_column(conn: Connection) -> None:
    inspector = inspect(conn)
    if "stat_categories" not in inspector.get_table_names():
        logger.debug("Table 'stat_categories' missing; icon column migration skipped")
        return
    columns = {col["name"] for col in inspector.get_columns("stat_categories")}
    if "icon" in columns:
        logger.debug("Column 'icon' already present on stat_categories")
        return
    logger.info("Adding 'icon' column to 'stat_categories' table")
    conn.execute(text("ALTER TABLE stat_categories ADD COLUMN icon TEXT"))


def _widen_stat_category_icon_column(conn: Connection) -> None:
    inspector = inspect(conn)
    if "stat_categories" not in inspector.get_table_names():
        logger.debug("Table 'stat_categories' missing; icon column resize skipped")
        return


def _fix_empty_real_names(conn: Connection) -> None:
    """Update users with empty real_name to use username as placeholder."""
    inspector = inspect(conn)
    if "users" not in inspector.get_table_names():
        logger.debug("Table 'users' missing; real_name fix skipped")
        return

    columns = {col["name"] for col in inspector.get_columns("users")}
    if "real_name" not in columns:
        logger.debug("Column 'real_name' not present; fix skipped")
        return

    logger.info("Fixing users with empty real_name fields")
    result = conn.execute(
        text("UPDATE users SET real_name = username WHERE real_name = '' OR real_name IS NULL")
    )
    logger.info(f"Updated {result.rowcount} users with empty real_name")


def _create_task_variants_table(conn: Connection) -> None:
    """Create task_variants table for task variant support."""
    inspector = inspect(conn)
    if "task_variants" in inspector.get_table_names():
        logger.debug("Table 'task_variants' already exists")
        return

    logger.info("Creating 'task_variants' table")
    conn.execute(
        text(
            """
            CREATE TABLE task_variants (
                id INTEGER PRIMARY KEY,
                task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                points REAL NOT NULL,
                position INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(task_id, name),
                UNIQUE(task_id, position)
            )
            """
        )
    )


def _add_variant_id_to_completions(conn: Connection) -> None:
    """Add variant_id column to completions table."""
    inspector = inspect(conn)
    if "completions" not in inspector.get_table_names():
        logger.debug("Table 'completions' missing; variant_id column addition skipped")
        return

    columns = {col["name"] for col in inspector.get_columns("completions")}
    if "variant_id" in columns:
        logger.debug("Column 'variant_id' already present on completions table")
        return

    logger.info("Adding 'variant_id' column to completions table")
    conn.execute(text("ALTER TABLE completions ADD COLUMN variant_id INTEGER REFERENCES task_variants(id) ON DELETE SET NULL"))
    columns = inspector.get_columns("stat_categories")
    icon_column = next((column for column in columns if column["name"] == "icon"), None)
    if not icon_column:
        logger.debug("Column 'icon' missing; nothing to widen")
        return
    column_type = str(icon_column["type"]).lower()
    if "text" in column_type and "varchar" not in column_type:
        logger.debug("Column 'icon' already stored as TEXT")
        return

    dialect = conn.dialect.name if hasattr(conn, "dialect") else conn.engine.dialect.name
    if dialect == "postgresql":
        logger.info("Altering 'stat_categories.icon' type to TEXT for PostgreSQL")
        conn.execute(text("ALTER TABLE stat_categories ALTER COLUMN icon TYPE TEXT"))
    elif dialect in {"mysql", "mariadb"}:
        logger.info("Altering 'stat_categories.icon' type to LONGTEXT for MySQL")
        conn.execute(text("ALTER TABLE stat_categories MODIFY COLUMN icon LONGTEXT"))
    else:
        logger.debug("Dialect '%s' does not require icon column alteration", dialect)


def _create_config_table(conn: Connection) -> None:
    inspector = inspect(conn)
    if "config" in inspector.get_table_names():
        logger.debug("Table 'config' already exists")
        return
    logger.info("Creating 'config' table")
    conn.execute(
        text(
            """
            CREATE TABLE config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
    )


def _add_first_login_at_column(conn: Connection) -> None:
    inspector = inspect(conn)
    columns = {col["name"] for col in inspector.get_columns("users")}
    if "first_login_at" in columns:
        logger.debug("Column 'first_login_at' already present on users table")
        return
    logger.info("Adding 'first_login_at' column to users table")
    conn.execute(text("ALTER TABLE users ADD COLUMN first_login_at TIMESTAMP"))


def _add_real_name_column(conn: Connection) -> None:
    inspector = inspect(conn)
    columns = {col["name"] for col in inspector.get_columns("users")}
    if "real_name" in columns:
        logger.debug("Column 'real_name' already present on users table")
        return
    logger.info("Adding 'real_name' column to users table")
    conn.execute(text("ALTER TABLE users ADD COLUMN real_name VARCHAR(150) NOT NULL DEFAULT ''"))


MIGRATIONS: List[Migration] = [
    Migration(
        "20240921_add_completion_count",
        _add_completion_count_column,
        "Add count column to completions",
    ),
    Migration(
        "20240921_add_notification_sender",
        _add_notification_sender_column,
        "Add sender column to notifications",
    ),
    Migration(
        "20240921_create_group_admin_teams",
        _create_group_admin_table,
        "Create mapping table for group admins",
    ),
    Migration(
        "20240922_create_dashboard_messages",
        _create_dashboard_messages_table,
        "Create dashboard messages table",
    ),
    Migration(
        "20240922_create_static_pages",
        _create_static_pages_table,
        "Create static pages table",
    ),
    Migration(
        "20240923_create_stat_categories",
        _create_stat_categories_tables,
        "Create tables for statistic categories",
    ),
    Migration(
        "20240924_add_stat_category_icon",
        _add_stat_category_icon_column,
        "Add icon column to stat categories",
    ),
    Migration(
        "20240929_widen_stat_category_icon",
        _widen_stat_category_icon_column,
        "Allow large base64 icons for stat categories",
    ),
    Migration(
        "20240923_create_config_table",
        _create_config_table,
        "Create configuration table",
    ),
    Migration(
        "20251005_add_first_login_at",
        _add_first_login_at_column,
        "Add first_login_at column to users table for password change tracking",
    ),
    Migration(
        "20251005_add_real_name",
        _add_real_name_column,
        "Add real_name column to users table",
    ),
    Migration(
        "20251005_fix_empty_real_names",
        _fix_empty_real_names,
        "Fix users with empty real_name fields",
    ),
    Migration(
        "20251005_create_task_variants",
        _create_task_variants_table,
        "Create task_variants table for task variant support",
    ),
    Migration(
        "20251005_add_variant_id_completions",
        _add_variant_id_to_completions,
        "Add variant_id column to completions table",
    ),
]


def run_migrations(engine: Engine) -> None:
    try:
        with engine.begin() as conn:
            _ensure_migrations_table(conn)
            for migration in MIGRATIONS:
                if _migration_applied(conn, migration.identifier):
                    continue
                logger.info("Applying migration %s (%s)", migration.identifier, migration.description)
                migration.handler(conn)
                _record_migration(conn, migration.identifier)
    except (OperationalError, ProgrammingError) as exc:
        logger.error("Failed to run migrations: %s", exc)
        raise
