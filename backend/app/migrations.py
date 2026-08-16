from __future__ import annotations

import logging
import json
from datetime import datetime, timezone
from typing import Callable, List

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.exc import OperationalError, ProgrammingError

from .usernames import is_canonical_username, normalize_legacy_username

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


def _create_web_tables(conn: Connection) -> None:
    inspector = inspect(conn)
    if "web_pages" not in inspector.get_table_names():
        logger.info("Creating 'web_pages' table")
        conn.execute(
            text(
                """
                CREATE TABLE web_pages (
                    id INTEGER PRIMARY KEY,
                    slug VARCHAR(200) NOT NULL UNIQUE,
                    title VARCHAR(200) NOT NULL,
                    template VARCHAR(50),
                    data JSON,
                    html TEXT,
                    published BOOLEAN NOT NULL DEFAULT 0,
                    team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
                    created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
    if "web_media" not in inspector.get_table_names():
        logger.info("Creating 'web_media' table")
        conn.execute(
            text(
                """
                CREATE TABLE web_media (
                    id INTEGER PRIMARY KEY,
                    filename VARCHAR(255) NOT NULL,
                    path VARCHAR(500) NOT NULL,
                    mime VARCHAR(100),
                    size INTEGER NOT NULL DEFAULT 0,
                    uploaded_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )


def _create_web_templates_table(conn: Connection) -> None:
    inspector = inspect(conn)
    if "web_templates" not in inspector.get_table_names():
        logger.info("Creating 'web_templates' table")
        conn.execute(
            text(
                """
                CREATE TABLE web_templates (
                    id INTEGER PRIMARY KEY,
                    key VARCHAR(50) NOT NULL UNIQUE,
                    name VARCHAR(200) NOT NULL,
                    description VARCHAR(500),
                    html TEXT NOT NULL,
                    css TEXT NOT NULL DEFAULT '',
                    is_system BOOLEAN NOT NULL DEFAULT 0,
                    created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
    from .web_defaults import DEFAULT_TEMPLATES

    for key, template in DEFAULT_TEMPLATES.items():
        existing = conn.execute(
            text("SELECT 1 FROM web_templates WHERE key = :key"), {"key": key}
        ).fetchone()
        if existing:
            continue
        values = {
            "key": key,
            "name": template["name"],
            "description": template.get("description"),
            "html": template["html"],
            "css": template.get("css", ""),
        }
        # Base.metadata.create_all() runs before migrations.  On a fresh
        # database the advanced model columns therefore already exist while
        # this legacy seed step is still pending.
        template_columns = {column["name"] for column in inspect(conn).get_columns("web_templates")}
        if "template_kind" in template_columns:
            conn.execute(
                text(
                    """
                    INSERT INTO web_templates
                        (key, name, description, html, css, is_system,
                         template_kind, draft_version, published_css, published_version,
                         created_at, updated_at)
                    VALUES
                        (:key, :name, :description, :html, :css, 1,
                         'page', 1, :css, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    """
                ),
                values,
            )
        else:
            conn.execute(
                text(
                    """
                    INSERT INTO web_templates (key, name, description, html, css, is_system, created_at, updated_at)
                    VALUES (:key, :name, :description, :html, :css, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    """
                ),
                values,
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


def _retire_inventory_event_locations(conn: Connection) -> None:
    """Release legacy inventory-event placements without deleting audit data."""
    inspector = inspect(conn)
    if "inventory_items" not in inspector.get_table_names():
        return
    conn.execute(
        text(
            """
            UPDATE inventory_items
            SET current_location = default_location
            WHERE current_location LIKE 'Akce: %'
            """
        )
    )


def _add_inventory_item_location_quantities(conn: Connection) -> None:
    """Track physical quantities per item location and preserve legacy stock."""
    inspector = inspect(conn)
    tables = inspector.get_table_names()
    if "inventory_items" not in tables:
        return
    if "inventory_item_locations" not in tables:
        conn.execute(text("""
            CREATE TABLE inventory_item_locations (
                id INTEGER PRIMARY KEY,
                item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
                location VARCHAR(200) NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 0,
                CONSTRAINT uq_inventory_item_location UNIQUE (item_id, location)
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_item_locations_item_id ON inventory_item_locations (item_id)"))
    loan_columns = {column["name"] for column in inspector.get_columns("inventory_loans")} if "inventory_loans" in tables else set()
    if "inventory_loans" in tables and "source_location" not in loan_columns:
        conn.execute(text("ALTER TABLE inventory_loans ADD COLUMN source_location VARCHAR(200)"))
    conn.execute(text("""
        INSERT INTO inventory_item_locations (item_id, location, quantity)
        SELECT item.id,
               COALESCE(NULLIF(item.current_location, ''), NULLIF(item.default_location, ''), 'Bez lokace'),
               MAX(item.quantity - COALESCE((SELECT SUM(loan.quantity) FROM inventory_loans loan WHERE loan.item_id = item.id AND loan.returned_at IS NULL), 0), 0)
        FROM inventory_items item
        WHERE NOT EXISTS (SELECT 1 FROM inventory_item_locations location WHERE location.item_id = item.id)
          AND item.quantity > 0
    """))
    if "inventory_loans" in tables:
        conn.execute(text("""
            UPDATE inventory_loans
            SET source_location = COALESCE((SELECT current_location FROM inventory_items WHERE id = inventory_loans.item_id),
                                           (SELECT default_location FROM inventory_items WHERE id = inventory_loans.item_id),
                                           'Bez lokace')
            WHERE source_location IS NULL
        """))


def _add_inventory_sets(conn: Connection) -> None:
    """Add equipment sets and optional set membership on inventory items."""
    inspector = inspect(conn)
    tables = set(inspector.get_table_names())
    if "inventory_sets" not in tables:
        conn.execute(text("""
            CREATE TABLE inventory_sets (
                id INTEGER PRIMARY KEY,
                name VARCHAR(200) NOT NULL,
                description TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """))
    if "inventory_items" not in tables:
        return
    item_columns = {column["name"] for column in inspector.get_columns("inventory_items")}
    if "set_id" not in item_columns:
        conn.execute(text("ALTER TABLE inventory_items ADD COLUMN set_id INTEGER REFERENCES inventory_sets(id) ON DELETE SET NULL"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_items_set_id ON inventory_items(set_id)"))


def _remove_inventory_set_team_assignment(conn: Connection) -> None:
    """Make existing set rows global by removing the NOT NULL team column."""
    inspector = inspect(conn)
    if "inventory_sets" not in inspector.get_table_names():
        return
    team_column = next((column for column in inspector.get_columns("inventory_sets") if column["name"] == "team_id"), None)
    if not team_column or team_column.get("nullable", True):
        return
    if conn.dialect.name == "sqlite":
        # SQLite cannot drop NOT NULL from a column in place. Foreign keys are
        # disabled only for this atomic table rebuild and restored afterwards.
        conn.execute(text("PRAGMA foreign_keys=OFF"))
        conn.execute(text("""
            CREATE TABLE inventory_sets_global (
                id INTEGER PRIMARY KEY,
                name VARCHAR(200) NOT NULL,
                description TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("""
            INSERT INTO inventory_sets_global (id, name, description, created_at, updated_at)
            SELECT id, name, description, created_at, updated_at FROM inventory_sets
        """))
        conn.execute(text("DROP TABLE inventory_sets"))
        conn.execute(text("ALTER TABLE inventory_sets_global RENAME TO inventory_sets"))
        conn.execute(text("PRAGMA foreign_keys=ON"))
        return
    conn.execute(text("ALTER TABLE inventory_sets ALTER COLUMN team_id DROP NOT NULL"))


def _add_inventory_set_item_fields(conn: Connection) -> None:
    inspector = inspect(conn)
    if "inventory_sets" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("inventory_sets")}
    additions = {
        "flag_id": "INTEGER REFERENCES inventory_flags(id) ON DELETE SET NULL",
        "default_location": "VARCHAR(200)",
        "current_location": "VARCHAR(200)",
        "status": "VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE'",
        "notes": "TEXT",
    }
    for name, definition in additions.items():
        if name not in existing:
            conn.execute(text(f"ALTER TABLE inventory_sets ADD COLUMN {name} {definition}"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_sets_flag_id ON inventory_sets(flag_id)"))


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


def _extend_module_authorization_schema(conn: Connection) -> None:
    """Forward-only upgrade for the module catalogue and scoped RBAC grants."""
    inspector = inspect(conn)
    tables = set(inspector.get_table_names())
    if "registered_modules" in tables:
        columns = {c["name"] for c in inspector.get_columns("registered_modules")}
        if "installed" not in columns:
            conn.execute(text("ALTER TABLE registered_modules ADD COLUMN installed BOOLEAN NOT NULL DEFAULT 1"))
    if "permission_definitions" in tables:
        columns = {c["name"] for c in inspector.get_columns("permission_definitions")}
        if "scopes" not in columns:
            conn.execute(text("ALTER TABLE permission_definitions ADD COLUMN scopes JSON"))
            conn.execute(text("UPDATE permission_definitions SET scopes = '[\"any\"]' WHERE scopes IS NULL"))
    if "permission_group_permissions" in tables:
        columns = {c["name"] for c in inspector.get_columns("permission_group_permissions")}
        if "scope" not in columns:
            conn.execute(text("ALTER TABLE permission_group_permissions ADD COLUMN scope VARCHAR(32) NOT NULL DEFAULT 'any'"))


def _extend_module_dependency_columns(conn: Connection) -> None:
    """Add dependency and metadata columns for the module catalogue."""
    inspector = inspect(conn)
    tables = set(inspector.get_table_names())
    if "registered_modules" not in tables:
        return
    columns = {c["name"] for c in inspector.get_columns("registered_modules")}
    if "dependencies" not in columns:
        conn.execute(text("ALTER TABLE registered_modules ADD COLUMN dependencies JSON NOT NULL DEFAULT ('[]')"))
    if "metadata" not in columns:
        conn.execute(text("ALTER TABLE registered_modules ADD COLUMN metadata JSON NOT NULL DEFAULT ('{}')"))


def _rename_dashboard_messages_to_announcements(conn: Connection) -> None:
    """Rename 'dashboard_messages' to 'announcements' to match the competitions module."""
    inspector = inspect(conn)
    tables = set(inspector.get_table_names())
    if "dashboard_messages" not in tables:
        logger.debug("Table 'dashboard_messages' already renamed or missing")
        return
    if "announcements" in tables:
        logger.info("Copying 'dashboard_messages' rows into 'announcements' table")
        conn.execute(
            text(
                """
                INSERT INTO announcements (id, title, body, team_id, created_by_id, created_at)
                SELECT id, title, body, team_id, created_by_id, created_at FROM dashboard_messages
                """
            )
        )
        conn.execute(text("DROP TABLE dashboard_messages"))
    else:
        logger.info("Renaming 'dashboard_messages' table to 'announcements'")
        conn.execute(text("ALTER TABLE dashboard_messages RENAME TO announcements"))


def _add_receive_messages_column(conn: Connection) -> None:
    inspector = inspect(conn)
    if "users" not in inspector.get_table_names():
        return
    columns = {col["name"] for col in inspector.get_columns("users")}
    if "receive_messages" in columns:
        return
    logger.info("Adding 'receive_messages' column to users table")
    conn.execute(text("ALTER TABLE users ADD COLUMN receive_messages BOOLEAN NOT NULL DEFAULT 1"))


def _add_user_avatar_column(conn: Connection) -> None:
    inspector = inspect(conn)
    if "users" not in inspector.get_table_names():
        return
    columns = {col["name"] for col in inspector.get_columns("users")}
    if "avatar" in columns:
        return
    logger.info("Adding 'avatar' column to users table")
    conn.execute(text("ALTER TABLE users ADD COLUMN avatar TEXT"))


def _add_team_logo_column(conn: Connection) -> None:
    inspector = inspect(conn)
    if "teams" not in inspector.get_table_names():
        return
    columns = {col["name"] for col in inspector.get_columns("teams")}
    if "logo" in columns:
        return
    logger.info("Adding 'logo' column to teams table")
    conn.execute(text("ALTER TABLE teams ADD COLUMN logo TEXT"))


def _add_event_color_column(conn: Connection) -> None:
    inspector = inspect(conn)
    if "scout_events" not in inspector.get_table_names():
        return
    columns = {col["name"] for col in inspector.get_columns("scout_events")}
    if "color" in columns:
        return
    logger.info("Adding 'color' column to scout_events table")
    conn.execute(text("ALTER TABLE scout_events ADD COLUMN color VARCHAR(16)"))


def _add_event_attendance_fields(conn: Connection) -> None:
    inspector = inspect(conn)
    if "scout_events" not in inspector.get_table_names():
        return
    columns = {col["name"] for col in inspector.get_columns("scout_events")}
    if "audience" not in columns:
        logger.info("Adding 'audience' column to scout_events table")
        conn.execute(text("ALTER TABLE scout_events ADD COLUMN audience VARCHAR(20) NOT NULL DEFAULT 'members'"))
    if "requires_planned" not in columns:
        logger.info("Adding 'requires_planned' column to scout_events table")
        conn.execute(text("ALTER TABLE scout_events ADD COLUMN requires_planned BOOLEAN NOT NULL DEFAULT 0"))
    if "planned_deadline" not in columns:
        logger.info("Adding 'planned_deadline' column to scout_events table")
        conn.execute(text("ALTER TABLE scout_events ADD COLUMN planned_deadline DATETIME"))


def _add_attendance_mode(conn: Connection) -> None:
    """Add the planned/real mode to scout_attendances.

    The old unique constraint covered (event_id, user_id); a user now needs a
    separate row per mode, so the table is rebuilt with a composite constraint.
    """
    inspector = inspect(conn)
    if "scout_attendances" not in inspector.get_table_names():
        return
    columns = {col["name"] for col in inspector.get_columns("scout_attendances")}
    if "mode" in columns:
        return
    logger.info("Rebuilding scout_attendances with 'mode' column and composite unique constraint")
    conn.execute(
        text(
            """
            CREATE TABLE scout_attendances_new (
                id INTEGER PRIMARY KEY,
                event_id INTEGER NOT NULL REFERENCES scout_events(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                mode VARCHAR(20) NOT NULL DEFAULT 'real',
                status VARCHAR(20) NOT NULL DEFAULT 'present',
                note TEXT,
                marked_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                marked_at DATETIME NOT NULL,
                CONSTRAINT uq_scout_event_user UNIQUE (event_id, user_id, mode)
            )
            """
        )
    )
    conn.execute(
        text(
            """
            INSERT INTO scout_attendances_new (id, event_id, user_id, mode, status, note, marked_by_id, marked_at)
            SELECT id, event_id, user_id, 'real', status, note, marked_by_id, marked_at FROM scout_attendances
            """
        )
    )
    conn.execute(text("DROP TABLE scout_attendances"))
    conn.execute(text("ALTER TABLE scout_attendances_new RENAME TO scout_attendances"))


def _normalize_legacy_usernames(conn: Connection) -> None:
    """Bring historic usernames in line with the public API contract.

    Usernames used to accept free-form values.  Pydantic now correctly rejects
    those values in ``UserPublic``, so normalize existing rows before routes can
    serialize them.  Existing valid names always win collision resolution.
    """
    inspector = inspect(conn)
    if "users" not in inspector.get_table_names():
        return

    rows = conn.execute(text("SELECT id, username FROM users ORDER BY id")).mappings().all()
    used = {row["username"] for row in rows if is_canonical_username(row["username"])}
    changed = 0

    for row in rows:
        original = row["username"] or ""
        if is_canonical_username(original):
            continue
        base = normalize_legacy_username(original, row["id"])
        candidate = base
        counter = 1
        while candidate in used:
            suffix = f"-{row['id']}" if counter == 1 else f"-{row['id']}-{counter}"
            candidate = f"{base[:64 - len(suffix)]}{suffix}"
            counter += 1
        conn.execute(
            text("UPDATE users SET username = :username WHERE id = :user_id"),
            {"username": candidate, "user_id": row["id"]},
        )
        used.add(candidate)
        changed += 1

    if changed:
        logger.info("Normalized %d legacy username(s)", changed)


def _add_attendance_created_at_column(conn: Connection) -> None:
    """Add created_at column to scout_attendances table for tracking registration date."""
    inspector = inspect(conn)
    if "scout_attendances" not in inspector.get_table_names():
        return
    columns = {col["name"] for col in inspector.get_columns("scout_attendances")}
    if "created_at" in columns:
        logger.debug("Column 'created_at' already present on scout_attendances table")
        return
    logger.info("Adding 'created_at' column to scout_attendances table")
    # SQLite doesn't support non-constant defaults in ALTER TABLE
    # Step 1: Add nullable column
    conn.execute(text("ALTER TABLE scout_attendances ADD COLUMN created_at DATETIME"))
    # Step 2: Update existing rows with marked_at value
    conn.execute(text("UPDATE scout_attendances SET created_at = marked_at WHERE created_at IS NULL"))
    # Step 3: For future inserts, we'll rely on the model's default=func.now()


def _web_cms_extend(conn: Connection) -> None:
    """Extend web tables into a full CMS: page hierarchy/trash/revisions,
    posts/news, menus and media albums/alt/caption."""
    inspector = inspect(conn)

    def _ensure_column(table: str, column: str, ddl: str) -> None:
        columns = {col["name"] for col in inspector.get_columns(table)}
        if column not in columns:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))

    if "web_pages" in inspector.get_table_names():
        _ensure_column("web_pages", "position", "position INTEGER NOT NULL DEFAULT 0")
        _ensure_column("web_pages", "parent_id", "parent_id INTEGER REFERENCES web_pages(id) ON DELETE SET NULL")
        _ensure_column("web_pages", "meta_description", "meta_description VARCHAR(300)")
        _ensure_column("web_pages", "deleted_at", "deleted_at TIMESTAMP")
    if "web_media" in inspector.get_table_names():
        _ensure_column("web_media", "album", "album VARCHAR(100)")
        _ensure_column("web_media", "alt", "alt VARCHAR(300)")
        _ensure_column("web_media", "caption", "caption VARCHAR(500)")

    if "web_page_revisions" not in inspector.get_table_names():
        conn.execute(
            text(
                """
                CREATE TABLE web_page_revisions (
                    id INTEGER PRIMARY KEY,
                    page_id INTEGER NOT NULL REFERENCES web_pages(id) ON DELETE CASCADE,
                    html TEXT,
                    data JSON,
                    created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
    if "web_posts" not in inspector.get_table_names():
        conn.execute(
            text(
                """
                CREATE TABLE web_posts (
                    id INTEGER PRIMARY KEY,
                    title VARCHAR(200) NOT NULL,
                    slug VARCHAR(200) NOT NULL UNIQUE,
                    excerpt VARCHAR(500),
                    body TEXT,
                    cover_media_id INTEGER REFERENCES web_media(id) ON DELETE SET NULL,
                    published BOOLEAN NOT NULL DEFAULT 0,
                    published_at TIMESTAMP,
                    created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
    if "web_menus" not in inspector.get_table_names():
        conn.execute(
            text(
                """
                CREATE TABLE web_menus (
                    id INTEGER PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    location VARCHAR(50) NOT NULL UNIQUE,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
    if "web_menu_items" not in inspector.get_table_names():
        conn.execute(
            text(
                """
                CREATE TABLE web_menu_items (
                    id INTEGER PRIMARY KEY,
                    menu_id INTEGER NOT NULL REFERENCES web_menus(id) ON DELETE CASCADE,
                    parent_id INTEGER REFERENCES web_menu_items(id) ON DELETE CASCADE,
                    label VARCHAR(200) NOT NULL,
                    page_slug VARCHAR(200),
                    url VARCHAR(500),
                    position INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )


def _advanced_web_cms_schema(conn: Connection) -> None:
    """Add the visual CMS draft/publication and theme schema.

    The migration deliberately retains every legacy column.  Existing public
    rows are copied to immutable revisions before their publication pointers
    are set, so an upgraded public renderer never has to expose a mutable
    draft.  Every operation is guarded to make recovery after partially
    transactional DDL (notably MySQL/MariaDB) safe.
    """
    from . import models as _models  # noqa: F401 - register model tables
    from .database import Base

    def tables() -> set[str]:
        return set(inspect(conn).get_table_names())

    def columns(table: str) -> set[str]:
        return {column["name"] for column in inspect(conn).get_columns(table)}

    def add_column(table: str, name: str, ddl: str) -> None:
        if table in tables() and name not in columns(table):
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))

    def create_model_table(name: str) -> None:
        if name not in tables():
            Base.metadata.tables[name].create(bind=conn, checkfirst=True)

    # Public event data is opt-in; authenticated audience alone is not enough.
    add_column("scout_events", "is_public", "BOOLEAN NOT NULL DEFAULT 0")

    # Tables referenced by new nullable pointer columns must exist first.
    create_model_table("web_post_revisions")
    create_model_table("web_menu_revisions")

    page_columns = {
        "path_segment": "VARCHAR(200)",
        "path": "VARCHAR(500)",
        "template_id": "INTEGER REFERENCES web_templates(id) ON DELETE SET NULL",
        "draft_version": "INTEGER NOT NULL DEFAULT 1",
        "published_revision_id": "INTEGER REFERENCES web_page_revisions(id) ON DELETE SET NULL",
        "seo_title": "VARCHAR(200)",
        "canonical_url": "VARCHAR(500)",
        "og_image_id": "INTEGER REFERENCES web_media(id) ON DELETE SET NULL",
        "noindex": "BOOLEAN NOT NULL DEFAULT 0",
        "sitemap_include": "BOOLEAN NOT NULL DEFAULT 1",
        "updated_by_id": "INTEGER REFERENCES users(id) ON DELETE SET NULL",
    }
    for name, ddl in page_columns.items():
        add_column("web_pages", name, ddl)

    revision_columns = {
        "revision_number": "INTEGER",
        "source_version": "INTEGER NOT NULL DEFAULT 1",
        "title": "VARCHAR(200)",
        "path_segment": "VARCHAR(200)",
        "path": "VARCHAR(500)",
        "template_key": "VARCHAR(100)",
        "template_id": "INTEGER REFERENCES web_templates(id) ON DELETE SET NULL",
        "compiled_tree": "JSON",
        "compiled_css": "TEXT",
        "reason": "VARCHAR(32)",
        "is_publication": "BOOLEAN NOT NULL DEFAULT 0",
        "seo_title": "VARCHAR(200)",
        "meta_description": "VARCHAR(300)",
        "canonical_url": "VARCHAR(500)",
        "og_image_id": "INTEGER REFERENCES web_media(id) ON DELETE SET NULL",
        "noindex": "BOOLEAN NOT NULL DEFAULT 0",
        "sitemap_include": "BOOLEAN NOT NULL DEFAULT 1",
    }
    for name, ddl in revision_columns.items():
        add_column("web_page_revisions", name, ddl)

    post_columns = {
        "draft_version": "INTEGER NOT NULL DEFAULT 1",
        "published_revision_id": "INTEGER REFERENCES web_post_revisions(id) ON DELETE SET NULL",
        "deleted_at": "TIMESTAMP",
        "seo_title": "VARCHAR(200)",
        "meta_description": "VARCHAR(300)",
        "canonical_url": "VARCHAR(500)",
        "og_image_id": "INTEGER REFERENCES web_media(id) ON DELETE SET NULL",
        "noindex": "BOOLEAN NOT NULL DEFAULT 0",
        "sitemap_include": "BOOLEAN NOT NULL DEFAULT 1",
        "updated_by_id": "INTEGER REFERENCES users(id) ON DELETE SET NULL",
    }
    for name, ddl in post_columns.items():
        add_column("web_posts", name, ddl)

    for name, ddl in {
        "draft_version": "INTEGER NOT NULL DEFAULT 1",
        "published_revision_id": "INTEGER REFERENCES web_menu_revisions(id) ON DELETE SET NULL",
        "updated_at": "TIMESTAMP",
    }.items():
        add_column("web_menus", name, ddl)
    conn.execute(text("UPDATE web_menus SET updated_at = created_at WHERE updated_at IS NULL"))

    for name, ddl in {
        "item_type": "VARCHAR(20) NOT NULL DEFAULT 'external'",
        "page_id": "INTEGER REFERENCES web_pages(id) ON DELETE SET NULL",
        "post_id": "INTEGER REFERENCES web_posts(id) ON DELETE SET NULL",
        "target": "VARCHAR(16)",
        "rel": "VARCHAR(100)",
    }.items():
        add_column("web_menu_items", name, ddl)
    conn.execute(
        text(
            "UPDATE web_menu_items SET item_type = CASE "
            "WHEN page_slug IS NOT NULL THEN 'page' ELSE 'external' END"
        )
    )
    conn.execute(
        text(
            "UPDATE web_menu_items SET page_id = "
            "(SELECT web_pages.id FROM web_pages WHERE web_pages.slug = web_menu_items.page_slug) "
            "WHERE page_slug IS NOT NULL AND page_id IS NULL"
        )
    )

    template_columns = {
        "qualified_key": "VARCHAR(240)",
        "template_kind": "VARCHAR(32) NOT NULL DEFAULT 'page'",
        "project_data": "JSON",
        "draft_version": "INTEGER NOT NULL DEFAULT 1",
        "published_project_data": "JSON",
        "published_css": "TEXT NOT NULL DEFAULT ''",
        "published_version": "INTEGER NOT NULL DEFAULT 0",
        "theme_version_id": "INTEGER REFERENCES web_theme_versions(id) ON DELETE RESTRICT",
        "forked_from_id": "INTEGER REFERENCES web_templates(id) ON DELETE SET NULL",
    }
    # Theme tables are created before adding the template theme FK.
    for table_name in ("web_themes", "web_theme_versions", "web_theme_assets"):
        create_model_table(table_name)
    for name, ddl in template_columns.items():
        add_column("web_templates", name, ddl)
    conn.execute(
        text(
            "UPDATE web_templates SET qualified_key = key, published_css = css, "
            "published_version = CASE WHEN published_version = 0 THEN 1 ELSE published_version END "
            "WHERE qualified_key IS NULL"
        )
    )
    conn.execute(
        text(
            "UPDATE web_pages SET template_id = "
            "(SELECT web_templates.id FROM web_templates WHERE web_templates.key = web_pages.template) "
            "WHERE template IS NOT NULL AND template_id IS NULL"
        )
    )

    for table_name in (
        "web_reusable_components",
        "web_sections",
        "web_patterns",
        "web_site_styles",
        "web_redirects",
    ):
        create_model_table(table_name)

    if conn.execute(text("SELECT 1 FROM web_site_styles WHERE id = 1")).fetchone() is None:
        conn.execute(
            text(
                "INSERT INTO web_site_styles "
                "(id, draft_tokens, draft_css, draft_version, published_tokens, "
                "published_css, published_version, updated_at) "
                "VALUES (1, :tokens, '', 1, :tokens, '', 1, CURRENT_TIMESTAMP)"
            ),
            {"tokens": json.dumps({})},
        )

    # Materialize deterministic nested paths from the legacy hierarchy.  Old
    # slugs are globally unique, so the cycle fallback remains collision-free.
    page_rows = conn.execute(text("SELECT id, slug, parent_id FROM web_pages")).mappings().all()
    by_id = {row["id"]: row for row in page_rows}
    resolved: dict[int, str] = {}

    def resolve_path(page_id: int, visiting: set[int] | None = None) -> str:
        if page_id in resolved:
            return resolved[page_id]
        visiting = set() if visiting is None else visiting
        row = by_id[page_id]
        segment = (row["slug"] or f"page-{page_id}").strip("/")
        if page_id in visiting:
            logger.warning("Cycle in legacy web page hierarchy at page %s", page_id)
            return segment
        visiting.add(page_id)
        parent_id = row["parent_id"]
        if parent_id in by_id and parent_id != page_id:
            parent_path = resolve_path(parent_id, visiting)
            value = f"/{segment}" if parent_path == "/" else f"{parent_path}/{segment}"
        else:
            value = "/" if segment == "main" else f"/{segment}"
        visiting.remove(page_id)
        resolved[page_id] = value
        return value

    for row in page_rows:
        conn.execute(
            text(
                "UPDATE web_pages SET path_segment = COALESCE(path_segment, :segment), "
                "path = :path WHERE id = :id"
            ),
            {"id": row["id"], "segment": row["slug"], "path": resolve_path(row["id"])},
        )

    # Number legacy revisions deterministically, then create one immutable
    # publication snapshot for every legacy live page without a pointer.
    for page_id in by_id:
        revisions = conn.execute(
            text(
                "SELECT id FROM web_page_revisions WHERE page_id = :page_id "
                "ORDER BY created_at, id"
            ),
            {"page_id": page_id},
        ).fetchall()
        for number, revision in enumerate(revisions, start=1):
            conn.execute(
                text(
                    "UPDATE web_page_revisions SET revision_number = COALESCE(revision_number, :number) "
                    "WHERE id = :id"
                ),
                {"number": number, "id": revision[0]},
            )

    live_pages = conn.execute(
        text("SELECT * FROM web_pages WHERE published = 1 AND published_revision_id IS NULL")
    ).mappings().all()
    for page in live_pages:
        next_number = conn.execute(
            text("SELECT COALESCE(MAX(revision_number), 0) + 1 FROM web_page_revisions WHERE page_id = :id"),
            {"id": page["id"]},
        ).scalar_one()
        conn.execute(
            text(
                "INSERT INTO web_page_revisions "
                "(page_id, html, data, revision_number, source_version, title, path_segment, path, "
                "template_key, template_id, reason, is_publication, seo_title, meta_description, canonical_url, "
                "og_image_id, noindex, sitemap_include, created_by_id, created_at) "
                "VALUES (:page_id, :html, :data, :number, :source_version, :title, :path_segment, :path, "
                ":template_key, :template_id, 'migration', 1, :seo_title, :meta_description, :canonical_url, "
                ":og_image_id, :noindex, :sitemap_include, :created_by_id, CURRENT_TIMESTAMP)"
            ),
            {
                "page_id": page["id"], "html": page["html"], "data": page["data"],
                "number": next_number, "source_version": page["draft_version"], "title": page["title"],
                "path_segment": page["path_segment"], "path": page["path"], "template_key": page["template"],
                "template_id": page["template_id"],
                "seo_title": page["seo_title"], "meta_description": page["meta_description"],
                "canonical_url": page["canonical_url"], "og_image_id": page["og_image_id"],
                "noindex": page["noindex"], "sitemap_include": page["sitemap_include"],
                "created_by_id": page["created_by_id"],
            },
        )
        revision_id = conn.execute(
            text("SELECT id FROM web_page_revisions WHERE page_id = :id AND revision_number = :number"),
            {"id": page["id"], "number": next_number},
        ).scalar_one()
        conn.execute(
            text("UPDATE web_pages SET published_revision_id = :revision_id WHERE id = :id"),
            {"revision_id": revision_id, "id": page["id"]},
        )

    live_posts = conn.execute(
        text("SELECT * FROM web_posts WHERE published = 1 AND published_revision_id IS NULL")
    ).mappings().all()
    for post in live_posts:
        conn.execute(
            text(
                "INSERT INTO web_post_revisions "
                "(post_id, revision_number, source_version, title, slug, excerpt, body, cover_media_id, "
                "reason, is_publication, seo_title, meta_description, canonical_url, og_image_id, "
                "noindex, sitemap_include, created_by_id, created_at) "
                "VALUES (:post_id, 1, :source_version, :title, :slug, :excerpt, :body, :cover_media_id, "
                "'migration', 1, :seo_title, :meta_description, :canonical_url, :og_image_id, "
                ":noindex, :sitemap_include, :created_by_id, CURRENT_TIMESTAMP)"
            ),
            {
                "post_id": post["id"], "source_version": post["draft_version"], "title": post["title"],
                "slug": post["slug"], "excerpt": post["excerpt"], "body": post["body"],
                "cover_media_id": post["cover_media_id"], "seo_title": post["seo_title"],
                "meta_description": post["meta_description"], "canonical_url": post["canonical_url"],
                "og_image_id": post["og_image_id"], "noindex": post["noindex"],
                "sitemap_include": post["sitemap_include"], "created_by_id": post["created_by_id"],
            },
        )
        revision_id = conn.execute(
            text("SELECT id FROM web_post_revisions WHERE post_id = :id AND revision_number = 1"),
            {"id": post["id"]},
        ).scalar_one()
        conn.execute(
            text("UPDATE web_posts SET published_revision_id = :revision_id WHERE id = :id"),
            {"revision_id": revision_id, "id": post["id"]},
        )

    # Menus had no draft state; preserve their hierarchy as the initial public
    # snapshot. The publication is a real nested tree, not a flat ORM dump.
    menu_rows = conn.execute(text("SELECT id FROM web_menus")).fetchall()
    for (menu_id,) in menu_rows:
        pointer = conn.execute(
            text("SELECT published_revision_id FROM web_menus WHERE id = :id"), {"id": menu_id}
        ).scalar_one_or_none()
        if pointer is not None:
            continue
        items = [dict(row) for row in conn.execute(
            text(
                "SELECT id, parent_id, label, page_slug, url, position, item_type, page_id, post_id, target, rel "
                "FROM web_menu_items WHERE menu_id = :id ORDER BY position, id"
            ),
            {"id": menu_id},
        ).mappings()]
        by_id = {item["id"]: {**item, "children": []} for item in items}
        tree = []
        for item in by_id.values():
            parent_id = item.get("parent_id")
            if parent_id in by_id and parent_id != item["id"]:
                by_id[parent_id]["children"].append(item)
            else:
                tree.append(item)
        conn.execute(
            text(
                "INSERT INTO web_menu_revisions "
                "(menu_id, revision_number, source_version, tree, reason, created_at) "
                "VALUES (:menu_id, 1, 1, :tree, 'migration', CURRENT_TIMESTAMP)"
            ),
            {"menu_id": menu_id, "tree": json.dumps(tree)},
        )
        revision_id = conn.execute(
            text("SELECT id FROM web_menu_revisions WHERE menu_id = :id AND revision_number = 1"),
            {"id": menu_id},
        ).scalar_one()
        conn.execute(
            text("UPDATE web_menus SET published_revision_id = :revision_id WHERE id = :id"),
            {"revision_id": revision_id, "id": menu_id},
        )

    # Alter-table constraints are limited on SQLite.  These indexes provide
    # the cross-dialect invariants that can be added safely after backfill.
    existing_indexes = {
        index["name"]
        for table_name in ("web_pages", "web_page_revisions", "web_templates")
        for index in inspect(conn).get_indexes(table_name)
    }
    for name, ddl in (
        ("uq_web_pages_path", "CREATE UNIQUE INDEX uq_web_pages_path ON web_pages(path)"),
        ("ix_web_pages_template_id", "CREATE INDEX ix_web_pages_template_id ON web_pages(template_id)"),
        (
            "uq_web_page_revision_number",
            "CREATE UNIQUE INDEX uq_web_page_revision_number ON web_page_revisions(page_id, revision_number)",
        ),
        (
            "uq_web_templates_qualified_key",
            "CREATE UNIQUE INDEX uq_web_templates_qualified_key ON web_templates(qualified_key)",
        ),
    ):
        if name not in existing_indexes:
            conn.execute(text(ddl))


def _advanced_web_cms_template_reference(conn: Connection) -> None:
    """Follow-up for databases that already recorded the initial CMS upgrade.

    This deliberately performs only the additive template-reference change.
    Re-entering the full data backfill would mutate menu kinds created after the
    first migration and, worse, copy editable draft metadata into immutable
    published revisions.
    """
    inspector = inspect(conn)
    tables = set(inspector.get_table_names())
    if "web_pages" not in tables or "web_page_revisions" not in tables:
        return
    page_columns = {column["name"] for column in inspector.get_columns("web_pages")}
    if "template_id" not in page_columns:
        conn.execute(text(
            "ALTER TABLE web_pages ADD COLUMN template_id "
            "INTEGER REFERENCES web_templates(id) ON DELETE SET NULL"
        ))
    revision_columns = {
        column["name"] for column in inspect(conn).get_columns("web_page_revisions")
    }
    if "template_id" not in revision_columns:
        conn.execute(text(
            "ALTER TABLE web_page_revisions ADD COLUMN template_id "
            "INTEGER REFERENCES web_templates(id) ON DELETE SET NULL"
        ))
    conn.execute(text(
        "UPDATE web_pages SET template_id = "
        "(SELECT web_templates.id FROM web_templates WHERE web_templates.key = web_pages.template) "
        "WHERE template_id IS NULL AND template IS NOT NULL"
    ))
    # A revision is backfilled from its own immutable legacy template key,
    # never from the page's current editable template selection.
    conn.execute(text(
        "UPDATE web_page_revisions SET template_id = "
        "(SELECT web_templates.id FROM web_templates "
        " WHERE web_templates.key = web_page_revisions.template_key) "
        "WHERE template_id IS NULL AND template_key IS NOT NULL"
    ))


def _web_media_public_visibility(conn: Connection) -> None:
    """Add the opt-in public media boundary without exposing legacy uploads."""
    inspector = inspect(conn)
    if "web_media" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("web_media")}
    if "is_public" not in columns:
        conn.execute(text(
            "ALTER TABLE web_media ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT 0"
        ))


def _web_media_tree_and_previews(conn: Connection) -> None:
    """Add folder tree for web media and preview media references for design resources."""
    inspector = inspect(conn)
    tables = set(inspector.get_table_names())

    if "web_media_folders" not in tables:
        logger.info("Creating 'web_media_folders' table")
        conn.execute(text("""
            CREATE TABLE web_media_folders (
                id INTEGER PRIMARY KEY,
                name VARCHAR(200) NOT NULL,
                parent_id INTEGER REFERENCES web_media_folders(id) ON DELETE CASCADE,
                created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_web_media_folders_parent_id ON web_media_folders(parent_id)"))

    if "web_media" in tables:
        def _ensure_media_column(table, column, ddl):
            cols = {c["name"] for c in inspector.get_columns(table)}
            if column not in cols:
                logger.info("Adding '%s' column to %s", column, table)
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))

        _ensure_media_column("web_media", "folder_id", "folder_id INTEGER")
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_web_media_folder_id ON web_media(folder_id)"))

    preview_columns = {
        "web_templates": "preview_media_id INTEGER",
        "web_reusable_components": "preview_media_id INTEGER",
        "web_sections": "preview_media_id INTEGER",
        "web_patterns": "preview_media_id INTEGER",
        "web_template_parts": "preview_media_id INTEGER",
    }
    for table, ddl in preview_columns.items():
        if table not in tables:
            continue
        cols = {c["name"] for c in inspector.get_columns(table)}
        if "preview_media_id" not in cols:
            logger.info("Adding 'preview_media_id' column to %s", table)
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))


def _web_media_note_and_metadata(conn: Connection) -> None:
    """Add media note column; alt/caption/album are superseded by note."""
    inspector = inspect(conn)
    tables = set(inspector.get_table_names())
    if "web_media" not in tables:
        return
    cols = {c["name"] for c in inspector.get_columns("web_media")}
    if "note" not in cols:
        logger.info("Adding 'note' column to web_media")
        conn.execute(text("ALTER TABLE web_media ADD COLUMN note VARCHAR(1000)"))


def _web_linked_resource_props(conn: Connection) -> None:
    inspector = inspect(conn)
    tables = set(inspector.get_table_names())
    for table_name in ("web_reusable_components", "web_sections"):
        if table_name not in tables:
            continue
        columns = {column["name"] for column in inspect(conn).get_columns(table_name)}
        additions = {
            "prop_schema": "JSON NOT NULL DEFAULT '[]'",
            "default_props": "JSON NOT NULL DEFAULT '{}'",
            "variants": "JSON NOT NULL DEFAULT '[]'",
            "published_project_data": "JSON",
            "published_css": "TEXT NOT NULL DEFAULT ''",
            "published_prop_schema": "JSON NOT NULL DEFAULT '[]'",
            "published_default_props": "JSON NOT NULL DEFAULT '{}'",
            "published_variants": "JSON NOT NULL DEFAULT '[]'",
            "published_version": "INTEGER NOT NULL DEFAULT 0",
        }
        for column_name, definition in additions.items():
            if column_name not in columns:
                conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}"))
        conn.execute(text(
            f"UPDATE {table_name} SET "
            "published_project_data = COALESCE(published_project_data, project_data), "
            "published_css = COALESCE(NULLIF(published_css, ''), css, ''), "
            "published_prop_schema = COALESCE(published_prop_schema, prop_schema, '[]'), "
            "published_default_props = COALESCE(published_default_props, default_props, '{}'), "
            "published_variants = COALESCE(published_variants, variants, '[]'), "
            "published_version = CASE WHEN published_version = 0 THEN 1 ELSE published_version END"
        ))








def _drop_legacy_design_tables(conn: Connection) -> None:
    """Contract phase: drop tables merged into WebTemplate / WebSection."""
    inspector = inspect(conn)
    for table in ("web_page_templates", "web_global_parts", "web_template_parts"):
        if table in inspector.get_table_names():
            logger.info("Dropping legacy table: %s", table)
            conn.execute(text(f"DROP TABLE IF EXISTS {table}"))


def _create_preview_artifacts(conn: Connection) -> None:
    """Create WebPreviewArtifact table for cached browser-rendered previews."""
    inspector = inspect(conn)
    if "web_preview_artifacts" in inspector.get_table_names():
        return
    logger.info("Creating 'web_preview_artifacts' table")
    conn.execute(text("""
        CREATE TABLE web_preview_artifacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resource_kind VARCHAR(32) NOT NULL,
            resource_id INTEGER NOT NULL,
            source_hash VARCHAR(64) NOT NULL,
            viewport VARCHAR(20) NOT NULL DEFAULT '1280x720',
            format VARCHAR(10) NOT NULL DEFAULT 'png',
            storage_path VARCHAR(500) NOT NULL,
            mime VARCHAR(50) NOT NULL DEFAULT 'image/png',
            width INTEGER,
            height INTEGER,
            status VARCHAR(16) NOT NULL DEFAULT 'building',
            error TEXT,
            retry_count INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """))
    conn.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_web_preview_artifact_resource "
        "ON web_preview_artifacts(resource_kind, resource_id)"
    ))
    conn.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_web_preview_artifact_source_hash "
        "ON web_preview_artifacts(source_hash)"
    ))
    conn.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_web_preview_artifact_status "
        "ON web_preview_artifacts(status)"
    ))


def _migrate_page_templates_into_web_templates(conn: Connection) -> None:
    """Copy WebPageTemplate rows into WebTemplate with usage_mode=copy_on_create.

    This is the expand phase of the consolidation. The old web_page_templates
    and web_global_parts tables remain for now; future contract phase removes
    them after all references are dual-written.
    """
    inspector = inspect(conn)
    tables = set(inspector.get_table_names())
    has_usage_mode = ("web_templates" in tables and
                      "usage_mode" in {c["name"] for c in inspector.get_columns("web_templates")})
    if "web_page_templates" not in tables or not has_usage_mode:
        return

    # Copy page templates that are not theme-locked
    rows = conn.execute(text(
        "SELECT id, qualified_key, name, description, project_data, css, "
        "draft_version, published_project_data, published_css, published_version, "
        "preview_media_id, theme_version_id, is_locked, created_by_id "
        "FROM web_page_templates "
        "WHERE qualified_key NOT IN (SELECT COALESCE(qualified_key, '') FROM web_templates)"
    )).mappings().all()

    for row in rows:
        key = row["qualified_key"].split(":")[-1] if row["qualified_key"] else f"pt-{row['id']}"
        # Ensure unique key
        legacy_key = key[:50] if len(key) > 50 else key
        conn.execute(text(
            "INSERT INTO web_templates "
            "(key, qualified_key, name, description, project_data, css, "
            "draft_version, published_project_data, published_css, published_version, "
            "usage_mode, template_kind, preview_media_id, theme_version_id, is_system, is_locked, created_by_id) "
            "VALUES (:key, :qualified_key, :name, :description, :project_data, :css, "
            ":draft_version, :published_project_data, :published_css, :published_version, "
            "'copy_on_create', 'layout', :preview_media_id, :theme_version_id, 0, :is_locked, :created_by_id)"
        ), {
            "key": legacy_key,
            "qualified_key": row["qualified_key"],
            "name": row["name"],
            "description": row["description"],
            "project_data": row["project_data"],
            "css": row["css"],
            "draft_version": row["draft_version"],
            "published_project_data": row["published_project_data"],
            "published_css": row["published_css"],
            "published_version": row["published_version"],
            "preview_media_id": row["preview_media_id"],
            "theme_version_id": row["theme_version_id"],
            "is_locked": row["is_locked"],
            "created_by_id": row["created_by_id"],
        })


def _migrate_global_parts_into_sections(conn: Connection) -> None:
    """Copy WebGlobalPart rows into WebSection.

    Global Parts (site-owned shared content: headers, footers) become
    Sections with empty prop_schema/default_props/variants. References
    (sc-global-part) are migrated in the renderer via dual-read.
    """
    inspector = inspect(conn)
    tables = set(inspector.get_table_names())
    if "web_global_parts" not in tables or "web_sections" not in tables:
        return

    rows = conn.execute(text(
        "SELECT id, qualified_key, name, description, project_data, css, "
        "draft_version, published_project_data, published_css, published_version, "
        "preview_media_id, created_by_id "
        "FROM web_global_parts "
        "WHERE qualified_key NOT IN (SELECT COALESCE(qualified_key, '') FROM web_sections)"
    )).mappings().all()

    for row in rows:
        conn.execute(text(
            "INSERT INTO web_sections "
            "(qualified_key, name, description, project_data, css, "
            "draft_version, published_project_data, published_css, published_version, "
            "prop_schema, default_props, variants, "
            "published_prop_schema, published_default_props, published_variants, "
            "preview_media_id, is_locked, created_by_id) "
            "VALUES (:qualified_key, :name, :description, :project_data, :css, "
            ":draft_version, :published_project_data, :published_css, :published_version, "
            "'[]', '{}', '[]', '[]', '{}', '[]', "
            ":preview_media_id, 0, :created_by_id)"
        ), {
            "qualified_key": row["qualified_key"],
            "name": row["name"],
            "description": row["description"],
            "project_data": row["project_data"],
            "css": row["css"],
            "draft_version": row["draft_version"],
            "published_project_data": row["published_project_data"],
            "published_css": row["published_css"],
            "published_version": row["published_version"],
            "preview_media_id": row["preview_media_id"],
            "created_by_id": row["created_by_id"],
        })




def _add_page_source_template_columns(conn: Connection) -> None:
    """Add source_template_id + source_template_version provenance columns."""
    inspector = inspect(conn)
    if "web_pages" not in inspector.get_table_names():
        return
    columns = {c["name"] for c in inspector.get_columns("web_pages")}
    if "source_template_id" not in columns:
        conn.execute(text(
            "ALTER TABLE web_pages ADD COLUMN source_template_id "
            "INTEGER REFERENCES web_templates(id) ON DELETE SET NULL"
        ))
    if "source_template_version" not in columns:
        conn.execute(text(
            "ALTER TABLE web_pages ADD COLUMN source_template_version INTEGER"
        ))
    conn.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_web_pages_source_template_id "
        "ON web_pages(source_template_id)"
    ))


def _create_web_global_parts(conn: Connection) -> None:
    """Create WebGlobalPart table for site-owned shared instances (headers, footers, etc.)."""
    inspector = inspect(conn)
    tables = set(inspector.get_table_names())
    if "web_global_parts" in tables:
        return
    logger.info("Creating 'web_global_parts' table")
    conn.execute(
        text(
            """
            CREATE TABLE web_global_parts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                qualified_key VARCHAR(240) NOT NULL UNIQUE,
                name VARCHAR(200) NOT NULL,
                description TEXT,
                project_data JSON NOT NULL,
                css TEXT NOT NULL DEFAULT '',
                draft_version INTEGER NOT NULL DEFAULT 1,
                published_project_data JSON,
                published_css TEXT NOT NULL DEFAULT '',
                published_version INTEGER NOT NULL DEFAULT 0,
                preview_media_id INTEGER REFERENCES web_media(id) ON DELETE SET NULL,
                usage_count INTEGER NOT NULL DEFAULT 0,
                created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
    )
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_web_global_parts_qualified_key ON web_global_parts(qualified_key)"))



def _add_template_usage_mode(conn: Connection) -> None:
    """Add usage_mode column to web_templates (linked_layout vs copy_on_create)."""
    inspector = inspect(conn)
    if "web_templates" not in inspector.get_table_names():
        return
    columns = {c["name"] for c in inspector.get_columns("web_templates")}
    if "usage_mode" not in columns:
        logger.info("Adding 'usage_mode' column to web_templates")
        conn.execute(text(
            "ALTER TABLE web_templates ADD COLUMN usage_mode "
            "VARCHAR(20) NOT NULL DEFAULT 'linked_layout'"
        ))


def _create_web_page_templates(conn: Connection) -> None:
    """Add Page Templates and page provenance columns (Layout vs Page Template).

    Forward-only and idempotent. Existing web_templates rows are treated as
    Layouts (linked shells); page templates start as an explicit new collection.
    """
    inspector = inspect(conn)
    tables = set(inspector.get_table_names())

    if "web_page_templates" not in tables:
        logger.info("Creating 'web_page_templates' table")
        conn.execute(text("""
            CREATE TABLE web_page_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                qualified_key VARCHAR(240) NOT NULL UNIQUE,
                name VARCHAR(200) NOT NULL,
                description TEXT,
                project_data JSON NOT NULL,
                css TEXT NOT NULL DEFAULT '',
                draft_version INTEGER NOT NULL DEFAULT 1,
                published_project_data JSON,
                published_css TEXT NOT NULL DEFAULT '',
                published_version INTEGER NOT NULL DEFAULT 0,
                preview_media_id INTEGER REFERENCES web_media(id) ON DELETE SET NULL,
                theme_version_id INTEGER REFERENCES web_theme_versions(id) ON DELETE RESTRICT,
                is_locked BOOLEAN NOT NULL DEFAULT 0,
                created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_web_page_templates_qualified_key "
            "ON web_page_templates(qualified_key)"
        ))

    # Provenance columns on web_pages: only a record of what was copied, never
    # a live dependency. template_id remains the linked Layout reference.
    if "web_pages" in tables:
        page_cols = {c["name"] for c in inspector.get_columns("web_pages")}
        if "page_template_id" not in page_cols:
            conn.execute(text(
                "ALTER TABLE web_pages ADD COLUMN page_template_id "
                "INTEGER REFERENCES web_page_templates(id) ON DELETE SET NULL"
            ))
        if "page_template_version" not in page_cols:
            conn.execute(text(
                "ALTER TABLE web_pages ADD COLUMN page_template_version INTEGER"
            ))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_web_pages_page_template_id ON web_pages(page_template_id)"))

    # Normalize legacy template_kind='page' to 'layout' on existing Layout rows.
    # 'page' remains a tolerated compatibility alias in read paths.
    if "web_templates" in tables:
        template_cols = {c["name"] for c in inspector.get_columns("web_templates")}
        if "template_kind" in template_cols:
            conn.execute(text(
                "UPDATE web_templates SET template_kind = 'layout' "
                "WHERE template_kind = 'page'"
            ))



def _create_member_tables(conn: Connection) -> None:
    """Create compact member metadata, tags and internal notes."""
    inspector = inspect(conn)
    tables = set(inspector.get_table_names())

    if "member_profiles" not in tables:
        logger.info("Creating 'member_profiles' table")
        conn.execute(
            text(
                """
                CREATE TABLE member_profiles (
                    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                    joined_at DATE,
                    member_status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )

    if "member_tags" not in tables:
        logger.info("Creating 'member_tags' table")
        conn.execute(
            text(
                """
                CREATE TABLE member_tags (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    tag VARCHAR(50) NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT uq_member_tag UNIQUE (user_id, tag)
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_member_tags_user_id ON member_tags(user_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_member_tags_tag ON member_tags(tag)"))

    if "member_notes" not in tables:
        logger.info("Creating 'member_notes' table")
        conn.execute(
            text(
                """
                CREATE TABLE member_notes (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    content TEXT NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_member_notes_user_id ON member_notes(user_id)"))


def _add_attendance_query_indexes(conn: Connection) -> None:
    """Indexes for the administrative attendance matrix and member overview."""
    inspector = inspect(conn)
    tables = set(inspector.get_table_names())
    if "scout_events" in tables:
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_scout_events_starts_at ON scout_events(starts_at)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_scout_events_kind_starts_at ON scout_events(kind, starts_at)"))
    if "scout_attendances" in tables:
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_scout_attendances_user_event_mode "
            "ON scout_attendances(user_id, event_id, mode)"
        ))


def _add_web_post_event_reference(conn: Connection) -> None:
    """Link posts and their immutable revisions to an optional Scout event."""
    inspector = inspect(conn)
    tables = set(inspector.get_table_names())
    for table in ("web_posts", "web_post_revisions"):
        if table not in tables:
            continue
        columns = {column["name"] for column in inspector.get_columns(table)}
        if "event_id" not in columns:
            conn.execute(text(
                f"ALTER TABLE {table} ADD COLUMN event_id INTEGER REFERENCES scout_events(id) ON DELETE SET NULL"
            ))
    indexes = {index["name"] for index in inspector.get_indexes("web_posts")} if "web_posts" in tables else set()
    if "ix_web_posts_event_id" not in indexes:
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_web_posts_event_id ON web_posts (event_id)"))


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
    Migration(
        "20260809_extend_module_authorization_schema",
        _extend_module_authorization_schema,
        "Add installation state and scoped module permission grants",
    ),
    Migration(
        "20260810_extend_module_dependency_columns",
        _extend_module_dependency_columns,
        "Add dependency and metadata columns for the module catalogue",
    ),
    Migration(
        "20260810_rename_dashboard_messages_to_announcements",
        _rename_dashboard_messages_to_announcements,
        "Rename dashboard_messages table to announcements",
    ),
    Migration(
        "20260810_add_receive_messages_preference",
        _add_receive_messages_column,
        "Add per-user receive_messages preference for private messaging",
    ),
    Migration(
        "20260810_add_user_avatar",
        _add_user_avatar_column,
        "Add avatar (base64 data URL) column to users table",
    ),
    Migration(
        "20260811_add_team_logo",
        _add_team_logo_column,
        "Add logo (base64 data URL) column to teams table",
    ),
    Migration(
        "20260810_add_event_color",
        _add_event_color_column,
        "Add optional color override column to scout_events table",
    ),
    Migration(
        "20260810_add_event_attendance_fields",
        _add_event_attendance_fields,
        "Add audience, requires_planned and planned_deadline columns to scout_events",
    ),
    Migration(
        "20260810_add_attendance_mode",
        _add_attendance_mode,
        "Add planned/real mode to scout_attendances with composite unique constraint",
    ),
    Migration(
        "20260810_add_attendance_created_at",
        _add_attendance_created_at_column,
        "Add created_at column to scout_attendances for registration date tracking",
    ),
    Migration(
        "20260812_create_web_tables",
        _create_web_tables,
        "Create web_pages and web_media tables for the web page designer module",
    ),
    Migration(
        "20260813_create_web_templates",
        _create_web_templates_table,
        "Create web_templates table and seed default page templates",
    ),
    Migration(
        "20260813_web_cms",
        _web_cms_extend,
        "CMS upgrade: page hierarchy/trash/revisions, posts, menus, media albums",
    ),
    Migration(
        "20260814_advanced_web_cms_schema",
        _advanced_web_cms_schema,
        "Advanced CMS drafts, immutable publications, design resources and themes",
    ),
    Migration(
        "20260814_web_cms_template_reference",
        _advanced_web_cms_template_reference,
        "Add composable page template references",
    ),
    Migration(
        "20260814_web_media_public_visibility",
        _web_media_public_visibility,
        "Add opt-in public visibility for website media",
    ),
    Migration(
        "20260814_web_media_tree_and_previews",
        _web_media_tree_and_previews,
        "Add media folder tree and design resource preview media references",
    ),
    Migration(
        "20260815_web_media_note",
        _web_media_note_and_metadata,
        "Add editor note and simplify web media metadata",
    ),
    Migration(
        "20260815_web_linked_resource_props",
        _web_linked_resource_props,
        "Add typed props and published snapshots for linked components and sections",
    ),
    Migration(
        "20260816_add_template_usage_mode",
        _add_template_usage_mode,
        "Add usage_mode to web_templates for linked_layout vs copy_on_create",
    ),
    Migration(
        "20260816_create_web_page_templates",
        _create_web_page_templates,
        "Create Page Templates table and page provenance columns",
    ),
    Migration(
        "20260816_drop_legacy_design_tables",
        _drop_legacy_design_tables,
        "Contract phase: drop legacy web_page_templates, web_global_parts, web_template_parts",
    ),
    Migration(
        "20260816_create_preview_artifacts",
        _create_preview_artifacts,
        "Create WebPreviewArtifact table for cached browser previews",
    ),
    Migration(
        "20260816_migrate_page_templates_into_web_templates",
        _migrate_page_templates_into_web_templates,
        "Migrate Page Templates into WebTemplate (copy_on_create mode)",
    ),
    Migration(
        "20260816_migrate_global_parts_into_sections",
        _migrate_global_parts_into_sections,
        "Migrate Global Parts into WebSection",
    ),
    Migration(
        "20260816_add_page_source_template_columns",
        _add_page_source_template_columns,
        "Add source_template_id + source_template_version provenance columns",
    ),
    Migration(
        "20260816_create_web_global_parts",
        _create_web_global_parts,
        "Create WebGlobalPart table for site-owned shared parts",
    ),
    Migration(
        "20260816_add_web_post_event_reference",
        _add_web_post_event_reference,
        "Add optional Scout event links to posts and post revisions",
    ),
    Migration(
        "20260816_normalize_legacy_usernames",
        _normalize_legacy_usernames,
        "Normalize legacy usernames to the canonical login format",
    ),
    Migration(
        "20260813_create_member_tables",
        _create_member_tables,
        "Create compact member metadata, tags and internal notes",
    ),
    Migration(
        "20260816_retire_inventory_events",
        _retire_inventory_event_locations,
        "Release legacy inventory event placements while retaining historical audit data",
    ),
    Migration(
        "20260816_inventory_item_location_quantities",
        _add_inventory_item_location_quantities,
        "Track physical inventory quantities across multiple locations",
    ),
    Migration(
        "20260816_inventory_sets",
        _add_inventory_sets,
        "Add equipment sets and item membership",
    ),
    Migration(
        "20260816_global_inventory_sets",
        _remove_inventory_set_team_assignment,
        "Remove team assignment from equipment sets",
    ),
    Migration(
        "20260816_inventory_set_item_fields",
        _add_inventory_set_item_fields,
        "Add item-like fields to equipment sets",
    ),
    Migration(
        "20260816_attendance_query_indexes",
        _add_attendance_query_indexes,
        "Add indexes used by the administrative attendance views",
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
