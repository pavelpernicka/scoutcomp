from datetime import datetime, timedelta, timezone

import pytest

from app.models import (
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
        "core.events", "web.media", "web.menu", "web.posts",
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
    assert set(result[0]) == {"id", "title", "description", "kind", "start_at", "end_at", "url", "color"}
    with pytest.raises(DataSourceValidationError):
        resolve_data_source(db_session, "core.events", {"private": True})
    with pytest.raises(DataSourceValidationError):
        resolve_data_source(db_session, "core.events", {"limit": 500})


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

    result = resolve_data_source(db_session, "web.posts")

    assert result[0]["title"] == "Live title"
    assert result[0]["url"] == "/post/live"


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
    gallery = WebMedia(
        filename="gallery.png", path="gallery.png", mime="image/png", size=1,
        album="Live", is_public=True,
    )
    draft = WebMedia(filename="draft.png", path="draft.png", mime="image/png", size=1, album="Draft secret")
    db_session.add_all([public, gallery, draft]); db_session.flush()
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
    )
    db_session.add(revision); db_session.flush()
    page.published_revision_id = revision.id
    db_session.commit()

    result = resolve_data_source(db_session, "web.media")

    assert {item["id"] for item in result} == {public.id, gallery.id}
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
