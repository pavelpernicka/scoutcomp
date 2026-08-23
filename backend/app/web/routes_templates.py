"""Authenticated CMS templates routes."""
from copy import deepcopy

from .routes_common import *  # noqa: F403

router = APIRouter(prefix="/web", tags=["web"])

from .routes_pages import PublishPayload, _empty_project
from .pages import _extract_page_content, rebuild_published_page_artifacts
from .routes_design import _validate_custom_css
from .default_template import DEFAULT_SCOUT_TEMPLATE, DEFAULT_THEME_ID, DEFAULT_THEME_NAME, DEFAULT_THEME_VERSION, DEFAULT_THEME_DESCRIPTION, DEFAULT_THEME_CONFIG, DEFAULT_THEME_TEMPLATES, DEFAULT_THEME_SECTIONS, DEFAULT_THEME_COMPONENTS
from .previews import build_preview, ensure_preview, get_current_preview, project_preview_svg
# ---------------------------------------------------------------- components & templates

_DEFAULT_TEMPLATE_SVG = (
    'data:image/svg+xml,' +
    '%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20400%20300%22%3E'
    '%3Crect%20width%3D%22400%22%20height%3D%22300%22%20fill%3D%22%23f3f4f6%22%2F%3E'
    '%3Crect%20x%3D%2230%22%20y%3D%2215%22%20width%3D%22340%22%20height%3D%2230%22%20rx%3D%224%22%20fill%3D%22%233b82f6%22%2F%3E'
    '%3Crect%20x%3D%2230%22%20y%3D%2255%22%20width%3D%22340%22%20height%3D%2280%22%20rx%3D%224%22%20fill%3D%22%23dbeafe%22%2F%3E'
    '%3Crect%20x%3D%2230%22%20y%3D%22145%22%20width%3D%22160%22%20height%3D%2270%22%20rx%3D%224%22%20fill%3D%22%23e5e7eb%22%2F%3E'
    '%3Crect%20x%3D%22210%22%20y%3D%22145%22%20width%3D%22160%22%20height%3D%2270%22%20rx%3D%224%22%20fill%3D%22%23e5e7eb%22%2F%3E'
    '%3Crect%20x%3D%2230%22%20y%3D%22255%22%20width%3D%22340%22%20height%3D%2230%22%20rx%3D%224%22%20fill%3D%22%233b82f6%22%2F%3E'
    '%3C%2Fsvg%3E'
)


def _template_is_locked(template: WebTemplate) -> bool:
    """Package-owned shells cannot be deleted even though their draft is editable."""
    qualified = str(template.qualified_key or "")
    return bool(template.is_system or (template.theme_version_id and not qualified.startswith("site:template:")))


def _serialize_template(db: Session, template: WebTemplate) -> dict:
    current_preview = get_current_preview(db, "templates", template.id)
    if current_preview:
        preview_url = current_preview["url"]
    elif template.preview_media_id:
        preview_url = f"/api/web/media/{template.preview_media_id}/file"
    else:
        # Derive a structural wireframe so every template has a preview even
        # when the theme/package did not ship a raster asset.
        preview_url = project_preview_svg(
            template.project_data or template.published_project_data,
            title=template.name or "",
        )
    return {
        "id": template.id,
        "key": template.key,
        "name": template.name,
        "description": template.description,
        "html": template.html,
        "css": template.css,
        "project_data": template.project_data,
        "draft_version": template.draft_version,
        "published_project_data": template.published_project_data,
        "published_css": template.published_css,
        "published_version": template.published_version,
        "qualified_key": template.qualified_key or template.key,
        "template_kind": template.template_kind,
        "usage_mode": getattr(template, "usage_mode", "linked_layout"),
        "theme_version_id": template.theme_version_id,
        "preview_media_id": template.preview_media_id,
        "preview_url": preview_url,
        "is_system": template.is_system,
        "is_locked": False,
        "is_from_theme": bool(template.theme_version_id),
        "forked_from_id": template.forked_from_id,
    }


def seed_default_templates(db: Session) -> None:
    """Idempotently ensure the built-in templates exist (used on startup)."""
    canonical_template = {
        "scoutcomp": {"schemaVersion": 2},
        "pages": [{"frames": [{"component": {
            "type": "wrapper", "components": [
                {"type": "sc-slot", "name": "content", "components": []}
            ],
        }, "styles": []}]}],
    }
    # The legacy templates still exist for compatibility but use the canonical
    # empty editor tree. The new default template carries the full site layout.
    for key, template in DEFAULT_TEMPLATES.items():
        existing = db.query(WebTemplate).filter_by(key=key).one_or_none()
        if existing:
            if not existing.project_data:
                existing.project_data = canonical_template
                existing.published_project_data = canonical_template
                existing.published_css = existing.css or ""
                existing.published_version = max(existing.published_version or 0, 1)
            continue
        db.add(WebTemplate(
            key=key,
            name=template["name"],
            description=template.get("description"),
            html=template["html"],
            css=template.get("css", ""),
            qualified_key=key,
            project_data=canonical_template,
            published_project_data=canonical_template,
            published_css=template.get("css", ""),
            published_version=1,
            is_system=True,
        ))

    # The default web is now a complete system theme, not a standalone page
    # template. See seed_default_theme() below. Do NOT create a legacy
    # "scout-default" template row here; the theme owns its templates.
    db.commit()


def seed_default_theme(db: Session) -> None:
    """Seed the complete system default theme (theme + version + templates).

    The built-in web is a full theme with its own set of page templates and
    components, not a single page template. This keeps the Design > Templates
    list free of system scaffolding while Themes shows the default theme and
    its preview. Idempotent and safe to run on every startup.
    """
    from ..models import WebTheme, WebThemeVersion
    from ..web_defaults import THEME_CSS, _THEME_TOKENS
    from .theme_package import _legacy_template_key, _qualified_key

    theme = db.query(WebTheme).filter_by(stable_key=DEFAULT_THEME_ID).one_or_none()
    if theme is None:
        theme = WebTheme(
            stable_key=DEFAULT_THEME_ID,
            name=DEFAULT_THEME_NAME,
            author="ScoutComp",
            description=DEFAULT_THEME_DESCRIPTION,
            license="GPL-3.0-or-later",
        )
        db.add(theme)
        db.flush()
    else:
        theme.name = DEFAULT_THEME_NAME
        theme.author = "ScoutComp"
        theme.description = DEFAULT_THEME_DESCRIPTION

    version = db.query(WebThemeVersion).filter_by(theme_id=theme.id, version=DEFAULT_THEME_VERSION).one_or_none()
    theme_css_changed = False
    if version is None:
        theme_css_changed = True
        import hashlib
        payload = f"{DEFAULT_THEME_ID}:{DEFAULT_THEME_VERSION}".encode()
        version = WebThemeVersion(
            theme_id=theme.id,
            version=DEFAULT_THEME_VERSION,
            schema_version=1,
            manifest={
                "id": DEFAULT_THEME_ID,
                "name": DEFAULT_THEME_NAME,
                "version": DEFAULT_THEME_VERSION,
                "author": "ScoutComp",
                "description": DEFAULT_THEME_DESCRIPTION,
                "license": "GPL-3.0-or-later",
                "config": DEFAULT_THEME_CONFIG,
            },
            default_tokens=_THEME_TOKENS,
            base_css=THEME_CSS,
            package_hash=hashlib.sha256(payload).hexdigest(),
            install_path=f"system/{DEFAULT_THEME_ID}/{DEFAULT_THEME_VERSION}",
        )
        db.add(version)
        db.flush()
    else:
        # The system theme is code-owned; refresh CSS along with its markup.
        if version.base_css != THEME_CSS:
            version.base_css = THEME_CSS
            theme_css_changed = True
        existing_config = version.manifest.get("config") or {}
        version.manifest = {
            **version.manifest,
            "id": DEFAULT_THEME_ID,
            "name": DEFAULT_THEME_NAME,
            "version": DEFAULT_THEME_VERSION,
            "author": "ScoutComp",
            "description": DEFAULT_THEME_DESCRIPTION,
            "license": "GPL-3.0-or-later",
            "config": {**DEFAULT_THEME_CONFIG, **existing_config},
        }
        version.default_tokens = {**_THEME_TOKENS, **(version.default_tokens or {})}

    for key, project_data in DEFAULT_THEME_TEMPLATES.items():
        qualified = _qualified_key(DEFAULT_THEME_ID, DEFAULT_THEME_VERSION, "templates", key)
        template = db.query(WebTemplate).filter_by(qualified_key=qualified).one_or_none()
        if template:
            # Existing theme rows are an editable authoring workspace. Seed
            # only repairs missing data; it must never erase an author draft.
            if not template.name:
                template.name = {"main": "Hlavní stránka", "news": "Aktuality", "scout-home": "Skautská úvodní stránka", "scout-story": "Příběh oddílu", "scout-team": "Družina", "scout-listing": "Výpis aktualit", "scout-detail": "Detail obsahu", "scout-landing": "Prezentační stránka", "scout-gallery-page": "Galerie", "scout-contact-page": "Kontakt"}.get(key, key.title())
            if not template.description:
                template.description = DEFAULT_THEME_DESCRIPTION
            if not template.project_data:
                template.project_data = project_data
            if not template.published_project_data:
                template.published_project_data = project_data
                template.published_version = max(template.published_version or 0, 1)
            template.theme_version_id = version.id
            template.is_system = True
            template.template_kind = "layout"
            continue
        db.add(WebTemplate(
            key=_legacy_template_key(qualified),
            name={"main": "Hlavní stránka", "news": "Aktuality", "scout-home": "Skautská úvodní stránka", "scout-story": "Příběh oddílu", "scout-team": "Družina", "scout-listing": "Výpis aktualit", "scout-detail": "Detail obsahu", "scout-landing": "Prezentační stránka", "scout-gallery-page": "Galerie", "scout-contact-page": "Kontakt"}.get(key, key.title()),
            description=DEFAULT_THEME_DESCRIPTION,
            html="",
            css="",
            qualified_key=qualified,
            template_kind="layout",
            project_data=project_data,
            published_project_data=project_data,
            published_css="",
            published_version=1,
            theme_version_id=version.id,
            is_system=True,
        ))
    # Remove starters generated by ScoutComp 2.0. They were an accidental
    # second template category; ordinary layouts now seed page content directly.
    legacy_starters = db.query(WebTemplate).filter(
        WebTemplate.theme_version_id == version.id,
        WebTemplate.is_system.is_(True),
        WebTemplate.usage_mode == "copy_on_create",
        WebTemplate.qualified_key.like("%-starter"),
    ).all()
    for starter in legacy_starters:
        db.query(WebPage).filter_by(source_template_id=starter.id).update(
            {WebPage.source_template_id: None, WebPage.source_template_version: None},
            synchronize_session=False,
        )
        db.delete(starter)

    # Install the theme's design resources (sections/components/patterns).
    design_resources = [
        (WebSection, DEFAULT_THEME_SECTIONS, "sections"),
        (WebReusableComponent, DEFAULT_THEME_COMPONENTS, "components"),
    ]
    for model, resources, kind in design_resources:
        for resource_id, project_data in resources.items():
            qualified = _qualified_key(DEFAULT_THEME_ID, DEFAULT_THEME_VERSION, kind, resource_id)
            row = db.query(model).filter_by(qualified_key=qualified).one_or_none()
            if row:
                if not row.name:
                    row.name = resource_id.replace("-", " ").title()
                if not row.description:
                    row.description = DEFAULT_THEME_DESCRIPTION
                if not row.project_data:
                    row.project_data = project_data
                if not row.published_project_data:
                    row.published_project_data = project_data
                    row.published_version = max(row.published_version or 0, 1)
                row.theme_version_id = version.id
                row.is_locked = True
                continue
            db.add(model(
                qualified_key=qualified,
                name=resource_id.replace("-", " ").title(),
                description=DEFAULT_THEME_DESCRIPTION,
                project_data=project_data,
                css="",
                prop_schema=[],
                default_props={},
                variants=[],
                published_project_data=project_data,
                published_css="",
                published_prop_schema=[],
                published_default_props={},
                published_variants=[],
                published_version=1,
                theme_version_id=version.id,
                is_locked=True,
                created_by_id=None,
            ))
    db.commit()
    if theme_css_changed:
        rebuild_published_page_artifacts(db)
        db.commit()

    # Generate/reuse compact real previews as soon as the bundled theme is
    # loaded. build_preview is content-hashed, so repeated startup/list calls
    # do not render unchanged definitions again.
    preview_items = list(db.query(WebTemplate).filter_by(theme_version_id=version.id).all())
    preview_items += list(db.query(WebSection).filter_by(theme_version_id=version.id).all())
    preview_items += list(db.query(WebReusableComponent).filter_by(theme_version_id=version.id).all())
    for item in preview_items:
        kind = "templates" if isinstance(item, WebTemplate) else ("sections" if isinstance(item, WebSection) else "components")
        build_preview(
            db, kind, item.id, item.project_data or {}, item.css or "",
            base_css=THEME_CSS, tokens=_THEME_TOKENS, title=item.name,
            browser_render=False,
        )
    db.commit()

    # Activate the system theme on first run so the public site renders the
    # default look without manual theme activation.
    style = db.get(WebSiteStyle, 1)
    if style is None:
        style = WebSiteStyle(id=1)
        db.add(style)
    if style.active_theme_version_id is None:
        style.active_theme_version_id = version.id
    # Attach the built-in wireframe SVG as a preview for the system theme.
    # The Themes page frontend renders this directly (it's a data URI).
    version.default_tokens["__preview_svg__"] = _DEFAULT_TEMPLATE_SVG
    db.commit()

    # Legacy bundled themes are no longer installed on fresh databases.  Their
    # rows are intentionally not deleted here because an existing site may
    # still reference an immutable published version.


def seed_default_pages(db: Session) -> None:
    """Create any missing default pages (main, news) idempotently and keep
    the built-in slugs in their default published state."""
    seed_default_templates(db)
    from .ontario_theme import (
        ONTARIO_THEME_ID,
        ONTARIO_THEME_TEMPLATES,
        ONTARIO_THEME_VERSION,
        seed_ontario_theme,
    )
    seed_ontario_theme(db)
    from .theme_package import _qualified_key as _theme_qualified_key
    theme_templates = {
        key: db.query(WebTemplate).filter_by(
            qualified_key=_theme_qualified_key(ONTARIO_THEME_ID, ONTARIO_THEME_VERSION, "templates", key),
        ).one_or_none()
        for key in ONTARIO_THEME_TEMPLATES
    }
    for item in DEFAULT_PAGES:
        existing = db.query(WebPage).filter_by(slug=item["slug"]).one_or_none()
        if existing:
            continue
        theme_key = {"main": "home", "news": "news"}.get(item["slug"], item["slug"])
        template = theme_templates.get(theme_key) or theme_templates.get("main")
        template_project = deepcopy(template.published_project_data or template.project_data) if template else None
        page_project = (
            _extract_page_content(template_project, template_project)
            if isinstance(template_project, dict) and template_project.get("pages")
            else _empty_project()
        )
        page = WebPage(
            slug=item["slug"],
            title=item["title"],
            template=template.key if template else None,
            template_id=template.id if template else None,
            path_segment=item["slug"],
            path="/" if item["slug"] == "main" else f"/{item['slug']}",
            html=None,
            data=page_project,
            published=False,
            draft_version=1,
        )
        db.add(page)

    # Bind default pages to the theme-owned templates when they still point at
    # the legacy empty templates or have no template assigned.
    for item in DEFAULT_PAGES:
        page = db.query(WebPage).filter_by(slug=item["slug"], deleted_at=None).one_or_none()
        if not page:
            continue
        theme_key = {"main": "home", "news": "news"}.get(item["slug"], item["slug"])
        template = theme_templates.get(theme_key)
        if not template:
            continue
        current_template = db.get(WebTemplate, page.template_id) if page.template_id else None
        legacy_default_keys = {
            _theme_qualified_key(DEFAULT_THEME_ID, DEFAULT_THEME_VERSION, "templates", "main"),
            _theme_qualified_key(DEFAULT_THEME_ID, DEFAULT_THEME_VERSION, "templates", "news"),
            _theme_qualified_key(DEFAULT_THEME_ID, DEFAULT_THEME_VERSION, "templates", "scout-home"),
            _theme_qualified_key(DEFAULT_THEME_ID, DEFAULT_THEME_VERSION, "templates", "scout-listing"),
        }
        # Fill a missing shell and migrate only the two legacy built-in shells.
        # A site editor's explicit template choice must survive startup/theme
        # package updates; overwriting it here could leave the page unstyled.
        if page.template_id is None or (
            current_template is not None
            and current_template.qualified_key in legacy_default_keys
            and current_template.id != template.id
        ):
            page.template_id = template.id
            page.template = template.key
    db.commit()


@router.get("/components")
def list_components(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.design.manage")
    # Deprecated compatibility endpoint. Fixed visual module components are no
    # longer authoring primitives; modules expose public data sources instead.
    return []


@router.get("/data-sources")
def data_source_catalog(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.design.manage")
    from ..web.data_sources import list_data_sources
    return list_data_sources(db)


class TemplatePayload(BaseModel):
    key: str | None = None
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    html: str = ""
    css: str = ""
    project_data: dict | None = None
    qualified_key: str | None = None
    template_kind: str = "layout"
    usage_mode: str = "linked_layout"
    preview_media_id: int | None = None
    expected_version: int | None = Field(default=None, ge=1)


class TemplateClonePayload(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    key: str | None = Field(default=None, max_length=50)
    qualified_key: str | None = Field(default=None, max_length=240)


def _active_theme_version_id(db: Session) -> int:
    style = db.query(WebSiteStyle).filter_by(id=1).one_or_none()
    if style is None or style.active_theme_version_id is None:
        raise HTTPException(422, "Activate a theme before managing templates")
    return int(style.active_theme_version_id)


@router.get("/templates")
def list_templates(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.templates.manage")
    from .ontario_theme import seed_ontario_theme
    seed_ontario_theme(db)
    active_theme_id = _active_theme_version_id(db)
    templates = db.query(WebTemplate).filter_by(theme_version_id=active_theme_id).order_by(WebTemplate.name.asc()).all()
    version = db.get(WebThemeVersion, active_theme_id)
    for template in templates:
        ensure_preview(
            db,
            "templates",
            template.id,
            template.project_data or template.published_project_data or _empty_project(),
            template.css or template.published_css or "",
            base_css=version.base_css if version else "",
            tokens=version.default_tokens if version else {},
            title=template.name,
        )
    # Lazy backfill also covers themes installed before preview artifacts were
    # introduced.  No artifact changes are made when all previews are current.
    db.commit()
    return [_serialize_template(db, t) for t in templates]


@router.get("/templates/{template_id}")
def get_template(template_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.templates.manage")
    template = db.query(WebTemplate).filter_by(id=template_id).one_or_none()
    if not template:
        raise HTTPException(404, "Template not found")
    return _serialize_template(db, template)


@router.post("/templates", status_code=201)
def create_template(payload: TemplatePayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.templates.manage")
    key = _slugify(payload.key or payload.name)
    if db.query(WebTemplate).filter_by(key=key).one_or_none():
        raise HTTPException(400, "Template with this key already exists")
    project = payload.project_data or _empty_project()
    compile_project(project)
    from .linked_resources import validate_linked_resource_instances
    from .resource_props import ResourcePropsError
    try:
        validate_linked_resource_instances(db, project, published=False)
    except ResourcePropsError as exc:
        raise HTTPException(422, str(exc)) from exc
    _validate_custom_css(payload.css)
    if payload.preview_media_id is not None and not db.query(WebMedia).filter_by(id=payload.preview_media_id).one_or_none():
        raise HTTPException(404, "Preview media not found")
    template = WebTemplate(
        key=key,
        name=payload.name.strip(),
        description=payload.description,
        html=payload.html,
        css=payload.css,
        project_data=project,
        qualified_key=(payload.qualified_key if str(payload.qualified_key or "").startswith("site:template:") else f"site:template:{key}"),
        template_kind=payload.template_kind,
        usage_mode=payload.usage_mode if payload.usage_mode in {"linked_layout", "copy_on_create"} else "linked_layout",
        preview_media_id=payload.preview_media_id,
        theme_version_id=_active_theme_version_id(db),
        draft_version=1,
        is_system=False,
        created_by_id=current_user.id,
    )
    db.add(template)
    db.flush()
    build_preview(
        db, "templates", template.id, template.project_data or {}, template.css or "", title=template.name,
    )
    db.commit()
    db.refresh(template)
    return _serialize_template(db, template)


@router.put("/templates/{template_id}")
def update_template(template_id: int, payload: TemplatePayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.templates.manage")
    template = db.query(WebTemplate).filter_by(id=template_id).one_or_none()
    if not template:
        raise HTTPException(404, "Template not found")
    if payload.expected_version is None:
        raise HTTPException(428, "expected_version is required")
    expected = payload.expected_version
    if expected != template.draft_version:
        raise HTTPException(409, "Template was changed by another editor")
    project = payload.project_data or template.project_data or _empty_project()
    compile_project(project); _validate_custom_css(payload.css)
    from .linked_resources import validate_linked_resource_instances
    from .resource_props import ResourcePropsError
    try:
        validate_linked_resource_instances(db, project, published=False)
    except ResourcePropsError as exc:
        raise HTTPException(422, str(exc)) from exc
    if payload.preview_media_id is not None and not db.query(WebMedia).filter_by(id=payload.preview_media_id).one_or_none():
        raise HTTPException(404, "Preview media not found")
    values = {
        WebTemplate.name: payload.name.strip(), WebTemplate.description: payload.description,
        WebTemplate.project_data: project, WebTemplate.css: payload.css,
        WebTemplate.template_kind: payload.template_kind,
        WebTemplate.usage_mode: payload.usage_mode if payload.usage_mode in {"linked_layout", "copy_on_create"} else "linked_layout",
        WebTemplate.preview_media_id: payload.preview_media_id,
        WebTemplate.draft_version: expected + 1,
    }
    if payload.html:
        values[WebTemplate.html] = payload.html
    updated = db.query(WebTemplate).filter(
        WebTemplate.id == template_id, WebTemplate.draft_version == expected,
    ).update(values, synchronize_session=False)
    if updated != 1:
        db.rollback(); raise HTTPException(409, "Template was changed by another editor")
    build_preview(
        db, "templates", template_id, project, payload.css or "", title=payload.name.strip(),
    )
    db.commit()
    db.refresh(template)
    return _serialize_template(db, template)


@router.post("/templates/{template_id}/clone", status_code=201)
def clone_template(template_id: int, payload: TemplateClonePayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.templates.manage")
    origin = db.query(WebTemplate).filter_by(id=template_id).one_or_none()
    if not origin:
        raise HTTPException(404, "Template not found")
    active_theme_id = _active_theme_version_id(db)
    if origin.theme_version_id != active_theme_id:
        raise HTTPException(404, "Template is not part of the active theme")

    requested_name = (payload.name or "").strip()
    name = requested_name or f"{origin.name} (copy)"
    base_key = _slugify(payload.key or f"{origin.key}-copy")
    key = base_key
    suffix = 2
    while db.query(WebTemplate.id).filter(WebTemplate.key == key).first():
        key = f"{base_key[:45]}-{suffix}"
        suffix += 1

    base_qualified_key = (payload.qualified_key or "").strip() or f"site:template:{key}"
    qualified_key = base_qualified_key
    suffix = 2
    while db.query(WebTemplate.id).filter(WebTemplate.qualified_key == qualified_key).first():
        qualified_key = f"{base_qualified_key[:235]}-{suffix}"
        suffix += 1

    project = deepcopy(origin.project_data or origin.published_project_data or _empty_project())
    published_project = deepcopy(origin.published_project_data) if origin.published_project_data else None
    clone = WebTemplate(
        key=key,
        qualified_key=qualified_key,
        name=name,
        description=origin.description,
        html=origin.html or "",
        css=origin.css or "",
        template_kind=origin.template_kind or "layout",
        usage_mode=origin.usage_mode or "linked_layout",
        project_data=project,
        draft_version=1,
        published_project_data=published_project,
        published_css=(origin.published_css or "") if published_project else "",
        published_version=int(origin.published_version or 1) if published_project else 0,
        theme_version_id=active_theme_id,
        preview_media_id=origin.preview_media_id,
        forked_from_id=origin.id,
        is_system=False,
        created_by_id=current_user.id,
    )
    db.add(clone)
    db.flush()
    build_preview(
        db, "templates", clone.id, clone.project_data or {}, clone.css or "", title=clone.name,
    )
    db.commit()
    db.refresh(clone)
    return _serialize_template(db, clone)


@router.post("/templates/{template_id}/publish")
def publish_template(template_id: int, payload: PublishPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.templates.manage")
    _require_action(db, current_user, "web.publish")
    template = db.query(WebTemplate).filter_by(id=template_id).one_or_none()
    if not template:
        raise HTTPException(404, "Template not found")
    if template.draft_version != payload.expected_version:
        raise HTTPException(409, "Template was changed by another editor")
    compile_project(template.project_data or _empty_project()); _validate_custom_css(template.css)
    from .linked_resources import validate_linked_resource_instances
    from .resource_props import ResourcePropsError
    try:
        validate_linked_resource_instances(db, template.project_data, published=True)
    except ResourcePropsError as exc:
        raise HTTPException(422, str(exc)) from exc
    updated = db.query(WebTemplate).filter(
        WebTemplate.id == template.id, WebTemplate.draft_version == payload.expected_version,
    ).update({
        WebTemplate.published_project_data: template.project_data,
        WebTemplate.published_css: template.css,
        WebTemplate.published_version: template.published_version + 1,
    }, synchronize_session=False)
    if updated != 1:
        db.rollback(); raise HTTPException(409, "Template was changed by another editor")
    # The optimistic bulk update bypasses SQLAlchemy's identity map. Reload
    # these fields before rebuilding linked page artifacts; otherwise the
    # rebuild can see the previous (or empty) layout and publish an unstyled
    # document until a later full regeneration.
    db.expire(template, ["published_project_data", "published_css", "published_version"])
    build_preview(
        db, "templates", template.id,
        template.project_data or _empty_project(), template.css or "", title=template.name,
    )
    # Layout content is part of each immutable public document.
    rebuild_published_page_artifacts(db)
    db.commit(); db.refresh(template)
    return _serialize_template(db, template)


@router.post("/templates/{template_id}/preview")
def regenerate_template_preview(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_action(db, current_user, "web.templates.manage")
    template = db.query(WebTemplate).filter_by(id=template_id).one_or_none()
    if not template:
        raise HTTPException(404, "Template not found")
    build_preview(
        db, "templates", template.id,
        template.project_data or template.published_project_data or _empty_project(),
        template.css or template.published_css or "",
        title=template.name,
        force=True,
    )
    db.commit()
    return _serialize_template(db, template)


@router.delete("/templates/{template_id}", status_code=204)
def delete_template(template_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.templates.manage")
    template = db.query(WebTemplate).filter_by(id=template_id).one_or_none()
    if not template:
        raise HTTPException(404, "Template not found")
    if _template_is_locked(template):
        raise HTTPException(409, "Installed theme templates cannot be deleted")
    draft_reference = db.query(WebPage.id).filter(
        (WebPage.template_id == template.id) | (WebPage.template == template.key)
    ).first()
    published_reference = db.query(WebPageRevision.id).join(
        WebPage, WebPage.published_revision_id == WebPageRevision.id,
    ).filter(WebPageRevision.template_id == template.id).first()
    if published_reference:
        _require_action(db, current_user, "web.publish")
        raise HTTPException(409, "Template is referenced by published pages")
    if draft_reference:
        raise HTTPException(400, "Template is used by existing pages")
    db.delete(template)
    db.commit()
