from copy import deepcopy
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import io
import json
import zipfile

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.models import (
    DirectUserPermission, DirectUserPermissionDeny, PermissionDefinition,
    RegisteredModule, RoleEnum, ScoutEvent, User, WebMedia, WebMenu, WebMenuRevision,
    WebPage, WebPageRevision, WebPost, WebPostRevision, WebReusableComponent, WebSiteStyle,
    WebTemplate, WebSection, WebTheme, WebThemeVersion,
)
from app.modules import registry
from app.web.data_sources import DataSourceUnavailableError, list_data_sources, resolve_public_source
from app.web.pages import _extract_page_content, publish_page, save_draft, validate_parent
from app.web.linked_resources import validate_linked_resource_instances
from app.web.renderer import CompileError, compile_project, render_document, render_project
from app.web.resource_props import ResourcePropsError
from app.web.routes_media import MAX_MEDIA_SIZE, _sniff_image, _stored_media_path
from app.web_render import render_markdown, sanitize_legacy_html
from app.web.url_schemes import validate_url_pattern


def project(*components, styles=None):
    """Real GrapesJS 0.21 project shape (page -> frame -> component)."""
    return {
        "assets": [],
        "styles": [],
        "pages": [{
            "id": "page-1",
            "frames": [{
                "id": "frame-1",
                "component": {"type": "wrapper", "components": list(components)},
                "styles": styles or [],
            }],
        }],
        "scoutcomp": {"schemaVersion": 2},
    }


def text(value):
    return {"type": "text", "tagName": "p", "content": value}


def test_real_grapes_project_repeat_bind_condition_and_empty(db_session):
    source = {
        "type": "sc-repeat",
        "source": "core.events",
        "params": {"limit": 2},
        "components": [
            {"type": "text", "tagName": "h2", "scBindings": {
                "text": {"scope": "context", "field": "title"},
            }},
            {"type": "sc-condition", "condition": {
                "left": {"scope": "context", "field": "kind"},
                "operator": "eq", "right": "trip",
            }, "components": [text("Výprava")]},
        ],
        "empty": [text("Nic tu není")],
    }
    compiled = compile_project(project(source))
    rendered = render_project(
        db_session, compiled.tree,
        resolver=lambda *_: [
            {"title": "Tábor <script>", "kind": "trip"},
            {"title": "Schůzka", "kind": "meeting"},
        ],
    )
    assert rendered == (
        "<main><h2>Tábor &lt;script&gt;</h2><p>Výprava</p>"
        "<h2>Schůzka</h2></main>"
    )
    empty = render_project(db_session, compiled.tree, resolver=lambda *_: [])
    assert "Nic tu není" in empty


def test_repeat_rejects_page_team_parameter_binding():
    with pytest.raises(CompileError, match="cannot be bound to a team"):
        compile_project(project({
            "type": "sc-repeat", "source": "core.events",
            "params": {"team_id": {"$scBinding": {"scope": "page", "field": "team_id"}}},
        }))

def test_repeat_rejects_non_page_parameter_binding():
    with pytest.raises(CompileError, match="page scope"):
        compile_project(project({
            "type": "sc-repeat", "source": "core.events",
            "params": {"team_id": {"$scBinding": {"scope": "site", "field": "id"}}},
        }))


def test_url_schema_rejects_external_and_ambiguous_patterns():
    assert validate_url_pattern("/aktuality/{slug}", "slug", label="Article") == "/aktuality/{slug}"
    with pytest.raises(HTTPException, match="schema is invalid"):
        validate_url_pattern("https://example.test/{slug}", "slug", label="Article")
    with pytest.raises(HTTPException, match="schema is invalid"):
        validate_url_pattern("/aktuality/{id}", "slug", label="Article")


def test_pagination_renders_previous_and_next_links_from_request_page(db_session):
    compiled = compile_project(project({
        "type": "sc-pagination", "source": "core.posts", "limit": 2,
        "params": {"limit": 2, "page": {"$scBinding": {"scope": "page", "field": "query.page"}}},
    }))

    rendered = render_project(
        db_session, compiled.tree, page={"query": {"page": "2"}},
        resolver=lambda *_: [{"id": 1}, {"id": 2}, {"id": 3}],
    )

    assert 'rel="prev" href="?page=1"' in rendered
    assert 'aria-current="page">2<' in rendered
    assert 'rel="next" href="?page=3"' in rendered


def test_pagination_accepts_grapesjs_omitted_default_source(db_session):
    compiled = compile_project(project({"type": "sc-pagination", "limit": 6, "params": {"limit": 6}}))

    assert compiled.tree["components"][0]["source"] == "core.posts"
    assert render_project(db_session, compiled.tree, resolver=lambda *_: []) == "<main></main>"


def test_unconfigured_pagination_saves_and_fails_closed(db_session):
    compiled = compile_project(project({"type": "sc-pagination", "source": "", "limit": 6}))

    assert compiled.tree["components"][0]["source"] == ""
    assert render_project(
        db_session, compiled.tree,
        resolver=lambda *_: pytest.fail("resolver must not run"),
    ) == "<main></main>"


def test_pagination_does_not_render_phantom_next_link_on_exact_final_page(db_session):
    compiled = compile_project(project({
        "type": "sc-pagination", "source": "core.posts", "limit": 2,
        "params": {"limit": 2, "page": {"$scBinding": {"scope": "page", "field": "query.page"}}},
    }))
    def resolver(_db, _source, params, *_args):
        return [{"id": 1}, {"id": 2}] if int(params["page"]) == 2 else []

    rendered = render_project(
        db_session, compiled.tree, page={"query": {"page": "2"}}, resolver=resolver,
    )
    assert 'rel="prev" href="?page=1"' in rendered
    assert 'rel="next"' not in rendered


def test_pagination_binds_to_nearest_repeat_and_owns_its_page_size():
    compiled = compile_project(project(
        {"type": "sc-repeat", "source": "core.posts", "params": {"limit": 3}},
        {
            "type": "default", "tagName": "div", "components": [{
                "type": "sc-repeat", "source": "core.events",
                "params": {"limit": 9, "kind": "meeting"},
                "components": [{"type": "text", "content": "Post"}],
            }],
        },
        {
            "type": "sc-pagination", "bindTo": "nearest",
            "pageSize": 4, "mode": "numbers",
        },
    ))

    repeat = compiled.tree["components"][1]["components"][0]
    pagination = compiled.tree["components"][2]
    expected_page = {"$scBinding": {"scope": "page", "field": "query.page"}}
    assert repeat["params"] == {
        "limit": 4, "kind": "meeting", "page": expected_page,
    }
    assert pagination["source"] == "core.events"
    assert pagination["limit"] == 4
    assert pagination["params"] == repeat["params"]
    assert pagination["mode"] == "numbers"


def test_pagination_lookahead_keeps_page_size_so_the_last_record_is_reachable(db_session):
    compiled = compile_project(project(
        {
            "type": "sc-repeat", "source": "core.posts",
            "components": [{
                "type": "sc-bind", "tagName": "span",
                "binding": {"scope": "context", "field": "title"},
            }],
        },
        {"type": "sc-pagination", "bindTo": "nearest", "pageSize": 2},
    ))
    records = [{"title": f"Post {index}"} for index in range(1, 6)]

    def resolver(_db, _source, params, *_args):
        limit = int(params["limit"])
        page_number = int(params["page"])
        offset = (page_number - 1) * limit
        return records[offset:offset + limit]

    second_page = render_project(
        db_session, compiled.tree, page={"query": {"page": "2"}}, resolver=resolver,
    )
    third_page = render_project(
        db_session, compiled.tree, page={"query": {"page": "3"}}, resolver=resolver,
    )

    assert "Post 3" in second_page and "Post 4" in second_page
    assert 'rel="next" href="?page=3"' in second_page
    assert "Post 5" in third_page
    assert 'rel="next"' not in third_page


def test_pagination_numbered_and_compact_modes(db_session):
    numbered = compile_project(project({
        "type": "sc-pagination", "source": "core.posts", "limit": 2,
        "mode": "numbers", "previousLabel": "Zpět", "nextLabel": "Vpřed",
        "params": {"limit": 2, "page": {"$scBinding": {"scope": "page", "field": "query.page"}}},
    }))
    numbered_html = render_project(
        db_session, numbered.tree, page={"query": {"page": "3"}},
        resolver=lambda *_: [{"id": 1}, {"id": 2}, {"id": 3}],
    )
    assert '>Zpět<' in numbered_html
    assert 'href="?page=1">1<' in numbered_html
    assert 'aria-current="page">3<' in numbered_html
    assert 'href="?page=4">4<' in numbered_html
    assert '>Vpřed<' in numbered_html

    compact = compile_project(project({
        "type": "sc-pagination", "source": "core.posts", "limit": 2,
        "mode": "compact", "params": {"limit": 2},
    }))
    compact_html = render_project(
        db_session, compact.tree, resolver=lambda *_: [{"id": 1}, {"id": 2}, {"id": 3}],
    )
    assert 'aria-current="page"' not in compact_html
    assert 'rel="next"' in compact_html


def test_calendar_component_normalises_configuration_and_renders_accessible_month(db_session, monkeypatch):
    from app.web import renderer as renderer_module
    monkeypatch.setattr(
        renderer_module, "_calendar_now",
        lambda: datetime(2026, 5, 19, 12, tzinfo=ZoneInfo("Europe/Prague")),
    )
    compiled = compile_project(project({
        "type": "sc-calendar", "dataSource": "core.events", "kind": "meeting",
        "teamId": "7", "firstDayOfWeek": "monday", "showDescription": "true",
        "components": [text("must not render")],
    }))
    calendar = compiled.tree["components"][0]
    assert calendar == {
        "type": "sc-calendar", "source": "core.events", "kind": "meeting",
        "teamId": 7, "firstDayOfWeek": "monday", "showDescription": True,
        "components": [],
    }
    seen = []

    def resolver(_db, source, params, *_args):
        seen.append((source, params))
        return [{
            "title": "Schůzka <bez skriptu>", "description": "Program & hry",
            "start_at": datetime(2026, 5, 19, 20, 0), "url": "/event/12", "color": "#176b44",
        }]

    rendered = render_project(
        db_session, compiled.tree, page={"query": {"month": "2026-05"}}, resolver=resolver,
    )

    assert len(seen) == 2
    assert all(source == "core.events" for source, _params in seen)
    month_params, upcoming_params = seen[0][1], seen[1][1]
    assert month_params["kind"] == "meeting" and month_params["team_id"] == 7
    assert month_params["overlap"] is True and month_params["limit"] == 501
    assert "to" in month_params
    assert upcoming_params["overlap"] is True and upcoming_params["limit"] == 501
    assert "to" not in upcoming_params
    # Noon in Prague is 10:00 UTC in May; database bounds follow the same UTC
    # storage contract as the authenticated application calendar.
    assert upcoming_params["from"] == datetime(2026, 5, 19, 10, 0)
    assert 'data-sc-calendar-month="2026-05"' in rendered
    assert "Květen 2026" in rendered
    assert 'href="?month=2026-04"' in rendered
    assert 'href="?month=2026-06"' in rendered
    assert '<legend>Zobrazení kalendáře</legend>' in rendered
    assert '▦ Měsíc</label>' in rendered and '☷ Seznam</label>' in rendered
    assert '<span class="sc-calendar-count sc-calendar-month-count">1 akce</span>' in rendered
    assert "Probíhající a budoucí akce" in rendered
    assert '<div class="sc-calendar-table" role="grid" aria-label="Kalendář – Květen 2026"' in rendered
    assert 'role="columnheader">Po</div>' in rendered
    assert 'role="gridcell" data-date="2026-05-19"' in rendered
    assert '<div class="sc-calendar-agenda">' in rendered
    assert "Schůzka &lt;bez skriptu&gt;" in rendered
    assert "Program &amp; hry" in rendered
    assert "/event/12" in rendered


def test_calendar_renders_multiday_events_in_stable_lanes_with_daily_overflow(db_session, monkeypatch):
    from app.web import renderer as renderer_module
    monkeypatch.setattr(
        renderer_module, "_calendar_now",
        lambda: datetime(2026, 5, 18, 8, tzinfo=ZoneInfo("Europe/Prague")),
    )
    compiled = compile_project(project({
        "type": "sc-calendar", "showDescription": True,
    }))

    def event(identifier, title, starts_at, ends_at=None):
        return {
            "id": identifier, "title": title, "description": f"Popis {title}",
            "start_at": starts_at, "end_at": ends_at,
            "url": f"/schuzky/{identifier}", "color": "#176b44",
        }

    records = [
        # Midnight is exclusive, matching the internal EventMonthCalendar:
        # this event occupies 18, 19 and 20 May, but not 21 May.
        event(1, "Tábor", datetime(2026, 5, 18, 7), datetime(2026, 5, 20, 22)),
        event(2, "Schůzka A", datetime(2026, 5, 19, 8), datetime(2026, 5, 19, 10))
        | {"color": "#f8e8a0"},
        event(3, "Schůzka B", datetime(2026, 5, 19, 9), datetime(2026, 5, 19, 11)),
        event(4, "Schůzka C", datetime(2026, 5, 19, 10), datetime(2026, 5, 19, 12)),
        event(5, "Schůzka D", datetime(2026, 5, 19, 11), datetime(2026, 5, 19, 13)),
    ]
    rendered = render_project(
        db_session, compiled.tree, page={"query": {"month": "2026-05"}},
        resolver=lambda *_: records,
    )

    # The long event is one real bar across three columns, not three unrelated
    # per-day labels. Midnight is exclusive, so it does not span 21 May.
    assert rendered.count('data-calendar-span="3"') == 1
    camp_bar = rendered.split('aria-label="Tábor,', 1)[0].rsplit(
        '<span class="sc-calendar-event sc-calendar-event-bar', 1,
    )[1]
    assert 'data-calendar-lane="1"' in camp_bar
    assert 'data-calendar-start="0"' in camp_bar
    assert "href=" not in camp_bar

    # Four concurrent one-day events compete with the long event. Desktop
    # mirrors the internal three-lane cap, while the list retains all events
    # exactly once instead of silently dropping or repeating them.
    may_nineteenth = rendered.split('data-date="2026-05-19"', 1)[1].split("</div>", 1)[0]
    assert '+2 další' in may_nineteenth
    assert '<details class="sc-calendar-overflow">' not in rendered
    assert 'class="sc-calendar-overflow" href="#sc-calendar-' in may_nineteenth
    assert 'aria-label="2 další akce dne 19. 5. 2026"' in may_nineteenth
    assert all(title in may_nineteenth for title in ("Schůzka A", "Schůzka B"))
    assert all(title not in may_nineteenth for title in ("Schůzka C", "Schůzka D"))
    title_position = rendered.index("<span>Schůzka A</span>")
    time_position = rendered.index(">10:00</time>", title_position)
    assert title_position < time_position
    assert 'class="sc-calendar-day-open"' in may_nineteenth
    day_modal = rendered.split(
        'data-calendar-modal-date="2026-05-19"', 1,
    )[1].split("</section>", 1)[0]
    assert 'class="sc-calendar-day-modal" role="dialog"' in rendered
    assert all(title in day_modal for title in (
        "Tábor", "Schůzka A", "Schůzka B", "Schůzka C", "Schůzka D",
    ))
    assert "18. 5. 2026 09:00 – 21. 5. 2026 00:00" in day_modal
    assert '--sc-calendar-event-color:#f8e8a0;--sc-calendar-event-text:#111' in rendered
    agenda_nineteenth = rendered.split(
        '<time class="sc-calendar-agenda-date" datetime="2026-05-19">', 1,
    )[1].split("</section>", 1)[0]
    assert all(title in agenda_nineteenth for title in (
        "Schůzka A", "Schůzka B", "Schůzka C", "Schůzka D",
    ))
    assert "Tábor" not in agenda_nineteenth
    agenda_eighteenth = rendered.split(
        '<time class="sc-calendar-agenda-date" datetime="2026-05-18">', 1,
    )[1].split("</section>", 1)[0]
    assert "Popis Tábor" in agenda_eighteenth
    assert rendered.split('<div class="sc-calendar-agenda">', 1)[1].count(">Tábor</a>") == 1
    assert 'aria-label="Tábor, 18. 5. 2026 09:00 – 21. 5. 2026 00:00"' in rendered


def test_calendar_splits_multiday_bar_once_at_each_week_boundary(db_session):
    compiled = compile_project(project({"type": "sc-calendar"}))
    rendered = render_project(
        db_session, compiled.tree, page={"query": {"month": "2026-05"}},
        resolver=lambda *_: [{
            "id": 7, "title": "Výprava přes víkend",
            "start_at": datetime(2026, 5, 22, 8),
            "end_at": datetime(2026, 5, 26, 18),
            "url": "/schuzky/7", "color": "#176b44",
        }],
    )

    # Monday-first weeks: Fri-Sun (columns 4..6) and Mon-Tue (0..1).
    assert rendered.count('class="sc-calendar-event sc-calendar-event-bar') == 2
    assert 'data-calendar-start="4" data-calendar-span="3"' in rendered
    assert 'data-calendar-start="0" data-calendar-span="2"' in rendered
    assert "sc-calendar-event-bar--continues-after" in rendered
    assert "sc-calendar-event-bar--continues-before" in rendered


def test_calendar_grid_keeps_past_events_but_agenda_only_shows_current_and_future(db_session, monkeypatch):
    from app.web import renderer as renderer_module
    monkeypatch.setattr(
        renderer_module, "_calendar_now",
        lambda: datetime(2026, 5, 19, 12, tzinfo=ZoneInfo("Europe/Prague")),
    )
    compiled = compile_project(project({"type": "sc-calendar"}))
    records = [
        {"id": 1, "title": "Skončená", "start_at": datetime(2026, 5, 19, 7), "end_at": datetime(2026, 5, 19, 8)},
        {"id": 2, "title": "Probíhající vícedenní", "start_at": datetime(2026, 5, 18, 9), "end_at": datetime(2026, 5, 20, 12)},
        {"id": 3, "title": "Budoucí", "start_at": datetime(2026, 5, 20, 16)},
        {"id": 4, "title": "Budoucí další rok", "start_at": datetime(2027, 6, 20, 16)},
    ]

    rendered = render_project(
        db_session, compiled.tree, page={"query": {"month": "2026-05"}},
        resolver=lambda *_: records,
    )

    grid, agenda = rendered.split('<div class="sc-calendar-agenda">', 1)
    assert "Skončená" in grid
    assert "Skončená" not in agenda
    assert "Probíhající vícedenní" in agenda
    assert agenda.count("Probíhající vícedenní") == 1
    assert "Pokračuje do 20. 5." in agenda
    assert "Budoucí" in agenda
    assert "Budoucí další rok" not in grid
    assert "Budoucí další rok" in agenda
    assert ">20. 6. 2027</time>" in agenda


def test_calendar_agenda_evaluates_ongoing_boundaries_in_utc(db_session, monkeypatch):
    from app.web import renderer as renderer_module
    monkeypatch.setattr(
        renderer_module, "_calendar_now",
        lambda: datetime(2026, 5, 19, 12, 0, tzinfo=ZoneInfo("Europe/Prague")),
    )
    compiled = compile_project(project({"type": "sc-calendar"}))
    records = [
        {
            "id": 1, "title": "Skončila před minutou",
            "start_at": datetime(2026, 5, 18, 8),
            "end_at": datetime(2026, 5, 19, 9, 59),
        },
        {
            "id": 2, "title": "Stále probíhá",
            "start_at": datetime(2026, 5, 18, 8),
            "end_at": datetime(2026, 5, 19, 10, 30),
        },
    ]

    rendered = render_project(
        db_session, compiled.tree, page={"query": {"month": "2026-05"}},
        resolver=lambda *_: records,
    )
    _grid, agenda = rendered.split('<div class="sc-calendar-agenda">', 1)

    assert "Skončila před minutou" not in agenda
    assert "Stále probíhá" in agenda


def test_calendar_rejects_months_above_bounded_event_limit(db_session):
    compiled = compile_project(project({"type": "sc-calendar"}))
    records = [{
        "id": index, "title": f"Akce {index}",
        "start_at": datetime(2026, 5, 19, 18),
    } for index in range(501)]

    with pytest.raises(CompileError, match="limit of 500 events"):
        render_project(
            db_session, compiled.tree, page={"query": {"month": "2026-05"}},
            resolver=lambda *_: records,
        )


@pytest.mark.parametrize("payload", [
    {"type": "sc-calendar", "source": "private.events"},
    {"type": "sc-calendar", "kind": "secret"},
    {"type": "sc-calendar", "teamId": "01"},
    {"type": "sc-calendar", "firstDayOfWeek": "friday"},
    {"type": "sc-calendar", "showDescription": "yes"},
])
def test_calendar_component_rejects_untrusted_configuration(payload):
    with pytest.raises(CompileError):
        compile_project(project(payload))


def test_public_image_binding_accepts_verified_avatar_and_replaces_missing_or_unsafe_images(db_session):
    compiled = compile_project(project({
        "type": "sc-repeat", "source": "core.events", "components": [{
            "type": "image", "tagName": "img", "attributes": {"alt": "Autor"},
            "scBindings": {"src": {"scope": "context", "field": "author_avatar"}},
        }],
    }))

    valid = render_project(
        db_session, compiled.tree,
        resolver=lambda *_: [{"author_avatar": "data:image/gif;base64,R0lGODlh"}],
    )
    unsafe = render_project(
        db_session, compiled.tree,
        resolver=lambda *_: [{"author_avatar": "data:image/svg+xml;base64,PHN2Zz4="}],
    )
    missing = render_project(
        db_session, compiled.tree,
        resolver=lambda *_: [{"author_avatar": None}],
    )

    assert 'src="data:image/gif;base64,R0lGODlh"' in valid
    assert "data:image/svg+xml" not in unsafe
    assert "<img" not in unsafe
    assert "<img" not in missing
    assert '<div aria-hidden="true" class="sc-image-placeholder"></div>' in unsafe
    assert '<div aria-hidden="true" class="sc-image-placeholder"></div>' in missing


def test_hierarchical_menu_component_preserves_children_and_safe_links(db_session):
    compiled = compile_project(project({"type": "sc-menu", "location": "main"}))
    assert compiled.tree["components"][0] == {"type": "sc-menu", "location": "main", "components": []}

    rendered = render_project(
        db_session,
        compiled.tree,
        resolver=lambda *_: [{
            "label": "O oddílu",
            "url": "/o-oddilu",
            "children": [{"label": "Historie", "url": "/historie", "target": "_blank"}],
        }],
    )
    assert 'class="sc-menu-list"' in rendered
    assert 'class="sc-menu-dropdown"' in rendered
    assert 'href="/historie" target="_blank" rel="noopener noreferrer"' in rendered


def test_menu_bootstrap_presentations_render_dropdowns_and_footer_columns(db_session):
    items = [{
        "label": "Schůzky",
        "url": "/schuzky",
        "children": [{"label": "Lachtani", "url": "/schuzky/lachtani"}],
    }]
    navbar = compile_project(project({
        "type": "sc-menu",
        "location": "main",
        "presentation": "bootstrap-navbar",
    }))
    navbar_html = render_project(db_session, navbar.tree, resolver=lambda *_: items)
    assert 'class="sc-menu-list navbar-nav"' in navbar_html
    assert "dropdown-toggle" in navbar_html
    assert "dropdown-menu" in navbar_html
    assert 'class="sc-menu-link dropdown-item text-dark"' in navbar_html
    assert "<details" not in navbar_html

    mobile = compile_project(project({
        "type": "sc-menu",
        "location": "main",
        "presentation": "ontario-mobile-navbar",
    }))
    mobile_html = render_project(db_session, mobile.tree, resolver=lambda *_: items)
    assert '<details class="sc-menu-details">' in mobile_html
    assert '<summary class="sc-menu-link nav-link dropdown-toggle">' in mobile_html

    footer = compile_project(project({
        "type": "sc-menu",
        "location": "footer",
        "presentation": "bootstrap-footer-columns",
    }))
    footer_html = render_project(db_session, footer.tree, resolver=lambda *_: items)
    assert 'class="sc-menu-list row"' in footer_html
    assert 'class="sc-menu-column col"' in footer_html
    assert "Lachtani" in footer_html
    assert "dropdown-item text-dark" not in footer_html


def test_theme_export_declares_user_resources_as_a_template_bundle(db_session):
    from app.web.theme_package import export_theme_archive

    theme = WebTheme(stable_key="export-bundle", name="Export bundle")
    db_session.add(theme)
    db_session.flush()
    version = WebThemeVersion(
        theme_id=theme.id,
        version="1.0.0",
        schema_version=1,
        manifest={"id": "export-bundle", "name": "Export bundle", "version": "1.0.0", "resources": {"templates": []}},
        default_tokens={}, base_css="", package_hash="b" * 64,
        install_path="missing-export-bundle/1.0.0",
    )
    db_session.add_all([version, WebReusableComponent(
        qualified_key="site:export-card", name="Export card", project_data=project(text("Card")),
    )])
    db_session.commit()

    with zipfile.ZipFile(io.BytesIO(export_theme_archive(db_session, version.id))) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        resources = json.loads(archive.read("site-resources.json"))

    assert manifest["site_resources"] == "site-resources.json"
    assert resources["components"][0]["qualified_key"] == "site:export-card"


def test_repeat_can_traverse_a_bounded_context_collection(db_session):
    compiled = compile_project(project({
        "type": "sc-repeat", "source": "web.menu", "components": [{
            "type": "sc-repeat", "source": "context.children", "components": [{
                "type": "sc-bind", "binding": {"scope": "context", "field": "label"},
            }],
        }],
    }))
    body = render_project(
        db_session,
        compiled.tree,
        resolver=lambda *_: [{"label": "Parent", "children": [{"label": "Child"}]}],
    )
    assert "Child" in body


def test_repeat_with_empty_source_is_safe_wip_state(db_session):
    """An empty repeat source saves/publishes and renders the empty branch."""
    compiled = compile_project(project({
        "type": "sc-repeat",
        "source": "",
        "params": {"limit": 2},
        "components": [text("Row")],
        "empty": [text("Není zdroj")],
    }))
    assert compiled.tree["type"] == "wrapper"
    repeat = compiled.tree["components"][0]
    assert repeat["source"] == ""
    # No resolver is consulted; the empty branch renders instead.
    def fail_resolver(*args):
        raise AssertionError("resolver must not run for an empty source")

    rendered = render_project(db_session, compiled.tree, resolver=fail_resolver)
    assert "Není zdroj" in rendered
    assert "Row" not in rendered


def test_repeat_without_source_attribute_is_safe_wip_state(db_session):
    """GrapesJS may omit default-valued properties; a missing source is also a safe WIP state."""
    compiled = compile_project(project({
        "type": "sc-repeat",
        "components": [text("Row")],
        "empty": [text("Zatím bez dat")],
    }))
    repeat = compiled.tree["components"][0]
    assert repeat["source"] == ""
    assert "Zatím bez dat" in render_project(db_session, compiled.tree)


def test_repeat_still_rejects_invalid_nonempty_source(db_session):
    with pytest.raises(CompileError):
        compile_project(project({"type": "sc-repeat", "source": "not a valid source!", "components": []}))
    with pytest.raises(CompileError):
        compile_project(project({"type": "sc-repeat", "source": {"bad": "shape"}, "components": []}))
    with pytest.raises(CompileError):
        compile_project(project({"type": "sc-repeat", "source": 0, "components": []}))


def test_renderer_rejects_xss_unsafe_urls_and_css_breakout(db_session):
    with pytest.raises(CompileError):
        compile_project(project({"type": "default", "tagName": "script", "content": "alert(1)"}))
    compiled = compile_project(project({
        "type": "link", "tagName": "a", "attributes": {"href": "javascript:alert(1)", "onclick": "x"},
        "content": "link",
    }))
    assert render_project(db_session, compiled.tree) == "<main><a>link</a></main>"
    with pytest.raises(CompileError):
        compile_project(project(text("x"), styles=[{
            "selectors": [{"name": "x"}], "style": {"color": "red;</style><script>alert(1)</script>"},
        }]))
    with pytest.raises(CompileError):
        render_document("", title="x", css="</style><script>alert(1)</script>")
    with pytest.raises(CompileError):
        render_document("", title="x", tokens={"color": "red;</style><script>"})


def test_renderer_accepts_legacy_empty_feature_test_url_but_not_external_css_url():
    document = render_document(
        "", title="x",
        css='@supports (mask-image:url("")){.shape{mask-image:none}}',
    )
    assert '@supports (mask-image:url(""))' in document
    document = render_document(
        "", title="x", css='.hero{background-image:url("/media/12/file")}',
    )
    assert 'url("/media/12/file")' in document
    with pytest.raises(CompileError):
        render_document(
            "", title="x",
            css=".tracked{background-image:url(https://evil.example/track.gif)}",
        )


def test_renderer_preserves_bounded_responsive_css():
    compiled = compile_project(project(text("responsive"), styles=[{
        "selectors": [{"name": "card"}],
        "style": {"display": "grid", "gap": "1rem"},
        "atRuleType": "media",
        "mediaText": "(max-width: 768px)",
    }]))
    assert compiled.css == "@media (max-width: 768px){.card{display:grid;gap:1rem}}"
    with pytest.raises(CompileError):
        compile_project(project(text("unsafe"), styles=[{
            "selectors": [{"name": "card"}],
            "style": {"display": "none"},
            "atRuleType": "media",
            "mediaText": "screen and (orientation: landscape)",
        }]))


def test_renderer_allows_bounded_overlay_custom_properties(db_session):
    component = {
        "type": "default",
        "tagName": "section",
        "attributes": {"class": "photo-hero", "data-sc-overlay": "true", "data-sc-overlay-enabled": "false"},
        "components": [text("overlay")],
    }
    compiled = compile_project(project(component, styles=[{
        "selectors": [{"name": "photo-hero"}],
        "style": {"--sc-overlay-color": "#142a4dcc", "--sc-overlay-opacity": "0.62"},
    }]))
    assert compiled.css == ".photo-hero{--sc-overlay-color:#142a4dcc;--sc-overlay-opacity:0.62}"
    rendered = render_project(db_session, compiled.tree)
    assert 'data-sc-overlay="true"' in rendered
    assert 'data-sc-overlay-enabled="false"' in rendered

    with pytest.raises(CompileError):
        compile_project(project(text("invalid overlay"), styles=[{
            "selectors": [{"name": "photo-hero"}],
            "style": {"--sc-overlay-opacity": "1.5"},
        }]))


def test_nested_design_tokens_and_safe_style_bindings(db_session):
    document = render_document("", title="x", tokens={
        "colors": {"primary": "#123456"},
        "typography": {"fontFamily": "Inter, sans-serif", "fontSize": "1rem"},
        "spacing": {"md": "1.5rem"},
        "radius": {"card": "8px"},
        "container": {"width": "72rem"},
    })
    for declaration in (
        "--sc-colors-primary:#123456",
        "--sc-typography-font-family:Inter, sans-serif",
        "--sc-typography-font-size:1rem",
        "--sc-spacing-md:1.5rem",
        "--sc-radius-card:8px",
        "--sc-container-width:72rem",
    ):
        assert declaration in document

    compiled = compile_project(project({
        "type": "text", "tagName": "p", "content": "bound",
        "scBindings": {
            "style.color": {"scope": "context", "field": "color"},
            "style.background-color": {"scope": "context", "field": "background"},
            "style.opacity": {"scope": "context", "field": "opacity"},
        },
    }))
    body = render_project(
        db_session, compiled.tree,
        resolver=lambda *_: [],
        page={}, site={},
    )
    # No repeater context means invalid/empty values cannot create a style.
    assert 'style=' not in body
    repeated = compile_project(project({
        "type": "sc-repeat", "source": "core.events", "components": [{
            "type": "text", "tagName": "p", "content": "bound",
            "scBindings": {
                "style.color": {"scope": "context", "field": "color"},
                "style.background-color": {"scope": "context", "field": "background"},
                "style.opacity": {"scope": "context", "field": "opacity"},
            },
        }],
    }))
    body = render_project(
        db_session, repeated.tree,
        resolver=lambda *_: [{"color": "#abc", "background": "javascript:red", "opacity": "0.5"}],
    )
    assert 'style="color:#abc;opacity:0.5"' in body
    assert "javascript" not in body


def test_linked_template_part_is_resolved_at_request_time(db_session):
    section = WebSection(
        qualified_key="site.header", name="Header", project_data=project(text("draft")),
        published_project_data=project({"type": "text", "tagName": "header", "content": "v1"}),
        published_version=1,
    )
    db_session.add(section); db_session.commit(); db_session.refresh(section)
    section.published_css = ".linked-header{color:red}"
    page = compile_project(project({"type": "sc-template-part", "resourceId": section.id}))
    css_layers = []
    assert "v1" in render_project(db_session, page.tree, css_layers=css_layers)
    assert any(".linked-header{color:red}" in layer for layer in css_layers)
    section.published_project_data = project({"type": "text", "tagName": "header", "content": "v2"})
    db_session.commit()
    assert "v2" in render_project(db_session, page.tree)


def test_global_part_resolves_published_at_request_time(db_session):
    section = WebSection(
        qualified_key="site.footer", name="Footer",
        project_data=project(text("draft footer")),
        published_project_data=project({"type": "text", "tagName": "footer", "content": "v1"}),
        published_version=1,
    )
    db_session.add(section); db_session.commit(); db_session.refresh(section)
    section.published_css = ".global-footer{color:red}"
    page = compile_project(project({"type": "sc-global-part", "resourceId": section.qualified_key}))
    css_layers = []
    assert "v1" in render_project(db_session, page.tree, css_layers=css_layers)
    assert any(".global-footer{color:red}" in layer for layer in css_layers)
    section.published_project_data = project({"type": "text", "tagName": "footer", "content": "v2"})
    db_session.commit()
    assert "v2" in render_project(db_session, page.tree)


def test_global_part_draft_only_when_unpublished(db_session):
    section = WebSection(
        qualified_key="site.announcement", name="Announcement",
        project_data=project({"type": "text", "tagName": "p", "content": "draft only"}),
        published_version=0,
    )
    db_session.add(section); db_session.commit()
    compiled = compile_project(project({"type": "sc-global-part", "resourceId": section.qualified_key}))
    assert "draft only" in render_project(db_session, compiled.tree, published_resources=False)
    assert render_project(db_session, compiled.tree) == "<main></main>"


def test_global_part_nested_resource_instance(db_session):
    component = WebReusableComponent(
        qualified_key="site:part-item", name="Item",
        project_data=project({"type": "text", "tagName": "span", "scBindings": {
            "text": {"scope": "props", "field": "label"},
        }}),
        prop_schema=[{"id": "label", "type": "text", "required": True}],
        default_props={},
        published_project_data=project({"type": "text", "tagName": "span", "scBindings": {
            "text": {"scope": "props", "field": "label"},
        }}),
        published_prop_schema=[{"id": "label", "type": "text", "required": True}],
        published_default_props={},
        published_version=1,
    )
    part = WebSection(
        qualified_key="site.nav", name="Nav",
        project_data=project(),
        published_project_data=project({
            "type": "sc-resource-instance",
            "resourceKind": "component",
            "resourceId": "site:part-item",
            "props": {"label": "Domů"},
        }),
        published_version=1,
    )
    db_session.add(component); db_session.add(part); db_session.commit()
    compiled = compile_project(project({"type": "sc-global-part", "resourceId": part.qualified_key}))
    assert "Domů" in render_project(db_session, compiled.tree)


def test_linked_component_uses_published_definition_props_and_css(db_session):
    definition_project = project({
        "type": "text",
        "tagName": "article",
        "classes": ["contact-card"],
        "scBindings": {"text": {"scope": "props", "field": "title"}},
    })
    component = WebReusableComponent(
        qualified_key="site:contact-card",
        name="Contact card",
        project_data=definition_project,
        css=".contact-card{color:blue}",
        prop_schema=[{"id": "title", "type": "text", "required": True}],
        default_props={},
        published_project_data=definition_project,
        published_css=".contact-card{color:red}",
        published_prop_schema=[{"id": "title", "type": "text", "required": True}],
        published_default_props={},
        published_version=1,
    )
    db_session.add(component)
    db_session.commit()
    compiled = compile_project(project({
        "type": "sc-resource-instance",
        "resourceKind": "component",
        "resourceId": component.qualified_key,
        "props": {"title": "Write <now>"},
    }))
    css_layers = []
    assert render_project(db_session, compiled.tree, css_layers=css_layers) == (
        '<main><article class="contact-card">Write &lt;now&gt;</article></main>'
    )
    assert any(".contact-card{color:red}" in layer for layer in css_layers)


def test_linked_component_draft_preview_and_prop_validation(db_session):
    component = WebReusableComponent(
        qualified_key="site:draft-card",
        name="Draft card",
        project_data=project({
            "type": "sc-bind",
            "binding": {"scope": "props", "field": "title"},
        }),
        prop_schema=[{"id": "title", "type": "text", "required": True}],
        default_props={},
        published_version=0,
    )
    db_session.add(component)
    db_session.commit()
    raw = project({
        "type": "sc-resource-instance",
        "resourceKind": "component",
        "resourceId": component.qualified_key,
        "props": {"title": "Draft"},
    })
    validate_linked_resource_instances(db_session, raw, published=False)
    compiled = compile_project(raw)
    assert "Draft" in render_project(db_session, compiled.tree, published_resources=False)
    assert render_project(db_session, compiled.tree) == "<main></main>"
    raw["pages"][0]["frames"][0]["component"]["components"][0]["props"] = {"unknown": "x"}
    with pytest.raises(ResourcePropsError, match="Unknown resource prop"):
        validate_linked_resource_instances(db_session, raw, published=False)


def test_linked_component_defaults_kind_when_grapesjs_omits_default(db_session):
    component = WebReusableComponent(
        qualified_key="site:grapes-default-card",
        name="Grapes default card",
        project_data=project({"type": "text", "tagName": "article", "content": "Card"}),
        published_project_data=project({"type": "text", "tagName": "article", "content": "Card"}),
        published_version=1,
    )
    db_session.add(component)
    db_session.commit()

    # GrapesJS 0.21 omits resourceKind because "component" is the custom
    # component model's default value.
    raw = project({
        "type": "sc-resource-instance",
        "resourceId": component.qualified_key,
        "props": {},
    })

    validate_linked_resource_instances(db_session, raw, published=False)
    compiled = compile_project(raw)
    assert compiled.tree["components"][0]["resourceKind"] == "component"
    assert "Card" in render_project(db_session, compiled.tree)


def test_grapes_default_component_survives_draft_preview_and_publish_routes(db_session):
    from app.web.routes_pages import (
        DraftPayload,
        PreviewPayload,
        PublishPayload,
        preview_page_draft,
        publish_page_draft,
        save_page_draft,
    )

    user = User(
        username="linked-card-editor",
        real_name="Linked card editor",
        password_hash="x",
        role=RoleEnum.ADMIN,
    )
    component = WebReusableComponent(
        qualified_key="site:route-card",
        name="Route card",
        project_data=project({"type": "text", "tagName": "article", "content": "Linked Card"}),
        published_project_data=project({"type": "text", "tagName": "article", "content": "Linked Card"}),
        published_version=1,
    )
    page = WebPage(
        slug="linked-card-page",
        path_segment="linked-card-page",
        path="/linked-card-page",
        title="Linked card page",
        data=project(),
        draft_version=1,
        created_by_id=None,
    )
    db_session.add_all([user, component, page])
    db_session.commit()

    payload_project = project({
        "type": "sc-resource-instance",
        "name": "Route card",
        "content": "◇ component: Route card",
        "attributes": {"data-sc-type": "resource-instance"},
        "resourceId": component.qualified_key,
        "resourceName": component.name,
        "props": {},
    })
    saved = save_page_draft(
        page.id,
        DraftPayload(project_data=payload_project, expected_version=1),
        db_session,
        user,
    )
    assert saved["draft_version"] == 2

    preview = preview_page_draft(
        page.id,
        PreviewPayload(project_data=payload_project, expected_version=2),
        db_session,
        user,
    )
    assert "Linked Card" in preview["html"]

    published = publish_page_draft(
        page.id,
        PublishPayload(expected_version=2),
        db_session,
        user,
    )
    assert published["published_revision_id"] is not None


def test_empty_repeat_survives_draft_save_and_publish_routes(db_session):
    from app.web.routes_pages import DraftPayload, PublishPayload, publish_page_draft, save_page_draft

    user = User(
        username="repeat-editor",
        real_name="Repeat editor",
        password_hash="x",
        role=RoleEnum.ADMIN,
    )
    page = WebPage(
        slug="empty-repeat-page",
        path_segment="empty-repeat-page",
        path="/empty-repeat-page",
        title="Empty repeat page",
        data=project(),
        draft_version=1,
    )
    db_session.add_all([user, page])
    db_session.commit()

    payload_project = project({
        "type": "sc-repeat",
        "source": "",
        "params": {},
        "components": [text("Row")],
        "empty": [text("Zatím bez zdroje")],
    })
    saved = save_page_draft(
        page.id,
        DraftPayload(project_data=payload_project, expected_version=1),
        db_session,
        user,
    )
    assert saved["draft_version"] == 2

    published = publish_page_draft(
        page.id,
        PublishPayload(expected_version=2),
        db_session,
        user,
    )
    assert published["published_revision_id"] is not None


def test_linked_component_variants_merge_order(db_session):
    """default_props -> variant.props -> instance.props wins."""
    component = WebReusableComponent(
        qualified_key="site:variant-card",
        name="Variant card",
        project_data=project({
            "type": "sc-bind",
            "binding": {"scope": "props", "field": "heading"},
        }),
        prop_schema=[
            {"id": "heading", "type": "text"},
            {"id": "color", "type": "text"},
        ],
        default_props={"heading": "Default", "color": "black"},
        variants=[
            {"id": "red", "label": "Red", "props": {"color": "red"}},
            {"id": "blue", "label": "Blue", "props": {"color": "blue"}},
        ],
        published_project_data=project({
            "type": "sc-bind",
            "binding": {"scope": "props", "field": "heading"},
        }),
        published_prop_schema=[
            {"id": "heading", "type": "text"},
            {"id": "color", "type": "text"},
        ],
        published_default_props={"heading": "Default", "color": "black"},
        published_variants=[
            {"id": "red", "label": "Red", "props": {"color": "red"}},
            {"id": "blue", "label": "Blue", "props": {"color": "blue"}},
        ],
        published_version=1,
    )
    db_session.add(component)
    db_session.commit()

    # 1) No variant -> uses default props only.
    raw = project({
        "type": "sc-resource-instance",
        "resourceKind": "component",
        "resourceId": component.qualified_key,
        "props": {"heading": "My Heading"},
    })
    compiled = compile_project(raw)
    assert compiled.tree["components"][0].get("variant") is None
    html = render_project(db_session, compiled.tree)
    assert "My Heading" in html

    # 2) Variant "red" without instance override -> variant.color wins.
    raw2 = project({
        "type": "sc-resource-instance",
        "resourceKind": "component",
        "resourceId": component.qualified_key,
        "variant": "red",
        "props": {"heading": "Red Heading"},
    })
    compiled2 = compile_project(raw2)
    assert compiled2.tree["components"][0].get("variant") == "red"
    assert "Red Heading" in render_project(db_session, compiled2.tree)

    # 3) Variant "blue" with instance override -> instance.color wins.
    raw3 = project({
        "type": "sc-resource-instance",
        "resourceKind": "component",
        "resourceId": component.qualified_key,
        "variant": "blue",
        "props": {"heading": "Blue Heading", "color": "green"},
    })
    compiled3 = compile_project(raw3)
    assert compile_project(raw3).tree["components"][0].get("variant") == "blue"

    # 4) Invalid variant rejected at validation time.
    raw4 = project({
        "type": "sc-resource-instance",
        "resourceKind": "component",
        "resourceId": component.qualified_key,
        "variant": "nonexistent",
        "props": {},
    })
    with pytest.raises(ResourcePropsError, match="Linked resource variant was not found"):
        validate_linked_resource_instances(db_session, raw4, published=False)

    # 5) __none is silently treated as no variant.
    raw5 = project({
        "type": "sc-resource-instance",
        "resourceKind": "component",
        "resourceId": component.qualified_key,
        "variant": "__none",
        "props": {"heading": "Sentinel"},
    })
    compiled5 = compile_project(raw5)
    assert compiled5.tree["components"][0].get("variant") is None
    assert "Sentinel" in render_project(db_session, compiled5.tree)


def test_linked_component_variants_published_snapshot(db_session):
    """Published render uses published_variants, draft uses variants."""
    component = WebReusableComponent(
        qualified_key="site:snapshot-card",
        name="Snapshot card",
        project_data=project({
            "type": "sc-bind",
            "binding": {"scope": "props", "field": "label"},
        }),
        prop_schema=[{"id": "label", "type": "text"}],
        default_props={"label": "Draft"},
        variants=[{"id": "big", "label": "Big", "props": {"label": "Big Draft"}}],
        published_project_data=project({
            "type": "sc-bind",
            "binding": {"scope": "props", "field": "label"},
        }),
        published_prop_schema=[{"id": "label", "type": "text"}],
        published_default_props={"label": "Published"},
        published_variants=[{"id": "big", "label": "Big", "props": {"label": "Big Published"}}],
        published_version=1,
    )
    db_session.add(component)
    db_session.commit()

    raw = project({
        "type": "sc-resource-instance",
        "resourceKind": "component",
        "resourceId": component.qualified_key,
        "variant": "big",
        "props": {},
    })
    # Draft preview (published=False) renders against draft variant.
    assert "Big Draft" in render_project(db_session, compile_project(raw).tree, published_resources=False)
    # Public render (published=True) renders against published variant.
    assert "Big Published" in render_project(db_session, compile_project(raw).tree)


def test_materialize_props_scope_bindings(db_session):
    """materialize renders static HTML for props-only bindings."""
    definition = project({
        "type": "sc-bind",
        "binding": {"scope": "props", "field": "title", "format": ""},
        "mode": "text",
    })
    component = WebReusableComponent(
        qualified_key="site:mat-props",
        name="Props-only",
        project_data=definition,
        css=".mat{color:green}",
        prop_schema=[{"id": "title", "type": "text"}],
        default_props={"title": "Default"},
        published_project_data=definition,
        published_css=".mat{color:green}",
        published_prop_schema=[{"id": "title", "type": "text"}],
        published_default_props={"title": "Default"},
        published_version=1,
    )
    db_session.add(component)
    db_session.commit()

    from app.web.linked_resources import render_resource_fragment, resource_snapshot
    from app.web.resource_props import ResourcePropsError

    snapshot = resource_snapshot(db_session, "component", component.qualified_key, published=False)
    fragment = render_resource_fragment(db_session, snapshot, {"title": "Hello"}, variant=None)
    assert "Hello" in fragment.html
    assert ".mat{color:green}" in fragment.css
    # No runtime bindings — must succeed.
    from app.web.renderer import CompileError, compile_project, has_runtime_bindings
    compiled = compile_project(snapshot.project_data)
    assert not has_runtime_bindings(compiled.tree)


def test_materialize_rejects_context_bindings(db_session):
    """materialize must refuse scopes other than props."""
    definition = project({
        "type": "sc-bind",
        "binding": {"scope": "context", "field": "title"},
    })
    component = WebReusableComponent(
        qualified_key="site:mat-ctx",
        name="Context scope",
        project_data=definition,
        prop_schema=[],
        default_props={},
        published_version=0,
    )
    db_session.add(component)
    db_session.commit()

    from app.web.renderer import compile_project, has_runtime_bindings
    compiled = compile_project(definition)
    assert has_runtime_bindings(compiled.tree)


def test_materialize_rejects_runtime_bindings_in_nested_linked_definition(db_session):
    from app.web.linked_resources import resource_has_runtime_bindings, resource_snapshot

    nested = WebReusableComponent(
        qualified_key="site:nested-runtime",
        name="Nested runtime",
        project_data=project({
            "type": "sc-bind",
            "binding": {"scope": "context", "field": "title"},
        }),
    )
    db_session.add(nested)
    db_session.flush()
    parent = WebSection(
        qualified_key="site:parent-static-looking",
        name="Parent",
        project_data=project({
            "type": "sc-resource-instance",
            "resourceKind": "component",
            "resourceId": nested.qualified_key,
            "props": {},
        }),
    )
    db_session.add(parent)
    db_session.commit()

    snapshot = resource_snapshot(db_session, "section", parent.qualified_key, published=False)
    assert resource_has_runtime_bindings(db_session, snapshot) is True

def test_template_slot_composes_page_tree(db_session):
    template = compile_project(project(
        {"type": "text", "tagName": "header", "content": "Header"},
        {"type": "sc-slot", "name": "content", "components": [text("fallback")]},
        {"type": "text", "tagName": "footer", "content": "Footer"},
    ))
    page_tree = compile_project(project(text("Page body"))).tree
    rendered = render_project(db_session, template.tree, slot_tree=page_tree)
    assert rendered == "<main><header>Header</header><main><p>Page body</p></main><footer>Footer</footer></main>"


def test_slot_name_defaults_when_grapes_omits_default_model_property():
    with_attribute = compile_project(project({
        "type": "sc-slot",
        "attributes": {"data-sc-type": "slot", "data-sc-slot": "content"},
        "components": [],
    }))
    legacy_default = compile_project(project({"type": "sc-slot", "components": []}))

    assert with_attribute.tree["components"][0]["name"] == "content"
    assert legacy_default.tree["components"][0]["name"] == "content"

    with pytest.raises(CompileError, match="Slot name is invalid"):
        compile_project(project({
            "type": "sc-slot",
            "attributes": {"data-sc-slot": "Invalid slot"},
            "components": [],
        }))
    with pytest.raises(CompileError, match="Slot name is invalid"):
        compile_project(project({
            "type": "sc-slot",
            "name": "",
            "attributes": {"data-sc-slot": "content"},
            "components": [],
        }))


def test_linked_layout_merge_save_publish_with_legacy_default_slot(db_session):
    """Legacy sc-slot data (no ``name`` and no ``data-sc-slot`` attribute) must
    behave as the default content slot through the whole linked-layout chain."""
    from app.web.routes_pages import _merged_editor_project

    layout_project = project(
        {"type": "text", "tagName": "header", "content": "Header"},
        {"type": "sc-slot", "components": []},
    )
    layout = WebTemplate(
        key="legacy-slot-layout",
        qualified_key="site:template:legacy-slot-layout",
        name="Legacy slot layout",
        html="",
        usage_mode="linked_layout",
        project_data=layout_project,
        published_project_data=deepcopy(layout_project),
        published_version=1,
    )
    page = WebPage(
        slug="legacy-slot-page",
        path_segment="legacy-slot-page",
        path="/legacy-slot-page",
        title="Legacy slot page",
        data=project(text("Body")),
        draft_version=1,
    )
    db_session.add_all([layout, page])
    db_session.flush()
    page.template_id = layout.id
    db_session.commit()

    merged = _merged_editor_project(page, db_session)
    root = merged["pages"][0]["frames"][0]["component"]
    slot = root["components"][1]
    assert slot["type"] == "sc-slot"
    assert slot["components"][0]["content"] == "Body"
    # Template shell stays locked even though the slot carried no name.
    assert root["components"][0]["editable"] is False
    assert slot.get("editable") is not False

    save_draft(
        db_session,
        page,
        expected_version=1,
        project=merged,
        user_id=1,
        metadata={"title": page.title, "slug": page.slug, "template_id": layout.id},
    )
    # Only the slot children survive into the page-owned project.
    assert page.data["pages"][0]["frames"][0]["component"]["components"][0]["content"] == "Body"

    revision = publish_page(db_session, page, expected_version=2, user_id=1)
    # The revision stores the page-owned tree; template composition happens
    # at render time. Render through the page pipeline so the legacy slot of
    # the template is composed with the published page content.
    from app.web.pages import compile_draft
    from app.web.routes_pages import _render_compiled_page
    document = _render_compiled_page(db_session, page, compile_draft(page), published=True)
    assert "Header" in document
    assert "Body" in document


def test_legacy_html_sanitizer_preserves_placeholder_and_removes_xss():
    raw = (
        '<section onclick="alert(1)" style="color:red;position:fixed">Safe'
        '<script>alert(2)</script><a href="javascript:alert(3)">link</a>'
        '<scoutcomp-web-component data-component="events_list" data-limit="3">'
        '</scoutcomp-web-component></section>'
    )
    clean = sanitize_legacy_html(raw)
    assert "Safe" in clean
    assert "script" not in clean
    assert "onclick" not in clean
    assert "javascript" not in clean
    assert 'style="color:red"' in clean
    assert "position:fixed" not in clean
    assert 'data-component="events_list"' in clean


def test_markdown_fenced_code_cannot_inject_markup_or_css():
    rendered = render_markdown(
        '```\n</pre><style>body{display:none}</style><form action="/">owned</form>\n```'
    )
    assert "<style>" not in rendered
    assert "<form" not in rendered
    assert "&lt;/pre&gt;" in rendered


def test_public_post_route_uses_published_revision_slug(db_session, monkeypatch):
    from sqlalchemy.orm import sessionmaker
    import app.site_app as site_module

    post = WebPost(title="Draft", slug="new-draft-slug", body="Draft", published=True, draft_version=2)
    db_session.add(post); db_session.flush()
    revision = WebPostRevision(
        post_id=post.id, revision_number=1, source_version=1,
        title="Live", slug="live-slug", body="Published body",
        reason="publish", is_publication=True,
    )
    db_session.add(revision); db_session.flush()
    post.published_revision_id = revision.id
    db_session.commit()
    monkeypatch.setattr(site_module, "SessionLocal", sessionmaker(bind=db_session.bind))

    document = site_module.site_post("live-slug").body.decode()
    assert "Published body" in document
    assert 'class="web-detail-meta"' in document
    assert 'class="web-detail-author-fallback"' in document
    assert 'class="web-detail-date"' in document
    with pytest.raises(HTTPException) as caught:
        site_module.site_post("new-draft-slug")
    assert caught.value.status_code == 404


def test_public_site_resolves_custom_article_url_schema(db_session, monkeypatch):
    from starlette.requests import Request
    from app import site_app as site_module
    from app.routers.config import set_config_value

    post = WebPost(title="Článek", slug="clanek", body="Obsah", published=True)
    db_session.add(post); db_session.flush()
    revision = WebPostRevision(
        post_id=post.id, revision_number=1, source_version=1, title="Článek",
        slug="clanek", body="Obsah", reason="publish", is_publication=True,
    )
    db_session.add(revision); db_session.flush(); post.published_revision_id = revision.id
    set_config_value(db_session, "web.post_url_pattern", "/aktuality/{slug}")
    db_session.commit()
    monkeypatch.setattr(site_module, "SessionLocal", sessionmaker(bind=db_session.bind))

    response = site_module.nested_site_page("aktuality/clanek", Request({"type": "http", "query_string": b""}))

    assert response.status_code == 200
    assert "Obsah" in response.body.decode()


def test_public_event_detail_requires_public_event_and_renders_it(db_session, monkeypatch):
    from app import site_app as site_module

    author = User(
        username="meeting-author", real_name="Vedoucí", password_hash="x",
        avatar="data:image/gif;base64,R0lGODlh",
    )
    db_session.add(author); db_session.flush()
    event = ScoutEvent(
        title="Veřejná schůzka", description="Sraz u klubovny", kind="meeting",
        starts_at=datetime(2026, 5, 19, 18, 30), is_public=True, created_by_id=author.id,
    )
    db_session.add(event); db_session.commit()
    monkeypatch.setattr(site_module, "SessionLocal", sessionmaker(bind=db_session.bind))
    monkeypatch.setattr(site_module.settings.site, "public_url", "https://www.example.cz")

    response = site_module.site_event(event.id)

    assert response.status_code == 200
    document = response.body.decode()
    assert "Veřejná schůzka" in document
    assert 'class="web-detail-meta"' in document
    assert 'class="web-detail-author-avatar"' in document
    assert "Vedoucí" in document
    assert "<p>meeting</p>" not in document
    assert "úterý 19. května 2026 · 20:30" in document
    assert 'datetime="2026-05-19T20:30:00+02:00"' in document
    assert f'<link rel="canonical" href="https://www.example.cz/event/{event.id}">' in document
    assert f'<meta property="og:url" content="https://www.example.cz/event/{event.id}">' in document
    assert '<meta name="twitter:card" content="summary">' in document

    redirect = site_module.legacy_site_meeting(event.id)
    assert redirect.status_code == 308
    assert redirect.headers["location"] == f"/event/{event.id}"


def test_multiday_event_schedule_separates_start_and_end_for_readability():
    from app.site_app import _event_schedule

    markup = _event_schedule(
        datetime(2026, 8, 25, 0, tzinfo=ZoneInfo("Europe/Prague")),
        datetime(2026, 8, 27, 1, tzinfo=ZoneInfo("Europe/Prague")),
    )

    assert 'class="sc-event-date-points"' in markup
    assert "Začátek" in markup and "Konec" in markup
    assert "Začátek</span> <time" in markup
    assert "Konec</span> <time" in markup
    assert "úterý 25. srpna 2026 · 00:00" in markup
    assert "čtvrtek 27. srpna 2026 · 01:00" in markup
    assert 'datetime="2026-08-25T00:00:00+02:00"' in markup
    assert 'datetime="2026-08-27T01:00:00+02:00"' in markup


def test_explicit_publish_deny_blocks_live_destructive_actions(db_session):
    from app.web.routes_content import delete_menu, delete_post
    from app.web.routes_design import activate_theme_version
    from app.web.routes_pages import delete_page
    from app.web.routes_templates import delete_template

    registry.seed(db_session)
    user = User(
        username="no-publisher", real_name="No publisher", password_hash="x",
        role=RoleEnum.MEMBER, first_login_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db_session.add(user); db_session.flush()
    manage = db_session.query(PermissionDefinition).filter_by(module_code="web", code="manage").one()
    publish = db_session.query(PermissionDefinition).filter_by(module_code="web", code="publish").one()
    db_session.add_all([
        DirectUserPermission(user_id=user.id, permission_id=manage.id),
        DirectUserPermissionDeny(user_id=user.id, permission_id=publish.id),
    ])
    template = WebTemplate(
        key="live-template", qualified_key="live-template", name="Live", html="", css="",
        project_data=project(), published_project_data=project(), published_version=1,
    )
    page = WebPage(slug="live-page", title="Live page", data=project(), published=True)
    post = WebPost(slug="live-post", title="Live post", published=True)
    menu = WebMenu(name="Main", location="main")
    db_session.add_all([template, page, post, menu]); db_session.flush()
    page_revision = WebPageRevision(
        page_id=page.id, revision_number=1, source_version=1, title=page.title,
        path="/live-page", path_segment="live-page", data=project(),
        compiled_tree=compile_project(project()).tree, is_publication=True,
        reason="publish", template_id=template.id,
    )
    menu_revision = WebMenuRevision(
        menu_id=menu.id, revision_number=1, source_version=1,
        tree=[], reason="publish",
    )
    db_session.add_all([page_revision, menu_revision]); db_session.flush()
    page.published_revision_id = page_revision.id
    page.template_id = template.id
    menu.published_revision_id = menu_revision.id
    db_session.commit()

    calls = (
        lambda: delete_page(page.id, db_session, user),
        lambda: delete_post(post.id, db_session, user),
        lambda: delete_menu(menu.id, db_session, user),
        lambda: activate_theme_version(999999, db_session, user),
        lambda: delete_template(template.id, db_session, user),
    )
    for call in calls:
        with pytest.raises(HTTPException) as caught:
            call()
        assert caught.value.status_code == 403


def test_media_magic_size_and_path_security(tmp_path):
    assert _sniff_image(b'<svg xmlns="http://www.w3.org/2000/svg"></svg>') is None
    assert _sniff_image(b"\x89PNG\r\n\x1a\nrest") == "image/png"
    assert MAX_MEDIA_SIZE == 10 * 1024 * 1024
    original = settings.app.web_media_dir
    settings.app.web_media_dir = str(tmp_path / "media")
    try:
        with pytest.raises(HTTPException) as caught:
            _stored_media_path(WebMedia(filename="escape.png", path="../../escape.png", size=1))
        assert caught.value.status_code == 404
    finally:
        settings.app.web_media_dir = original


def test_publish_pointer_is_immutable_while_new_draft_is_saved(db_session):
    page = WebPage(
        slug="live", path_segment="live", path="/live", title="Live",
        data=project(text("version one")), draft_version=1, published=False,
    )
    db_session.add(page); db_session.commit(); db_session.refresh(page)
    published = publish_page(db_session, page, expected_version=1, user_id=1)
    pointer = page.published_revision_id
    assert pointer == published.id
    save_draft(
        db_session, page, expected_version=1, project=project(text("version two")),
        user_id=1, metadata={"title": "Live", "slug": "live"},
    )
    db_session.refresh(page)
    assert page.published_revision_id == pointer
    assert "version one" in render_project(db_session, published.compiled_tree)
    assert "version two" not in render_project(db_session, published.compiled_tree)


def test_optimistic_draft_save_is_atomic_across_sessions(db_session):
    page = WebPage(
        slug="race", path_segment="race", path="/race", title="Race",
        data=project(text("one")), draft_version=1,
    )
    db_session.add(page); db_session.commit(); page_id = page.id
    OtherSession = sessionmaker(bind=db_session.bind)
    stale_session = OtherSession()
    try:
        stale = stale_session.get(WebPage, page_id)
        current = db_session.get(WebPage, page_id)
        save_draft(
            db_session, current, expected_version=1, project=project(text("two")),
            user_id=1, metadata={"title": "Race", "slug": "race"},
        )
        with pytest.raises(HTTPException) as caught:
            save_draft(
                stale_session, stale, expected_version=1, project=project(text("stale")),
                user_id=1, metadata={"title": "Race", "slug": "race"},
            )
        assert caught.value.status_code == 409
    finally:
        stale_session.close()


def test_nested_paths_and_cycle_guard(db_session):
    parent = WebPage(slug="about", path_segment="about", path="/about", title="About", data=project(), draft_version=1)
    db_session.add(parent); db_session.commit(); db_session.refresh(parent)
    child = WebPage(
        slug="team", path_segment="team", path="/about/team", title="Team",
        parent_id=parent.id, data=project(), draft_version=1,
    )
    db_session.add(child); db_session.commit(); db_session.refresh(child)
    with pytest.raises(HTTPException) as caught:
        validate_parent(db_session, parent, child.id)
    assert caught.value.status_code == 400


def test_disabled_module_hides_public_data_sources(db_session):
    registry.seed(db_session)
    assert "core.events" in {item["id"] for item in list_data_sources(db_session)}
    core = db_session.query(RegisteredModule).filter_by(code="core").one()
    core.enabled = False
    db_session.commit()
    assert "core.events" not in {item["id"] for item in list_data_sources(db_session)}
    with pytest.raises(DataSourceUnavailableError):
        resolve_public_source(db_session, "core.events", {})


def test_template_copy_on_create(db_session):
    pt = WebTemplate(
        key="starter", name="Starter",
        project_data=project(text("starter-content")),
        html="", css="",
        published_project_data=project({"type": "text", "tagName": "div", "content": "Published Start"}),
        usage_mode="copy_on_create", published_version=1,
    )
    db_session.add(pt); db_session.commit(); db_session.refresh(pt)

    from app.web.routes_pages import _copy_source_template_project
    copied = _copy_source_template_project(db_session, pt.id)
    assert copied is not None
    root = copied["pages"][0]["frames"][0]["component"] if "frames" in copied["pages"][0] else copied["pages"][0]["component"]
    assert root["components"][0]["content"] == "Published Start"

    # Unpublished template returns None
    pt2 = WebTemplate(
        key="draft-only", name="Draft",
        project_data=project(text("draft")),
        html="", css="",
        usage_mode="copy_on_create", published_version=0,
    )
    db_session.add(pt2); db_session.commit()
    assert _copy_source_template_project(db_session, pt2.id) is None

    # Non-existent id returns None
    assert _copy_source_template_project(db_session, 99999) is None


def test_page_creation_rejects_invalid_source_template_contract(db_session):
    from app.web.routes_pages import PagePayload, create_page

    with pytest.raises(ValueError):
        PagePayload(title="Legacy template field", page_template_id=123)

    user = User(
        username="page-template-user", real_name="Page template user", password_hash="x",
        role=RoleEnum.ADMIN,
    )
    linked_layout = WebTemplate(
        key="linked-layout", qualified_key="site:template:linked-layout", name="Layout",
        html="", css="", project_data=project(), published_project_data=project(),
        published_version=1, usage_mode="linked_layout",
    )
    unpublished_starter = WebTemplate(
        key="unpublished-starter", qualified_key="site:template:unpublished-starter", name="Draft starter",
        html="", css="", project_data=project(), published_version=0,
        usage_mode="copy_on_create",
    )
    db_session.add_all([user, linked_layout, unpublished_starter]); db_session.commit()

    with pytest.raises(HTTPException) as linked_error:
        create_page(PagePayload(title="Invalid linked", source_template_id=linked_layout.id), db_session, user)
    assert linked_error.value.status_code == 422

    with pytest.raises(HTTPException) as unpublished_error:
        create_page(PagePayload(title="Invalid unpublished", source_template_id=unpublished_starter.id), db_session, user)
    assert unpublished_error.value.status_code == 422

    with pytest.raises(HTTPException) as starter_as_layout_error:
        create_page(PagePayload(title="Starter as layout", template_id=unpublished_starter.id), db_session, user)
    assert starter_as_layout_error.value.status_code == 422

    with pytest.raises(HTTPException) as missing_layout_error:
        create_page(PagePayload(title="Missing layout", template_id=99999), db_session, user)
    assert missing_layout_error.value.status_code == 404


def test_template_clone_creates_editable_site_owned_variant(db_session):
    from app.web.routes_templates import TemplateClonePayload, clone_template

    user = User(
        username="template-cloner", real_name="Template cloner", password_hash="x",
        role=RoleEnum.ADMIN,
    )
    from app.models import WebSiteStyle, WebTheme, WebThemeVersion
    theme = WebTheme(stable_key="test-template-clone", name="Test")
    db_session.add(theme); db_session.flush()
    version = WebThemeVersion(theme_id=theme.id, version="1.0.0", schema_version=1, manifest={}, package_hash="a" * 64, install_path="test/template-clone")
    db_session.add(version); db_session.flush()
    db_session.get(WebSiteStyle, 1).active_theme_version_id = version.id
    origin = WebTemplate(
        key="theme-starter", qualified_key="theme:templates:starter", name="Starter",
        html="", css=".starter{color:green}", project_data=project(text("Starter")),
        published_project_data=project(text("Published")), published_version=1,
        usage_mode="copy_on_create", is_system=True, theme_version_id=version.id,
    )
    db_session.add_all([user, origin]); db_session.commit()

    clone = clone_template(origin.id, TemplateClonePayload(), db_session, user)

    assert clone["id"] != origin.id
    assert clone["forked_from_id"] == origin.id
    assert clone["usage_mode"] == "copy_on_create"
    assert clone["published_version"] == 1
    assert clone["published_project_data"] == origin.published_project_data
    assert clone["is_system"] is False
    cloned_model = db_session.get(WebTemplate, clone["id"])
    assert cloned_model.theme_version_id == version.id
    assert cloned_model.project_data == origin.project_data
    assert cloned_model.project_data is not origin.project_data


def test_page_publish_adopts_published_baseline_for_pristine_legacy_template_fork(db_session):
    origin_project = project(
        {"type": "sc-slot", "name": "content", "components": []},
    )
    origin = WebTemplate(
        key="published-origin", qualified_key="theme:templates:published-origin",
        name="Published origin", html="", usage_mode="linked_layout",
        project_data=origin_project,
        published_project_data=deepcopy(origin_project),
        published_version=1,
    )
    legacy_fork = WebTemplate(
        key="legacy-fork", qualified_key="site:template:legacy-fork",
        name="Legacy fork", html="", usage_mode="linked_layout",
        project_data=deepcopy(origin_project),
        published_project_data=None,
        published_version=0,
        draft_version=1,
    )
    db_session.add(origin)
    db_session.flush()
    legacy_fork.forked_from_id = origin.id
    db_session.add(legacy_fork)
    db_session.flush()
    page = WebPage(
        slug="legacy-fork-page", path_segment="legacy-fork-page",
        path="/legacy-fork-page", title="Legacy fork page",
        data=project(text("Publish me")), template_id=legacy_fork.id,
        template=legacy_fork.key, draft_version=1,
    )
    db_session.add(page)
    db_session.commit()

    revision = publish_page(db_session, page, expected_version=1, user_id=1)

    assert revision.id == page.published_revision_id
    assert legacy_fork.published_version == 1
    assert legacy_fork.published_project_data == origin.published_project_data


def test_installed_theme_template_cannot_be_deleted_directly(db_session):
    from app.web.routes_templates import delete_template

    user = User(
        username="theme-template-deleter",
        real_name="Theme template deleter",
        password_hash="x",
        role=RoleEnum.ADMIN,
    )
    theme = WebTheme(stable_key="immutable-theme", name="Immutable theme")
    db_session.add_all([user, theme])
    db_session.flush()
    version = WebThemeVersion(
        theme_id=theme.id,
        version="1.0.0",
        schema_version=1,
        manifest={},
        default_tokens={},
        base_css="",
        package_hash="a" * 64,
        install_path="immutable-theme/1.0.0",
    )
    db_session.add(version)
    db_session.flush()
    template = WebTemplate(
        key="immutable-layout",
        qualified_key="immutable-theme@1.0.0:templates:layout",
        name="Immutable layout",
        html="",
        project_data=project(),
        theme_version_id=version.id,
        is_system=False,
    )
    db_session.add(template)
    db_session.commit()

    with pytest.raises(HTTPException) as caught:
        delete_template(template.id, db_session, user)
    assert caught.value.status_code == 409
    assert db_session.get(WebTemplate, template.id) is not None


def test_template_kind_normalized_to_layout(db_session):
    from sqlalchemy import create_engine, inspect, text

    # Set up a template with legacy kind='page'
    tmpl = db_session.query(WebTemplate).filter_by(is_system=True).first()
    if tmpl:
        tmpl.template_kind = "page"
        db_session.commit()
        assert tmpl.template_kind == "page"

        # Run the normalization logic directly
        connection = db_session.connection()
        connection.execute(text(
            "UPDATE web_templates SET template_kind = 'layout' "
            "WHERE template_kind = 'page'"
        ))
        db_session.expire_all()
        db_session.refresh(tmpl)
        assert tmpl.template_kind == "layout"


def test_preview_merged_project_does_not_double_layout(db_session):
    """Regression: a merged editor project (layout + page content in sc-slot)
    must not add the layout a second time, which previously raised
    'Rendered page exceeds complexity limits' (422)."""
    from app.web.routes_pages import _tree_contains_sc_slot

    # Simulate the merged editor project the frontend sends.
    merged = project(
        {"type": "text", "tagName": "header", "content": "Header"},
        {"type": "sc-slot", "name": "content", "components": [text("Page body")]},
        {"type": "text", "tagName": "footer", "content": "Footer"},
    )
    compiled = compile_project(merged)
    assert _tree_contains_sc_slot(compiled.tree) is True

    # Without the guard this merged tree would be re-wrapped and blow node count.
    body = render_project(db_session, compiled.tree)
    assert "Header" in body
    assert "Page body" in body
    assert "Footer" in body


def test_editor_data_marks_linked_layout_shell_but_not_page_content(db_session):
    from app.web.routes_pages import _merged_editor_project

    template_style = {"selectors": [{"name": "layout"}], "style": {"color": "navy"}}
    page_style = {"selectors": [{"name": "page-card"}], "style": {"color": "red"}}
    template_asset = {"src": "/theme-logo.png", "name": "Theme logo"}
    page_asset = {"src": "/page-photo.png", "name": "Page photo"}

    layout = WebTemplate(
        key="locked-layout",
        qualified_key="site:template:locked-layout",
        name="Locked layout",
        html="",
        usage_mode="linked_layout",
        project_data={**project(
            {"type": "text", "tagName": "header", "content": "Header"},
            {"type": "sc-slot", "name": "content", "components": []},
            styles=[template_style],
        ), "assets": [template_asset]},
    )
    page = WebPage(
        slug="locked-layout-page",
        path_segment="locked-layout-page",
        path="/locked-layout-page",
        title="Locked layout page",
        data={**project(text("Editable page body"), styles=[page_style]), "assets": [page_asset]},
        template_id=None,
    )
    db_session.add_all([layout, page])
    db_session.flush()
    page.template_id = layout.id
    db_session.commit()

    merged = _merged_editor_project(page, db_session)
    root = merged["pages"][0]["frames"][0]["component"]
    header, slot = root["components"]
    page_body = slot["components"][0]

    assert header["attributes"]["data-sc-template-owner"] == str(layout.id)
    assert header["editable"] is False
    assert slot["attributes"]["data-sc-template-owner"] == str(layout.id)
    assert "data-sc-template-owner" not in page_body.get("attributes", {})
    assert page_body.get("editable") is not False
    assert root is not None
    assert merged["pages"][0]["frames"][0]["styles"] == [template_style, page_style]
    assert merged["assets"] == [template_asset, page_asset]

    extracted = _extract_page_content(merged, layout.project_data)
    assert extracted["pages"][0]["frames"][0]["styles"] == [page_style]
    assert extracted["assets"] == [page_asset]


@pytest.mark.parametrize(
    "layout_components",
    [
        [text("Layout without a slot")],
        [
            {"type": "sc-slot", "name": "content", "components": []},
            {"type": "sc-slot", "name": "content", "components": []},
        ],
    ],
)
def test_extract_page_content_requires_one_unambiguous_content_slot(layout_components):
    layout = project(*layout_components)
    with pytest.raises(HTTPException) as caught:
        _extract_page_content(deepcopy(layout), layout)
    assert caught.value.status_code == 422


def test_linked_layout_save_reload_publish_preserves_page_css(db_session):
    from app.web.routes_pages import _merged_editor_project

    template_style = {"selectors": [{"name": "layout"}], "style": {"color": "navy"}}
    page_style = {"selectors": [{"name": "page-card"}], "style": {"color": "red"}}
    layout_project = project(
        {"type": "text", "tagName": "header", "content": "Header"},
        {
            "type": "sc-slot",
            "attributes": {"data-sc-type": "slot", "data-sc-slot": "content"},
            "components": [],
        },
        styles=[template_style],
    )
    layout = WebTemplate(
        key="roundtrip-layout",
        qualified_key="site:template:roundtrip-layout",
        name="Roundtrip layout",
        html="",
        usage_mode="linked_layout",
        project_data=layout_project,
        published_project_data=deepcopy(layout_project),
        published_css=".layout{color:navy}",
        published_version=1,
    )
    page = WebPage(
        slug="roundtrip-page",
        path_segment="roundtrip-page",
        path="/roundtrip-page",
        title="Roundtrip page",
        data=project(text("Before")),
        draft_version=1,
    )
    db_session.add_all([layout, page])
    db_session.flush()
    page.template_id = layout.id
    db_session.commit()

    merged = _merged_editor_project(page, db_session)
    frame = merged["pages"][0]["frames"][0]
    slot = frame["component"]["components"][1]
    slot["components"] = [{
        "type": "text",
        "tagName": "p",
        "classes": ["page-card"],
        "content": "After",
    }]
    frame["styles"].append(page_style)

    save_draft(
        db_session,
        page,
        expected_version=1,
        project=merged,
        user_id=1,
        metadata={"title": page.title, "slug": page.slug, "template_id": layout.id},
    )
    assert page.data["pages"][0]["frames"][0]["styles"] == [page_style]

    reloaded = _merged_editor_project(page, db_session)
    reloaded_frame = reloaded["pages"][0]["frames"][0]
    assert reloaded_frame["styles"] == [template_style, page_style]
    assert reloaded_frame["component"]["components"][1]["components"][0]["content"] == "After"

    revision = publish_page(db_session, page, expected_version=2, user_id=1)
    assert ".page-card{color:red}" in revision.compiled_css
    assert "After" in render_project(db_session, revision.compiled_tree)


def test_publishing_linked_layout_refreshes_existing_page_without_losing_css(
    db_session, monkeypatch,
):
    from app.web import routes_templates
    from app.web.routes_pages import PublishPayload

    original_layout = project(
        {"type": "text", "tagName": "header", "content": "Old header"},
        {"type": "sc-slot", "name": "content", "components": []},
        styles=[{"selectors": [{"name": "shell"}], "style": {"color": "navy"}}],
    )
    template = WebTemplate(
        key="live-layout-update", qualified_key="site:template:live-layout-update",
        name="Live layout", html="", usage_mode="linked_layout",
        project_data=deepcopy(original_layout),
        published_project_data=deepcopy(original_layout),
        css="", published_css="", draft_version=1, published_version=1,
    )
    page = WebPage(
        slug="linked-live", path_segment="linked-live", path="/linked-live",
        title="Linked live", data=project(text("Page body")), draft_version=1,
    )
    db_session.add_all([template, page]); db_session.flush()
    page.template_id = template.id
    revision = publish_page(db_session, page, expected_version=1, user_id=1)
    assert "Old header" in revision.rendered_html
    assert ".shell{color:navy}" in revision.rendered_html

    updated_layout = project(
        {"type": "text", "tagName": "header", "content": "New header"},
        {"type": "sc-slot", "name": "content", "components": []},
        styles=[{"selectors": [{"name": "shell"}], "style": {"color": "#b00075"}}],
    )
    template.project_data = updated_layout
    template.draft_version = 2
    db_session.commit()
    monkeypatch.setattr(routes_templates, "_require_action", lambda *_args: None)
    monkeypatch.setattr(routes_templates, "build_preview", lambda *_args, **_kwargs: {})

    routes_templates.publish_template(
        template.id, PublishPayload(expected_version=2), db_session, User(id=1, username="publisher"),
    )
    db_session.refresh(revision)

    assert "New header" in revision.rendered_html
    assert "Old header" not in revision.rendered_html
    assert "Page body" in revision.rendered_html
    assert ".shell{color:#b00075}" in revision.rendered_html


def test_publishing_theme_tokens_refreshes_existing_page_artifact(db_session, monkeypatch):
    from app.web import routes_design
    from app.web.routes_pages import PublishPayload

    style = db_session.get(WebSiteStyle, 1) or WebSiteStyle(id=1)
    style.draft_tokens = {"primary_color": "#b00075"}
    style.published_tokens = {"primary_color": "#255c9e"}
    style.draft_css = ""
    style.published_css = ""
    style.draft_version = 2
    style.published_version = 1
    page = WebPage(
        slug="token-page", path_segment="token-page", path="/token-page",
        title="Token page", data=project(text("Styled body")), draft_version=1,
    )
    db_session.add_all([style, page]); db_session.commit()
    revision = publish_page(db_session, page, expected_version=1, user_id=1)
    assert "--sc-primary-color:#255c9e" in revision.rendered_html

    monkeypatch.setattr(routes_design, "_require_action", lambda *_args: None)
    routes_design.publish_global_styles(
        PublishPayload(expected_version=2), db_session, User(id=1, username="publisher"),
    )
    db_session.refresh(revision)

    assert "--sc-primary-color:#b00075" in revision.rendered_html
    assert "--sc-primary-color:#255c9e" not in revision.rendered_html


def test_switching_linked_layout_splits_against_the_editor_shell(db_session):
    from app.web.routes_pages import _merged_editor_project

    first_project = project(
        {"type": "text", "tagName": "header", "content": "First"},
        {"type": "sc-slot", "name": "content", "components": []},
    )
    second_project = project(
        {"type": "text", "tagName": "header", "content": "Second"},
        {"type": "sc-slot", "name": "content", "components": []},
    )
    first = WebTemplate(
        key="switch-first", qualified_key="site:template:switch-first",
        name="First", html="", usage_mode="linked_layout", project_data=first_project,
    )
    second = WebTemplate(
        key="switch-second", qualified_key="site:template:switch-second",
        name="Second", html="", usage_mode="linked_layout", project_data=second_project,
    )
    page = WebPage(
        slug="switch-layout", path_segment="switch-layout", path="/switch-layout",
        title="Switch layout", data=project(text("Body")), draft_version=1,
    )
    db_session.add_all([first, second, page])
    db_session.flush()
    page.template_id = first.id
    db_session.commit()

    first_merged = _merged_editor_project(page, db_session)
    save_draft(
        db_session, page, expected_version=1, project=first_merged, user_id=1,
        metadata={
            "title": page.title,
            "slug": page.slug,
            "template_id": second.id,
            "editor_template_id": first.id,
        },
    )
    assert page.template_id == second.id
    assert page.template == second.key
    assert page.data["pages"][0]["frames"][0]["component"]["components"][0]["content"] == "Body"
    second_merged = _merged_editor_project(page, db_session)
    second_root = second_merged["pages"][0]["frames"][0]["component"]
    assert second_root["components"][0]["content"] == "Second"
    assert second_root["components"][1]["components"][0]["content"] == "Body"

    save_draft(
        db_session, page, expected_version=2, project=second_merged, user_id=1,
        metadata={
            "title": page.title,
            "slug": page.slug,
            "template_id": None,
            "editor_template_id": second.id,
        },
    )
    assert page.template_id is None
    assert page.template is None
    assert page.data["pages"][0]["frames"][0]["component"]["components"][0]["content"] == "Body"


def test_media_id_repairs_transient_editor_blob_url_for_public_render(db_session):
    compiled = compile_project(project({
        "type": "image",
        "attributes": {
            "src": "blob:http://editor.invalid/temporary",
            "data-sc-media-id": "42",
            "alt": "Oddílový znak",
        },
    }))
    rendered = render_project(db_session, compiled.tree)
    assert 'src="/api/web/media/42/file"' in rendered
    assert "blob:" not in rendered


def test_column_primitive_has_a_public_grid_fallback():
    document = render_document("<main><div class=\"sc-layout-columns\"></div></main>", title="Columns")
    assert ".sc-layout-columns{display:grid" in document


def test_public_calendar_grid_fits_narrow_viewports_without_horizontal_scroll():
    document = render_document("<main><div class=\"sc-calendar\"></div></main>", title="Calendar")
    assert ".sc-calendar-table{display:block;width:100%;max-width:100%;overflow:visible}" in document
    assert ".sc-calendar-head,.sc-calendar-week{min-width:0}" in document
    assert ".sc-calendar-head,.sc-calendar-week{min-width:42rem}" not in document


def test_whole_site_export_keeps_site_owned_designs_and_metadata(db_session, monkeypatch):
    from app.web import routes_design

    page = WebPage(
        slug="export", path_segment="export", path="/export", title="Export",
        data=project(text("Obsah")), draft_version=1,
    )
    component = WebReusableComponent(
        qualified_key="site:export-card", name="Export card", project_data=project(text("Card")),
    )
    db_session.add_all([page, component])
    db_session.commit()
    monkeypatch.setattr(routes_design, "_require_action", lambda *_: None)

    response = routes_design.export_site(db_session, User(username="export-user"))
    with zipfile.ZipFile(io.BytesIO(response.body)) as archive:
        exported = json.loads(archive.read("scoutcomp-web.json"))
    assert exported["format"] == "scoutcomp-web-export"
    assert exported["pages"][0]["title"] == "Export"
    assert exported["components"][0]["qualified_key"] == "site:export-card"


def test_page_publication_materialises_an_immutable_document_artifact(db_session):
    """The visitor app reads this document instead of invoking the renderer."""
    page = WebPage(
        slug="artifact", path_segment="artifact", path="/artifact", title="Artifact",
        data=project(text("Published snapshot")), draft_version=1,
    )
    db_session.add(page)
    db_session.commit()

    revision = publish_page(db_session, page, expected_version=1, user_id=1)
    assert revision.rendered_html
    assert "Published snapshot" in revision.rendered_html
    assert revision.rendered_at is not None

    from app.site_app import _render_revision
    page.title = "Mutable draft title"
    db_session.flush()
    assert _render_revision(db_session, page, revision) == revision.rendered_html


def test_calendar_publication_materialises_only_a_bounded_month_window(db_session):
    page = WebPage(
        slug="calendar-artifact", path_segment="calendar-artifact", path="/calendar-artifact",
        title="Kalendář", data=project({"type": "sc-calendar"}), draft_version=1,
    )
    db_session.add(page)
    db_session.commit()

    revision = publish_page(db_session, page, expected_version=1, user_id=1)
    month_variants = {
        key: value for key, value in (revision.rendered_variants or {}).items()
        if key.startswith("month=")
    }

    assert len(month_variants) == 31
    assert all('class="sc-calendar"' in document for document in month_variants.values())
    current_key = datetime.now().strftime("month=%Y-%m")
    assert current_key in month_variants
    from app.site_app import _render_revision
    assert _render_revision(
        db_session, page, revision, query={"month": current_key.removeprefix("month=")},
    ) == month_variants[current_key]


def test_non_calendar_publication_does_not_generate_month_variants(db_session):
    page = WebPage(
        slug="plain-artifact", path_segment="plain-artifact", path="/plain-artifact",
        title="Běžná stránka", data=project(text("Obsah")), draft_version=1,
    )
    db_session.add(page)
    db_session.commit()

    revision = publish_page(db_session, page, expected_version=1, user_id=1)

    assert not any(key.startswith("month=") for key in (revision.rendered_variants or {}))


def test_public_renderer_rejects_missing_new_publication_artifact(db_session):
    page = WebPage(slug="not-built", path_segment="not-built", path="/not-built", title="Not built", draft_version=1)
    db_session.add(page); db_session.flush()
    revision = WebPageRevision(page_id=page.id, revision_number=1, is_publication=True, reason="publish")
    db_session.add(revision); db_session.flush()
    from app.site_app import _render_revision
    with pytest.raises(HTTPException) as exc:
        _render_revision(db_session, page, revision)
    assert exc.value.status_code == 503


def test_detail_layout_renders_sanitised_fragment_in_its_content_slot(db_session):
    from app.routers.config import set_config_value
    from app.site_app import _detail_document

    template = WebTemplate(
        key="article-layout", qualified_key="site:template:article-layout", name="Article layout", html="",
        usage_mode="linked_layout", project_data=project(text("Draft")),
        published_project_data=project(
            {"type": "text", "tagName": "header", "content": "Shared header"},
            {"type": "sc-slot", "name": "content", "components": []},
        ), published_css=".web-post{max-width:60rem}", published_version=1,
    )
    db_session.add(template); db_session.flush()
    set_config_value(db_session, "web.post_detail_template_id", str(template.id))
    document = _detail_document(
        db_session, setting_key="web.post_detail_template_id",
        detail_html='<article class="web-post"><h1>Safe title</h1></article>', title="Safe title",
    )
    assert "Shared header" in document
    assert "Safe title" in document


def test_scout_theme_seeds_a_composed_homepage_and_rich_sections(db_session):
    from app.web.default_template import DEFAULT_THEME_VERSION
    from app.web.routes_templates import seed_default_theme
    from app.web.renderer import compile_project
    from app.web.theme_package import activate_theme

    seed_default_theme(db_session)
    home = db_session.query(WebTemplate).filter_by(
        qualified_key=f"scoutcomp-default@{DEFAULT_THEME_VERSION}:templates:scout-home",
    ).one()
    assert home.published_project_data
    theme_version = db_session.get(WebThemeVersion, home.theme_version_id)
    assert ".sc2-hero" in theme_version.base_css
    compiled = compile_project(home.published_project_data)
    assert compiled.tree
    templates = db_session.query(WebTemplate).filter(
        WebTemplate.qualified_key.like(f"scoutcomp-default@{DEFAULT_THEME_VERSION}:templates:%"),
    ).all()
    assert {"scout-home", "scout-landing", "scout-story", "scout-team", "scout-listing", "scout-detail", "scout-gallery-page", "scout-contact-page"} <= {
        item.qualified_key.rsplit(":", 1)[-1] for item in templates
    }
    resources = db_session.query(WebSection).filter(
        WebSection.qualified_key.like(f"scoutcomp-default@{DEFAULT_THEME_VERSION}:sections:%"),
    ).all()
    assert {"scout-hero-full", "scout-hero-compact", "scout-showcase", "scout-posts-grid", "scout-team-grid", "scout-events", "scout-values", "scout-cta", "scout-gallery", "scout-contact"} <= {
        item.qualified_key.rsplit(":", 1)[-1] for item in resources
    }
    assert all(item.published_project_data and item.published_version >= 1 for item in resources)
    assert all(item.usage_mode == "linked_layout" for item in templates)
    assert activate_theme(db_session, home.theme_version_id).active_theme_version_id == home.theme_version_id


def test_legacy_ontario_theme_can_be_installed_with_assets_and_default_hierarchical_menus(db_session):
    from app.models import WebReusableComponent, WebSiteStyle, WebTheme, WebThemeAsset
    from app.web.ontario_theme import ONTARIO_THEME_ID, ONTARIO_THEME_VERSION, seed_ontario_theme
    from app.web.routes_templates import seed_default_theme
    from app.web.theme_package import activate_theme, resolve_theme_asset_path

    seed_default_theme(db_session)
    seed_ontario_theme(db_session)
    theme = db_session.query(WebTheme).filter_by(stable_key=ONTARIO_THEME_ID).one()
    version = db_session.query(WebThemeVersion).filter_by(
        theme_id=theme.id, version=ONTARIO_THEME_VERSION,
    ).one()
    assert version.manifest["config"]["primary_color"]["type"] == "color"
    assert version.manifest["config"]["footer_color"]["default"] == "#212529"
    assert version.default_tokens["primary_color"] == "#255c9e"
    assert "var(--sc-primary-color,#255c9e)" in version.base_css
    assert ".ontario-footer{background:var(--ontario-dark)!important}" in version.base_css
    assert db_session.get(WebSiteStyle, 1).active_theme_version_id != version.id
    assert db_session.query(WebTemplate).filter_by(theme_version_id=version.id).count() >= 16
    assert db_session.query(WebSection).filter_by(theme_version_id=version.id).count() >= 14
    assert db_session.query(WebReusableComponent).filter_by(theme_version_id=version.id).count() >= 11
    font = db_session.query(WebThemeAsset).filter_by(
        theme_version_id=version.id,
        relative_path="assets/fonts/SKAUT-Bold.otf",
    ).one()
    assert resolve_theme_asset_path(version, font.relative_path).is_file()
    home = db_session.query(WebTemplate).filter_by(
        qualified_key=f"ontario@{ONTARIO_THEME_VERSION}:templates:home",
    ).one()
    compiled = compile_project(home.project_data)
    assert "bootstrap-navbar" in str(compiled.tree)
    assert "bootstrap-footer-columns" in str(compiled.tree)

    activate_theme(db_session, version.id)
    main = db_session.query(WebMenu).filter_by(location="main").one()
    footer = db_session.query(WebMenu).filter_by(location="footer").one()
    main_tree = db_session.get(WebMenuRevision, main.published_revision_id).tree
    footer_tree = db_session.get(WebMenuRevision, footer.published_revision_id).tree
    assert [item["label"] for item in main_tree] == [
        "Kalendář", "Schůzky", "Galerie", "Kontakt", "Ostatní", "Domů",
    ]
    assert [item["label"] for item in main_tree[1]["children"]] == [
        "Lachtani", "Delfíni", "Kanafásci", "Medojedi", "Kanci",
    ]
    assert [item["label"] for item in footer_tree] == ["ODDÍL", "SCHŮZKY DRUŽIN", "OSTATNÍ"]


def test_ontario_theme_resources_are_directly_editable(db_session, monkeypatch):
    from app.web import routes_design, routes_templates
    from app.web.ontario_theme import ONTARIO_THEME_VERSION, seed_ontario_theme
    from app.web.routes_design import DesignResourcePayload
    from app.web.routes_templates import TemplatePayload, seed_default_theme

    seed_default_theme(db_session)
    seed_ontario_theme(db_session)
    user = User(
        username="ontario-editor", real_name="Ontario editor", password_hash="x",
        role=RoleEnum.ADMIN,
    )
    db_session.add(user)
    db_session.commit()
    monkeypatch.setattr(routes_design, "_require_action", lambda *_args: None)
    monkeypatch.setattr(routes_templates, "_require_action", lambda *_args: None)
    monkeypatch.setattr(routes_design, "build_resource_preview", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(routes_templates, "build_preview", lambda *_args, **_kwargs: None)

    component = db_session.query(WebReusableComponent).filter_by(
        qualified_key=f"ontario@{ONTARIO_THEME_VERSION}:components:button",
    ).one()
    updated_component = routes_design.update_design_resource(
        "components",
        component.id,
        DesignResourcePayload(
            qualified_key=component.qualified_key,
            name="Vlastní Ontario tlačítko",
            project_data=component.project_data,
            css=".btn-skaut{letter-spacing:.05em}",
            expected_version=component.draft_version,
        ),
        db_session,
        user,
    )
    assert updated_component["name"] == "Vlastní Ontario tlačítko"
    assert updated_component["is_locked"] is False
    assert updated_component["is_from_theme"] is True

    template = db_session.query(WebTemplate).filter_by(
        qualified_key=f"ontario@{ONTARIO_THEME_VERSION}:templates:home",
    ).one()
    updated_template = routes_templates.update_template(
        template.id,
        TemplatePayload(
            key=template.key,
            qualified_key=template.qualified_key,
            name="Vlastní Ontario homepage",
            project_data=template.project_data,
            css=".ontario-hero{min-height:600px}",
            expected_version=template.draft_version,
        ),
        db_session,
        user,
    )
    assert updated_template["name"] == "Vlastní Ontario homepage"
    assert updated_template["is_locked"] is False
    assert updated_template["is_from_theme"] is True

    # Routine startup/catalog seeding repairs missing rows but must not erase
    # direct author edits to bundled resources.
    seed_default_theme(db_session)
    assert db_session.get(WebReusableComponent, component.id).name == "Vlastní Ontario tlačítko"
    assert db_session.get(WebReusableComponent, component.id).css == ".btn-skaut{letter-spacing:.05em}"
    assert db_session.get(WebTemplate, template.id).name == "Vlastní Ontario homepage"
    assert db_session.get(WebTemplate, template.id).css == ".ontario-hero{min-height:600px}"


def test_ontario_seed_refreshes_only_untouched_bundled_resources(db_session):
    from app.web.ontario_theme import ONTARIO_THEME_VERSION, seed_ontario_theme
    from app.web.routes_templates import seed_default_theme

    seed_default_theme(db_session)
    seed_ontario_theme(db_session)
    home = db_session.query(WebTemplate).filter_by(
        qualified_key=f"ontario@{ONTARIO_THEME_VERSION}:templates:home",
    ).one()
    stale = deepcopy(home.project_data)
    components = stale["pages"][0]["frames"][0]["component"]["components"]
    components.append({
        "type": "link", "tagName": "a",
        "attributes": {"class": "ontario-search", "href": "/hledat"},
        "content": "Hledat",
    })
    home.project_data = stale
    home.published_project_data = deepcopy(stale)
    db_session.commit()

    seed_ontario_theme(db_session)
    db_session.refresh(home)
    refreshed = str(home.project_data)
    assert "ontario-search" not in refreshed
    assert "ontario-menu-shell" in refreshed
    assert "https://scoutcomp.pernicka.cz" in refreshed
    assert "ScoutComp" in refreshed

    # Once an author has saved a draft, the bundled baseline must no longer
    # replace it during routine startup/catalog seeding.
    home.project_data = stale
    home.published_project_data = deepcopy(stale)
    home.draft_version = 2
    home.published_version = 2
    db_session.commit()
    seed_ontario_theme(db_session)
    db_session.refresh(home)
    assert "ontario-search" in str(home.project_data)


def test_ontario_theme_export_contains_all_editable_resources_and_fonts(db_session, tmp_path):
    from app.models import WebThemeAsset
    from app.web.ontario_theme import ONTARIO_THEME_ID, ONTARIO_THEME_VERSION, seed_ontario_theme
    from app.web.routes_templates import seed_default_theme
    from app.web.theme_package import export_theme_archive, install_theme, uninstall_theme

    seed_default_theme(db_session)
    seed_ontario_theme(db_session)
    theme = db_session.query(WebTheme).filter_by(stable_key=ONTARIO_THEME_ID).one()
    version = db_session.query(WebThemeVersion).filter_by(
        theme_id=theme.id, version=ONTARIO_THEME_VERSION,
    ).one()
    archive_bytes = export_theme_archive(db_session, version.id, include_site_resources=False)
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        assert len(manifest["resources"]["templates"]) >= 16
        assert len(manifest["resources"]["sections"]) >= 14
        assert len(manifest["resources"]["components"]) >= 11
        assert "assets/fonts/SKAUT-Bold.otf" in manifest["resources"]["assets"]
        home = json.loads(archive.read("templates/home.json"))
        assert "/theme-assets/" not in json.dumps(home)

    uninstall_theme(db_session, version.id)
    installed = install_theme(db_session, archive_bytes, storage_root=tmp_path / "themes")
    assert db_session.query(WebTemplate).filter_by(theme_version_id=installed.id).count() >= 16
    assert db_session.query(WebThemeAsset).filter_by(
        theme_version_id=installed.id,
        relative_path="assets/fonts/SKAUT-Bold.otf",
    ).one()


def test_page_creation_supports_editable_custom_and_root_paths(db_session):
    from app.web.pages import ROOT_PAGE_SEGMENT, normalise_path_segment
    from app.web.routes_pages import PagePayload, create_page

    user = User(
        username="root-page-user", real_name="Root page user", password_hash="x",
        role=RoleEnum.ADMIN,
    )
    db_session.add(user)
    db_session.commit()

    custom = create_page(PagePayload(title="O nás", slug="Náš vlastní odkaz"), db_session, user)
    assert custom["path_segment"] == "nas-vlastni-odkaz"
    assert custom["path"] == "/nas-vlastni-odkaz"

    homepage = create_page(PagePayload(title="Domů", slug="/"), db_session, user)
    assert normalise_path_segment("/") == ROOT_PAGE_SEGMENT
    assert homepage["path"] == "/"
    assert homepage["path_segment"] == ROOT_PAGE_SEGMENT

    with pytest.raises(HTTPException) as duplicate_root:
        create_page(PagePayload(title="Druhá domů", slug="/"), db_session, user)
    assert duplicate_root.value.status_code == 409

    with pytest.raises(HTTPException) as nested_root:
        create_page(PagePayload(title="Vnořená domů", slug="/", parent_id=custom["id"]), db_session, user)
    assert nested_root.value.status_code == 422


def test_trashing_page_releases_root_path_and_restore_detects_collision(db_session):
    from app.web.pages import restore_trashed_page, trash_page
    from app.web.routes_pages import PagePayload, create_page

    user = User(username="trash-root-user", real_name="Trash root", password_hash="x", role=RoleEnum.ADMIN)
    db_session.add(user); db_session.commit()
    original = create_page(PagePayload(title="Původní domů", slug="/"), db_session, user)
    page = db_session.get(WebPage, original["id"])
    trash_page(db_session, page)
    db_session.refresh(page)
    assert page.trashed_path == "/"
    assert page.path.startswith("/__trash/")

    replacement = create_page(PagePayload(title="Nová domů", slug="/"), db_session, user)
    assert replacement["path"] == "/"
    with pytest.raises(HTTPException) as restore_error:
        restore_trashed_page(db_session, page)
    assert restore_error.value.status_code == 409


def test_confirmed_layout_switch_adopts_template_slot_content(db_session):
    layout_one = WebTemplate(
        key="switch-one", qualified_key="site:switch-one", name="One", html="",
        usage_mode="linked_layout", project_data=project({"type": "sc-slot", "name": "content", "components": [text("One")]}),
    )
    layout_two = WebTemplate(
        key="switch-two", qualified_key="site:switch-two", name="Two", html="",
        usage_mode="linked_layout", project_data=project({"type": "sc-slot", "name": "content", "components": [text("Template body")]}),
    )
    page = WebPage(slug="switch-page", path_segment="switch-page", path="/switch-page", title="Switch", data=project(text("Old body")), draft_version=1, template_id=None)
    db_session.add_all([layout_one, layout_two, page]); db_session.commit()

    save_draft(
        db_session, page, expected_version=1, project=project(text("Old body")), user_id=1,
        metadata={"title": "Switch", "template_id": layout_two.id, "replace_content_with_template": True},
    )
    root = page.data["pages"][0]["frames"][0]["component"]
    assert root["components"][0]["content"] == "Template body"


def test_new_page_uses_selected_classic_template_as_layout_and_initial_content(db_session):
    from app.web.routes_pages import PagePayload, create_page

    user = User(username="classic-template-user", real_name="Classic template", password_hash="x", role=RoleEnum.ADMIN)
    layout = WebTemplate(
        key="classic-layout", qualified_key="site:template:classic-layout", name="Classic", html="",
        usage_mode="linked_layout",
        project_data=project({"type": "sc-slot", "name": "content", "components": [text("Template content")]}),
        published_project_data=project({"type": "sc-slot", "name": "content", "components": [text("Template content")]}),
        published_version=1,
    )
    db_session.add_all([user, layout]); db_session.commit()

    created = create_page(PagePayload(title="New", source_template_id=layout.id), db_session, user)
    page = db_session.get(WebPage, created["id"])
    assert page.template_id == layout.id
    assert page.data["pages"][0]["frames"][0]["component"]["components"][0]["content"] == "Template content"
