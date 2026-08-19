"""Authenticated CMS pages routes."""
from .routes_common import *  # noqa: F403
from copy import deepcopy

from .resource_props import ResourcePropsError
from .renderer import component_slot_name
from .pages import _extract_page_content
from .site_identity import DEFAULT_TITLE_PATTERN, format_document_title

router = APIRouter(prefix="/web", tags=["web"])

# ---------------------------------------------------------------- pages


class PagePayload(BaseModel):
    model_config = {"extra": "forbid"}

    title: str = Field(min_length=1, max_length=200)
    slug: str | None = None
    template: str | None = None
    template_id: int | None = None  # Layout reference (linked page shell)
    source_template_id: int | None = None  # copy_on_create template provenance
    data: dict | None = None
    html: str | None = None
    published: bool = False
    parent_id: int | None = None
    position: int | None = None
    meta_description: str | None = None
    expected_version: int | None = None
    seo_title: str | None = None
    canonical_url: str | None = None
    og_image_id: int | None = None
    noindex: bool = False
    sitemap_include: bool = True


def _empty_project() -> dict:
    return {
        "scoutcomp": {"schemaVersion": 2},
        "pages": [{"component": {"type": "wrapper", "tagName": "main", "components": []}, "styles": []}],
    }


@router.get("/pages")
def list_pages(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.pages.manage")
    pages = (
        db.query(WebPage)
        .filter(WebPage.deleted_at.is_(None))
        .order_by(WebPage.position.asc(), WebPage.updated_at.desc())
        .all()
    )
    return [
        {
            "id": p.id,
            "slug": p.slug,
            "path_segment": p.path_segment or p.slug,
            "path": p.path or ("/" if p.slug == "main" else f"/{p.slug}"),
            "title": p.title,
            "template": p.template,
            "template_id": p.template_id,
            "published": p.published,
            "published_revision_id": p.published_revision_id,
            "draft_version": p.draft_version,
            "parent_id": p.parent_id,
            "position": p.position,
            "source_template_id": p.source_template_id,
            "source_template_version": p.source_template_version,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        }
        for p in pages
    ]


@router.get("/pages/trash")
def list_trash_pages(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.pages.manage")
    pages = (
        db.query(WebPage)
        .filter(WebPage.deleted_at.isnot(None))
        .order_by(WebPage.deleted_at.desc())
        .all()
    )
    return [_serialize_page(p) for p in pages]


def _copy_source_template_project(db: Session, source_template_id: int | None) -> dict | None:
    """Deep-copy the published snapshot of a copy-on-create template.

    Accepts the consolidated WebTemplate
    with usage_mode='copy_on_create'. The copy is detached; later template
    edits never propagate to existing pages.
    """
    if source_template_id is None:
        return None

    template = db.query(WebTemplate).filter_by(id=source_template_id).one_or_none()
    if template is None:
        return None
    source = template.published_project_data
    if source and isinstance(source, dict) and source.get("pages"):
        return deepcopy(source)
    return None


@router.post("/pages", status_code=201)
def create_page(payload: PagePayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.pages.manage")
    segment = normalise_path_segment(payload.slug, payload.title)
    if segment == "main" and payload.parent_id is not None:
        raise HTTPException(422, "Homepage cannot have a parent page")
    parent = validate_parent(db, None, payload.parent_id)
    unique_segment(db, segment, payload.parent_id)
    slug = unique_legacy_slug(db, segment)
    selected_layout = validate_template_usage(db, payload.template_id, "linked_layout")

    # A page always selects one ordinary template. Its published content seeds
    # the page slot at creation time; we do not maintain a second "starter"
    # template category.
    project = None
    source_template_id = None
    source_template_version = None
    if isinstance(payload.data, dict) and payload.data.get("pages"):
        project = payload.data
    elif payload.source_template_id is not None:
        source_template = db.query(WebTemplate).filter_by(id=payload.source_template_id).one_or_none()
        if source_template is None:
            raise HTTPException(404, "Template not found")
        project = _copy_source_template_project(db, source_template.id)
        if project is None:
            raise HTTPException(422, "Template must be published before use")
        source_template_id = source_template.id
        source_template_version = source_template.published_version
        if source_template.usage_mode == "linked_layout":
            selected_layout = source_template
            project = _extract_page_content(project, project)

    if project is None:
        project = _empty_project()

    page = WebPage(
        slug=slug,
        path_segment=segment,
        path=build_path(parent, segment),
        title=payload.title.strip(),
        template=(selected_layout.key if selected_layout is not None else payload.template),
        template_id=(selected_layout.id if selected_layout is not None else payload.template_id),
        source_template_id=source_template_id,
        source_template_version=source_template_version,
        data=project,
        html=payload.html if payload.data is None else None,
        published=False,
        draft_version=1,
        parent_id=payload.parent_id,
        position=payload.position or 0,
        meta_description=payload.meta_description,
        seo_title=payload.seo_title,
        canonical_url=payload.canonical_url,
        og_image_id=payload.og_image_id,
        noindex=payload.noindex,
        sitemap_include=payload.sitemap_include,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    db.add(page)
    db.commit()
    db.refresh(page)
    if payload.published:
        _require_action(db, current_user, "web.publish")
        publish_page(db, page, expected_version=page.draft_version, user_id=current_user.id)
    return _serialize_page(page)


@router.get("/pages/{page_id}")
def get_page(page_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.pages.manage")
    page = db.query(WebPage).filter_by(id=page_id).one_or_none()
    if not page:
        raise HTTPException(404, "Page not found")
    return _serialize_page(page)


@router.put("/pages/{page_id}")
def update_page(page_id: int, payload: PagePayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.pages.manage")
    page = db.query(WebPage).filter_by(id=page_id).one_or_none()
    if not page:
        raise HTTPException(404, "Page not found")
    project = payload.data if isinstance(payload.data, dict) and payload.data.get("pages") else canonical_project_data(page)
    page = save_draft(
        db,
        page,
        expected_version=payload.expected_version or page.draft_version or 1,
        project=project,
        user_id=current_user.id,
        metadata={
            "title": payload.title,
            "slug": payload.slug or page.path_segment or page.slug,
            "template": payload.template,
            "template_id": payload.template_id if payload.template_id is not None else page.template_id,
            "parent_id": payload.parent_id if payload.parent_id is not None else page.parent_id,
            "position": payload.position if payload.position is not None else page.position,
            "meta_description": payload.meta_description,
            "seo_title": payload.seo_title,
            "canonical_url": payload.canonical_url,
            "og_image_id": payload.og_image_id,
            "noindex": payload.noindex,
            "sitemap_include": payload.sitemap_include,
        },
    )
    if payload.published:
        _require_action(db, current_user, "web.publish")
        publish_page(db, page, expected_version=page.draft_version, user_id=current_user.id)
    return _serialize_page(page)


class DraftPayload(BaseModel):
    project_data: dict
    draft_css: str = ""  # accepted for API stability; canonical styles live in project JSON
    expected_version: int = Field(ge=1)
    metadata: dict = Field(default_factory=dict)


class PreviewPayload(BaseModel):
    project_data: dict | None = None
    expected_version: int = Field(ge=1)
    metadata: dict = Field(default_factory=dict)


class PublishPayload(BaseModel):
    expected_version: int = Field(ge=1)


def _site_style(db: Session, *, published: bool) -> tuple[dict, str, str]:
    style = db.query(WebSiteStyle).filter_by(id=1).one_or_none()
    if not style:
        return {}, "", ""
    tokens = style.published_tokens if published else style.draft_tokens
    css = style.published_css if published else style.draft_css
    base_css = ""
    merged_tokens = tokens or {}
    if style.active_theme_version_id:
        version = db.query(WebThemeVersion).filter_by(id=style.active_theme_version_id).one_or_none()
        if version:
            from .theme_package import rewrite_theme_asset_urls
            base_css = rewrite_theme_asset_urls(version.base_css or "", version.id, api=True)
            merged_tokens = _deep_merge(version.default_tokens or {}, merged_tokens)
    return merged_tokens, css or "", base_css


def _deep_merge(base: dict, override: dict) -> dict:
    result = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def _tree_contains_sc_slot(node: dict, depth: int = 0) -> bool:
    if not isinstance(node, dict) or depth > 40:
        return False
    if node.get("type") == "sc-slot" and component_slot_name(node) == "content":
        return True
    for child in node.get("components", []):
        if _tree_contains_sc_slot(child, depth + 1):
            return True
    return False


def _render_compiled_page(
    db: Session, page: WebPage, compiled, *, published: bool,
    metadata: dict | None = None,
) -> str:
    metadata = metadata or {}
    title = str(metadata.get("title") or page.title)
    path_segment = str(metadata.get("path_segment") or page.path_segment or page.slug)
    meta_description = metadata.get("meta_description", page.meta_description)
    seo_title = metadata.get("seo_title", page.seo_title)
    canonical_url = metadata.get("canonical_url", page.canonical_url)
    noindex = bool(metadata.get("noindex", page.noindex))
    page_context = {
        "id": page.id,
        "title": title,
        "path": page.path,
        "slug": path_segment,
        "meta_description": meta_description,
    }
    render_tree, slot_tree = compiled.tree, None
    template = None
    template_id = metadata.get("template_id", page.template_id)
    if template_id:
        template = db.query(WebTemplate).filter_by(id=template_id).one_or_none()
    elif page.template:
        template = db.query(WebTemplate).filter_by(key=page.template).one_or_none()
    template_project = (
        template.published_project_data if published and template else
        template.project_data if template else None
    )
    if template_project:
        # When the compiled tree already wraps the template (merged editor
        # project with an sc-slot), do not add the layout a second time.
        already_merged = _tree_contains_sc_slot(compiled.tree)
        if not already_merged:
            render_tree = compile_project(template_project).tree
            slot_tree = compiled.tree
    part_css: list[str] = []
    body = render_project(
        db, render_tree, slot_tree=slot_tree, page=page_context,
        site=_site_settings(db), css_layers=part_css,
        published_resources=published,
    ).replace('"/theme-assets/', '"/api/web/theme-assets/')
    tokens, global_css, base_css = _site_style(db, published=published)
    template_css = ""
    if template:
        template_css = template.published_css if published else template.css
        if template.theme_version_id:
            from .theme_package import rewrite_theme_asset_urls
            template_css = rewrite_theme_asset_urls(template_css or "", template.theme_version_id, api=True)
    linked_css = "\n".join(part_css).replace("/theme-assets/", "/api/web/theme-assets/")
    settings_data = _site_settings(db)
    return render_document(
        body,
        title=format_document_title(seo_title or title, settings_data["site_title"], settings_data["title_pattern"]),
        description=meta_description or "",
        canonical_url=canonical_url or "",
        favicon=settings_data["favicon"],
        noindex=noindex or not published,
        css=f"{global_css}\n{linked_css}\n{template_css or ''}\n{compiled.css}",
        base_css=base_css,
        tokens=tokens,
    )


def _merged_editor_project(page: WebPage, db: Session) -> dict | None:
    """Merge the page template's project data with the page's content.

    The template provides the outer shell (nav, hero, footer, sc-slot).
    Page content is inserted into the first sc-slot named "content". The
    GrapesJS editor loads this merged project so it renders with the
    template's structure and the page's actual content.
    """
    template = None
    if page.template_id:
        template = db.query(WebTemplate).filter_by(id=page.template_id).one_or_none()
    elif page.template:
        template = db.query(WebTemplate).filter_by(key=page.template).one_or_none()
    if not template or not template.project_data:
        return canonical_project_data(page)

    merged = deepcopy(template.project_data)
    page_project = canonical_project_data(page)
    page_root = _project_root_component(page_project)
    page_content = page_root.get("components", []) if page_root else []
    page_styles = _project_styles(page_project)
    page_assets = _project_assets(page_project)
    merged["assets"] = [*_project_assets(merged), *deepcopy(page_assets)]

    def _mark_template_owned(node, depth=0):
        if not isinstance(node, dict) or depth > 40:
            return
        attributes = dict(node.get("attributes") or {})
        attributes["data-sc-template-owner"] = str(template.id)
        node["attributes"] = attributes
        is_content_slot = node.get("type") == "sc-slot" and component_slot_name(node) == "content"
        node["removable"] = False
        node["copyable"] = False
        if not is_content_slot:
            # The page editor displays linked layout structure for context, but
            # the page draft owns only the content-slot children. Locking the
            # shell prevents edits that would otherwise be discarded on save.
            node["editable"] = False
            node["stylable"] = False
            node["draggable"] = False
            node["droppable"] = False
        for child in node.get("components", []):
            _mark_template_owned(child, depth + 1)

    def _inject_into_slot(node, depth=0):
        if not isinstance(node, dict) or depth > 40:
            return False
        if node.get("type") == "sc-slot" and component_slot_name(node) == "content":
            node["components"] = deepcopy(page_content)
            return True
        for child in node.get("components", []):
            if _inject_into_slot(child, depth + 1):
                return True
        return False

    for tpl_page in merged.get("pages", []):
        frames = tpl_page.get("frames", [])
        for frame in frames:
            root = frame.get("component")
            if root and isinstance(root, dict):
                _mark_template_owned(root)
                _inject_into_slot(root)
            existing_styles = frame.get("styles")
            if not isinstance(existing_styles, list):
                existing_styles = []
            frame["styles"] = [*existing_styles, *deepcopy(page_styles)]
        if not frames:
            root = tpl_page.get("component")
            if root and isinstance(root, dict):
                _mark_template_owned(root)
                _inject_into_slot(root)
            existing_styles = tpl_page.get("styles")
            if not isinstance(existing_styles, list):
                existing_styles = []
            tpl_page["styles"] = [*existing_styles, *deepcopy(page_styles)]

    return merged


@router.get("/pages/{page_id}/editor-data")
def get_page_editor_data(page_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.pages.manage")
    page = db.query(WebPage).filter_by(id=page_id).one_or_none()
    if not page:
        raise HTTPException(404, "Page not found")
    serialized = _serialize_page(page)
    merged = _merged_editor_project(page, db)
    if merged:
        serialized["project_data"] = merged
        serialized["data"] = merged
    return serialized


@router.put("/pages/{page_id}/draft")
def save_page_draft(page_id: int, payload: DraftPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.pages.manage")
    page = db.query(WebPage).filter_by(id=page_id, deleted_at=None).one_or_none()
    if not page:
        raise HTTPException(404, "Page not found")
    page = save_draft(
        db,
        page,
        expected_version=payload.expected_version,
        project=payload.project_data,
        user_id=current_user.id,
        metadata=payload.metadata,
    )
    return _serialize_page(page)


@router.post("/pages/{page_id}/preview")
def preview_page_draft(page_id: int, payload: PreviewPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.pages.manage")
    page = db.query(WebPage).filter_by(id=page_id, deleted_at=None).one_or_none()
    if not page:
        raise HTTPException(404, "Page not found")
    if payload.expected_version != (page.draft_version or 1):
        raise HTTPException(409, "Draft was changed by another editor")
    try:
        compiled = compile_draft(page, payload.project_data)
        from .linked_resources import validate_linked_resource_instances
        validate_linked_resource_instances(db, payload.project_data, published=False)
        document = _render_compiled_page(
            db, page, compiled, published=False, metadata=payload.metadata,
        )
    except (CompileError, ResourcePropsError) as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"html": document, "warnings": [], "draft_version": page.draft_version}


@router.post("/pages/regenerate-public")
def regenerate_public_pages(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    """One explicit, authorised rebuild for legacy published revisions."""
    _require_action(db, current_user, "web.publish")
    count = rebuild_published_page_artifacts(db)
    db.commit()
    return {"regenerated_pages": count}


@router.post("/pages/{page_id}/publish")
def publish_page_draft(page_id: int, payload: PublishPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.pages.manage")
    _require_action(db, current_user, "web.publish")
    page = db.query(WebPage).filter_by(id=page_id, deleted_at=None).one_or_none()
    if not page:
        raise HTTPException(404, "Page not found")
    revision = publish_page(db, page, expected_version=payload.expected_version, user_id=current_user.id)
    db.refresh(page)
    return {"page": _serialize_page(page), "published_revision_id": revision.id}


@router.post("/pages/{page_id}/unpublish")
def unpublish_page(page_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.pages.manage")
    _require_action(db, current_user, "web.publish")
    page = db.query(WebPage).filter_by(id=page_id, deleted_at=None).one_or_none()
    if not page:
        raise HTTPException(404, "Page not found")
    db.query(WebPage).filter_by(id=page_id).update({
        WebPage.published_revision_id: None,
        WebPage.published: False,
    }, synchronize_session=False)
    db.commit()
    db.refresh(page)
    return _serialize_page(page)


@router.delete("/pages/{page_id}", status_code=204)
def delete_page(page_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.pages.manage")
    page = db.query(WebPage).filter_by(id=page_id).one_or_none()
    if not page:
        raise HTTPException(404, "Page not found")
    if page.published_revision_id or page.published:
        _require_action(db, current_user, "web.publish")
    trash_page(db, page)


@router.post("/pages/{page_id}/restore", status_code=204)
def restore_page(page_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.pages.manage")
    page = db.query(WebPage).filter_by(id=page_id).one_or_none()
    if not page or page.deleted_at is None:
        raise HTTPException(404, "Trashed page not found")
    restore_trashed_page(db, page)


@router.delete("/pages/{page_id}/purge", status_code=204)
def purge_page(page_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.pages.manage")
    page = db.query(WebPage).filter_by(id=page_id).one_or_none()
    if not page:
        raise HTTPException(404, "Page not found")
    if page.published_revision_id or page.published:
        _require_action(db, current_user, "web.publish")
    db.query(WebPageRevision).filter_by(page_id=page_id).delete()
    db.delete(page)
    db.commit()


@router.post("/pages/{page_id}/duplicate", status_code=201)
def duplicate_page(page_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.pages.manage")
    page = db.query(WebPage).filter_by(id=page_id).one_or_none()
    if not page:
        raise HTTPException(404, "Page not found")
    slug = _slugify(f"{page.slug}-copy")
    base, counter = slug, 1
    while db.query(WebPage).filter_by(slug=slug).one_or_none():
        counter += 1
        slug = f"{base}-{counter}"
    clone_segment = _slugify(f"{page.path_segment or page.slug}-copy")
    parent = validate_parent(db, None, page.parent_id)
    unique_segment(db, clone_segment, page.parent_id)
    clone = WebPage(
        slug=slug,
        path_segment=clone_segment,
        path=build_path(parent, clone_segment),
        title=f"{page.title} (kopie)",
        template=page.template,
        template_id=page.template_id,
        data=page.data,
        html=page.html,
        published=False,
        draft_version=1,
        parent_id=page.parent_id,
        position=page.position,
        meta_description=page.meta_description,
        seo_title=page.seo_title,
        canonical_url=None,
        og_image_id=page.og_image_id,
        noindex=page.noindex,
        sitemap_include=page.sitemap_include,
        created_by_id=current_user.id,
    )
    db.add(clone)
    db.commit()
    db.refresh(clone)
    return _serialize_page(clone)


@router.get("/pages/{page_id}/revisions")
def list_page_revisions(page_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.pages.manage")
    page = db.query(WebPage).filter_by(id=page_id).one_or_none()
    if not page:
        raise HTTPException(404, "Page not found")
    revisions = (
        db.query(WebPageRevision)
        .filter_by(page_id=page_id)
        .order_by(WebPageRevision.created_at.desc())
        .limit(30)
        .all()
    )
    return [
        {
            "id": r.id,
            "page_id": r.page_id,
            "html": r.html,
            "data": r.data,
            "project_data": r.data,
            "revision_number": r.revision_number,
            "source_version": r.source_version,
            "reason": r.reason,
            "is_publication": r.is_publication,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "created_by": r.created_by.username if r.created_by else None,
        }
        for r in revisions
    ]


@router.post("/pages/{page_id}/restore/{revision_id}")
def restore_page_revision(page_id: int, revision_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.pages.manage")
    page = db.query(WebPage).filter_by(id=page_id).one_or_none()
    revision = db.query(WebPageRevision).filter_by(id=revision_id, page_id=page_id).one_or_none()
    if not page or not revision:
        raise HTTPException(404, "Page or revision not found")
    restore_page_revision_service(db, page, revision, user_id=current_user.id)
    return _serialize_page(page)



def _site_settings(db: Session) -> dict:
    return {
        "site_title": get_config_value(db, "web.site_title") or "Naše skautská střediska",
        "title_pattern": get_config_value(db, "web.title_pattern") or DEFAULT_TITLE_PATTERN,
        "favicon": get_config_value(db, "web.favicon"),
        "site_tagline": get_config_value(db, "web.site_tagline"),
        "site_meta": get_config_value(db, "web.site_meta"),
        "site_logo": get_config_value(db, "web.site_logo"),
        "contact_address": get_config_value(db, "web.contact_address"),
        "contact_phone": get_config_value(db, "web.contact_phone"),
        "contact_email": get_config_value(db, "web.contact_email"),
        "contact_meeting_time": get_config_value(db, "web.contact_meeting_time"),
        "social_facebook": get_config_value(db, "web.social_facebook"),
        "social_instagram": get_config_value(db, "web.social_instagram"),
        "social_whatsapp": get_config_value(db, "web.social_whatsapp"),
    }
