"""Authenticated CMS design routes."""
import re

from .routes_common import *  # noqa: F403
from ..models import WebPreviewArtifact

router = APIRouter(prefix="/web", tags=["web"])

from .routes_pages import PublishPayload
from .previews import (
    build_preview as build_resource_preview,
    get_current_preview,
    project_preview_svg,
    stored_preview_path,
)
from .routes_content import _serialize_menus
from .linked_resources import validate_linked_resource_instances
from .resource_props import (
    ResourcePropsError,
    normalise_default_props,
    normalise_prop_schema,
    normalise_variants,
)
# ---------------------------------------------------------------- settings


def _site_settings(db: Session) -> dict:
    return {
        "site_title": get_config_value(db, "web.site_title") or "Naše skautská střediska",
        "site_tagline": get_config_value(db, "web.site_tagline"),
        "site_meta": get_config_value(db, "web.site_meta"),
        "site_logo": get_config_value(db, "web.site_logo"),
        "favicon": get_config_value(db, "web.favicon"),
        "meta_description": get_config_value(db, "web.meta_description"),
        "og_title": get_config_value(db, "web.og_title"),
        "og_description": get_config_value(db, "web.og_description"),
        "og_image": get_config_value(db, "web.og_image"),
        "og_type": get_config_value(db, "web.og_type"),
        "canonical_url": get_config_value(db, "web.canonical_url"),
    }


@router.get("/settings")
def get_site_settings(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.settings.manage")
    return {"settings": _site_settings(db), "menus": _serialize_menus(db)}


class SettingsPayload(BaseModel):
    site_title: str | None = None
    site_tagline: str | None = None
    site_meta: str | None = None
    site_logo: str | None = None
    favicon: str | None = None
    meta_description: str | None = None
    og_title: str | None = None
    og_description: str | None = None
    og_image: str | None = None
    og_type: str | None = None
    canonical_url: str | None = None


@router.put("/settings")
def update_site_settings(payload: SettingsPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.settings.manage")
    for field in payload.model_fields_set:
        value = getattr(payload, field)
        set_config_value(db, f"web.{field}", "" if value is None else str(value))
    return {"settings": _site_settings(db)}


# ---------------------------------------------------------------- design system

DESIGN_MODELS = {
    "components": WebReusableComponent,
    "sections": WebSection,
}


class DesignResourcePayload(BaseModel):
    qualified_key: str = Field(min_length=1, max_length=240)
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    project_data: dict
    css: str = ""
    prop_schema: list[dict] = Field(default_factory=list)
    default_props: dict = Field(default_factory=dict)
    variants: list[dict] = Field(default_factory=list)
    preview_media_id: int | None = None
    expected_version: int | None = Field(default=None, ge=1)
    part_kind: str | None = None


def _design_out(db: Session, item) -> dict:
    preview_media_id = getattr(item, "preview_media_id", None)
    kind = {WebReusableComponent: "components", WebSection: "sections"}.get(type(item), "components")
    current_preview = get_current_preview(db, kind, item.id)
    if current_preview:
        preview_url = current_preview["url"]
    elif preview_media_id:
        preview_url = f"/api/web/media/{preview_media_id}/file"
    else:
        # Derive a structural wireframe when the theme/package did not ship a
        # raster preview. This keeps every resource visible in the catalog and
        # the editor without an authenticated media round-trip.
        preview_url = project_preview_svg(
            getattr(item, "project_data", None),
            title=getattr(item, "name", "") or "",
        )
    result = {
        "id": item.id, "qualified_key": item.qualified_key, "name": item.name,
        "description": item.description, "project_data": item.project_data,
        "css": item.css, "draft_version": item.draft_version,
        "prop_schema": item.prop_schema or [], "default_props": item.default_props or {},
        "variants": item.variants or [],
        "published_project_data": item.published_project_data,
        "published_css": item.published_css or "",
        "published_prop_schema": item.published_prop_schema or [],
        "published_default_props": item.published_default_props or {},
        "published_variants": item.published_variants or [],
        "preview_media_id": preview_media_id,
        "preview_url": preview_url,
        "theme_version_id": item.theme_version_id, "is_locked": item.is_locked,
        "part_kind": getattr(item, "part_kind", None),
        "published_version": getattr(item, "published_version", None),
    }
    return result



class MaterializeResourcePayload(BaseModel):
    props: dict = Field(default_factory=dict)
    variant: str | None = Field(default=None, max_length=80)
    expected_version: int = Field(ge=1)


class DesignResourceClonePayload(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    qualified_key: str | None = Field(default=None, max_length=240)


def _normalise_resource_definition(payload: DesignResourcePayload) -> tuple[list[dict], dict, list[dict]]:
    try:
        schema = normalise_prop_schema(payload.prop_schema)
        defaults = normalise_default_props(schema, payload.default_props)
        variants = normalise_variants(schema, defaults, payload.variants)
    except ResourcePropsError as exc:
        raise HTTPException(422, str(exc)) from exc
    return schema, defaults, variants


@router.get("/design/styles")
def get_global_styles(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.design.manage")
    item = db.query(WebSiteStyle).filter_by(id=1).one_or_none()
    if not item:
        item = WebSiteStyle(id=1)
        db.add(item); db.commit(); db.refresh(item)
    return {
        "draft_tokens": item.draft_tokens, "draft_css": item.draft_css,
        "draft_version": item.draft_version, "published_tokens": item.published_tokens,
        "published_css": item.published_css, "published_version": item.published_version,
        "active_theme_version_id": item.active_theme_version_id,
    }


class SiteStylePayload(BaseModel):
    expected_version: int = Field(ge=1)
    tokens: dict = Field(default_factory=dict)
    css: str = ""


def _validate_custom_css(css: str) -> None:
    from ..web.renderer import UNSAFE_CSS
    if len(css) > 500_000 or UNSAFE_CSS.search(css):
        raise HTTPException(422, "Global CSS violates the public rendering policy")


def _validate_design_tokens(tokens: dict) -> None:
    try:
        render_document("", title="validation", tokens=tokens)
    except CompileError as exc:
        raise HTTPException(422, str(exc)) from exc


def _validate_preview_media(db: Session, preview_media_id: int | None) -> None:
    if preview_media_id is None:
        return
    if not db.query(WebMedia).filter_by(id=preview_media_id).one_or_none():
        raise HTTPException(404, "Preview media not found")


def _design_permission(kind: str) -> str:
    return "web.design.manage"


def _project_references_part(value, identifiers: set[str]) -> bool:
    from .theme_package import _linked_part_references
    return bool(_linked_part_references(value) & identifiers)




@router.put("/design/styles")
def update_global_styles(payload: SiteStylePayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.design.manage")
    _validate_custom_css(payload.css)
    _validate_design_tokens(payload.tokens)
    item = db.query(WebSiteStyle).filter_by(id=1).one_or_none()
    if not item:
        item = WebSiteStyle(id=1, draft_version=1); db.add(item); db.flush()
    updated = db.query(WebSiteStyle).filter(
        WebSiteStyle.id == item.id, WebSiteStyle.draft_version == payload.expected_version,
    ).update({
        WebSiteStyle.draft_tokens: payload.tokens, WebSiteStyle.draft_css: payload.css,
        WebSiteStyle.draft_version: payload.expected_version + 1,
        WebSiteStyle.updated_by_id: current_user.id,
    }, synchronize_session=False)
    if updated != 1:
        db.rollback(); raise HTTPException(409, "Global styles were changed by another editor")
    db.commit(); db.refresh(item)
    return get_global_styles(db, current_user)


@router.post("/design/styles/publish")
def publish_global_styles(payload: PublishPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.design.manage")
    _require_action(db, current_user, "web.publish")
    item = db.query(WebSiteStyle).filter_by(id=1).one_or_none()
    if not item or item.draft_version != payload.expected_version:
        raise HTTPException(409, "Global styles were changed by another editor")
    _validate_custom_css(item.draft_css)
    _validate_design_tokens(item.draft_tokens or {})
    updated = db.query(WebSiteStyle).filter(
        WebSiteStyle.id == 1, WebSiteStyle.draft_version == payload.expected_version,
    ).update({
        WebSiteStyle.published_tokens: item.draft_tokens,
        WebSiteStyle.published_css: item.draft_css,
        WebSiteStyle.published_version: item.published_version + 1,
    }, synchronize_session=False)
    if updated != 1:
        db.rollback(); raise HTTPException(409, "Global styles were changed by another editor")
    db.commit(); db.refresh(item)
    return get_global_styles(db, current_user)


# ---------------------------------------------------------------- editor canvas styles


@router.get("/design/canvas-styles")
def get_canvas_styles(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.pages.manage")
    style = db.query(WebSiteStyle).filter_by(id=1).one_or_none()
    tokens = (style.published_tokens if style else {}) or {}
    css = (style.published_css if style else "") or ""
    base_css = ""
    if style and style.active_theme_version_id:
        version = db.query(WebThemeVersion).filter_by(id=style.active_theme_version_id).one_or_none()
        if version:
            from .theme_package import rewrite_theme_asset_urls
            base_css = rewrite_theme_asset_urls(version.base_css or "", version.id, api=True)
            # Merge the active theme's default tokens underneath the site-level
            # overrides, exactly like the public renderer does.
            tokens = _deep_merge_tokens(version.default_tokens or {}, tokens)

    # Flatten tokens to CSS custom properties. The segment conversion must
    # match render_document exactly so the editor preview and the public
    # renderer agree on custom property names (camelCase -> kebab-case).
    root_vars = []
    def _segment(key):
        return re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "-", str(key)).lower().replace("_", "-")

    def _flatten(value, prefix=None):
        out = []
        if prefix is None:
            prefix = []
        if isinstance(value, dict):
            for key in sorted(value):
                segment = _segment(key)
                if re.fullmatch(r"[a-z][a-z0-9-]{0,39}", segment):
                    out.extend(_flatten(value[key], prefix + [segment]))
        elif prefix and isinstance(value, (str, int, float)) and not isinstance(value, bool):
            name = f'--sc-{"-".join(prefix)}'
            out.append(f'{name}:{value}')
        return out
    root_vars = _flatten(tokens)
    token_css = f':root{{{";".join(root_vars)}}}' if root_vars else ""

    return {
        "css": f"{token_css}\n{base_css}\n{css}",
        "active_theme_version_id": style.active_theme_version_id if style else None,
    }


@router.get("/design/{kind}")
def list_design_resources(
    kind: str,
    theme_version_id: int | None = Query(None, description="Filter to a specific theme version"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_action(db, current_user, _design_permission(kind))
    model = DESIGN_MODELS.get(kind)
    if not model:
        raise HTTPException(404, "Unknown design resource kind")
    query = db.query(model)
    if theme_version_id is not None:
        query = query.filter(model.theme_version_id == theme_version_id)
    return [_design_out(db, item) for item in query.order_by(model.name.asc()).all()]


@router.post("/design/{kind}", status_code=201)
def create_design_resource(kind: str, payload: DesignResourcePayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, _design_permission(kind))
    model = DESIGN_MODELS.get(kind)
    if not model:
        raise HTTPException(404, "Unknown design resource kind")
    compile_project(payload.project_data)
    try:
        validate_linked_resource_instances(db, payload.project_data, published=False)
    except ResourcePropsError as exc:
        raise HTTPException(422, str(exc)) from exc
    _validate_custom_css(payload.css)
    if db.query(model).filter_by(qualified_key=payload.qualified_key).first():
        raise HTTPException(409, "Resource key is already used")
    _validate_preview_media(db, payload.preview_media_id)
    schema, defaults, variants = _normalise_resource_definition(payload)
    values = dict(
        qualified_key=payload.qualified_key, name=payload.name.strip(),
        description=payload.description, project_data=payload.project_data, css=payload.css,
        prop_schema=schema, default_props=defaults, variants=variants,
        preview_media_id=payload.preview_media_id,
        draft_version=1, created_by_id=current_user.id,
    )
    item = model(**values)
    db.add(item)
    db.flush()
    build_resource_preview(
        db, kind, item.id, item.project_data or {}, item.css or "", title=item.name,
    )
    db.commit()
    db.refresh(item)
    return _design_out(db, item)


@router.put("/design/{kind}/{resource_id}")
def update_design_resource(kind: str, resource_id: int, payload: DesignResourcePayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, _design_permission(kind))
    model = DESIGN_MODELS.get(kind)
    if not model:
        raise HTTPException(404, "Unknown design resource kind")
    item = db.query(model).filter_by(id=resource_id).one_or_none()
    if not item:
        raise HTTPException(404, "Design resource not found")
    if item.is_locked or item.theme_version_id:
        raise HTTPException(409, "Installed theme resources must be cloned before editing")
    if payload.expected_version is None:
        raise HTTPException(428, "expected_version is required")
    expected = payload.expected_version
    if expected != item.draft_version:
        raise HTTPException(409, "Resource was changed by another editor")
    if payload.qualified_key != item.qualified_key:
        raise HTTPException(409, "Resource qualified_key is immutable")
    compile_project(payload.project_data)
    try:
        validate_linked_resource_instances(db, payload.project_data, published=False)
    except ResourcePropsError as exc:
        raise HTTPException(422, str(exc)) from exc
    _validate_custom_css(payload.css)
    _validate_preview_media(db, payload.preview_media_id)
    schema, defaults, variants = _normalise_resource_definition(payload)
    updated = db.query(model).filter(model.id == resource_id, model.draft_version == expected).update({
        model.name: payload.name.strip(),
        model.description: payload.description, model.project_data: payload.project_data,
        model.css: payload.css, model.prop_schema: schema,
        model.default_props: defaults, model.variants: variants,
        model.preview_media_id: payload.preview_media_id,
        model.draft_version: expected + 1,
    }, synchronize_session=False)
    if updated != 1:
        db.rollback(); raise HTTPException(409, "Resource was changed by another editor")
    build_resource_preview(
        db, kind, resource_id, payload.project_data or {}, payload.css or "", title=payload.name.strip(),
    )
    db.commit(); db.refresh(item)
    return _design_out(db, item)


@router.post("/design/{kind}/{resource_id}/publish")
def publish_design_resource(
    kind: str,
    resource_id: int,
    payload: PublishPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_action(db, current_user, _design_permission(kind))
    _require_action(db, current_user, "web.publish")
    model = DESIGN_MODELS.get(kind)
    if not model:
        raise HTTPException(404, "Unknown design resource kind")
    item = db.query(model).filter_by(id=resource_id).one_or_none()
    if not item:
        raise HTTPException(404, "Design resource not found")
    if item.is_locked or item.theme_version_id:
        raise HTTPException(409, "Installed theme resources are already immutable and published")
    if item.draft_version != payload.expected_version:
        raise HTTPException(409, "Resource was changed by another editor")
    try:
        compile_project(item.project_data)
        validate_linked_resource_instances(db, item.project_data, published=True)
        schema = normalise_prop_schema(item.prop_schema or [])
        defaults = normalise_default_props(schema, item.default_props or {})
        variants = normalise_variants(schema, defaults, item.variants or [])
    except (CompileError, ResourcePropsError) as exc:
        raise HTTPException(422, str(exc)) from exc
    _validate_custom_css(item.css or "")
    updated = db.query(model).filter(
        model.id == item.id, model.draft_version == payload.expected_version,
    ).update({
        model.published_project_data: item.project_data,
        model.published_css: item.css,
        model.published_prop_schema: schema,
        model.published_default_props: defaults,
        model.published_variants: variants,
        model.published_version: item.published_version + 1,
    }, synchronize_session=False)
    if updated != 1:
        db.rollback()
        raise HTTPException(409, "Resource was changed by another editor")
    build_resource_preview(
        db, kind, item.id, item.project_data or {}, item.css or "", title=item.name,
    )
    db.commit()
    db.refresh(item)
    return _design_out(db, item)


@router.post("/design/{kind}/{resource_id}/clone", status_code=201)
def clone_design_resource(kind: str, resource_id: int, payload: DesignResourceClonePayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    """Clone a design resource into a site-owned definition.

    Site-owned clones are the only sanctioned way to edit an installed theme
    resource. The clone becomes the new source of truth; the original stays
    immutable. If a name/key is not supplied, we derive a site-owned key that
    does not collide with existing resources.
    """
    _require_action(db, current_user, _design_permission(kind))
    model = DESIGN_MODELS.get(kind)
    if not model:
        raise HTTPException(404, "Unknown design resource kind")
    origin = db.query(model).filter_by(id=resource_id).one_or_none()
    if not origin:
        raise HTTPException(404, "Design resource not found")
    if origin.is_locked or origin.theme_version_id:
        # Installing a theme is immutable; cloning is allowed and expected here.
        pass

    name = (payload.name or "").strip() or f"{origin.name} (vlastní)"
    base_key = (payload.qualified_key or "").strip() or f"site:{kind[:-1] if kind.endswith('s') else kind}:{cms_slugify(origin.name) or 'clone'}"

    # Ensure unique key.
    key = base_key
    index = 2
    while db.query(model).filter_by(qualified_key=key).first():
        key = f"{base_key}-{index}"
        index += 1

    clone = model(
        qualified_key=key,
        name=name[:200],
        description=origin.description,
        project_data=origin.project_data,
        css=origin.css or "",
        prop_schema=origin.prop_schema or [],
        default_props=origin.default_props or {},
        variants=origin.variants or [],
        published_project_data=origin.published_project_data,
        published_css=origin.published_css or "",
        published_prop_schema=origin.published_prop_schema or [],
        published_default_props=origin.published_default_props or {},
        published_variants=origin.published_variants or [],
        published_version=int(origin.published_version or 1) if origin.published_project_data else 0,
        theme_version_id=None,
        preview_media_id=origin.preview_media_id,
        origin_resource_id=origin.id,
        draft_version=1,
        is_locked=False,
        created_by_id=current_user.id,
    )
    db.add(clone)
    db.flush()
    build_resource_preview(
        db, kind, clone.id, clone.project_data or {}, clone.css or "", title=clone.name,
    )
    db.commit()
    db.refresh(clone)
    return _design_out(db, clone)


@router.post("/design/{kind}/{resource_id}/materialize")
def materialize_design_resource(kind: str, resource_id: int, payload: MaterializeResourcePayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    """Return a detached HTML+CSS fragment for one linked instance.

    The server only materializes; the caller (GrapesJS) performs the actual
    detach. This keeps the renderer the single authority for applying props and
    CSS and avoids losing binding metadata on the client.
    """
    _require_action(db, current_user, "web.pages.manage")
    model = DESIGN_MODELS.get(kind)
    if not model:
        raise HTTPException(404, "Unknown design resource kind")
    item = db.query(model).filter_by(id=resource_id).one_or_none()
    if not item:
        raise HTTPException(404, "Design resource not found")
    if payload.expected_version != item.draft_version:
        raise HTTPException(409, "Resource was changed by another editor")

    from .linked_resources import render_resource_fragment, resource_has_runtime_bindings, resource_snapshot
    from .resource_props import ResourcePropsError
    from .renderer import CompileError

    try:
        singular = kind.rstrip('s') if kind.endswith('s') else kind
        snapshot = resource_snapshot(db, singular, resource_id, published=False)
    except CompileError as exc:
        raise HTTPException(422, str(exc)) from exc
    except ResourcePropsError as exc:
        raise HTTPException(422, str(exc)) from exc

    if resource_has_runtime_bindings(db, snapshot):
        raise HTTPException(422, "Resource contains runtime bindings and cannot be detached as HTML")

    try:
        fragment = render_resource_fragment(
            db,
            snapshot,
            payload.props,
            variant=payload.variant,
        )
    except (CompileError, ResourcePropsError) as exc:
        raise HTTPException(422, str(exc)) from exc

    return {
        "html": fragment.html,
        "css": fragment.css,
        "draft_version": item.draft_version,
    }


@router.post("/design/{kind}/{resource_id}/preview")
def regenerate_design_preview(kind: str, resource_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, _design_permission(kind))
    model = DESIGN_MODELS.get(kind)
    if not model:
        raise HTTPException(404, "Unknown design resource kind")
    item = db.query(model).filter_by(id=resource_id).one_or_none()
    if not item:
        raise HTTPException(404, "Design resource not found")
    # Build a fresh preview artifact from current project data.
    preview = build_resource_preview(
        db, kind, resource_id,
        getattr(item, "project_data", {}) or {},
        getattr(item, "css", "") or "",
        title=getattr(item, "name", "") or "",
        force=True,
    )
    db.commit()
    return _design_out(db, item)


@router.get("/preview-artifacts/{artifact_id}/file")
def serve_preview_artifact(
    artifact_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    artifact = db.query(WebPreviewArtifact).filter_by(id=artifact_id).one_or_none()
    if not artifact:
        raise HTTPException(404, "Preview artifact not found")
    permission = {
        "components": "web.design.manage",
        "sections": "web.design.manage",
        "templates": "web.templates.manage",
    }.get(artifact.resource_kind)
    if permission is None:
        raise HTTPException(404, "Preview artifact not found")
    _require_action(db, current_user, permission)

    allowed_types = {
        ("png", "image/png"): ".png",
        ("svg", "image/svg+xml"): ".svg",
    }
    expected_suffix = allowed_types.get((artifact.format, artifact.mime))
    if expected_suffix is None:
        raise HTTPException(404, "Preview artifact file is invalid")
    try:
        path = stored_preview_path(artifact.storage_path)
    except ValueError as exc:
        raise HTTPException(404, "Preview artifact file is missing") from exc
    if path.suffix.lower() != expected_suffix or not path.is_file():
        raise HTTPException(404, "Preview artifact file is missing")
    return FileResponse(
        path,
        media_type=artifact.mime,
        headers={
            "Content-Disposition": f'inline; filename="preview-{artifact.id}{expected_suffix}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.delete("/design/{kind}/{resource_id}", status_code=204)
def delete_design_resource(kind: str, resource_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, _design_permission(kind))
    model = DESIGN_MODELS.get(kind)
    if not model:
        raise HTTPException(404, "Unknown design resource kind")
    item = db.query(model).filter_by(id=resource_id).one_or_none()
    if not item:
        raise HTTPException(404, "Design resource not found")
    if item.is_locked or item.theme_version_id:
        raise HTTPException(409, "Installed theme resources cannot be deleted individually")
    db.delete(item); db.commit()




def _deep_merge_tokens(base: dict, override: dict) -> dict:
    """Merge theme default tokens with site-level overrides (shallow leaf replace)."""
    result = dict(base)
    for key, value in (override or {}).items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _deep_merge_tokens(result[key], value)
        else:
            result[key] = value
    return result


# ---------------------------------------------------------------- themes
# ---------------------------------------------------------------- themes

@router.get("/themes")
def get_themes(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.themes.manage")
    from ..web.theme_package import list_themes
    return list_themes(db)


@router.get("/theme-assets/{theme_version_id}/{asset_path:path}")
def serve_theme_asset(
    theme_version_id: int, asset_path: str,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user),
):
    _require_action(db, current_user, "web.pages.manage")
    from ..web.theme_package import ThemePackageError, resolve_theme_asset_path
    from ..models import WebThemeAsset
    version = db.query(WebThemeVersion).filter_by(id=theme_version_id).one_or_none()
    asset = db.query(WebThemeAsset).filter_by(
        theme_version_id=theme_version_id, relative_path=asset_path,
    ).one_or_none()
    if not version or not asset:
        raise HTTPException(404, "Theme asset not found")
    try:
        path = resolve_theme_asset_path(version, asset.relative_path)
    except ThemePackageError as exc:
        raise HTTPException(404, "Theme asset not found") from exc
    if not path.is_file() or path.stat().st_size != asset.size:
        raise HTTPException(404, "Theme asset not found")
    return FileResponse(
        path, media_type=asset.mime,
        headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"},
    )


@router.get("/themes/{theme_version_id}")
def get_theme(theme_version_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.themes.manage")
    from ..web.theme_package import ThemeNotFoundError, inspect_theme
    try:
        return inspect_theme(db, theme_version_id)
    except ThemeNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.post("/themes/install", status_code=201)
async def install_theme_archive(file: UploadFile, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.themes.manage")
    from ..web.theme_package import MAX_ARCHIVE_SIZE, ThemeConflictError, ThemePackageError, install_theme
    content = await file.read(MAX_ARCHIVE_SIZE + 1)
    if len(content) > MAX_ARCHIVE_SIZE:
        raise HTTPException(413, "Theme archive is too large")
    try:
        version = install_theme(db, content, installed_by_id=current_user.id)
    except ThemeConflictError as exc:
        raise HTTPException(409, str(exc)) from exc
    except ThemePackageError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"id": version.id, "theme_id": version.theme_id, "version": version.version}


@router.post("/themes/{theme_version_id}/activate")
def activate_theme_version(theme_version_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.themes.manage")
    _require_action(db, current_user, "web.publish")
    from ..web.theme_package import ThemeNotFoundError, ThemePackageError, activate_theme
    try:
        style = activate_theme(db, theme_version_id, updated_by_id=current_user.id)
    except ThemeNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ThemePackageError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"active_theme_version_id": style.active_theme_version_id}


@router.get("/themes/{theme_version_id}/download")
def download_theme(theme_version_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.themes.manage")
    from ..web.theme_package import ThemeNotFoundError, ThemePackageError, export_theme_archive, list_themes
    try:
        themes = list_themes(db)
        name = "theme"
        for t_list in themes:
            if t_list.get("id") == theme_version_id:
                name = t_list.get("name", "theme")
                break
        if name == "theme":
            # Look up version directly
            from ..models import WebThemeVersion, WebTheme
            v = db.get(WebThemeVersion, theme_version_id)
            if v:
                thm = db.get(WebTheme, v.theme_id)
                name = thm.name if thm else name
        data = export_theme_archive(db, theme_version_id)
        safe_name = re.sub(r'[^a-zA-Z0-9._-]', '_', name)
        return Response(content=data, media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{safe_name}.zip"'})
    except ThemeNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ThemePackageError as exc:
        raise HTTPException(422, str(exc)) from exc


class DuplicateThemePayload(BaseModel):
    name: str = Field(min_length=1, max_length=200)


@router.post("/themes/{theme_version_id}/duplicate", status_code=201)
def duplicate_theme_version(theme_version_id: int, payload: DuplicateThemePayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.themes.manage")
    from ..web.theme_package import ThemeNotFoundError, ThemePackageError, duplicate_theme
    try:
        version = duplicate_theme(db, theme_version_id, new_name=payload.name, installed_by_id=current_user.id)
        return {"id": version.id, "theme_id": version.theme_id, "name": payload.name, "version": version.version}
    except ThemeNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ThemePackageError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.delete("/themes/{theme_version_id}", status_code=204)
def uninstall_theme_version(theme_version_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.themes.manage")
    from ..web.theme_package import ThemeInUseError, ThemeNotFoundError, uninstall_theme
    try:
        uninstall_theme(db, theme_version_id)
    except ThemeNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ThemeInUseError as exc:
        raise HTTPException(409, str(exc)) from exc
