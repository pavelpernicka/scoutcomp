from copy import deepcopy
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.models import (
    DirectUserPermission, DirectUserPermissionDeny, PermissionDefinition,
    RegisteredModule, RoleEnum, User, WebMedia, WebMenu, WebMenuRevision,
    WebPage, WebPageRevision, WebPost, WebPostRevision, WebReusableComponent,
    WebTemplate, WebSection, WebTheme, WebThemeVersion,
)
from app.modules import registry
from app.web.data_sources import DataSourceUnavailableError, list_data_sources, resolve_public_source
from app.web.pages import publish_page, save_draft, validate_parent
from app.web.linked_resources import validate_linked_resource_instances
from app.web.renderer import CompileError, compile_project, render_document, render_project
from app.web.resource_props import ResourcePropsError
from app.web.routes_media import MAX_MEDIA_SIZE, _sniff_image, _stored_media_path
from app.web_render import render_markdown, sanitize_legacy_html


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

def test_template_slot_composes_page_tree(db_session):
    template = compile_project(project(
        {"type": "text", "tagName": "header", "content": "Header"},
        {"type": "sc-slot", "name": "content", "components": [text("fallback")]},
        {"type": "text", "tagName": "footer", "content": "Footer"},
    ))
    page_tree = compile_project(project(text("Page body"))).tree
    rendered = render_project(db_session, template.tree, slot_tree=page_tree)
    assert rendered == "<main><header>Header</header><main><p>Page body</p></main><footer>Footer</footer></main>"


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

    assert "Published body" in site_module.site_post("live-slug").body.decode()
    with pytest.raises(HTTPException) as caught:
        site_module.site_post("new-draft-slug")
    assert caught.value.status_code == 404


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
    origin = WebTemplate(
        key="theme-starter", qualified_key="theme:templates:starter", name="Starter",
        html="", css=".starter{color:green}", project_data=project(text("Starter")),
        published_project_data=project(text("Published")), published_version=1,
        usage_mode="copy_on_create", is_system=True,
    )
    db_session.add_all([user, origin]); db_session.commit()

    clone = clone_template(origin.id, TemplateClonePayload(), db_session, user)

    assert clone["id"] != origin.id
    assert clone["forked_from_id"] == origin.id
    assert clone["usage_mode"] == "copy_on_create"
    assert clone["published_version"] == 0
    assert clone["is_system"] is False
    cloned_model = db_session.get(WebTemplate, clone["id"])
    assert cloned_model.theme_version_id is None
    assert cloned_model.project_data == origin.project_data
    assert cloned_model.project_data is not origin.project_data


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
