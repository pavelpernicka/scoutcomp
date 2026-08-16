from datetime import datetime, timezone

from app.config import settings
from app.core.security import get_password_hash
from app.models import RoleEnum, User

def _project(text: str) -> dict:
    return {
        "scoutcomp": {"schemaVersion": 2},
        "pages": [{"frames": [{
            "component": {"type": "wrapper", "components": [
                {"type": "text", "tagName": "p", "content": text},
            ]},
            "styles": [],
        }]}],
    }


def _project_components(*components):
    """Real GrapesJS 0.21 project shape for inline test."""
    return {
        "assets": [],
        "styles": [],
        "pages": [{
            "id": "page-1",
            "frames": [{
                "id": "frame-1",
                "component": {"type": "wrapper", "components": list(components)},
            }],
        }],
        "scoutcomp": {"schemaVersion": 2},
    }


WEB_PAGE_HTML = (
    '<style>.web-title{font-weight:700}</style>'
    '<h1 class="web-title">Akce</h1>'
    '<scoutcomp-web-component data-component="events_list"></scoutcomp-web-component>'
)



def _user(username: str, role: RoleEnum):
    return User(
        username=username,
        real_name=username,
        password_hash=get_password_hash("secret"),
        role=role,
        preferred_language="cs",
        is_active=True,
        first_login_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )


def _login(client, username: str) -> str:
    response = client.post("/auth/login", json={"username": username, "password": "secret"})
    assert response.status_code == 200
    return response.json()["access_token"]


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _seed_and_login(client, db_session, role: RoleEnum):
    user = _user(f"{role}_user", role)
    db_session.add(user)
    db_session.commit()
    token = _login(client, user.username)
    return token


def test_web_data_sources_and_templates_catalogue(client, db_session):
    token = _seed_and_login(client, db_session, RoleEnum.ADMIN)
    sources = client.get("/web/data-sources", headers=_headers(token))
    assert sources.status_code == 200
    assert {"core.events", "web.posts", "web.media", "web.menu"} <= {
        item["id"] for item in sources.json()
    }

    templates = client.get("/web/templates", headers=_headers(token))
    assert templates.status_code == 200
    keys = {item["key"] for item in templates.json()}
    assert {"blank", "main", "group", "events"} <= keys


def test_web_page_crud_and_site_render(client, db_session):
    token = _seed_and_login(client, db_session, RoleEnum.ADMIN)
    headers = _headers(token)

    created = client.post(
        "/web/pages",
        headers=headers,
        json={
            "title": "Hlavní stránka",
            "data": _project("published v1"),
            "published": True,
        },
    )
    assert created.status_code == 201
    page = created.json()
    assert page["slug"] == "hlavni-stranka"
    page_id = page["id"]

    listed = client.get("/web/pages", headers=headers)
    assert listed.status_code == 200
    listed_ids = {p["id"] for p in listed.json()}
    assert page_id in listed_ids

    fetched = client.get(f"/web/pages/{page_id}", headers=headers)
    assert fetched.status_code == 200
    assert fetched.json()["project_data"] == _project("published v1")

    assert fetched.json()["published_revision_id"] is not None

    updated = client.put(
        f"/web/pages/{page_id}",
        headers=headers,
        json={
            "title": "Úvod",
            "slug": "hlavni-stranka",
            "data": _project("draft v2"),
            "expected_version": page["draft_version"],
            "published": False,
        },
    )
    assert updated.status_code == 200
    assert updated.json()["published"] is True
    assert updated.json()["published_revision_id"] == page["published_revision_id"]

    deleted = client.delete(f"/web/pages/{page_id}", headers=headers)
    assert deleted.status_code == 204


def test_web_template_crud_and_delete_guards(client, db_session):
    token = _seed_and_login(client, db_session, RoleEnum.ADMIN)
    headers = _headers(token)

    created = client.post(
        "/web/templates",
        headers=headers,
        json={
            "name": "Vlastní",
            "key": "custom",
            "description": "test",
            "project_data": _project("Hi"),
            "css": "",
        },
    )
    assert created.status_code == 201
    template = created.json()
    template_id = template["id"]
    assert template["key"] == "custom"
    assert template["is_system"] is False

    updated = client.put(
        f"/web/templates/{template_id}",
        headers=headers,
        json={
            "name": "Vlastní 2", "key": "custom", "project_data": _project("Hi2"),
            "css": "", "expected_version": template["draft_version"],
        },
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Vlastní 2"

    system_ids = {
        item["id"]
        for item in client.get("/web/templates", headers=headers).json()
        if item["is_system"]
    }
    some_system_id = next(iter(system_ids))
    assert client.delete(f"/web/templates/{some_system_id}", headers=headers).status_code == 400

    page = client.post("/web/pages", headers=headers, json={"title": "Sablona", "template": "custom"})
    assert page.status_code == 201
    assert client.delete(f"/web/templates/{template_id}", headers=headers).status_code == 400

    assert client.delete(f"/web/pages/{page.json()['id']}", headers=headers).status_code == 204
    assert client.delete(f"/web/pages/{page.json()['id']}/purge", headers=headers).status_code == 204
    assert client.delete(f"/web/templates/{template_id}", headers=headers).status_code == 204
    assert client.delete(f"/web/templates/{template_id}", headers=headers).status_code == 404


def test_web_sibling_slug_collision_is_rejected(client, db_session):
    token = _seed_and_login(client, db_session, RoleEnum.ADMIN)
    headers = _headers(token)

    first = client.post("/web/pages", headers=headers, json={"title": "Zprávy"})
    assert first.status_code == 201
    assert first.json()["slug"] == "zpravy"

    second = client.post("/web/pages", headers=headers, json={"title": "Zprávy"})
    assert second.status_code == 409


def test_web_media_upload_list_serve_delete(client, db_session, tmp_path):
    from app.config import settings

    original = settings.app.web_media_dir
    settings.app.web_media_dir = str(tmp_path / "media")

    token = _seed_and_login(client, db_session, RoleEnum.ADMIN)
    headers = _headers(token)

    try:
        uploaded = client.post(
            "/web/media",
            headers=headers,
            files={"file": ("logo.png", b"\x89PNG\r\n\x1a\nfake-bytes", "image/png")},
        )
        assert uploaded.status_code == 201
        media = uploaded.json()
        assert media["filename"] == "logo.png"
        assert media["url"].startswith("/api/web/media/")

        listed = client.get("/web/media", headers=headers)
        assert listed.status_code == 200
        assert [m["id"] for m in listed.json()["items"]] == [media["id"]]

        served = client.get(f"/web/media/{media['id']}/file", headers=headers)
        assert served.status_code == 200
        assert served.content == b"\x89PNG\r\n\x1a\nfake-bytes"

        rejected = client.post(
            "/web/media",
            headers=headers,
            files={"file": ("evil.txt", b"hello", "text/plain")},
        )
        assert rejected.status_code == 415

        deleted = client.delete(f"/web/media/{media['id']}", headers=headers)
        assert deleted.status_code == 204
        assert client.get(f"/web/media/{media['id']}/file", headers=headers).status_code == 404
    finally:
        settings.app.web_media_dir = original


def test_site_app_public_pages(client, db_session, monkeypatch):
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import sessionmaker

    import app.site_app as site_module

    token = _seed_and_login(client, db_session, RoleEnum.ADMIN)
    headers = _headers(token)
    created = client.post(
        "/web/pages",
        headers=headers,
        json={
            "title": "Uvod",
            "slug": "uvod",
            "data": _project("Uvod"),
            "published": True,
        },
    )
    assert created.status_code == 201

    SiteSession = sessionmaker(bind=db_session.bind)
    monkeypatch.setattr(site_module, "SessionLocal", SiteSession)

    site = TestClient(site_module.app)
    home = site.get("/")
    assert home.status_code == 200
    assert "Uvod" in home.text
    assert "<!doctype html>" in home.text

    direct = site.get("/uvod")
    assert direct.status_code == 200
    assert "Uvod" in direct.text

    assert site.get("/neexistuje").status_code == 404
    assert site.get("/healthz").json() == {"status": "ok"}


def test_web_module_permissions(client, db_session):
    token = _seed_and_login(client, db_session, RoleEnum.MEMBER)
    headers = _headers(token)

    # CMS has no default member permission.
    sources = client.get("/web/data-sources", headers=headers)
    assert sources.status_code == 403

    # manage is not granted to plain members
    created = client.post("/web/pages", headers=headers, json={"title": "X"})
    assert created.status_code == 403

    unauthenticated = client.get("/web/data-sources")
    assert unauthenticated.status_code in (401, 403)


def test_web_settings_and_menus(client, db_session):
    token = _seed_and_login(client, db_session, RoleEnum.ADMIN)
    headers = _headers(token)

    updated = client.put(
        "/web/settings",
        headers=headers,
        json={
            "site_title": "Skauti Praha 6",
            "site_tagline": "Děláme kluky a holky lepší",
            "social_instagram": "https://instagram.com/skauti",
        },
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body["settings"]["site_title"] == "Skauti Praha 6"
    assert body["settings"]["social_instagram"] == "https://instagram.com/skauti"

    fetched = client.get("/web/settings", headers=headers)
    assert fetched.status_code == 200
    assert fetched.json()["settings"]["site_tagline"] == "Děláme kluky a holky lepší"

    menu = client.post("/web/menus", headers=headers, json={"name": "Hlavní", "location": "main"})
    assert menu.status_code == 201
    menu_id = menu.json()["id"]
    home_page = client.post(
        "/web/pages", headers=headers, json={"title": "Domů", "slug": "main"},
    ).json()

    items = client.put(
        f"/web/menus/{menu_id}/items",
        headers=headers,
        json={
            "expected_version": menu.json()["draft_version"],
            "items": [
                {"id": -1, "label": "Domů", "item_type": "page", "page_id": home_page["id"], "position": 0},
                {"label": "Kontakt", "url": "/contact", "position": 1},
            ]
        },
    )
    assert items.status_code == 200
    menus = items.json()
    main_menu = next(m for m in menus if m["id"] == menu_id)
    assert [i["label"] for i in main_menu["items"]] == ["Domů", "Kontakt"]
    assert main_menu["items"][0]["page_id"] == home_page["id"]

    menus = client.get("/web/menus", headers=headers).json()
    assert len(menus) == 1
    assert client.delete(f"/web/menus/{menu_id}", headers=headers).status_code == 204
    assert client.get("/web/menus", headers=headers).json() == []


def test_web_posts_crud_and_public_render(client, db_session, monkeypatch):
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import sessionmaker

    import app.site_app as site_module

    token = _seed_and_login(client, db_session, RoleEnum.ADMIN)
    headers = _headers(token)

    created = client.post(
        "/web/posts",
        headers=headers,
        json={
            "title": "Tábor 2026",
            "slug": "tabor-2026",
            "excerpt": "Letní tábor se vydařil",
            "body": "## Tábor\nLetošní **tábor** byl skvělý.",
            "published": True,
        },
    )
    assert created.status_code == 201
    post = created.json()
    assert post["slug"] == "tabor-2026"

    listed = client.get("/web/posts", headers=headers)
    assert listed.status_code == 200
    assert any(p["slug"] == "tabor-2026" for p in listed.json())

    updated = client.put(
        f"/web/posts/{post['id']}",
        headers=headers,
        json={"title": "Tábor 2026 (aktualizováno)", "slug": "tabor-2026", "body": "Nový text", "published": True, "expected_version": post["draft_version"]},
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Tábor 2026 (aktualizováno)"

    SiteSession = sessionmaker(bind=db_session.bind)
    monkeypatch.setattr(site_module, "SessionLocal", SiteSession)
    site = TestClient(site_module.app)
    rendered = site.get("/post/tabor-2026")
    assert rendered.status_code == 200
    assert "<p>Nový text</p>" in rendered.text
    assert "Tábor 2026 (aktualizováno)" in rendered.text

    sitemap = site.get("/sitemap.xml")
    assert sitemap.status_code == 200
    assert "post/tabor-2026" in sitemap.text

    assert client.delete(f"/web/posts/{post['id']}", headers=headers).status_code == 204
    assert client.get(f"/web/posts/{post['id']}", headers=headers).status_code == 404


def test_web_revisions_duplicate_and_trash(client, db_session):
    token = _seed_and_login(client, db_session, RoleEnum.ADMIN)
    headers = _headers(token)

    created = client.post("/web/pages", headers=headers, json={"title": "Výprava", "data": _project("v1")})
    assert created.status_code == 201
    page_id = created.json()["id"]

    updated = client.put(
        f"/web/pages/{page_id}", headers=headers,
        json={"title": "Výprava", "data": _project("v2"), "expected_version": created.json()["draft_version"]},
    )
    assert updated.status_code == 200

    revisions = client.get(f"/web/pages/{page_id}/revisions", headers=headers)
    assert revisions.status_code == 200
    assert len(revisions.json()) == 1
    assert revisions.json()[0]["data"] == _project("v1")

    restored = client.post(
        f"/web/pages/{page_id}/restore/{revisions.json()[0]['id']}",
        headers=headers,
    )
    assert restored.status_code == 200
    assert restored.json()["project_data"] == _project("v1")

    duplicate = client.post(f"/web/pages/{page_id}/duplicate", headers=headers)
    assert duplicate.status_code == 201
    assert duplicate.json()["slug"].startswith("vyprava-copy")
    assert duplicate.json()["published"] is False

    assert client.delete(f"/web/pages/{page_id}", headers=headers).status_code == 204
    trash = client.get("/web/pages/trash", headers=headers)
    assert trash.status_code == 200
    assert any(p["id"] == page_id for p in trash.json())

    assert client.post(f"/web/pages/{page_id}/restore", headers=headers).status_code == 204
    assert not any(p["id"] == page_id for p in client.get("/web/pages/trash", headers=headers).json())

    assert client.delete(f"/web/pages/{page_id}", headers=headers).status_code == 204
    assert client.delete(f"/web/pages/{page_id}/purge", headers=headers).status_code == 204
    assert client.get(f"/web/pages/{page_id}", headers=headers).status_code == 404


def test_web_media_metadata(client, db_session, monkeypatch):
    import tempfile
    from pathlib import Path

    token = _seed_and_login(client, db_session, RoleEnum.ADMIN)
    headers = _headers(token)

    original = settings.app.web_media_dir
    with tempfile.TemporaryDirectory() as tmp:
        settings.app.web_media_dir = tmp
        upload = client.post(
            "/web/media",
            headers=headers,
            files={"file": ("foto.png", b"\x89PNG\r\n\x1a\n" + b"0" * 16, "image/png")},
        )
        assert upload.status_code == 201
        media_id = upload.json()["id"]

        meta = client.put(
            f"/web/media/{media_id}",
            headers=headers,
            json={"album": "Tábor", "alt": "Fotka z tábora", "caption": "Společná fotka"},
        )
        assert meta.status_code == 200
        assert meta.json()["album"] == "Tábor"

        albums = client.get("/web/media/albums", headers=headers)
        assert albums.status_code == 200
        assert "Tábor" in albums.json()

        listed = client.get("/web/media", headers=headers).json()["items"]
        assert listed[0]["alt"] == "Fotka z tábora"
    settings.app.web_media_dir = original

def test_web_design_resource_clone(client, db_session):
    """Clone creates a site-owned copy of a theme resource with origin metadata."""
    token = _seed_and_login(client, db_session, RoleEnum.ADMIN)
    headers = _headers(token)

    payload = {
        "qualified_key": "site:clone-source",
        "name": "Clone source",
        "description": "Original",
        "project_data": _project_components({"type": "text", "tagName": "p", "content": "Hello"}),
        "css": ".src{color:black}",
        "prop_schema": [{"id": "x", "type": "text"}],
        "default_props": {"x": "1"},
        "variants": [{"id": "big", "label": "Big", "props": {"x": "Big"}}],
    }
    res = client.post("/web/design/components", headers=headers, json=payload)
    assert res.status_code == 201
    src = res.json()
    assert src["qualified_key"] == "site:clone-source"
    assert src["draft_version"] == 1
    src_id = src["id"]

    clone_res = client.post(
        f"/web/design/components/{src_id}/clone",
        headers=headers,
        json={"name": "My Clone", "qualified_key": "site:clone-custom"},
    )
    assert clone_res.status_code == 201
    clone = clone_res.json()
    assert clone["name"] == "My Clone"
    assert clone["qualified_key"] == "site:clone-custom"
    assert clone["draft_version"] == 1
    assert clone["published_version"] == 0
    assert clone["is_locked"] is False
    assert clone.get("theme_version_id") is None
    assert clone["project_data"] == payload["project_data"]
    assert clone["prop_schema"] == payload["prop_schema"]
    assert clone["variants"] == payload["variants"]
    assert clone["css"] == payload["css"]

    clone2_res = client.post(
        f"/web/design/components/{src_id}/clone",
        headers=headers,
        json={},
    )
    assert clone2_res.status_code == 201
    clone2 = clone2_res.json()
    assert clone2["name"].startswith("Clone source")
    assert clone2["qualified_key"].startswith("site:component:clone-source") or clone2["qualified_key"].startswith("site:clone-source")

    clone3_res = client.post(
        f"/web/design/components/{src_id}/clone",
        headers=headers,
        json={},
    )
    assert clone3_res.status_code == 201
    clone3 = clone3_res.json()
    assert clone3["qualified_key"] != clone2["qualified_key"]

    bad = client.post("/web/design/components/99999/clone", headers=headers, json={})
    assert bad.status_code == 404

def test_web_design_resource_materialize(client, db_session):
    """materialize returns a detached HTML+CSS fragment with props applied."""
    token = _seed_and_login(client, db_session, RoleEnum.ADMIN)
    headers = _headers(token)

    payload = {
        "qualified_key": "site:mat-source",
        "name": "Mat source",
        "project_data": _project_components({
            "type": "default",
            "tagName": "article",
            "scBindings": {"text": {"scope": "props", "field": "title"}},
        }),
        "css": ".mat{color:blue}",
        "prop_schema": [{"id": "title", "type": "text"}],
        "default_props": {"title": "Default"},
        "variants": [],
    }
    res = client.post("/web/design/components", headers=headers, json=payload)
    assert res.status_code == 201
    src = res.json()

    mat = client.post(
        f"/web/design/components/{src['id']}/materialize",
        headers=headers,
        json={"props": {"title": "Hello"}, "variant": None, "expected_version": src["draft_version"]},
    )
    assert mat.status_code == 200
    body = mat.json()
    assert "Hello" in body["html"]
    assert ".mat{color:blue}" in body["css"]
    assert body["draft_version"] == src["draft_version"]

    # Wrong version -> 409
    conflict = client.post(
        f"/web/design/components/{src['id']}/materialize",
        headers=headers,
        json={"props": {}, "variant": None, "expected_version": src["draft_version"] + 1},
    )
    assert conflict.status_code == 409

    # Runtime binding -> 422
    ctx_payload = {
        "qualified_key": "site:mat-ctx",
        "name": "Mat ctx",
        "project_data": _project_components({
            "type": "sc-bind",
            "binding": {"scope": "context", "field": "title"},
        }),
        "css": "",
        "prop_schema": [],
        "default_props": {},
        "variants": [],
    }
    ctx_res = client.post("/web/design/components", headers=headers, json=ctx_payload)
    assert ctx_res.status_code == 201
    ctx_src = ctx_res.json()
    mat_ctx = client.post(
        f"/web/design/components/{ctx_src['id']}/materialize",
        headers=headers,
        json={"props": {}, "variant": None, "expected_version": ctx_src["draft_version"]},
    )
    assert mat_ctx.status_code == 422
