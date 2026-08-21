"""Page draft, revision and publishing services."""
from __future__ import annotations

from collections import Counter
from copy import deepcopy
from datetime import date, datetime, timezone
import json
import re
import uuid
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from unidecode import unidecode

from ..models import WebPage, WebPageRevision, WebTemplate
from ..timezones import application_timezone
from .linked_resources import validate_linked_resource_instances
from .renderer import (
    CompiledProject, CompileError, compile_project, component_slot_name,
    render_document,
)
from .resource_props import ResourcePropsError


def slugify(value: str) -> str:
    value = unidecode((value or "").strip().lower())
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value[:200] or "stranka"

ROOT_PAGE_SEGMENT = "main"


def normalise_path_segment(value: Any, fallback: str = "") -> str:
    """Accept the user-facing root path ``/`` while retaining one stable key."""
    raw = str(value if value is not None else fallback).strip()
    if raw == "/":
        return ROOT_PAGE_SEGMENT
    return slugify(raw or fallback)


def _next_revision(db: Session, page_id: int) -> int:
    value = db.query(func.max(WebPageRevision.revision_number)).filter_by(page_id=page_id).scalar()
    return int(value or 0) + 1


def _legacy_project(page: WebPage) -> dict[str, Any]:
    if isinstance(page.data, dict) and page.data.get("pages"):
        return deepcopy(page.data)
    # Existing pages used generated HTML as editor input. It remains available
    # for explicit conversion, but new saves always replace this project.
    text = re.sub(r"<[^>]+>", " ", page.html or "")
    text = re.sub(r"\s+", " ", text).strip()
    return {
        "scoutcomp": {"schemaVersion": 2, "legacyImported": True},
        "pages": [{"component": {"type": "wrapper", "tagName": "main", "components": [
            {"type": "text", "tagName": "p", "content": text}
        ]}, "styles": []}],
    }


def project_data(page: WebPage) -> dict[str, Any]:
    return deepcopy(page.data) if isinstance(page.data, dict) and page.data.get("pages") else _legacy_project(page)


def serialize_page(page: WebPage) -> dict[str, Any]:
    data = project_data(page)
    return {
        "id": page.id,
        "slug": (page.trashed_path_segment or page.trashed_slug) if page.deleted_at else (page.path_segment or page.slug),
        "path_segment": (page.trashed_path_segment or page.trashed_slug) if page.deleted_at else (page.path_segment or page.slug),
        "path": (page.trashed_path or page.path) if page.deleted_at else (page.path or ("/" if page.slug == "main" else f"/{page.slug}")),
        "title": page.title,
        "template": page.template,
        "template_id": page.template_id,
        "project_data": data,
        "data": data,
        "draft_css": "",
        "html": page.html,
        "published": bool(page.published_revision_id or page.published),
        "draft_version": page.draft_version or 1,
        "published_revision_id": page.published_revision_id,
        "parent_id": page.parent_id,
        "position": page.position,
        "meta_description": page.meta_description,
        "seo_title": page.seo_title,
        "canonical_url": page.canonical_url,
        "og_image_id": page.og_image_id,
        "noindex": page.noindex,
        "sitemap_include": page.sitemap_include,
        "deleted_at": page.deleted_at.isoformat() if page.deleted_at else None,
        "source_template_id": page.source_template_id,
        "source_template_version": page.source_template_version,
        "updated_at": page.updated_at.isoformat() if page.updated_at else None,
    }


def _descendant_ids(db: Session, page_id: int) -> set[int]:
    result: set[int] = set()
    frontier = [page_id]
    while frontier:
        children = [row[0] for row in db.query(WebPage.id).filter(WebPage.parent_id.in_(frontier)).all()]
        children = [item for item in children if item not in result]
        result.update(children)
        frontier = children
    return result


def validate_parent(db: Session, page: WebPage | None, parent_id: int | None) -> WebPage | None:
    if parent_id is None:
        return None
    parent = db.query(WebPage).filter_by(id=parent_id, deleted_at=None).one_or_none()
    if not parent:
        raise HTTPException(400, "Parent page does not exist")
    if page and (parent.id == page.id or parent.id in _descendant_ids(db, page.id)):
        raise HTTPException(400, "Page hierarchy cannot contain a cycle")
    return parent


def validate_template_usage(
    db: Session,
    template_id: int | None,
    expected_usage_mode: str,
    *,
    label: str = "Template",
) -> WebTemplate | None:
    """Resolve a template and enforce whether it is a layout or a starter."""
    if template_id is None:
        return None
    template = db.query(WebTemplate).filter_by(id=template_id).one_or_none()
    if template is None:
        raise HTTPException(404, f"{label} not found")
    if template.usage_mode != expected_usage_mode:
        expected_label = "linked layout" if expected_usage_mode == "linked_layout" else "page starter"
        raise HTTPException(422, f"{label} is not a {expected_label}")
    return template


def validate_detail_template(db: Session, template_id: int | None, *, label: str) -> WebTemplate | None:
    """Resolve a published layout suitable for an article/event detail."""
    if template_id is None:
        return None
    template = validate_template_usage(db, template_id, "linked_layout", label=label)
    if template is None or not template.published_project_data:
        raise HTTPException(422, f"{label} has not been published")
    compiled = compile_project(template.published_project_data)
    if not _content_slots(compiled.tree):
        raise HTTPException(422, f"{label} must contain a content slot")
    return template


def unique_segment(db: Session, segment: str, parent_id: int | None, page_id: int | None = None) -> None:
    query = db.query(WebPage).filter(
        WebPage.deleted_at.is_(None),
        WebPage.parent_id == parent_id,
        WebPage.path_segment == segment,
    )
    if page_id is not None:
        query = query.filter(WebPage.id != page_id)
    if query.first():
        raise HTTPException(409, "A sibling page already uses this path segment")


def build_path(parent: WebPage | None, segment: str) -> str:
    if parent is None:
        return "/" if segment == ROOT_PAGE_SEGMENT else f"/{segment}"
    prefix = (parent.path or f"/{parent.path_segment or parent.slug}").rstrip("/")
    return f"{prefix}/{segment}"


def unique_legacy_slug(db: Session, desired: str, page_id: int | None = None) -> str:
    candidate, counter = desired, 1
    while True:
        query = db.query(WebPage).filter(WebPage.deleted_at.is_(None), WebPage.slug == candidate)
        if page_id is not None:
            query = query.filter(WebPage.id != page_id)
        if not query.first():
            return candidate
        counter += 1
        candidate = f"{desired[:190]}-{counter}"



def snapshot_draft(db: Session, page: WebPage, user_id: int | None, reason: str) -> WebPageRevision:
    revision = WebPageRevision(
        page_id=page.id,
        revision_number=_next_revision(db, page.id),
        source_version=page.draft_version or 1,
        title=page.title,
        path_segment=page.path_segment or page.slug,
        path=page.path or ("/" if page.slug == "main" else f"/{page.slug}"),
        template_key=page.template,
        template_id=page.template_id,
        data=deepcopy(page.data),
        html=page.html,
        reason=reason,
        is_publication=False,
        seo_title=page.seo_title,
        meta_description=page.meta_description,
        canonical_url=page.canonical_url,
        og_image_id=page.og_image_id,
        noindex=page.noindex,
        sitemap_include=page.sitemap_include,
        created_by_id=user_id,
    )
    db.add(revision)
    return revision


def _find_content_slot(node: dict[str, Any], depth: int = 0) -> dict[str, Any] | None:
    """Locate the first ``sc-slot`` named "content" in a project tree."""
    if not isinstance(node, dict) or depth > 40:
        return None
    if node.get("type") == "sc-slot" and component_slot_name(node) == "content":
        return node
    for child in node.get("components", []):
        found = _find_content_slot(child, depth + 1)
        if found is not None:
            return found
    return None


def _content_slots(node: dict[str, Any], depth: int = 0) -> list[dict[str, Any]]:
    if not isinstance(node, dict) or depth > 40:
        return []
    found = [node] if node.get("type") == "sc-slot" and component_slot_name(node) == "content" else []
    for child in node.get("components", []):
        found.extend(_content_slots(child, depth + 1))
    return found


def _project_root_component(project: dict[str, Any]) -> dict[str, Any] | None:
    pages = project.get("pages")
    if isinstance(pages, list) and pages:
        page = pages[0] if isinstance(pages[0], dict) else {}
        frames = page.get("frames")
        if isinstance(frames, list) and frames and isinstance(frames[0], dict):
            return frames[0].get("component")
        return page.get("component")
    return project.get("component")


def _project_styles(project: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(project, dict):
        return []
    pages = project.get("pages")
    if isinstance(pages, list) and pages and isinstance(pages[0], dict):
        frames = pages[0].get("frames")
        if isinstance(frames, list) and frames and isinstance(frames[0], dict):
            styles = frames[0].get("styles")
            if isinstance(styles, list):
                return deepcopy(styles)
        styles = pages[0].get("styles")
        if isinstance(styles, list):
            return deepcopy(styles)
    styles = project.get("styles")
    return deepcopy(styles) if isinstance(styles, list) else []


def _project_assets(project: dict[str, Any] | None) -> list[Any]:
    assets = project.get("assets") if isinstance(project, dict) else None
    return deepcopy(assets) if isinstance(assets, list) else []


def _without_template_items(items: list[Any], template_items: list[Any]) -> list[Any]:
    template_counts = Counter(
        json.dumps(rule, sort_keys=True, default=str, separators=(",", ":"))
        for rule in template_items
    )
    result = []
    for rule in items:
        marker = json.dumps(rule, sort_keys=True, default=str, separators=(",", ":"))
        if template_counts[marker] > 0:
            template_counts[marker] -= 1
        else:
            result.append(deepcopy(rule))
    return result


def _extract_page_content(project: dict[str, Any], template: dict[str, Any] | None) -> dict[str, Any]:
    """Strip the template shell from a merged editor project.

    The GrapesJS editor loads template + page content merged together (the
    template provides nav/hero/footer and an ``sc-slot`` named "content").
    Only the slot's children belong to the page itself; they must be stored
    back as the page's canonical project so the next merge does not nest the
    template twice.

    When no template is present the project is stored as-is.
    """
    if not isinstance(project, dict):
        return project
    if not isinstance(template, dict):
        return deepcopy(project)

    root = _project_root_component(project)
    if not isinstance(root, dict):
        return deepcopy(project)
    slots = _content_slots(root)
    if len(slots) != 1:
        raise HTTPException(422, "Linked layout must contain exactly one content slot")
    slot = slots[0]

    content = slot.get("components", [])
    page_styles = _without_template_items(_project_styles(project), _project_styles(template))
    page_assets = _without_template_items(_project_assets(project), _project_assets(template))
    return {
        "assets": page_assets,
        "scoutcomp": {"schemaVersion": 2},
        "pages": [{
            "frames": [{
                "component": {
                    "type": "wrapper",
                    "components": deepcopy(content),
                },
                "styles": page_styles,
            }],
        }],
    }


def save_draft(
    db: Session,
    page: WebPage,
    *,
    expected_version: int,
    project: dict[str, Any],
    user_id: int,
    metadata: dict[str, Any] | None = None,
) -> WebPage:
    if expected_version != (page.draft_version or 1):
        raise HTTPException(409, "Draft was changed by another editor")
    metadata = metadata or {}
    selected_template = validate_template_usage(
        db,
        metadata.get("template_id", page.template_id),
        "linked_layout",
    )
    # The submitted editor snapshot is composed with the template that was
    # active when the editor loaded, not necessarily the newly selected one.
    # Split against that current shell first; the next editor-data request will
    # compose the stored page content with ``selected_template``.
    editor_template = None
    if "editor_template_id" in metadata:
        editor_template = validate_template_usage(
            db,
            metadata.get("editor_template_id"),
            "linked_layout",
            label="Editor template",
        )
    elif page.template_id:
        editor_template = db.query(WebTemplate).filter_by(id=page.template_id).one_or_none()
    elif page.template:
        editor_template = db.query(WebTemplate).filter_by(key=page.template).one_or_none()
    # Validate the whole project at the trust boundary even though dynamic data
    # is intentionally not resolved until preview/public rendering.
    compile_project(project)
    try:
        validate_linked_resource_instances(db, project, published=False)
    except ResourcePropsError as exc:
        raise HTTPException(422, str(exc)) from exc
    snapshot_draft(db, page, user_id, "autosave")
    db.flush()
    # The conditional write is the concurrency boundary. A Python comparison
    # alone is insufficient when two sessions loaded the same draft version.
    updated = (
        db.query(WebPage)
        .filter(WebPage.id == page.id, WebPage.draft_version == expected_version)
        .update({WebPage.draft_version: expected_version + 1}, synchronize_session=False)
    )
    if updated != 1:
        db.rollback()
        raise HTTPException(409, "Draft was changed by another editor")
    db.refresh(page)

    title = str(metadata.get("title", page.title)).strip()
    if not title:
        raise HTTPException(422, "Page title is required")
    segment = normalise_path_segment(
        metadata.get("path_segment") if metadata.get("path_segment") is not None else metadata.get("slug"),
        page.path_segment or page.slug,
    )
    parent_id = metadata.get("parent_id", page.parent_id)
    if segment == ROOT_PAGE_SEGMENT and parent_id is not None:
        raise HTTPException(422, "Homepage cannot have a parent page")
    parent = validate_parent(db, page, parent_id)
    unique_segment(db, segment, parent_id, page.id)
    path = build_path(parent, segment)
    if db.query(WebPage).filter(WebPage.path == path, WebPage.id != page.id).first():
        raise HTTPException(409, "Page path is already used")

    page.title = title
    page.path_segment = segment
    page.path = path
    page.slug = unique_legacy_slug(db, segment, page.id)
    page.parent_id = parent_id
    page.position = int(metadata.get("position", page.position or 0))
    page.template = metadata.get("template", page.template)
    if "template_id" in metadata:
        page.template_id = metadata.get("template_id")
        page.template = selected_template.key if selected_template is not None else None

    # The editor sends the merged template+page project. Persist only the
    # page-owned content (slot children); otherwise the next editor load would
    # nest the template shell inside itself. When the page has no template the
    # project is stored verbatim.
    template_project = editor_template.project_data if editor_template is not None else None
    if metadata.get("replace_content_with_template") and selected_template is not None:
        # A confirmed layout switch intentionally adopts the new layout's
        # authored slot content. The layout shell itself remains linked; only
        # this page-owned initial content is copied into the page draft.
        page.data = _extract_page_content(
            selected_template.project_data or selected_template.published_project_data or _legacy_project(page),
            selected_template.project_data or selected_template.published_project_data or _legacy_project(page),
        )
    else:
        page.data = _extract_page_content(project, template_project)
    page.html = None
    page.meta_description = metadata.get("meta_description", page.meta_description)
    page.seo_title = metadata.get("seo_title", page.seo_title)
    page.canonical_url = metadata.get("canonical_url", page.canonical_url)
    page.og_image_id = metadata.get("og_image_id", page.og_image_id)
    page.noindex = bool(metadata.get("noindex", page.noindex))
    page.sitemap_include = bool(metadata.get("sitemap_include", page.sitemap_include))
    page.updated_by_id = user_id
    _recompute_descendant_paths(db, page)
    db.commit()
    db.refresh(page)
    return page


def compile_draft(page: WebPage, override: dict[str, Any] | None = None) -> CompiledProject:
    return compile_project(deepcopy(override) if override is not None else project_data(page))


def _adopt_pristine_template_fork_baseline(db: Session, template: WebTemplate) -> None:
    """Backfill the published baseline for clones created by older code.

    A pristine site-owned fork is semantically identical to its published
    origin until edited. Older clone routes stored only the draft, which made
    every page using such a fork unpublishable. Adoption happens only as part
    of an explicit page publish and never promotes edited draft content.
    """
    if (
        template.published_project_data
        or int(template.published_version or 0) > 0
        or not template.forked_from_id
        or int(template.draft_version or 1) != 1
    ):
        return
    origin = db.query(WebTemplate).filter_by(id=template.forked_from_id).one_or_none()
    if origin is None or not origin.published_project_data or int(origin.published_version or 0) < 1:
        return
    template.published_project_data = deepcopy(origin.published_project_data)
    template.published_css = origin.published_css or ""
    template.published_version = int(origin.published_version or 1)


def publish_page(db: Session, page: WebPage, *, expected_version: int, user_id: int) -> WebPageRevision:
    if expected_version != (page.draft_version or 1):
        raise HTTPException(409, "Draft was changed by another editor")
    if page.deleted_at is not None:
        raise HTTPException(409, "A trashed page cannot be published")
    try:
        compiled = compile_draft(page)
        validate_linked_resource_instances(db, page.data, published=True)
        template = None
        if page.template_id:
            template = db.query(WebTemplate).filter_by(id=page.template_id).one_or_none()
            if template is None:
                raise CompileError("Selected template does not exist")
        elif page.template:
            template = db.query(WebTemplate).filter_by(key=page.template).one_or_none()
        if template is not None:
            _adopt_pristine_template_fork_baseline(db, template)
            if not template.published_project_data:
                raise CompileError("Selected template has not been published")
            compile_project(template.published_project_data)
            validate_linked_resource_instances(db, template.published_project_data, published=True)
            render_document("", title="validation", css=template.published_css or "")
    except (CompileError, ResourcePropsError) as exc:
        raise HTTPException(422, str(exc)) from exc
    revision = WebPageRevision(
        page_id=page.id,
        revision_number=_next_revision(db, page.id),
        source_version=page.draft_version or 1,
        title=page.title,
        path_segment=page.path_segment or page.slug,
        path=page.path or ("/" if page.slug == "main" else f"/{page.slug}"),
        template_key=page.template,
        template_id=page.template_id,
        data=deepcopy(page.data),
        compiled_tree=compiled.tree,
        compiled_css=compiled.css,
        reason="publish",
        is_publication=True,
        seo_title=page.seo_title,
        meta_description=page.meta_description,
        canonical_url=page.canonical_url,
        og_image_id=page.og_image_id,
        noindex=page.noindex,
        sitemap_include=page.sitemap_include,
        created_by_id=user_id,
    )
    db.add(revision)
    db.flush()
    updated = (
        db.query(WebPage)
        .filter(WebPage.id == page.id, WebPage.draft_version == expected_version)
        .update(
            {WebPage.published_revision_id: revision.id, WebPage.published: True},
            synchronize_session=False,
        )
    )
    if updated != 1:
        db.rollback()
        raise HTTPException(409, "Draft was changed by another editor")

    # Compile all public documents before committing the publication pointer.
    # The public server therefore has a single immutable output to read and
    # cannot accidentally render mutable data during a visitor request.
    _build_publication_artifacts(db, page, revision)
    db.commit()
    db.refresh(revision)
    return revision


def _build_publication_artifacts(db: Session, page: WebPage, revision: WebPageRevision) -> None:
    """Materialise page 1 and bounded pagination variants in the same tx.

    The linked pagination component uses only ``?page=N`` and shows a next
    link while another variant exists. Rendering until that link disappears
    gives visitors static output for every reachable page without a request
    time renderer. The upper bound protects publication from malformed data.
    """
    from ..site_app import _render_revision

    default = _render_revision(db, page, revision, query={}, use_artifact=False)
    variants: dict[str, str] = {}
    current = 2
    previous = default
    pagination_next_marker = 'class="sc-pagination-link sc-pagination-next"'
    while pagination_next_marker in previous and current <= 100:
        document = _render_revision(db, page, revision, query={"page": str(current)}, use_artifact=False)
        variants[f"page={current}"] = document
        previous = document
        current += 1
    if pagination_next_marker in previous:
        raise HTTPException(422, "Pagination exceeds the publication limit of 100 pages")
    # A calendar has a finite set of immutable month variants.  Generate them
    # only when the actually rendered document contains the server component,
    # including when it comes from a linked layout/resource.  This preserves
    # the cheap publication path for every page without a calendar.
    if '<section class="sc-calendar"' in default:
        current_month = datetime.now(application_timezone()).date().replace(day=1)
        for offset in range(-12, 19):
            absolute = current_month.year * 12 + current_month.month - 1 + offset
            month = date(absolute // 12, absolute % 12 + 1, 1).strftime("%Y-%m")
            variants[f"month={month}"] = _render_revision(
                db, page, revision, query={"month": month}, use_artifact=False,
            )
    revision.rendered_html = default
    revision.rendered_variants = variants
    revision.rendered_at = datetime.now(timezone.utc)


def rebuild_published_page_artifacts(db: Session, *, page_ids: set[int] | None = None) -> int:
    """Regenerate immutable output before a related publication is committed.

    Rebuilds happen in the caller's transaction: either all rendered documents
    become visible together, or none do. ``page_ids`` enables future dependency
    narrowing while the conservative default protects existing dynamic blocks.
    """
    query = db.query(WebPage).filter(
        WebPage.published.is_(True),
        WebPage.published_revision_id.is_not(None),
        WebPage.deleted_at.is_(None),
    )
    if page_ids is not None:
        if not page_ids:
            return 0
        query = query.filter(WebPage.id.in_(page_ids))
    pages = query.order_by(WebPage.id.asc()).all()
    count = 0
    for published_page in pages:
        revision = db.query(WebPageRevision).filter_by(
            id=published_page.published_revision_id, page_id=published_page.id,
            is_publication=True,
        ).one_or_none()
        if revision is None:
            continue
        _build_publication_artifacts(db, published_page, revision)
        count += 1
    return count


def restore_revision(db: Session, page: WebPage, revision: WebPageRevision, *, user_id: int) -> WebPage:
    snapshot_draft(db, page, user_id, "before_restore")
    page.title = revision.title or page.title
    page.path_segment = revision.path_segment or page.path_segment
    page.path = revision.path or page.path
    page.template = revision.template_key or page.template
    page.template_id = revision.template_id
    page.data = deepcopy(revision.data)
    page.html = revision.html
    page.seo_title = revision.seo_title
    page.meta_description = revision.meta_description
    page.canonical_url = revision.canonical_url
    page.og_image_id = revision.og_image_id
    page.noindex = revision.noindex
    page.sitemap_include = revision.sitemap_include
    page.updated_by_id = user_id
    page.draft_version = (page.draft_version or 1) + 1
    db.commit()
    db.refresh(page)
    return page


def trash_page(db: Session, page: WebPage) -> None:
    """Move a page to trash while releasing its URL and slug immediately."""
    if page.deleted_at is not None:
        return
    page.trashed_slug = page.slug
    page.trashed_path_segment = page.path_segment or page.slug
    page.trashed_path = page.path or build_path(None, page.trashed_path_segment)
    tombstone = f"trashed-{page.id}-{uuid.uuid4().hex[:8]}"
    page.slug = tombstone
    page.path_segment = tombstone
    page.path = f"/__trash/{page.id}/{tombstone}"
    page.deleted_at = datetime.now(timezone.utc)
    page.published = False
    db.commit()


def restore_trashed_page(db: Session, page: WebPage) -> None:
    """Restore a page only when its original address is still available."""
    if page.deleted_at is None:
        raise HTTPException(404, "Trashed page not found")
    slug = page.trashed_slug or page.slug
    segment = page.trashed_path_segment or slug
    path = page.trashed_path or build_path(None, segment)
    parent_id = page.parent_id
    if parent_id is not None and not validate_parent(db, page, parent_id):
        parent_id = None
        path = build_path(None, segment)
    if db.query(WebPage).filter(WebPage.deleted_at.is_(None), WebPage.slug == slug).first():
        raise HTTPException(409, "Cannot restore page because its original slug is now used")
    if db.query(WebPage).filter(WebPage.deleted_at.is_(None), WebPage.path == path).first():
        raise HTTPException(409, "Cannot restore page because its original path is now used")
    unique_segment(db, segment, parent_id, page.id)
    page.slug = slug
    page.path_segment = segment
    page.path = path
    page.parent_id = parent_id
    page.deleted_at = None
    page.trashed_slug = None
    page.trashed_path_segment = None
    page.trashed_path = None
    db.commit()


def _recompute_descendant_paths(db: Session, parent: WebPage) -> None:
    """Keep the editable hierarchy coherent after a parent path change.

    Published revisions deliberately retain their immutable historical paths.
    """
    children = db.query(WebPage).filter_by(parent_id=parent.id).all()
    for child in children:
        segment = child.path_segment or child.slug
        child.path = build_path(parent, segment)
        _recompute_descendant_paths(db, child)
