"""Upgrade coverage for the additive advanced CMS schema."""

from sqlalchemy import create_engine, inspect, text

from app.database import Base
from app import models  # noqa: F401 - registers complete model metadata
from app.migrations import (
    _advanced_web_cms_schema,
    _advanced_web_cms_template_reference,
    _create_web_global_parts,
    _create_web_page_templates,
    _web_linked_resource_props,
    _web_media_public_visibility,
)


LEGACY_SCHEMA = """
CREATE TABLE users (id INTEGER PRIMARY KEY);
CREATE TABLE teams (id INTEGER PRIMARY KEY);
CREATE TABLE scout_events (id INTEGER PRIMARY KEY, title VARCHAR(200) NOT NULL);
CREATE TABLE web_media (
    id INTEGER PRIMARY KEY, filename VARCHAR(255) NOT NULL, path VARCHAR(500) NOT NULL,
    size INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE web_pages (
    id INTEGER PRIMARY KEY, slug VARCHAR(200) NOT NULL UNIQUE, title VARCHAR(200) NOT NULL,
    template VARCHAR(50), data JSON, html TEXT, published BOOLEAN NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0, parent_id INTEGER REFERENCES web_pages(id),
    meta_description VARCHAR(300), deleted_at TIMESTAMP, team_id INTEGER, created_by_id INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE web_page_revisions (
    id INTEGER PRIMARY KEY, page_id INTEGER NOT NULL REFERENCES web_pages(id), html TEXT, data JSON,
    created_by_id INTEGER, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE web_posts (
    id INTEGER PRIMARY KEY, title VARCHAR(200) NOT NULL, slug VARCHAR(200) NOT NULL UNIQUE,
    excerpt VARCHAR(500), body TEXT, cover_media_id INTEGER, published BOOLEAN NOT NULL DEFAULT 0,
    published_at TIMESTAMP, created_by_id INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE web_menus (
    id INTEGER PRIMARY KEY, name VARCHAR(100) NOT NULL, location VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE web_menu_items (
    id INTEGER PRIMARY KEY, menu_id INTEGER NOT NULL, parent_id INTEGER, label VARCHAR(200) NOT NULL,
    page_slug VARCHAR(200), url VARCHAR(500), position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE web_templates (
    id INTEGER PRIMARY KEY, key VARCHAR(50) NOT NULL UNIQUE, name VARCHAR(200) NOT NULL,
    description VARCHAR(500), html TEXT NOT NULL, css TEXT NOT NULL DEFAULT '',
    is_system BOOLEAN NOT NULL DEFAULT 0, created_by_id INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""


def _create_legacy_database(engine) -> None:
    raw = engine.raw_connection()
    try:
        raw.executescript(LEGACY_SCHEMA)
        raw.commit()
    finally:
        raw.close()

    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO web_pages (id, slug, title, template, data, html, published) "
                "VALUES (1, 'main', 'Home', 'page', :data, '<main>live</main>', 1)"
            ),
            {"data": '{"pages": [{"id": "home"}]}'},
        )
        connection.execute(
            text(
                "INSERT INTO web_pages (id, slug, title, parent_id, data, html, published) "
                "VALUES (2, 'about', 'About', 1, :data, '<main>about</main>', 1)"
            ),
            {"data": '{"pages": [{"id": "about"}]}'},
        )
        connection.execute(
            text(
                "INSERT INTO web_page_revisions (page_id, html, data) "
                "VALUES (1, '<main>older</main>', :data)"
            ),
            {"data": '{"pages": []}'},
        )
        connection.execute(
            text(
                "INSERT INTO web_posts (id, title, slug, body, published) "
                "VALUES (1, 'News', 'news', 'Published body', 1)"
            )
        )
        connection.execute(text("INSERT INTO web_menus (id, name, location) VALUES (1, 'Main', 'main')"))
        connection.execute(
            text(
                "INSERT INTO web_menu_items (id, menu_id, label, page_slug, position) "
                "VALUES (1, 1, 'About', 'about', 0)"
            )
        )
        connection.execute(
            text(
                "INSERT INTO web_menu_items (id, menu_id, parent_id, label, url, position) "
                "VALUES (2, 1, 1, 'Child', '/child', 0)"
            )
        )
        connection.execute(
            text(
                "INSERT INTO web_templates (id, key, name, html, css, is_system) "
                "VALUES (1, 'page', 'Page', '<main></main>', :css, 1)"
            ),
            {"css": ":root{}"},
        )


def test_advanced_web_schema_upgrades_legacy_data_idempotently(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}", future=True)
    _create_legacy_database(engine)

    with engine.begin() as connection:
        _advanced_web_cms_schema(connection)
        _web_media_public_visibility(connection)
    # Simulate recovery/re-entry independently of schema_migrations bookkeeping.
    with engine.begin() as connection:
        _advanced_web_cms_schema(connection)

    inspector = inspect(engine)
    assert {
        "web_post_revisions",
        "web_menu_revisions",
        "web_themes",
        "web_theme_versions",
        "web_theme_assets",
        "web_reusable_components",
        "web_sections",
        "web_patterns",
        "web_template_parts",
        "web_site_styles",
        "web_redirects",
    }.issubset(inspector.get_table_names())

    with engine.connect() as connection:
        pages = connection.execute(
            text(
                "SELECT id, path_segment, path, template_id, draft_version, published_revision_id "
                "FROM web_pages ORDER BY id"
            )
        ).mappings().all()
        assert [dict(page) for page in pages] == [
            {
                "id": 1, "path_segment": "main", "path": "/", "template_id": 1,
                "draft_version": 1, "published_revision_id": 2,
            },
            {
                "id": 2, "path_segment": "about", "path": "/about", "template_id": None,
                "draft_version": 1, "published_revision_id": 3,
            },
        ]

        page_revisions = connection.execute(
            text(
                "SELECT page_id, revision_number, title, path, html, is_publication "
                "FROM web_page_revisions ORDER BY id"
            )
        ).mappings().all()
        assert len(page_revisions) == 3
        assert page_revisions[0]["revision_number"] == 1
        assert page_revisions[1]["html"] == "<main>live</main>"
        assert page_revisions[1]["is_publication"] == 1
        assert page_revisions[2]["path"] == "/about"
        assert connection.execute(
            text(
                "SELECT r.template_id FROM web_pages p "
                "JOIN web_page_revisions r ON r.id = p.published_revision_id WHERE p.id = 1"
            )
        ).scalar_one() == 1

        post = connection.execute(
            text(
                "SELECT p.published_revision_id, r.body, r.is_publication "
                "FROM web_posts p JOIN web_post_revisions r ON r.id = p.published_revision_id"
            )
        ).mappings().one()
        assert dict(post) == {
            "published_revision_id": 1,
            "body": "Published body",
            "is_publication": 1,
        }

        menu = connection.execute(
            text(
                "SELECT m.published_revision_id, r.tree "
                "FROM web_menus m JOIN web_menu_revisions r ON r.id = m.published_revision_id"
            )
        ).mappings().one()
        assert '"item_type": "page"' in menu["tree"]
        assert '"page_id": 2' in menu["tree"]
        assert '"children": [{"id": 2' in menu["tree"]
        assert connection.execute(text("SELECT COUNT(*) FROM web_site_styles")).scalar_one() == 1
        assert connection.execute(text("SELECT COUNT(*) FROM web_page_revisions")).scalar_one() == 3
        assert connection.execute(text("SELECT COUNT(*) FROM web_post_revisions")).scalar_one() == 1
        assert connection.execute(text("SELECT COUNT(*) FROM web_menu_revisions")).scalar_one() == 1

    engine.dispose()


def test_advanced_web_schema_matches_fresh_model_metadata(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'fresh.db'}", future=True)
    Base.metadata.create_all(engine)

    with engine.begin() as connection:
        _advanced_web_cms_schema(connection)
        _advanced_web_cms_schema(connection)

    inspector = inspect(engine)
    page_columns = {column["name"] for column in inspector.get_columns("web_pages")}
    assert {"path", "template_id", "draft_version", "published_revision_id", "seo_title"} <= page_columns
    assert "is_public" in {
        column["name"] for column in inspector.get_columns("scout_events")
    }
    assert "is_public" in {
        column["name"] for column in inspector.get_columns("web_media")
    }
    with engine.connect() as connection:
        assert connection.execute(text("SELECT COUNT(*) FROM web_site_styles")).scalar_one() == 1

    engine.dispose()


def test_template_reference_followup_does_not_rewrite_live_snapshots(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'followup.db'}", future=True)
    _create_legacy_database(engine)
    with engine.begin() as connection:
        _advanced_web_cms_schema(connection)
        published = connection.execute(text(
            "SELECT r.id, r.path, r.path_segment, r.template_id "
            "FROM web_pages p JOIN web_page_revisions r ON r.id = p.published_revision_id "
            "WHERE p.id = 1"
        )).mappings().one()
        connection.execute(text(
            "UPDATE web_menu_items SET item_type = 'post', post_id = 1, page_id = NULL WHERE id = 1"
        ))
        connection.execute(text(
            "UPDATE web_pages SET path = '/draft-only', path_segment = 'draft-only', template_id = NULL "
            "WHERE id = 1"
        ))
        _advanced_web_cms_template_reference(connection)
        after = connection.execute(text(
            "SELECT path, path_segment, template_id FROM web_page_revisions WHERE id = :id"
        ), {"id": published["id"]}).mappings().one()
        assert dict(after) == {
            "path": published["path"],
            "path_segment": published["path_segment"],
            "template_id": published["template_id"],
        }
        assert connection.execute(text(
            "SELECT item_type FROM web_menu_items WHERE id = 1"
        )).scalar_one() == "post"
    engine.dispose()


def test_linked_resource_props_migration_backfills_published_snapshots(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'linked-props.db'}", future=True)
    _create_legacy_database(engine)
    with engine.begin() as connection:
        _advanced_web_cms_schema(connection)
        connection.execute(text(
            "INSERT INTO web_reusable_components "
            "(qualified_key, name, project_data, css, prop_schema, default_props, variants, "
            "published_css, published_prop_schema, published_default_props, published_variants, "
            "published_version, draft_version, is_locked, created_at, updated_at) "
            "VALUES ('site:card', 'Card', :project, '.card{}', '[]', '{}', '[]', '', '[]', '{}', '[]', "
            "0, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
        ), {"project": '{"pages": []}'})
        _web_linked_resource_props(connection)
        _web_linked_resource_props(connection)
    columns = {column["name"] for column in inspect(engine).get_columns("web_reusable_components")}
    assert {"prop_schema", "default_props", "variants", "published_project_data", "published_version"} <= columns
    with engine.connect() as connection:
        row = connection.execute(text(
            "SELECT published_project_data, published_css, published_version "
            "FROM web_reusable_components WHERE qualified_key = 'site:card'"
        )).mappings().one()
        assert row["published_project_data"] == '{"pages": []}'
        assert row["published_css"] == ".card{}"
        assert row["published_version"] == 1
    engine.dispose()


def test_web_global_parts_migration_creates_table_idempotently(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'global-parts.db'}", future=True)
    _create_legacy_database(engine)
    with engine.begin() as connection:
        _advanced_web_cms_schema(connection)
        _create_web_global_parts(connection)
        _create_web_global_parts(connection)

    tables = set(inspect(engine).get_table_names())
    assert "web_global_parts" in tables

    columns = {col["name"] for col in inspect(engine).get_columns("web_global_parts")}
    assert "qualified_key" in columns
    assert "project_data" in columns
    assert "usage_count" in columns
    assert "published_version" in columns
    assert "theme_version_id" not in columns
    assert "is_locked" not in columns

    with engine.connect() as connection:
        connection.execute(text(
            "INSERT INTO web_global_parts "
            "(qualified_key, name, project_data, css, draft_version, usage_count) "
            "VALUES (:key, :name, :project, '', 1, 0)"
        ), {"key": "site.footer", "name": "Footer", "project": '{"pages": []}'})
        connection.execute(text(
            "INSERT INTO web_global_parts "
            "(qualified_key, name, project_data, css, draft_version, usage_count) "
            "VALUES (:key, :name, :project, '', 1, 0)"
        ), {"key": "site.header", "name": "Header", "project": '{"pages": []}'})
        connection.commit()
        rows = connection.execute(text(
            "SELECT qualified_key, name FROM web_global_parts ORDER BY id"
        )).mappings().all()
        assert [dict(r) for r in rows] == [
            {"qualified_key": "site.footer", "name": "Footer"},
            {"qualified_key": "site.header", "name": "Header"},
        ]

    engine.dispose()


def test_web_page_templates_migration_creates_table_and_provenance(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'page-templates.db'}", future=True)
    _create_legacy_database(engine)
    with engine.begin() as connection:
        _advanced_web_cms_schema(connection)
        _create_web_page_templates(connection)
        _create_web_page_templates(connection)

    tables = set(inspect(engine).get_table_names())
    assert "web_page_templates" in tables

    columns = {col["name"] for col in inspect(engine).get_columns("web_page_templates")}
    assert "qualified_key" in columns
    assert "project_data" in columns
    assert "published_project_data" in columns
    assert "published_version" in columns

    page_cols = {col["name"] for col in inspect(engine).get_columns("web_pages")}
    assert "page_template_id" in page_cols
    assert "page_template_version" in page_cols

    # Verify template_kind normalization to layout
    with engine.connect() as connection:
        # Insert a legacy template with kind='page'
        connection.execute(text(
            "INSERT INTO web_templates (key, name, html, css, template_kind) "
            "VALUES ('legacy-page', 'Legacy Page', '<main></main>', '', 'page')"
        ))
        connection.commit()
        _create_web_page_templates(connection)
        row = connection.execute(text(
            "SELECT template_kind FROM web_templates WHERE key = 'legacy-page'"
        )).scalar_one()
        assert row == "layout"

    engine.dispose()
