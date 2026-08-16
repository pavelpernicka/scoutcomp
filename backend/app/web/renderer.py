"""Safe, browser-independent compiler and renderer for GrapesJS project data.

The persisted project JSON is the editor source of truth.  Publishing validates
and normalises it into a JSON tree; visitor requests traverse that tree and
resolve explicitly registered public data sources.  No user supplied code or
template expression is evaluated.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from html import escape
import json
import re
from typing import Any, Callable
from urllib.parse import urlparse

from sqlalchemy.orm import Session


MAX_DEPTH = 40
MAX_NODES = 5_000
MAX_REPEAT = 100
MAX_TEXT = 200_000

SAFE_TAGS = {
    "a", "abbr", "address", "article", "aside", "b", "blockquote", "br",
    "button", "caption", "cite", "code", "col", "colgroup", "dd", "details",
    "dfn", "div", "dl", "dt", "em", "figcaption", "figure", "footer", "h1",
    "h2", "h3", "h4", "h5", "h6", "header", "hr", "i", "img", "li", "main",
    "mark", "nav", "ol", "p", "picture", "pre", "q", "s", "section", "small",
    "source", "span", "strong", "sub", "summary", "sup", "table", "tbody", "td",
    "tfoot", "th", "thead", "time", "tr", "u", "ul",
}
VOID_TAGS = {"br", "col", "hr", "img", "source"}
SAFE_ATTRS = {
    "alt", "aria-label", "aria-current", "aria-describedby", "aria-hidden",
    "class", "colspan", "datetime", "height", "id", "loading", "rel", "role",
    "rowspan", "src", "srcset", "target", "title", "width",
}
URL_ATTRS = {"href", "src"}
SAFE_CSS_PROPERTIES = {
    "align-content", "align-items", "align-self", "background", "background-color",
    "border", "border-bottom", "border-color", "border-left", "border-radius",
    "border-right", "border-style", "border-top", "border-width", "box-shadow",
    "color", "column-gap", "display", "flex", "flex-basis", "flex-direction",
    "flex-grow", "flex-shrink", "flex-wrap", "font-family", "font-size",
    "font-style", "font-weight", "gap", "grid-template-columns", "height",
    "justify-content", "letter-spacing", "line-height", "list-style", "margin",
    "margin-bottom", "margin-left", "margin-right", "margin-top", "max-height",
    "max-width", "min-height", "min-width", "object-fit", "opacity", "overflow",
    "padding", "padding-bottom", "padding-left", "padding-right", "padding-top",
    "position", "text-align", "text-decoration", "text-transform", "transform",
    "vertical-align", "white-space", "width", "word-break", "z-index",
}
CONDITION_OPERATORS = {"eq", "neq", "in", "not_in", "exists", "empty", "gt", "gte", "lt", "lte"}
BIND_TARGETS = {
    "text", "richText", "href", "src", "alt", "datetime", "title",
    "style.color", "style.background-color", "style.opacity",
}
UNSAFE_CSS = re.compile(
    r"(?:expression\s*\(|javascript\s*:|@import|(?<![-a-z])behavior\s*:(?!\s*:)|</?style\b)",
    re.I,
)
# Separate pattern for value-level breakout. Valid CSS may legitimately
# contain `<` inside quoted strings (rare) but never an unquoted closing tag.
CSS_TAG_BREAKOUT = re.compile(r"</?(?:script|iframe|object|embed|link|meta|base|style)\b", re.I)
CSS_VALUE_BREAKOUT = re.compile(r"[{};<>]")
CLASS_TOKEN = re.compile(r"^[A-Za-z_][A-Za-z0-9_-]{0,79}$")
ID_TOKEN = re.compile(r"^[A-Za-z][A-Za-z0-9_:.-]{0,99}$")
SAFE_COLOR = re.compile(
    r"^(?:#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([0-9.,%+\-\s]+\)|var\(--sc-[a-z0-9-]+\))$",
    re.I,
)
SAFE_LENGTH = re.compile(r"^(?:0|-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%|vw|vh|ch|vmin|vmax))$", re.I)
SAFE_FONT = re.compile(r"^[A-Za-z0-9 '\",._-]{1,160}$")


class CompileError(ValueError):
    """The project cannot be published under the public rendering policy."""


def _safe_bound_style(property_name: str, value: Any) -> str:
    text = str(value or "").strip()
    if property_name in {"color", "background-color"}:
        return text if SAFE_COLOR.fullmatch(text) else ""
    if property_name == "opacity":
        try:
            number = float(text)
        except (TypeError, ValueError):
            return ""
        return f"{number:g}" if 0 <= number <= 1 else ""
    return ""


@dataclass(frozen=True)
class CompiledProject:
    tree: dict[str, Any]
    css: str


def _project_root(project: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(project, dict):
        raise CompileError("Project data must be an object")
    pages = project.get("pages")
    if isinstance(pages, list) and pages:
        page = pages[0] if isinstance(pages[0], dict) else {}
        frames = page.get("frames")
        if isinstance(frames, list) and frames and isinstance(frames[0], dict):
            root = frames[0].get("component")
        else:
            root = page.get("component")
    else:
        root = project.get("component") or project
    if not isinstance(root, dict):
        raise CompileError("Project has no component root")
    return root


def _safe_url(value: Any, *, image: bool = False) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if any(ord(char) < 32 for char in text):
        return ""
    parsed = urlparse(text)
    if parsed.scheme:
        allowed = {"http", "https"} if image else {"http", "https", "mailto", "tel"}
        if parsed.scheme.lower() not in allowed:
            return ""
    elif text.startswith("//"):
        return ""
    return text


def _classes(value: Any) -> str:
    values = value if isinstance(value, list) else str(value or "").split()
    result: list[str] = []
    for item in values:
        token = item.get("name") if isinstance(item, dict) else str(item)
        if CLASS_TOKEN.fullmatch(token or ""):
            result.append(token)
    return " ".join(dict.fromkeys(result))


def _normalise_binding(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise CompileError("Binding must be an object")
    field = value.get("field")
    if not isinstance(field, str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_.]{0,119}", field):
        raise CompileError("Binding field is invalid")
    scope = value.get("scope", "context")
    if scope not in {"context", "props", "source", "page", "site"}:
        raise CompileError("Binding scope is invalid")
    result = {"scope": scope, "field": field}
    if scope == "source":
        source = value.get("source")
        if not isinstance(source, str) or not re.fullmatch(r"[a-z][a-z0-9_-]*\.[a-z][a-z0-9_.-]*", source):
            raise CompileError("Binding source is invalid")
        result["source"] = source
        result["params"] = value.get("params") if isinstance(value.get("params"), dict) else {}
    if value.get("format") in {"date", "datetime", "time", "number", "url"}:
        result["format"] = value["format"]
    return result


def _normalise_condition(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise CompileError("Condition must be an object")
    operator = value.get("operator", "eq")
    if operator not in CONDITION_OPERATORS:
        raise CompileError("Condition operator is not allowed")
    left = _normalise_binding(value.get("left"))
    right = value.get("right")
    if isinstance(right, (dict, list)) and operator not in {"in", "not_in"}:
        raise CompileError("Condition value must be scalar")
    return {"left": left, "operator": operator, "right": right}


def _normalise_node(node: Any, *, depth: int, counter: list[int]) -> dict[str, Any]:
    if depth > MAX_DEPTH:
        raise CompileError("Component nesting is too deep")
    if not isinstance(node, dict):
        if isinstance(node, str):
            return {"type": "text", "content": node[:MAX_TEXT]}
        raise CompileError("Component must be an object")
    counter[0] += 1
    if counter[0] > MAX_NODES:
        raise CompileError("Project has too many components")

    component_type = str(node.get("type") or "default")
    result: dict[str, Any] = {"type": component_type}
    children = node.get("components", [])
    if isinstance(children, str):
        children = [{"type": "text", "content": children}]
    if not isinstance(children, list):
        raise CompileError("Component children must be a list")

    if component_type == "sc-repeat":
        source = node.get("source") or node.get("dataSource")
        if not isinstance(source, str) or not re.fullmatch(
            r"(?:[a-z][a-z0-9_-]*\.[a-z][a-z0-9_.-]*|context\.[a-z][a-z0-9_.-]*)",
            source,
        ):
            raise CompileError("Repeat data source is invalid")
        params = node.get("params") if isinstance(node.get("params"), dict) else {}
        params = {str(key): value for key, value in params.items() if len(str(key)) <= 80 and isinstance(value, (str, int, float, bool, type(None)))}
        if "limit" in params:
            try:
                params["limit"] = max(0, min(int(params["limit"]), MAX_REPEAT))
            except (TypeError, ValueError) as exc:
                raise CompileError("Repeat limit is invalid") from exc
        result.update(source=source, params=params)
        empty = node.get("empty", [])
        if not isinstance(empty, list):
            raise CompileError("Repeat empty state must be a list")
        result["empty"] = [_normalise_node(item, depth=depth + 1, counter=counter) for item in empty]
    elif component_type == "sc-condition":
        result["condition"] = _normalise_condition(node.get("condition"))
    elif component_type == "sc-bind":
        result["binding"] = _normalise_binding(node.get("binding"))
        result["mode"] = node.get("mode") if node.get("mode") in {"text", "richText"} else "text"
    elif component_type in {"sc-template-part", "sc-global-part"}:
        resource = node.get("resourceId") or node.get("resource_id")
        if not isinstance(resource, (int, str)) or len(str(resource)) > 240:
            raise CompileError("Global part reference is invalid")
        result["resourceId"] = resource
        if component_type == "sc-global-part":
            result["type"] = "sc-global-part"
    elif component_type == "sc-resource-instance":
        # GrapesJS omits model properties that match their defaults from
        # project JSON. Component instances therefore legitimately arrive
        # without resourceKind; sections always serialize their non-default
        # value explicitly.
        kind = str(node.get("resourceKind", node.get("resource_kind", "component"))).casefold()
        resource = node.get("resourceId", node.get("resource_id"))
        props = node.get("props") or {}
        variant = node.get("variant")
        if kind not in {"component", "section"}:
            raise CompileError("Linked resource kind is invalid")
        if not isinstance(resource, (int, str)) or not str(resource) or len(str(resource)) > 240:
            raise CompileError("Linked resource reference is invalid")
        if not isinstance(props, dict):
            raise CompileError("Linked resource props must be an object")
        if variant in (None, "", "__none"):
            variant = None
        elif not isinstance(variant, str) or not re.fullmatch(
            r"[A-Za-z_][A-Za-z0-9_.-]{0,79}",
            variant,
        ):
            raise CompileError("Linked resource variant is invalid")
        result.update(resourceKind=kind, resourceId=resource, props=props)
        if variant is not None:
            result["variant"] = variant
        children = []
    elif component_type == "sc-slot":
        name = node.get("name")
        if not isinstance(name, str) or not re.fullmatch(r"[a-z][a-z0-9_-]{0,49}", name):
            raise CompileError("Slot name is invalid")
        result["name"] = name
    elif component_type == "sc-empty":
        pass
    else:
        tag = (
            "main" if component_type == "wrapper" else
            str(node.get("tagName") or ({"text": "span", "link": "a", "image": "img"}.get(component_type, "div"))).lower()
        )
        if tag not in SAFE_TAGS:
            raise CompileError(f"HTML tag '{tag}' is not allowed")
        result["tagName"] = tag
        content = node.get("content")
        if content is not None:
            if not isinstance(content, (str, int, float, bool)):
                raise CompileError("Component content must be text")
            result["content"] = str(content)[:MAX_TEXT]
        attributes = node.get("attributes") if isinstance(node.get("attributes"), dict) else {}
        clean_attrs: dict[str, str] = {}
        class_value = node.get("classes") or attributes.get("class")
        if class_value:
            value = _classes(class_value)
            if value:
                clean_attrs["class"] = value
        for key, value in attributes.items():
            key = str(key).lower()
            if key == "class" or key.startswith("on"):
                continue
            if key in URL_ATTRS:
                clean = _safe_url(value, image=key == "src")
                if clean:
                    clean_attrs[key] = clean
            elif key in SAFE_ATTRS or key.startswith("aria-"):
                if key == "id" and not ID_TOKEN.fullmatch(str(value)):
                    continue
                clean_attrs[key] = str(value)[:1000]
        result["attributes"] = clean_attrs
        bindings = node.get("scBindings") or node.get("sc_bindings")
        if bindings is not None:
            if not isinstance(bindings, dict):
                raise CompileError("Component bindings must be an object")
            clean_bindings = {}
            for target, binding in bindings.items():
                if target not in BIND_TARGETS:
                    raise CompileError(f"Binding target '{target}' is not allowed")
                clean_bindings[target] = _normalise_binding(binding)
            result["scBindings"] = clean_bindings

    result["components"] = [_normalise_node(child, depth=depth + 1, counter=counter) for child in children]
    return result


def _normalise_styles(project: dict[str, Any]) -> str:
    pages = project.get("pages")
    styles: Any = []
    if isinstance(pages, list) and pages and isinstance(pages[0], dict):
        frames = pages[0].get("frames")
        if isinstance(frames, list) and frames and isinstance(frames[0], dict):
            styles = frames[0].get("styles", [])
        if not styles:
            styles = pages[0].get("styles", [])
    if not styles:
        styles = project.get("styles", [])
    if not isinstance(styles, list):
        return ""
    rules: list[str] = []
    for rule in styles[:2000]:
        if not isinstance(rule, dict) or not isinstance(rule.get("style"), dict):
            continue
        selectors = rule.get("selectors", [])
        selector_parts = []
        if isinstance(selectors, list):
            for selector in selectors:
                name = selector.get("name") if isinstance(selector, dict) else str(selector)
                if CLASS_TOKEN.fullmatch(name or ""):
                    selector_parts.append(f".{name}")
        if not selector_parts:
            continue
        declarations = []
        for prop, value in sorted(rule["style"].items()):
            prop = str(prop).lower()
            text = str(value).strip()
            if prop not in SAFE_CSS_PROPERTIES:
                continue
            if len(text) > 500 or UNSAFE_CSS.search(text) or CSS_TAG_BREAKOUT.search(text) or CSS_VALUE_BREAKOUT.search(text):
                raise CompileError(f"CSS value for '{prop}' violates the public rendering policy")
            declarations.append(f"{prop}:{text}")
        if declarations:
            state = str(rule.get("state") or "").strip().lower()
            if state:
                if state not in {"hover", "focus", "focus-visible", "active"}:
                    continue
                selector = f"{''.join(selector_parts)}:{state}"
            else:
                selector = "".join(selector_parts)
            rendered_rule = f"{selector}{{{';'.join(declarations)}}}"
            at_rule_type = str(rule.get("atRuleType") or "").strip().lower()
            if at_rule_type:
                if at_rule_type != "media":
                    continue
                media_text = str(rule.get("mediaText") or "").strip().lower()
                if not re.fullmatch(
                    r"\(\s*(?:min|max)-width\s*:\s*\d{1,5}(?:px|em|rem)\s*\)",
                    media_text,
                ):
                    raise CompileError("Responsive CSS uses an unsupported media query")
                rendered_rule = f"@media {media_text}{{{rendered_rule}}}"
            rules.append(rendered_rule)
    return "\n".join(rules)


def compile_project(project: dict[str, Any]) -> CompiledProject:
    """Validate and deterministically normalise a GrapesJS project."""
    root = _project_root(project)
    tree = _normalise_node(root, depth=0, counter=[0])
    return CompiledProject(tree=tree, css=_normalise_styles(project))


def _lookup(value: Any, field: str) -> Any:
    current = value
    for part in field.split("."):
        if isinstance(current, dict):
            current = current.get(part)
        else:
            return None
    return current


def _format_value(value: Any, format_name: str | None) -> str:
    if value is None:
        return ""
    if isinstance(value, (datetime, date)):
        if format_name == "date":
            return value.strftime("%Y-%m-%d")
        if format_name == "time" and isinstance(value, datetime):
            return value.strftime("%H:%M")
        return value.isoformat()
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return str(value)


class _RenderState:
    def __init__(self, db: Session, *, page: dict[str, Any], site: dict[str, Any], resolver: Callable[..., Any] | None,
                 slot_tree: dict[str, Any] | None = None, css_layers: list[str] | None = None,
                 published_resources: bool = True):
        self.db = db
        self.page = page
        self.site = site
        self.resolver = resolver
        self.cache: dict[str, Any] = {}
        self.nodes = 0
        self.parts: set[str] = set()
        self.global_parts: set[str] = set()
        self.resources: set[tuple[str, str]] = set()
        self.resource_cache: dict[tuple[str, str], Any] = {}
        self.props_stack: list[dict[str, Any]] = []
        self.slot_tree = slot_tree
        self.css_layers = css_layers
        self.styled_parts: set[str] = set()
        self.styled_global_parts: set[str] = set()
        self.styled_resources: set[tuple[str, str]] = set()
        self.published_resources = published_resources

    def resolve_source(self, source: str, params: dict[str, Any]) -> Any:
        key = json.dumps([source, params], sort_keys=True, default=str)
        if key in self.cache:
            return self.cache[key]
        try:
            if self.resolver is None:
                from .data_sources import resolve_public_source  # type: ignore
                value = resolve_public_source(self.db, source, params, cache=self.cache)
            else:
                value = self.resolver(self.db, source, params, self.cache)
        except ImportError as exc:
            raise CompileError(f"Data source '{source}' is not available") from exc
        except Exception as exc:
            # A disabled/removed source is an expected runtime state. Public
            # pages fail closed to their authored empty state without exposing
            # registry details. Unexpected resolver bugs still propagate.
            from .data_sources import DataSourceError
            if not isinstance(exc, DataSourceError):
                raise
            value = []
        self.cache[key] = value
        return value


def _binding_value(binding: dict[str, Any], state: _RenderState, context: Any) -> Any:
    scope = binding.get("scope", "context")
    if scope == "context":
        base = context
    elif scope == "props":
        base = state.props_stack[-1] if state.props_stack else {}
    elif scope == "page":
        base = state.page
    elif scope == "site":
        base = state.site
    else:
        base = state.resolve_source(binding["source"], binding.get("params") or {})
    return _lookup(base, binding["field"])


def _condition_matches(condition: dict[str, Any], state: _RenderState, context: Any) -> bool:
    left = _binding_value(condition["left"], state, context)
    right = condition.get("right")
    op = condition["operator"]
    if op == "exists":
        return left is not None
    if op == "empty":
        return left is None or left == "" or left == [] or left == {}
    if op == "eq":
        return left == right
    if op == "neq":
        return left != right
    if op == "in":
        return left in right if isinstance(right, (list, tuple, set, str)) else False
    if op == "not_in":
        return left not in right if isinstance(right, (list, tuple, set, str)) else True
    try:
        if op == "gt":
            return left > right
        if op == "gte":
            return left >= right
        if op == "lt":
            return left < right
        if op == "lte":
            return left <= right
    except TypeError:
        return False
    return False


def _rich_text(value: Any) -> str:
    # Rich bindings intentionally support only line breaks; stored data never
    # becomes raw markup. Rich author content should be represented as AST nodes.
    return "<br>".join(escape(part) for part in _format_value(value, None).splitlines())


def _render_nodes(nodes: list[dict[str, Any]], state: _RenderState, context: Any, depth: int) -> str:
    return "".join(_render_node(node, state, context, depth) for node in nodes)


def _render_node(node: dict[str, Any], state: _RenderState, context: Any, depth: int) -> str:
    state.nodes += 1
    if depth > MAX_DEPTH or state.nodes > MAX_NODES + MAX_REPEAT * 100:
        raise CompileError("Rendered page exceeds complexity limits")
    component_type = node.get("type")
    if component_type == "sc-repeat":
        source = node["source"]
        records = (
            _lookup(context, source.removeprefix("context."))
            if source.startswith("context.") else
            state.resolve_source(source, node.get("params") or {})
        )
        if not isinstance(records, (list, tuple)):
            records = []
        limit = min(int((node.get("params") or {}).get("limit", MAX_REPEAT)), MAX_REPEAT)
        if not records:
            return _render_nodes(node.get("empty", []), state, context, depth + 1)
        return "".join(_render_nodes(node.get("components", []), state, record, depth + 1) for record in records[:limit])
    if component_type == "sc-condition":
        return _render_nodes(node.get("components", []), state, context, depth + 1) if _condition_matches(node["condition"], state, context) else ""
    if component_type == "sc-bind":
        value = _binding_value(node["binding"], state, context)
        return _rich_text(value) if node.get("mode") == "richText" else escape(_format_value(value, node["binding"].get("format")))
    if component_type == "sc-empty":
        return _render_nodes(node.get("components", []), state, context, depth + 1)
    if component_type == "sc-template-part":
        resource_id = str(node["resourceId"])
        if resource_id in state.parts or len(state.parts) >= 12:
            return ""
        from ..models import WebSection
        section = state.db.query(WebSection).filter_by(id=int(resource_id)).one_or_none() if resource_id.isdigit() else state.db.query(WebSection).filter_by(qualified_key=resource_id).one_or_none()
        if section is None:
            return ""
        source_data = section.published_project_data if state.published_resources else section.project_data
        source_css = section.published_css if state.published_resources else section.css
        if not source_data:
            return ""
        state.parts.add(resource_id)
        try:
            compiled = compile_project(source_data)
            if state.css_layers is not None and resource_id not in state.styled_parts:
                css = f"{source_css or ''}\n{compiled.css}"
                if section.theme_version_id:
                    from .theme_package import rewrite_theme_asset_urls
                    css = rewrite_theme_asset_urls(css, section.theme_version_id)
                state.css_layers.append(css)
                state.styled_parts.add(resource_id)
            if compiled.tree.get("type") == "wrapper":
                return _render_nodes(compiled.tree.get("components", []), state, context, depth + 1)
            return _render_node(compiled.tree, state, context, depth + 1)
        finally:
            state.parts.remove(resource_id)
    if component_type == "sc-global-part":
        resource_id = str(node["resourceId"])
        if resource_id in state.global_parts or len(state.global_parts) >= 12:
            return ""
        from ..models import WebSection
        section = state.db.query(WebSection).filter_by(id=int(resource_id)).one_or_none() if resource_id.isdigit() else state.db.query(WebSection).filter_by(qualified_key=resource_id).one_or_none()
        if section is None:
            return ""
        source_data = section.published_project_data if state.published_resources else section.project_data
        source_css = section.published_css if state.published_resources else section.css
        if not source_data:
            return ""
        state.global_parts.add(resource_id)
        try:
            compiled = compile_project(source_data)
            if state.css_layers is not None and resource_id not in state.styled_global_parts:
                state.css_layers.append(f"{source_css or ''}\n{compiled.css}")
                state.styled_global_parts.add(resource_id)
            if compiled.tree.get("type") == "wrapper":
                return _render_nodes(compiled.tree.get("components", []), state, context, depth + 1)
            return _render_node(compiled.tree, state, context, depth + 1)
        finally:
            state.global_parts.remove(resource_id)
    if component_type == "sc-resource-instance":
        from .linked_resources import instance_props, resource_snapshot
        from .resource_props import ResourcePropsError

        kind = str(node["resourceKind"])
        resource_id = str(node["resourceId"])
        marker = (kind, resource_id)
        if marker in state.resources or len(state.resources) >= 12:
            return ""
        try:
            snapshot = state.resource_cache.get(marker)
            if snapshot is None:
                snapshot = resource_snapshot(
                    state.db, kind, resource_id, published=state.published_resources,
                )
                state.resource_cache[marker] = snapshot
            props = instance_props(
                snapshot,
                node.get("props") or {},
                variant=node.get("variant"),
            )
            compiled = compile_project(snapshot.project_data)
        except ResourcePropsError:
            return ""
        state.resources.add(marker)
        state.props_stack.append(props)
        try:
            if state.css_layers is not None and marker not in state.styled_resources:
                css = f"{snapshot.css}\n{compiled.css}"
                if snapshot.theme_version_id:
                    from .theme_package import rewrite_theme_asset_urls
                    css = rewrite_theme_asset_urls(css, snapshot.theme_version_id)
                state.css_layers.append(css)
                state.styled_resources.add(marker)
            if compiled.tree.get("type") == "wrapper":
                return _render_nodes(compiled.tree.get("components", []), state, context, depth + 1)
            return _render_node(compiled.tree, state, context, depth + 1)
        finally:
            state.props_stack.pop()
            state.resources.remove(marker)
    if component_type == "sc-slot":
        return _render_node(state.slot_tree, state, context, depth + 1) if state.slot_tree else _render_nodes(node.get("components", []), state, context, depth + 1)

    tag = node.get("tagName", "div")
    attrs = dict(node.get("attributes") or {})
    bound_styles: dict[str, str] = {}
    content = escape(str(node.get("content") or ""))
    for target, binding in (node.get("scBindings") or {}).items():
        value = _binding_value(binding, state, context)
        text = _format_value(value, binding.get("format"))
        if target == "text":
            content = escape(text)
        elif target == "richText":
            content = _rich_text(value)
        elif target in {"href", "src"}:
            clean = _safe_url(text, image=target == "src")
            if clean:
                attrs[target] = clean
            else:
                attrs.pop(target, None)
        elif target.startswith("style."):
            property_name = target.removeprefix("style.")
            clean = _safe_bound_style(property_name, text)
            if clean:
                bound_styles[property_name] = clean
        else:
            attrs[target] = text
    if bound_styles:
        attrs["style"] = ";".join(f"{key}:{value}" for key, value in sorted(bound_styles.items()))
    attr_html = "".join(f' {key}="{escape(str(value), quote=True)}"' for key, value in sorted(attrs.items()))
    if tag in VOID_TAGS:
        return f"<{tag}{attr_html}>"
    children = _render_nodes(node.get("components", []), state, context, depth + 1)
    return f"<{tag}{attr_html}>{content}{children}</{tag}>"


_ALLOWED_THEME_URL = re.compile(
    r"url\(\s*([\'\"]?)/(?:api/web/)?theme-assets/\d+/assets/[A-Za-z0-9%._~!$&'()*+,;=:@/-]+\1\s*\)", re.I,
)
_UNSAFE_URL = re.compile(r"url\s*\(", re.I)


def validate_render_css(css: str) -> None:
    """Reject CSS that violates the public rendering boundary."""
    cleaned = _ALLOWED_THEME_URL.sub("", css or "")
    if _UNSAFE_URL.search(cleaned):
        raise CompileError("CSS violates the public rendering policy")
    if UNSAFE_CSS.search(cleaned) or CSS_TAG_BREAKOUT.search(cleaned):
        raise CompileError("CSS violates the public rendering policy")


def has_runtime_bindings(node: dict[str, Any]) -> bool:
    """True when a compiled tree contains dynamic behavior that HTML cannot represent."""
    stack = [node]
    while stack:
        item = stack.pop()
        if not isinstance(item, dict):
            continue
        component_type = str(item.get("type") or "default")
        if component_type in {"sc-repeat", "sc-condition", "sc-template-part", "sc-global-part", "sc-slot"}:
            return True
        if component_type == "sc-bind":
            binding = item.get("binding") or {}
            if binding.get("scope", "context") != "props":
                return True
        if component_type == "sc-resource-instance":
            # Nested linked resources will be rendered by the renderer, but they
            # may contain runtime nodes; recurse is safe because normalised tree
            # already replaced children with [].
            pass
        bindings = item.get("scBindings") or {}
        if any(b.get("scope", "context") != "props" for b in bindings.values()):
            return True
        stack.extend(item.get("components", []))
    return False


def render_compiled_fragment(
    db: Session,
    compiled_tree: dict[str, Any],
    *,
    initial_props: dict[str, Any],
    css_layers: list[str] | None = None,
    published_resources: bool = False,
) -> str:
    """Render a reusable resource fragment with an initial props scope.

    Unlike ``render_project``, this does not render a synthetic ``<main>``
    wrapper. The wrapper is a project-level artifact and would change DOM
    semantics, layout, and CSS selectors if materialized into a page.
    """
    state = _RenderState(
        db,
        page={},
        site={},
        resolver=None,
        css_layers=css_layers,
        published_resources=published_resources,
    )
    state.props_stack.append(initial_props)
    try:
        if compiled_tree.get("type") == "wrapper":
            return _render_nodes(compiled_tree.get("components", []), state, None, 0)
        return _render_node(compiled_tree, state, None, 0)
    finally:
        state.props_stack.pop()


def render_project(
    db: Session,
    compiled_tree: dict[str, Any],
    *,
    page: dict[str, Any] | None = None,
    site: dict[str, Any] | None = None,
    resolver: Callable[..., Any] | None = None,
    slot_tree: dict[str, Any] | None = None,
    css_layers: list[str] | None = None,
    published_resources: bool = True,
) -> str:
    state = _RenderState(
        db, page=page or {}, site=site or {}, resolver=resolver,
        slot_tree=slot_tree, css_layers=css_layers,
        published_resources=published_resources,
    )
    return _render_node(compiled_tree, state, None, 0)


def render_document(
    body: str,
    *,
    title: str,
    description: str = "",
    canonical_url: str = "",
    noindex: bool = False,
    css: str = "",
    base_css: str = "",
    tokens: dict[str, Any] | None = None,
) -> str:
    for layer in (css, base_css):
        validate_render_css(layer)
    flattened: list[tuple[str, Any]] = []

    def _segment(key: Any) -> str:
        value = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "-", str(key)).lower().replace("_", "-")
        return value

    def _flatten(value: Any, prefix: tuple[str, ...] = (), depth: int = 0) -> None:
        if depth > 4 or len(flattened) >= 200:
            return
        if isinstance(value, dict):
            for key in sorted(value):
                segment = _segment(key)
                if re.fullmatch(r"[a-z][a-z0-9-]{0,39}", segment):
                    _flatten(value[key], (*prefix, segment), depth + 1)
        elif prefix and isinstance(value, (str, int, float)) and not isinstance(value, bool):
            flattened.append(("-".join(prefix), value))

    _flatten(tokens or {})
    token_css = []
    for key, value in flattened:
        text = str(value).strip()
        path = key.split("-")
        safe = len(text) <= 300 and not UNSAFE_CSS.search(text) and not CSS_TAG_BREAKOUT.search(text) and not CSS_VALUE_BREAKOUT.search(text)
        if path[0] in {"color", "colors"}:
            safe = safe and bool(SAFE_COLOR.fullmatch(text))
        elif "font-family" in key or key.endswith("-font"):
            safe = safe and bool(SAFE_FONT.fullmatch(text))
        elif any(part in path for part in {"spacing", "radius", "width", "size", "breakpoint", "container"}):
            safe = safe and bool(SAFE_LENGTH.fullmatch(text))
        if not safe:
            raise CompileError(f"Design token '--sc-{key}' violates the public rendering policy")
        token_css.append(f"--sc-{key}:{text}")
    root_css = f":root{{{';'.join(token_css)}}}" if token_css else ""
    robots = '<meta name="robots" content="noindex,nofollow">' if noindex else ""
    canonical = f'<link rel="canonical" href="{escape(canonical_url, quote=True)}">' if canonical_url else ""
    return (
        "<!doctype html><html lang=\"cs\"><head><meta charset=\"utf-8\">"
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        f"<title>{escape(title)}</title>"
        f'<meta name="description" content="{escape(description, quote=True)}">'
        f"{robots}{canonical}<style>{root_css}{base_css}{css}</style></head>"
        f"<body>{body}</body></html>"
    )
