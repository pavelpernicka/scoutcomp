"""Resolution and validation for linked Component and Section instances."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from ..models import WebReusableComponent, WebSection
from .resource_props import (
    ResourcePropsError,
    normalise_default_props,
    normalise_prop_schema,
    normalise_prop_values,
    normalise_variants,
)


RESOURCE_MODELS = {
    "component": WebReusableComponent,
    "section": WebSection,
}


@dataclass(frozen=True)
class LinkedResourceSnapshot:
    kind: str
    key: str
    name: str
    project_data: dict[str, Any]
    css: str
    prop_schema: list[dict[str, Any]]
    default_props: dict[str, Any]
    variants: list[dict[str, Any]]
    published_version: int
    theme_version_id: int | None


def _resource_key(value: Any) -> str:
    if not isinstance(value, (str, int)) or not str(value) or len(str(value)) > 240:
        raise ResourcePropsError("Linked resource reference is invalid")
    return str(value)


def get_linked_resource(db: Session, kind: Any, resource_id: Any):
    kind = str(kind or "").casefold()
    model = RESOURCE_MODELS.get(kind)
    if model is None:
        raise ResourcePropsError("Linked resource kind is invalid")
    key = _resource_key(resource_id)
    query = db.query(model)
    item = query.filter_by(id=int(key)).one_or_none() if key.isdigit() else query.filter_by(qualified_key=key).one_or_none()
    if item is None:
        raise ResourcePropsError("Linked resource was not found")
    return kind, key, item


def resource_snapshot(db: Session, kind: Any, resource_id: Any, *, published: bool) -> LinkedResourceSnapshot:
    kind, key, item = get_linked_resource(db, kind, resource_id)
    project_data = item.published_project_data if published else item.project_data
    css = item.published_css if published else item.css
    schema = item.published_prop_schema if published else item.prop_schema
    defaults = item.published_default_props if published else item.default_props
    variants = item.published_variants if published else item.variants
    published_version = int(item.published_version or 0)
    if (
        published
        and (published_version < 1 or not project_data)
        and item.origin_resource_id
        and int(item.draft_version or 1) == 1
    ):
        # Compatibility for pristine forks created before clone endpoints
        # preserved the origin's published baseline.
        origin = db.query(type(item)).filter_by(id=item.origin_resource_id).one_or_none()
        if origin is not None and origin.published_project_data and int(origin.published_version or 0) > 0:
            project_data = origin.published_project_data
            css = origin.published_css
            schema = origin.published_prop_schema
            defaults = origin.published_default_props
            variants = origin.published_variants
            published_version = int(origin.published_version or 1)
    if published and (published_version < 1 or not project_data):
        raise ResourcePropsError(f"Linked {kind} has not been published")
    schema = normalise_prop_schema(schema or [])
    defaults = normalise_default_props(schema, defaults or {})
    variants = normalise_variants(schema, defaults, variants or [])
    return LinkedResourceSnapshot(
        kind=kind,
        key=key,
        name=item.name,
        project_data=project_data or {},
        css=css or "",
        prop_schema=schema,
        default_props=defaults,
        variants=variants,
        published_version=published_version,
        theme_version_id=item.theme_version_id,
    )


def instance_props(
    snapshot: LinkedResourceSnapshot,
    value: Any,
    *,
    variant: Any = None,
) -> dict[str, Any]:
    """Merge default props, an optional variant, and instance overrides.

    Order matters: ``default_props`` -> ``variant.props`` -> ``value``.
    ``normalise_variants`` already validates each variant's props, but the
    explicit merge here keeps the precedence unambiguous and independent of
    future changes to variant normalisation.
    """
    defaults = snapshot.default_props
    if variant not in (None, "", "__none"):
        if not isinstance(variant, str):
            raise ResourcePropsError("Linked resource variant is invalid")
        selected = next(
            (item for item in snapshot.variants if item["id"] == variant),
            None,
        )
        if selected is None:
            raise ResourcePropsError("Linked resource variant was not found")
        defaults = {**snapshot.default_props, **selected["props"]}
    return normalise_prop_values(snapshot.prop_schema, defaults, value or {})


@dataclass(frozen=True)
class MaterializedResourceFragment:
    html: str
    css: str


def resource_has_runtime_bindings(
    db: Session,
    snapshot: LinkedResourceSnapshot,
    *,
    stack: tuple[tuple[str, str], ...] = (),
) -> bool:
    """Inspect a definition and every nested linked definition before detach.

    A linked node has no local children in the compiled tree, so the renderer's
    structural guard alone cannot see runtime bindings owned by its definition.
    Detach must reject the entire transitive graph rather than materializing a
    request-time value as permanent HTML.
    """
    from .renderer import compile_project, has_runtime_bindings

    marker = (snapshot.kind, snapshot.key)
    if marker in stack or len(stack) >= 12:
        raise ResourcePropsError("Linked resource cycle is not allowed")
    compiled = compile_project(snapshot.project_data)
    if has_runtime_bindings(compiled.tree):
        return True

    nodes = [compiled.tree]
    while nodes:
        node = nodes.pop()
        if not isinstance(node, dict):
            continue
        if str(node.get("type", "")).casefold() == "sc-resource-instance":
            nested = resource_snapshot(
                db,
                node.get("resourceKind", node.get("resource_kind", "component")),
                node.get("resourceId", node.get("resource_id")),
                published=False,
            )
            if resource_has_runtime_bindings(db, nested, stack=(*stack, marker)):
                return True
        nodes.extend(node.get("components", []))
    return False


def render_resource_fragment(
    db: Session,
    snapshot: LinkedResourceSnapshot,
    props: Any,
    *,
    variant: Any = None,
) -> MaterializedResourceFragment:
    """Render a reusable resource as a detached HTML+CSS fragment.

    Props are merged in the canonical order (default -> variant -> instance),
    then applied to ``props``-scope bindings. Runtime bindings outside the
    ``props`` scope cannot be represented by static HTML and must be rejected
    before this helper is called (see endpoint guard).
    """
    from .renderer import (
        CompileError,
        compile_project,
        render_compiled_fragment,
        validate_render_css,
    )
    from .theme_package import rewrite_theme_asset_urls

    merged_props = instance_props(snapshot, props, variant=variant)
    compiled = compile_project(snapshot.project_data)

    own_css = f"{snapshot.css or ''}\n{compiled.css}".strip()
    if snapshot.theme_version_id:
        # Detached CSS becomes part of the published page, so persist the
        # public theme asset path rather than the API-only preview path.
        own_css = rewrite_theme_asset_urls(own_css, snapshot.theme_version_id, api=False)

    css_layers = [own_css] if own_css else []
    html = render_compiled_fragment(
        db,
        compiled.tree,
        initial_props=merged_props,
        css_layers=css_layers,
        published_resources=False,
    )
    css = "\n".join(layer for layer in css_layers if layer)
    validate_render_css(css)
    return MaterializedResourceFragment(html=html, css=css)


def validate_linked_resource_instances(
    db: Session,
    value: Any,
    *,
    published: bool,
    stack: tuple[tuple[str, str], ...] = (),
) -> None:
    if isinstance(value, list):
        for item in value:
            validate_linked_resource_instances(db, item, published=published, stack=stack)
        return
    if not isinstance(value, dict):
        return
    if str(value.get("type", "")).casefold() == "sc-resource-instance":
        snapshot = resource_snapshot(
            db,
            value.get("resourceKind", value.get("resource_kind", "component")),
            value.get("resourceId", value.get("resource_id")),
            published=published,
        )
        marker = (snapshot.kind, snapshot.key)
        if marker in stack or len(stack) >= 12:
            raise ResourcePropsError("Linked resource cycle is not allowed")
        instance_props(
            snapshot,
            value.get("props") or {},
            variant=value.get("variant"),
        )
        children = value.get("components")
        if children not in (None, [], ""):
            raise ResourcePropsError("Linked resource instances cannot own local children")
        validate_linked_resource_instances(
            db,
            snapshot.project_data,
            published=published,
            stack=(*stack, marker),
        )
        return
    for child in value.values():
        validate_linked_resource_instances(db, child, published=published, stack=stack)
