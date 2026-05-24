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


def _add_hot_deal_column(conn: Connection) -> None:
    """Add hot_deal column to tasks table."""
    inspector = inspect(conn)
    if "tasks" not in inspector.get_table_names():
        logger.debug("Table 'tasks' missing; hot_deal column addition skipped")
        return

    columns = {col["name"] for col in inspector.get_columns("tasks")}
    if "hot_deal" in columns:
        logger.debug("Column 'hot_deal' already present on tasks table")
        return

    logger.info("Adding 'hot_deal' column to tasks table")
    conn.execute(text("ALTER TABLE tasks ADD COLUMN hot_deal BOOLEAN NOT NULL DEFAULT FALSE"))


def _add_task_auto_close_columns(conn: Connection) -> None:
    inspector = inspect(conn)
    if "tasks" not in inspector.get_table_names():
        logger.debug("Table 'tasks' missing; auto-close columns addition skipped")
        return

    columns = {col["name"] for col in inspector.get_columns("tasks")}
    if "auto_close_after_completions" not in columns:
        logger.info("Adding 'auto_close_after_completions' column to tasks table")
        conn.execute(text("ALTER TABLE tasks ADD COLUMN auto_close_after_completions INTEGER"))
    if "auto_close_scope" not in columns:
        logger.info("Adding 'auto_close_scope' column to tasks table")
        conn.execute(text("ALTER TABLE tasks ADD COLUMN auto_close_scope VARCHAR(16)"))
    if "auto_closed_at" not in columns:
        logger.info("Adding 'auto_closed_at' column to tasks table")
        conn.execute(text("ALTER TABLE tasks ADD COLUMN auto_closed_at TIMESTAMP"))
    if "auto_close_reset_at" not in columns:
        logger.info("Adding 'auto_close_reset_at' column to tasks table")
        conn.execute(text("ALTER TABLE tasks ADD COLUMN auto_close_reset_at TIMESTAMP"))


def _create_task_team_closures_table(conn: Connection) -> None:
    inspector = inspect(conn)
    if "task_team_closures" in inspector.get_table_names():
        logger.debug("Table 'task_team_closures' already exists")
        return

    logger.info("Creating 'task_team_closures' table")
    conn.execute(
        text(
            """
            CREATE TABLE task_team_closures (
                id INTEGER PRIMARY KEY,
                task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
                closed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(task_id, team_id)
            )
            """
        )
    )


def _add_task_auto_close_reset_column(conn: Connection) -> None:
    inspector = inspect(conn)
    if "tasks" not in inspector.get_table_names():
        logger.debug("Table 'tasks' missing; auto_close_reset_at column addition skipped")
        return

    columns = {col["name"] for col in inspector.get_columns("tasks")}
    if "auto_close_reset_at" in columns:
        logger.debug("Column 'auto_close_reset_at' already present on tasks table")
        return

    logger.info("Adding 'auto_close_reset_at' column to tasks table")
    conn.execute(text("ALTER TABLE tasks ADD COLUMN auto_close_reset_at TIMESTAMP"))


def _create_inventory_tables(conn: Connection) -> None:
    inspector = inspect(conn)
    tables = set(inspector.get_table_names())

    if "inventory_flags" not in tables:
        conn.execute(
            text(
                """
                CREATE TABLE inventory_flags (
                    id INTEGER PRIMARY KEY,
                    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
                    name VARCHAR(120) NOT NULL,
                    description TEXT,
                    color VARCHAR(32) NOT NULL DEFAULT 'neutral',
                    is_system BOOLEAN NOT NULL DEFAULT 0,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_flags_team_id ON inventory_flags(team_id)"))
        tables.add("inventory_flags")

    if "inventory_items" not in tables:
        conn.execute(
            text(
                """
                CREATE TABLE inventory_items (
                    id INTEGER PRIMARY KEY,
                    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
                    name VARCHAR(200) NOT NULL,
                    description TEXT,
                    category VARCHAR(120),
                    flag_id INTEGER REFERENCES inventory_flags(id) ON DELETE SET NULL,
                    quantity INTEGER NOT NULL DEFAULT 1,
                    quantity_unit VARCHAR(32) NOT NULL DEFAULT 'ks',
                    default_location VARCHAR(200),
                    current_location VARCHAR(200),
                    status VARCHAR(32) NOT NULL DEFAULT 'available',
                    notes TEXT,
                    qr_identifier VARCHAR(64) NOT NULL UNIQUE,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_items_team_id ON inventory_items(team_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_items_name ON inventory_items(name)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_items_category ON inventory_items(category)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_items_flag_id ON inventory_items(flag_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_items_qr_identifier ON inventory_items(qr_identifier)"))

    if "inventory_photos" not in tables:
        conn.execute(
            text(
                """
                CREATE TABLE inventory_photos (
                    id INTEGER PRIMARY KEY,
                    item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
                    image_url TEXT NOT NULL,
                    caption VARCHAR(200),
                    position INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )

    if "inventory_events" not in tables:
        conn.execute(
            text(
                """
                CREATE TABLE inventory_events (
                    id INTEGER PRIMARY KEY,
                    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
                    name VARCHAR(200) NOT NULL,
                    start_date TIMESTAMP,
                    end_date TIMESTAMP,
                    note TEXT,
                    status VARCHAR(32) NOT NULL DEFAULT 'planned',
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )

    if "inventory_event_items" not in tables:
        conn.execute(
            text(
                """
                CREATE TABLE inventory_event_items (
                    id INTEGER PRIMARY KEY,
                    event_id INTEGER NOT NULL REFERENCES inventory_events(id) ON DELETE CASCADE,
                    item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
                    planned_quantity INTEGER NOT NULL DEFAULT 1,
                    returned_quantity INTEGER NOT NULL DEFAULT 0,
                    damaged_quantity INTEGER NOT NULL DEFAULT 0,
                    note TEXT,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(event_id, item_id)
                )
                """
            )
        )

    if "inventory_loans" not in tables:
        conn.execute(
            text(
                """
                CREATE TABLE inventory_loans (
                    id INTEGER PRIMARY KEY,
                    item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
                    borrower_name VARCHAR(200) NOT NULL,
                    borrowed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    due_at TIMESTAMP,
                    returned_at TIMESTAMP,
                    quantity INTEGER NOT NULL DEFAULT 1,
                    note TEXT
                )
                """
            )
        )

    if "inventory_history" not in tables:
        conn.execute(
            text(
                """
                CREATE TABLE inventory_history (
                    id INTEGER PRIMARY KEY,
                    item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
                    event_id INTEGER REFERENCES inventory_events(id) ON DELETE SET NULL,
                    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    action VARCHAR(32) NOT NULL,
                    payload JSON,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )

    if "inventory_event_scans" not in tables:
        conn.execute(
            text(
                """
                CREATE TABLE inventory_event_scans (
                    id INTEGER PRIMARY KEY,
                    event_id INTEGER NOT NULL REFERENCES inventory_events(id) ON DELETE CASCADE,
                    item_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL,
                    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    qr_identifier VARCHAR(64) NOT NULL,
                    result VARCHAR(32) NOT NULL DEFAULT 'returned',
                    condition VARCHAR(32),
                    note TEXT,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )

    if "inventory_label_templates" not in tables:
        conn.execute(
            text(
                """
                CREATE TABLE inventory_label_templates (
                    id INTEGER PRIMARY KEY,
                    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
                    name VARCHAR(200) NOT NULL,
                    width_mm REAL NOT NULL DEFAULT 62,
                    height_mm REAL NOT NULL DEFAULT 29,
                    qr_x_mm REAL NOT NULL DEFAULT 3,
                    qr_y_mm REAL NOT NULL DEFAULT 3,
                    qr_size_mm REAL NOT NULL DEFAULT 18,
                    title_font_size REAL NOT NULL DEFAULT 14,
                    meta_font_size REAL NOT NULL DEFAULT 9,
                    fields JSON NOT NULL DEFAULT '[]',
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )

    if "inventory_locations" not in tables:
        conn.execute(
            text(
                """
                CREATE TABLE inventory_locations (
                    id INTEGER PRIMARY KEY,
                    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
                    parent_id INTEGER REFERENCES inventory_locations(id) ON DELETE CASCADE,
                    name VARCHAR(200) NOT NULL,
                    description TEXT,
                    path VARCHAR(500) NOT NULL,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_locations_team_id ON inventory_locations(team_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_locations_parent_id ON inventory_locations(parent_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_locations_path ON inventory_locations(path)"))

    if "inventory_categories" not in tables:
        conn.execute(
            text(
                """
                CREATE TABLE inventory_categories (
                    id INTEGER PRIMARY KEY,
                    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
                    parent_id INTEGER REFERENCES inventory_categories(id) ON DELETE CASCADE,
                    name VARCHAR(200) NOT NULL,
                    description TEXT,
                    path VARCHAR(500) NOT NULL,
                    color VARCHAR(16) NOT NULL DEFAULT '#5b8def',
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_categories_team_id ON inventory_categories(team_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_categories_parent_id ON inventory_categories(parent_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_categories_path ON inventory_categories(path)"))


def _extend_inventory_items_with_unit(conn: Connection) -> None:
    inspector = inspect(conn)
    if "inventory_items" not in inspector.get_table_names():
        return
    columns = {col["name"] for col in inspector.get_columns("inventory_items")}
    if "quantity_unit" in columns:
        return
    conn.execute(text("ALTER TABLE inventory_items ADD COLUMN quantity_unit VARCHAR(32) NOT NULL DEFAULT 'ks'"))


def _extend_inventory_categories_and_flags(conn: Connection) -> None:
    inspector = inspect(conn)
    tables = set(inspector.get_table_names())

    if "inventory_categories" in tables:
        category_columns = {col["name"] for col in inspector.get_columns("inventory_categories")}
        if "description" not in category_columns:
            conn.execute(text("ALTER TABLE inventory_categories ADD COLUMN description TEXT"))
        if "color" not in category_columns:
            conn.execute(text("ALTER TABLE inventory_categories ADD COLUMN color VARCHAR(16) NOT NULL DEFAULT '#5b8def'"))

    if "inventory_flags" not in tables:
        conn.execute(
            text(
                """
                CREATE TABLE inventory_flags (
                    id INTEGER PRIMARY KEY,
                    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
                    name VARCHAR(120) NOT NULL,
                    description TEXT,
                    color VARCHAR(32) NOT NULL DEFAULT 'neutral',
                    is_system BOOLEAN NOT NULL DEFAULT 0,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_flags_team_id ON inventory_flags(team_id)"))

    if "inventory_items" in tables:
        item_columns = {col["name"] for col in inspector.get_columns("inventory_items")}
        if "flag_id" not in item_columns:
            conn.execute(text("ALTER TABLE inventory_items ADD COLUMN flag_id INTEGER REFERENCES inventory_flags(id) ON DELETE SET NULL"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_items_flag_id ON inventory_items(flag_id)"))

    if "inventory_flags" in inspector.get_table_names():
        flag_columns = {col["name"] for col in inspector.get_columns("inventory_flags")}
        if "color" in flag_columns:
            conn.execute(text("UPDATE inventory_flags SET color = 'neutral' WHERE color IS NULL OR color = ''"))
            conn.execute(text("UPDATE inventory_flags SET color = 'neutral' WHERE color = '#6c757d' OR color = 'secondary'"))
            conn.execute(text("UPDATE inventory_flags SET color = 'mismatch' WHERE color = '#dc3545' OR color = 'danger'"))
            conn.execute(text("UPDATE inventory_flags SET color = 'match' WHERE color = 'success'"))
            conn.execute(text("UPDATE inventory_flags SET color = 'loan' WHERE color = 'warning'"))
            conn.execute(text("UPDATE inventory_flags SET color = 'event' WHERE color = 'info' OR color = 'primary'"))


def _add_inventory_category_and_flag_descriptions(conn: Connection) -> None:
    inspector = inspect(conn)
    tables = set(inspector.get_table_names())

    if "inventory_categories" in tables:
        category_columns = {col["name"] for col in inspector.get_columns("inventory_categories")}
        if "description" not in category_columns:
            conn.execute(text("ALTER TABLE inventory_categories ADD COLUMN description TEXT"))

    if "inventory_flags" in tables:
        flag_columns = {col["name"] for col in inspector.get_columns("inventory_flags")}
        if "description" not in flag_columns:
            conn.execute(text("ALTER TABLE inventory_flags ADD COLUMN description TEXT"))
        if "color" in flag_columns:
            conn.execute(text("UPDATE inventory_flags SET color = 'neutral' WHERE color IS NULL OR color = ''"))
            conn.execute(text("UPDATE inventory_flags SET color = 'neutral' WHERE color = '#6c757d' OR color = 'secondary'"))
            conn.execute(text("UPDATE inventory_flags SET color = 'mismatch' WHERE color = '#dc3545' OR color = 'danger'"))
            conn.execute(text("UPDATE inventory_flags SET color = 'match' WHERE color = 'success'"))
            conn.execute(text("UPDATE inventory_flags SET color = 'loan' WHERE color = 'warning'"))
            conn.execute(text("UPDATE inventory_flags SET color = 'event' WHERE color = 'info' OR color = 'primary'"))


def _add_inventory_location_descriptions(conn: Connection) -> None:
    inspector = inspect(conn)
    tables = set(inspector.get_table_names())
    if "inventory_locations" in tables:
        location_columns = {col["name"] for col in inspector.get_columns("inventory_locations")}
        if "description" not in location_columns:
            conn.execute(text("ALTER TABLE inventory_locations ADD COLUMN description TEXT"))

    if "teams" not in tables or "inventory_flags" not in inspector.get_table_names():
        return

    team_ids = [row[0] for row in conn.execute(text("SELECT id FROM teams")).fetchall()]
    for team_id in team_ids:
        existing = {
            row[0]: row[1]
            for row in conn.execute(
                text("SELECT name, id FROM inventory_flags WHERE team_id = :team_id"),
                {"team_id": team_id},
            ).fetchall()
        }
        defaults = [
            ("OK", "#6c757d", 0),
            ("Potřebuje opravu", "#dc3545", 1),
        ]
        for name, color, sort_order in defaults:
            if name not in existing:
                conn.execute(
                    text(
                        """
                        INSERT INTO inventory_flags (team_id, name, color, sort_order, created_at, updated_at)
                        VALUES (:team_id, :name, :color, :sort_order, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        """
                    ),
                    {"team_id": team_id, "name": name, "color": color, "sort_order": sort_order},
                )

        ok_flag_id = conn.execute(
            text("SELECT id FROM inventory_flags WHERE team_id = :team_id AND name = 'OK' ORDER BY id LIMIT 1"),
            {"team_id": team_id},
        ).scalar()
        repair_flag_id = conn.execute(
            text("SELECT id FROM inventory_flags WHERE team_id = :team_id AND name = 'Potřebuje opravu' ORDER BY id LIMIT 1"),
            {"team_id": team_id},
        ).scalar()
        if repair_flag_id is not None:
            conn.execute(
                text(
                    """
                    UPDATE inventory_items
                    SET flag_id = :flag_id
                    WHERE team_id = :team_id
                      AND flag_id IS NULL
                      AND status IN ('maintenance', 'damaged')
                    """
                ),
                {"team_id": team_id, "flag_id": repair_flag_id},
            )
        if ok_flag_id is not None:
            conn.execute(
                text(
                    """
                    UPDATE inventory_items
                    SET flag_id = :flag_id
                    WHERE team_id = :team_id
                      AND flag_id IS NULL
                    """
                ),
                {"team_id": team_id, "flag_id": ok_flag_id},
            )


def _add_inventory_system_flags(conn: Connection) -> None:
    inspector = inspect(conn)
    if "inventory_flags" not in inspector.get_table_names():
        return

    flag_columns = {col["name"] for col in inspector.get_columns("inventory_flags")}
    if "is_system" not in flag_columns:
        conn.execute(text("ALTER TABLE inventory_flags ADD COLUMN is_system BOOLEAN NOT NULL DEFAULT 0"))

    conn.execute(text("UPDATE inventory_flags SET is_system = 1 WHERE lower(trim(name)) = 'došlo'"))

    if "teams" not in inspector.get_table_names():
        return

    team_ids = [row[0] for row in conn.execute(text("SELECT id FROM teams")).fetchall()]
    for team_id in team_ids:
        sold_out_flag_id = conn.execute(
            text("SELECT id FROM inventory_flags WHERE team_id = :team_id AND lower(trim(name)) = 'došlo' ORDER BY id LIMIT 1"),
            {"team_id": team_id},
        ).scalar()
        if sold_out_flag_id is None:
            conn.execute(
                text(
                    """
                    INSERT INTO inventory_flags (team_id, name, description, color, is_system, sort_order, created_at, updated_at)
                    VALUES (:team_id, 'Došlo', 'Systémový příznak pro nulové množství.', 'mismatch', 1, 999, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    """
                ),
                {"team_id": team_id},
            )
            sold_out_flag_id = conn.execute(
                text("SELECT id FROM inventory_flags WHERE team_id = :team_id AND lower(trim(name)) = 'došlo' ORDER BY id LIMIT 1"),
                {"team_id": team_id},
            ).scalar()
        if sold_out_flag_id is not None:
            conn.execute(
                text(
                    """
                    UPDATE inventory_items
                    SET flag_id = :flag_id, status = 'MISSING'
                    WHERE team_id = :team_id AND quantity <= 0
                    """
                ),
                {"team_id": team_id, "flag_id": sold_out_flag_id},
            )


def _normalize_inventory_item_status_values(conn: Connection) -> None:
    inspector = inspect(conn)
    if "inventory_items" not in inspector.get_table_names():
        return

    conn.execute(
        text(
            """
            UPDATE inventory_items
            SET status = CASE lower(status)
                WHEN 'available' THEN 'AVAILABLE'
                WHEN 'missing' THEN 'MISSING'
                WHEN 'damaged' THEN 'DAMAGED'
                WHEN 'maintenance' THEN 'MAINTENANCE'
                ELSE status
            END
            """
        )
    )


def _add_latex_template_column(conn: Connection) -> None:
    """Add latex_template column to inventory_label_templates table."""
    inspector = inspect(conn)
    if "inventory_label_templates" not in inspector.get_table_names():
        return

    try:
        conn.execute(text("ALTER TABLE inventory_label_templates ADD COLUMN latex_template TEXT"))
    except (OperationalError, ProgrammingError) as e:
        if "duplicate column name" not in str(e).lower():
            raise


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
    Migration(
        "20251005_add_hot_deal_to_tasks",
        _add_hot_deal_column,
        "Add hot_deal column to tasks table",
    ),
    Migration(
        "20260307_add_task_auto_close_columns",
        _add_task_auto_close_columns,
        "Add auto-close configuration fields to tasks",
    ),
    Migration(
        "20260307_create_task_team_closures",
        _create_task_team_closures_table,
        "Create per-team task closure table for auto-close",
    ),
    Migration(
        "20260308_add_task_auto_close_reset_at",
        _add_task_auto_close_reset_column,
        "Add auto_close_reset_at column to tasks table",
    ),
    Migration(
        "20260523_create_inventory_tables",
        _create_inventory_tables,
        "Create tables for the inventory module",
    ),
    Migration(
        "20260524_add_inventory_quantity_unit",
        _extend_inventory_items_with_unit,
        "Add quantity unit to inventory items",
    ),
    Migration(
        "20260525_add_inventory_flags_and_category_colors",
        _extend_inventory_categories_and_flags,
        "Add configurable inventory flags and colors for categories",
    ),
    Migration(
        "20260525_add_inventory_category_and_flag_descriptions",
        _add_inventory_category_and_flag_descriptions,
        "Add description fields for inventory categories and flags",
    ),
    Migration(
        "20260525_add_inventory_location_descriptions",
        _add_inventory_location_descriptions,
        "Add description fields for inventory locations",
    ),
    Migration(
        "20260525_add_inventory_system_flags",
        _add_inventory_system_flags,
        "Add system flag support for inventory flags",
    ),
    Migration(
        "20260525_normalize_inventory_item_status_values",
        _normalize_inventory_item_status_values,
        "Normalize inventory item status enum values",
    ),
    Migration(
        "20260524_add_latex_template_column",
        _add_latex_template_column,
        "Add latex_template column to inventory label templates",
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
