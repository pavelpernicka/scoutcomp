"""Page draft, revision and publishing services."""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from unidecode import unidecode
import re

from ..models import WebPage, WebPageRevision, WebTemplate
from .linked_resources import validate_linked_resource_instances
from .renderer import CompiledProject, CompileError, compile_project, render_document
from .resource_props import ResourcePropsError


def slugify(value: str) -> str:
    value = unidecode((value or "").strip().lower())
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value[:200] or "stranka"


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
        "slug": page.path_segment or page.slug,
        "path_segment": page.path_segment or page.slug,
        "path": page.path or ("/" if page.slug == "main" else f"/{page.slug}"),
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
        "page_template_id": page.page_template_id,
        "page_template_version": page.page_template_version,
        "source_template_id": page.source_template_id,
        "source_template_version": page.source_template_version,
        "team_id": page.team_id,
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


def unique_segment(db: Session, segment: str, parent_id: int | None, page_id: int | None = None) -> None:
    query = db.query(WebPage).filter(
        WebPage.parent_id == parent_id,
        WebPage.path_segment == segment,
    )
    if page_id is not None:
        query = query.filter(WebPage.id != page_id)
    if query.first():
        raise HTTPException(409, "A sibling page already uses this path segment")


def build_path(parent: WebPage | None, segment: str) -> str:
    if parent is None:
        return "/" if segment == "main" else f"/{segment}"
    prefix = (parent.path or f"/{parent.path_segment or parent.slug}").rstrip("/")
    return f"{prefix}/{segment}"


def unique_legacy_slug(db: Session, desired: str, page_id: int | None = None) -> str:
    candidate, counter = desired, 1
    while True:
        query = db.query(WebPage).filter(WebPage.slug == candidate)
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
    if node.get("type") == "sc-slot" and node.get("name") == "content":
        return node
    for child in node.get("components", []):
        found = _find_content_slot(child, depth + 1)
        if found is not None:
            return found
    return None


def _project_root_component(project: dict[str, Any]) -> dict[str, Any] | None:
    pages = project.get("pages")
    if isinstance(pages, list) and pages:
        page = pages[0] if isinstance(pages[0], dict) else {}
        frames = page.get("frames")
        if isinstance(frames, list) and frames and isinstance(frames[0], dict):
            return frames[0].get("component")
        return page.get("component")
    return project.get("component")


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
    slot = _find_content_slot(root)
    if slot is None:
        return deepcopy(project)

    content = slot.get("components", [])
    return {
        "scoutcomp": {"schemaVersion": 2},
        "pages": [{
            "frames": [{
                "component": {
                    "type": "wrapper",
                    "components": deepcopy(content),
                },
                "styles": [],
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
    segment = slugify(str(metadata.get("path_segment") or metadata.get("slug") or page.path_segment or page.slug))
    parent_id = metadata.get("parent_id", page.parent_id)
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

    # The editor sends the merged template+page project. Persist only the
    # page-owned content (slot children); otherwise the next editor load would
    # nest the template shell inside itself. When the page has no template the
    # project is stored verbatim.
    template_project = None
    if page.template_id:
        template_row = db.query(WebTemplate).filter_by(id=page.template_id).one_or_none()
        template_project = template_row.project_data if template_row else None
    elif page.template:
        template_row = db.query(WebTemplate).filter_by(key=page.template).one_or_none()
        template_project = template_row.project_data if template_row else None
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
    db.commit()
    db.refresh(revision)
    return revision


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
    page.deleted_at = datetime.now(timezone.utc)
    page.published = False
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
