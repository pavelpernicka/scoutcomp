from datetime import datetime, timedelta, timezone

import pytest

from app.models import (
    Config,
    DirectUserPermission,
    DirectUserPermissionDeny,
    PermissionDefinition,
    RegisteredModule,
    RoleEnum,
    ScoutEvent,
    User,
    WebPost,
    WebPostRevision,
    WebMenu,
    WebMenuItem,
    WebMenuRevision,
    WebMedia,
    WebPage,
    WebPageRevision,
)
from app.modules import registry
from app.permissions import permission_keys
from app.routers.config import set_config_value
from app.web.data_sources import (
    DataSourceUnavailableError,
    DataSourceValidationError,
    ResolveContext,
    list_data_sources,
    resolve_data_source,
)


def _seed(db):
    registry.seed(db)


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def test_catalog_only_contains_sources_from_available_modules(db_session):
    _seed(db_session)
    assert {item["id"] for item in list_data_sources(db_session)} == {
        "core.events", "core.media", "web.menu", "core.posts", "core.teams",
    }

    core = db_session.query(RegisteredModule).filter_by(code="core").one()
    core.enabled = False
    db_session.commit()

    # web depends on core, so disabling the dependency removes both catalogs.
    assert list_data_sources(db_session) == []
    with pytest.raises(DataSourceUnavailableError):
        resolve_data_source(db_session, "web.posts")


def test_events_are_public_only_and_projected_through_allowlist(db_session):
    _seed(db_session)
    now = _now()
    db_session.add_all([
        ScoutEvent(title="Public", description="Visible", kind="trip", starts_at=now, is_public=True),
        ScoutEvent(title="Internal", description="Secret", kind="trip", starts_at=now, is_public=False),
    ])
    db_session.commit()

    result = resolve_data_source(
        db_session, "core.events", {"kind": "trip", "limit": "5"}, ResolveContext(now=now)
    )

    assert [item["title"] for item in result] == ["Public"]
    assert set(result[0]) == {
        "id", "title", "description", "kind", "start_at", "end_at", "url", "color",
        "author", "author_avatar",
    }
    with pytest.raises(DataSourceValidationError):
        resolve_data_source(db_session, "core.events", {"private": True})
    with pytest.raises(DataSourceValidationError):
        resolve_data_source(db_session, "core.events", {"limit": 502})


def test_event_calendar_window_can_include_multiday_overlaps_without_changing_lists(db_session):
    _seed(db_session)
    window_start = datetime(2026, 5, 1)
    window_end = datetime(2026, 5, 31, 23, 59, 59)
    db_session.add_all([
        ScoutEvent(
            title="Probíhající tábor", kind="trip", is_public=True,
            starts_at=datetime(2026, 4, 28, 9), ends_at=datetime(2026, 5, 3, 18),
        ),
        ScoutEvent(
            title="Skončil o půlnoci", kind="trip", is_public=True,
            starts_at=datetime(2026, 4, 30, 9), ends_at=window_start,
        ),
        ScoutEvent(
            title="Květnová schůzka", kind="meeting", is_public=True,
            starts_at=datetime(2026, 5, 2, 17), ends_at=None,
        ),
    ])
    db_session.commit()

    list_result = resolve_data_source(
        db_session, "core.events", {"from": window_start, "to": window_end, "limit": 10},
    )
    calendar_result = resolve_data_source(
        db_session, "core.events", {
            "from": window_start, "to": window_end, "overlap": True, "limit": 10,
        },
    )

    assert [item["title"] for item in list_result] == ["Květnová schůzka"]
    assert [item["title"] for item in calendar_result] == [
        "Probíhající tábor", "Květnová schůzka",
    ]


def test_public_author_avatar_requires_a_real_allowlisted_raster_image(db_session):
    _seed(db_session)
    valid = User(
        username="valid-avatar", real_name="Valid Avatar", password_hash="x",
        avatar="data:image/gif;base64,R0lGODlh",
    )
    unsafe = User(
        username="unsafe-avatar", real_name="Unsafe Avatar", password_hash="x",
        avatar="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+",
    )
    spoofed = User(
        username="spoofed-avatar", real_name="Spoofed Avatar", password_hash="x",
        avatar="data:image/png;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    )
    db_session.add_all([valid, unsafe, spoofed]); db_session.flush()
    now = _now()
    db_session.add_all([
        ScoutEvent(title="Valid", kind="meeting", starts_at=now, is_public=True, created_by_id=valid.id),
        ScoutEvent(title="Unsafe", kind="meeting", starts_at=now + timedelta(minutes=1), is_public=True, created_by_id=unsafe.id),
        ScoutEvent(title="Spoofed", kind="meeting", starts_at=now + timedelta(minutes=2), is_public=True, created_by_id=spoofed.id),
    ])
    db_session.commit()

    records = resolve_data_source(db_session, "core.events", {"kind": "meeting"})

    assert records[0]["author"] == "Valid Avatar"
    assert records[0]["author_avatar"] == "data:image/gif;base64,R0lGODlh"
    assert records[1]["author_avatar"] is None
    assert records[2]["author_avatar"] is None


def test_events_are_public_by_event_flag_not_by_cms_page(db_session):
    _seed(db_session)
    from app.models import Team

    first_team = Team(name="První", join_code="first-events")
    second_team = Team(name="Druhá", join_code="second-events")
    db_session.add_all([first_team, second_team]); db_session.flush()
    db_session.add_all([
        ScoutEvent(title="První schůzka", kind="meeting", starts_at=_now(), team_id=first_team.id, is_public=True),
        ScoutEvent(title="Druhá schůzka", kind="meeting", starts_at=_now(), team_id=second_team.id, is_public=True),
    ])
    db_session.commit()

    assert [item["title"] for item in resolve_data_source(db_session, "core.events", {"team_id": first_team.id})] == ["První schůzka"]
    assert [item["title"] for item in resolve_data_source(db_session, "core.events", {"team_id": second_team.id})] == ["Druhá schůzka"]
    assert [item["title"] for item in resolve_data_source(db_session, "core.events", {"kind": "meeting"})] == ["První schůzka", "Druhá schůzka"]

def test_request_cache_reuses_projected_result(db_session):
    _seed(db_session)
    event = ScoutEvent(title="Before", kind="other", starts_at=_now(), is_public=True)
    db_session.add(event)
    db_session.commit()
    cache = {}

    first = resolve_data_source(db_session, "core.events", cache=cache)
    event.title = "After"
    db_session.commit()

    assert resolve_data_source(db_session, "core.events", cache=cache) == first
    assert resolve_data_source(db_session, "core.events", cache={})[0]["title"] == "After"


def test_posts_source_reads_published_snapshot_not_mutable_draft(db_session):
    _seed(db_session)
    post = WebPost(title="Draft title", slug="draft", body="Draft", published=True, draft_version=2)
    db_session.add(post)
    db_session.flush()
    publication = WebPostRevision(
        post_id=post.id,
        revision_number=1,
        source_version=1,
        title="Live title",
        slug="live",
        excerpt="Published excerpt",
        body="Published",
        reason="publish",
        is_publication=True,
    )
    db_session.add(publication)
    db_session.flush()
    post.published_revision_id = publication.id
    db_session.commit()

    result = resolve_data_source(db_session, "core.posts")

    assert result[0]["title"] == "Live title"
    assert result[0]["url"] == "/post/live"


def test_public_content_urls_follow_validated_site_schemes(db_session):
    _seed(db_session)
    post = WebPost(title="Článek", slug="clanek", published=True)
    db_session.add(post); db_session.flush()
    revision = WebPostRevision(
        post_id=post.id, revision_number=1, source_version=1, title="Článek",
        slug="clanek", reason="publish", is_publication=True,
    )
    db_session.add(revision); db_session.flush(); post.published_revision_id = revision.id
    event = ScoutEvent(title="Schůzka", kind="meeting", starts_at=_now(), is_public=True)
    db_session.add(event)
    set_config_value(db_session, "web.post_url_pattern", "/aktuality/{slug}")
    set_config_value(db_session, "web.event_url_pattern", "/udalosti/{id}")
    db_session.commit()

    assert resolve_data_source(db_session, "core.posts")[0]["url"] == "/aktuality/clanek"
    assert resolve_data_source(db_session, "core.events")[0]["url"] == f"/udalosti/{event.id}"


def test_collection_sources_accept_a_bounded_offset_for_pagination(db_session):
    _seed(db_session)
    now = _now()
    db_session.add_all([
        ScoutEvent(title="First", kind="trip", starts_at=now, is_public=True),
        ScoutEvent(title="Second", kind="trip", starts_at=now + timedelta(days=1), is_public=True),
    ])
    db_session.commit()

    result = resolve_data_source(db_session, "core.events", {"offset": 1, "limit": 1}, ResolveContext(now=now))

    assert [item["title"] for item in result] == ["Second"]


def test_events_source_accepts_author_facing_page_pagination(db_session):
    _seed(db_session)
    now = _now()
    db_session.add_all([
        ScoutEvent(title="First", kind="meeting", starts_at=now, is_public=True),
        ScoutEvent(title="Second", kind="meeting", starts_at=now + timedelta(days=1), is_public=True),
    ])
    db_session.commit()

    result = resolve_data_source(db_session, "core.events", {"limit": 1, "page": 2})

    assert [item["title"] for item in result] == ["Second"]


def test_posts_source_accepts_author_facing_page_pagination(db_session):
    _seed(db_session)
    posts = [WebPost(title=f"Příspěvek {index}", slug=f"post-{index}", published=True) for index in range(3)]
    db_session.add_all(posts); db_session.flush()
    revisions = [WebPostRevision(
        post_id=post.id, revision_number=1, source_version=1, title=post.title,
        slug=post.slug, reason="publish", is_publication=True,
    ) for post in posts]
    db_session.add_all(revisions); db_session.flush()
    for post, revision in zip(posts, revisions):
        post.published_revision_id = revision.id
    db_session.commit()

    result = resolve_data_source(db_session, "core.posts", {"limit": 1, "page": 2})

    assert [item["title"] for item in result] == ["Příspěvek 1"]


def test_teams_source_is_independent_of_cms_pages(db_session):
    _seed(db_session)
    from app.models import Team

    first_team = Team(name="Lachtani", join_code="first-team", description="První družina", logo="data:image/png;base64,iVBORw0KGgo=")
    second_team = Team(name="Medojedi", join_code="second-team", description="Druhá družina")
    db_session.add_all([first_team, second_team]); db_session.commit()

    assert resolve_data_source(db_session, "core.teams") == [
        {"id": first_team.id, "name": "Lachtani", "description": "První družina", "logo_url": "data:image/png;base64,iVBORw0KGgo="},
        {"id": second_team.id, "name": "Medojedi", "description": "Druhá družina", "logo_url": None},
    ]

def test_menu_source_reads_published_tree_and_projects_nested_items(db_session):
    _seed(db_session)
    menu = WebMenu(name="Main", location="main")
    db_session.add(menu)
    db_session.flush()
    db_session.add(WebMenuItem(menu_id=menu.id, label="Draft item", url="/draft"))
    publication = WebMenuRevision(
        menu_id=menu.id,
        revision_number=1,
        source_version=1,
        reason="publish",
        tree=[{
            "id": 10,
            "label": "Live item",
            "url": "/live",
            "target": None,
            "private_note": "must not leak",
            "children": [{"id": 11, "label": "Child", "url": "/child", "target": None, "children": []}],
        }],
    )
    db_session.add(publication)
    db_session.flush()
    menu.published_revision_id = publication.id
    db_session.commit()

    result = resolve_data_source(db_session, "web.menu")

    assert result[0]["label"] == "Live item"
    assert result[0]["children"][0]["label"] == "Child"
    assert "private_note" not in result[0]


def test_media_source_exposes_only_media_referenced_by_published_snapshots(db_session):
    _seed(db_session)
    public = WebMedia(filename="public.png", path="public.png", mime="image/png", size=1, album="Live")
    background = WebMedia(filename="background.png", path="background.png", mime="image/png", size=1, album="Live")
    gallery = WebMedia(
        filename="gallery.png", path="gallery.png", mime="image/png", size=1,
        album="Live", is_public=True,
    )
    draft = WebMedia(filename="draft.png", path="draft.png", mime="image/png", size=1, album="Draft secret")
    db_session.add_all([public, background, gallery, draft]); db_session.flush()
    page = WebPage(
        slug="gallery", path_segment="gallery", path="/gallery", title="Gallery",
        data={}, published=True, draft_version=1,
    )
    db_session.add(page); db_session.flush()
    revision = WebPageRevision(
        page_id=page.id, revision_number=1, source_version=1, title="Gallery",
        path_segment="gallery", path="/gallery", is_publication=True, reason="publish",
        compiled_tree={
            "type": "default", "tagName": "img",
            "attributes": {"src": f"/media/{public.id}/file"}, "components": [],
        },
        compiled_css=f'.hero{{background-image:url("/media/{background.id}/file")}}',
    )
    db_session.add(revision); db_session.flush()
    page.published_revision_id = revision.id
    db_session.commit()

    result = resolve_data_source(db_session, "core.media")

    assert {item["id"] for item in result} == {public.id, background.id, gallery.id}
    assert all(item["album"] != "Draft secret" for item in result)


def test_web_manage_implies_granular_permissions_but_explicit_deny_wins(db_session):
    _seed(db_session)
    user = User(
        username="designer",
        real_name="Designer",
        password_hash="test",
        role=RoleEnum.MEMBER,
        first_login_at=_now() - timedelta(days=1),
    )
    db_session.add(user)
    db_session.flush()
    manage = db_session.query(PermissionDefinition).filter_by(module_code="web", code="manage").one()
    publish = db_session.query(PermissionDefinition).filter_by(module_code="web", code="publish").one()
    db_session.add_all([
        DirectUserPermission(user_id=user.id, permission_id=manage.id),
        DirectUserPermissionDeny(user_id=user.id, permission_id=publish.id),
    ])
    db_session.commit()

    permissions = permission_keys(db_session, user)

    assert "web.pages.manage" in permissions
    assert "web.themes.manage" in permissions
    assert "web.publish" not in permissions
    assert "web.read" not in permissions


def test_seed_removes_obsolete_default_web_read_permission(db_session):
    obsolete = PermissionDefinition(
        module_code="web",
        code="read",
        name="Legacy read",
        default_for_member=True,
        scopes=["any"],
    )
    db_session.add(obsolete)
    db_session.commit()

    _seed(db_session)

    assert db_session.query(PermissionDefinition).filter_by(module_code="web", code="read").one_or_none() is None

    pages = db_session.query(PermissionDefinition).filter_by(module_code="web", code="pages.manage").one()
    pages.default_for_member = True
    db_session.commit()
    _seed(db_session)
    assert pages.default_for_member is False


def test_posts_source_projects_legacy_html_excerpt_to_plain_public_text(db_session):
    from app.web.data_sources import _plain_public_excerpt, _plain_public_text

    assert _plain_public_excerpt('<p>Ahoj <img src="/api/web/media/2/file"> světe</p>') == "Ahoj světe"
    assert _plain_public_text('<p>Schůzka <img src="/api/web/media/2/file"> dnes</p>') == "Schůzka dnes"


def test_explicit_empty_event_settings_do_not_restore_legacy_values(db_session):
    from app.web.routes_design import _site_settings
    from app.web.url_schemes import event_pattern

    values = {
        "web.meeting_url_pattern": "/schuzky/{id}",
        "web.event_url_pattern": "",
        "web.meeting_detail_template_id": "42",
        "web.event_detail_template_id": "",
    }
    for key, value in values.items():
        row = db_session.query(Config).filter_by(key=key).one_or_none()
        if row is None:
            db_session.add(Config(key=key, value=value))
        else:
            row.value = value
    db_session.commit()

    assert event_pattern(db_session) == "/event/{id}"
    assert _site_settings(db_session)["event_detail_template_id"] == ""
