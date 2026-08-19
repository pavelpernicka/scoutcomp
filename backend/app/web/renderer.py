"""Safe, browser-independent compiler and renderer for GrapesJS project data.

The persisted project JSON is the editor source of truth.  Publishing validates
and normalises it into a JSON tree; visitor requests traverse that tree and
resolve explicitly registered public data sources.  No user supplied code or
template expression is evaluated.
"""
from __future__ import annotations

import calendar as calendar_module
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
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
    "rowspan", "src", "srcset", "target", "title", "width", "open", "download",
    "data-sc-button-icon", "data-sc-button-icon-only", "data-sc-overlay",
    "data-sc-overlay-enabled", "data-sc-template-logo",
    "data-sc-template-logo-fallback", "data-sc-template-logo-hidden",
}
MEDIA_ID = re.compile(r"^[1-9][0-9]{0,9}$")
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
    # Common visual controls exposed by the GrapesJS style manager.  Values
    # still pass the CSS breakout and URL allow-lists below; adding a property
    # here does not make executable CSS or remote package code possible.
    "top", "right", "bottom", "left", "inset", "aspect-ratio",
    "background-image", "background-position", "background-repeat",
    "background-size", "background-blend-mode", "object-position",
    "grid-template-rows", "grid-column", "grid-row", "grid-gap",
    "clip-path", "filter", "mix-blend-mode", "isolation",
    # Theme-owned authoring shortcuts. Keep the allow-list explicit so a
    # custom property cannot smuggle arbitrary declarations into public CSS.
    "--sc-edge-fill", "--sc-hero-tint", "--sc-hero-tint-opacity",
    "--sc-overlay-color", "--sc-overlay-opacity",
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
SLOT_NAME = re.compile(r"^[a-z][a-z0-9_-]{0,49}$")
# Builder primitives must render correctly even with a minimalist custom theme.
# Authors can still override these classes in their own theme/resource CSS.
BUILDER_LAYOUT_CSS = (
    ".sc-layout-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}"
    "@media (max-width:575px){.sc-layout-columns{grid-template-columns:1fr}}"
    ".sc-shape-soft{border-radius:1.75rem 2.2rem 1.6rem 2rem/2rem 1.6rem 2.2rem 1.7rem!important}"
    ".sc-shape-blob{border-radius:2.8rem 1.8rem 2.5rem 2rem/2rem 2.6rem 1.8rem 2.4rem!important}"
    ".sc-shape-oval{border-radius:50%!important}.sc-shape-rounded{border-radius:1rem!important}"
    ".sc-menu,.sc-menu ul{margin:0;padding:0;list-style:none}"
    ".sc-menu-list{display:flex;flex-wrap:wrap;align-items:center;gap:.25rem}"
    ".sc-menu-item{position:relative}.sc-menu-link{display:block;padding:.45rem .65rem;text-decoration:none}"
    ".sc-menu-dropdown{display:none;min-width:12rem;padding:.35rem;background:var(--sc-menu-surface,#fff);box-shadow:0 .5rem 1.25rem rgba(0,0,0,.16)}"
    ".sc-menu-item:hover>.sc-menu-dropdown,.sc-menu-item:focus-within>.sc-menu-dropdown{display:block;position:absolute;z-index:20;left:0;top:100%}"
    ".sc-menu-dropdown .sc-menu-dropdown{left:100%;top:0}"
    ".sc-menu--footer .sc-menu-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:.25rem 1rem}"
    ".sc-menu--footer .sc-menu-dropdown{display:block;position:static;box-shadow:none;background:transparent;padding-left:.7rem}"
    "@media (max-width:575px){.sc-menu-list{display:block}.sc-menu-dropdown,.sc-menu-item:hover>.sc-menu-dropdown,.sc-menu-item:focus-within>.sc-menu-dropdown{display:block;position:static;box-shadow:none;background:transparent;padding-left:.7rem}}"
    ".sc-pagination{display:flex;align-items:center;gap:.5rem;margin:1.5rem 0}.sc-pagination-link,.sc-pagination-current{display:inline-flex;min-height:2.5rem;align-items:center;padding:0 .85rem;border:1px solid currentColor;border-radius:.25rem;text-decoration:none}.sc-pagination-current{font-weight:700}"
    ".sc-calendar{margin:1.5rem 0}.sc-calendar-toolbar{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:1rem}"
    ".sc-calendar-title{margin:0;text-align:center}.sc-calendar-nav{display:inline-flex;min-width:2.75rem;min-height:2.75rem;align-items:center;justify-content:center;border:1px solid currentColor;border-radius:.35rem;text-decoration:none}"
    ".sc-calendar-table{width:100%;table-layout:fixed;border-collapse:collapse}.sc-calendar-table th{padding:.55rem;text-align:center}.sc-calendar-day{height:7.5rem;padding:.35rem;border:1px solid currentColor;vertical-align:top}"
    ".sc-calendar-day--outside{opacity:.55}.sc-calendar-day--today{background:color-mix(in srgb,currentColor 8%,transparent)}.sc-calendar-day-number{display:block;margin-bottom:.35rem;font-weight:700}"
    ".sc-calendar-events{display:grid;gap:.25rem;list-style:none;margin:0;padding:0}.sc-calendar-event{display:block;padding:.25rem .35rem;border-radius:.25rem;background:var(--sc-calendar-event-color,#176b44);color:#fff;text-decoration:none;overflow-wrap:anywhere}"
    ".sc-calendar-event-time{font-weight:700}.sc-calendar-agenda{display:none}.sc-calendar-empty{margin:.75rem 0;color:inherit}"
    "@media (max-width:700px){.sc-calendar-table{display:none}.sc-calendar-agenda{display:grid;gap:1rem}.sc-calendar-agenda-day{display:grid;grid-template-columns:minmax(5rem,7rem) 1fr;gap:.75rem}.sc-calendar-agenda-date{font-weight:700}.sc-calendar-agenda-events{display:grid;gap:.5rem;list-style:none;margin:0;padding:0}.sc-calendar-agenda-event{padding:.65rem .75rem;border-left:.3rem solid var(--sc-calendar-event-color,#176b44);background:color-mix(in srgb,currentColor 6%,transparent)}.sc-calendar-agenda-event a{font-weight:700}.sc-calendar-agenda-description{margin:.25rem 0 0}}"
)

CZECH_MONTHS = (
    "", "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
    "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec",
)
CZECH_WEEKDAYS_MONDAY = ("Po", "Út", "St", "Čt", "Pá", "So", "Ne")


class CompileError(ValueError):
    """The project cannot be published under the public rendering policy."""


def component_slot_name(node: dict[str, Any]) -> Any:
    """Return a slot name while honoring GrapesJS default-value omission.

    GrapesJS does not serialize model properties equal to their registered
    defaults. ``sc-slot`` therefore legitimately arrives without ``name``;
    the editor keeps its semantic name in ``data-sc-slot`` and older projects
    may omit both fields for the default content slot.
    """
    if "name" in node:
        return node.get("name")
    attributes = node.get("attributes")
    if isinstance(attributes, dict) and "data-sc-slot" in attributes:
        return attributes.get("data-sc-slot")
    return "content"


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
        if image and parsed.scheme.lower() == "data":
            # Public data sources expose profile/team images as data URLs.
            # Reuse the same decoded-signature boundary as those resolvers;
            # SVG and MIME-spoofed payloads remain rejected.
            from .data_sources import safe_public_avatar
            return safe_public_avatar(text) or ""
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
    if value.get("format") in {"date", "datetime", "date_short", "datetime_short", "time", "number", "url"}:
        result["format"] = value["format"]
    return result


def _normalise_repeat_param(value: Any) -> Any:
    """Allow a repeat to consume a published page value, nothing else.

    Page metadata is intentionally generic. In particular, pages cannot carry
    a team identity; authors configure an explicit team filter when needed.
    """
    if isinstance(value, (str, int, float, bool, type(None))):
        return value
    if not isinstance(value, dict) or set(value) != {"$scBinding"}:
        raise CompileError("Repeat parameter is invalid")
    binding = _normalise_binding(value["$scBinding"])
    if binding["scope"] != "page":
        raise CompileError("Repeat parameter binding must use page scope")
    if binding["field"] == "team_id":
        raise CompileError("Pages cannot be bound to a team")
    return {"$scBinding": binding}


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


def _normalise_calendar_boolean(value: Any, *, default: bool) -> bool:
    if value in (None, ""):
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str) and value.strip().lower() in {"true", "false"}:
        return value.strip().lower() == "true"
    raise CompileError("Calendar boolean parameter is invalid")


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
        source = node.get("source") if "source" in node else node.get("dataSource")
        if source in (None, ""):
            # A repeat without a data source is a safe work-in-progress state:
            # the draft saves and publishes, and rendering fails closed to the
            # authored empty branch. Only a non-empty source is validated.
            source = ""
        elif not isinstance(source, str) or not re.fullmatch(
            r"(?:[a-z][a-z0-9_-]*\.[a-z][a-z0-9_.-]*|context\.[a-z][a-z0-9_.-]*)",
            source,
        ):
            raise CompileError("Repeat data source is invalid")
        params = node.get("params") if isinstance(node.get("params"), dict) else {}
        params = {str(key): _normalise_repeat_param(value) for key, value in params.items() if len(str(key)) <= 80}
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
    elif component_type == "sc-pagination":
        # GrapesJS omits values equal to a component type's defaults from its
        # JSON. The editor's pagination default is core.posts, so a missing
        # source is a legitimate persisted document, not corrupt input.
        source = node.get("source", node.get("dataSource", "core.posts"))
        if source in (None, ""):
            source = ""
        elif not isinstance(source, str) or not re.fullmatch(r"[a-z][a-z0-9_-]*\.[a-z][a-z0-9_.-]*", source):
            raise CompileError("Pagination data source is invalid")
        configured_page_size = node.get("pageSize") if "pageSize" in node else node.get("limit")
        limit = configured_page_size if configured_page_size not in (None, "") else 10
        if isinstance(limit, bool):
            raise CompileError("Pagination limit is invalid")
        try:
            limit = max(1, min(int(limit), MAX_REPEAT))
        except (TypeError, ValueError) as exc:
            raise CompileError("Pagination limit is invalid") from exc
        params = node.get("params") if isinstance(node.get("params"), dict) else {}
        mode = str(node.get("mode") or "simple").strip().lower()
        if mode not in {"simple", "numbers", "compact"}:
            raise CompileError("Pagination mode is invalid")
        bind_to = str(node.get("bindTo") or "nearest").strip().lower()
        if bind_to not in {"nearest", "manual"}:
            raise CompileError("Pagination binding mode is invalid")
        previous_label = str(node.get("previousLabel") or "Předchozí").strip()[:60]
        next_label = str(node.get("nextLabel") or "Další").strip()[:60]
        result.update(source=source, limit=limit, params={
            str(key): _normalise_repeat_param(value) for key, value in params.items() if len(str(key)) <= 80
        }, bindTo=bind_to, mode=mode, previousLabel=previous_label, nextLabel=next_label)
        # Kept only until the structural pairing pass below. A missing value
        # means "inherit the nearest Repeat limit" rather than an authored 10.
        result["_configuredPageSize"] = limit if configured_page_size not in (None, "") else None
    elif component_type == "sc-calendar":
        source = node.get("source", node.get("dataSource", "core.events"))
        if source in (None, ""):
            source = "core.events"
        if source != "core.events":
            raise CompileError("Calendar data source must be core.events")
        kind = str(node.get("kind") or "all").strip().lower()
        if kind not in {"all", "meeting", "trip", "other"}:
            raise CompileError("Calendar event kind is invalid")
        raw_team_id = node.get("teamId", node.get("team_id"))
        team_id: int | None = None
        if raw_team_id not in (None, ""):
            if isinstance(raw_team_id, bool):
                raise CompileError("Calendar team is invalid")
            try:
                team_id = int(raw_team_id)
            except (TypeError, ValueError) as exc:
                raise CompileError("Calendar team is invalid") from exc
            if team_id < 1 or team_id > 1_000_000_000 or str(raw_team_id).strip() != str(team_id):
                raise CompileError("Calendar team is invalid")
        first_day = str(node.get("firstDayOfWeek") or "monday").strip().lower()
        if first_day not in {"monday", "sunday"}:
            raise CompileError("Calendar first day is invalid")
        result.update(
            source="core.events",
            kind=kind,
            teamId=team_id,
            firstDayOfWeek=first_day,
            # GrapesJS omits properties equal to their component defaults;
            # the editor default is true and the compiler must preserve it.
            showDescription=_normalise_calendar_boolean(node.get("showDescription"), default=True),
        )
        children = []
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
        name = component_slot_name(node)
        if not isinstance(name, str) or not SLOT_NAME.fullmatch(name):
            raise CompileError("Slot name is invalid")
        result["name"] = name
    elif component_type == "sc-empty":
        pass
    elif component_type == "sc-detail-content":
        # A detail template receives a server-generated, sanitised content
        # fragment through its content slot. No editor-provided HTML is used.
        children = []
    elif component_type == "sc-menu":
        location = str(node.get("location") or "main").strip().lower()
        if not re.fullmatch(r"[a-z][a-z0-9_-]{0,49}", location):
            raise CompileError("Menu location is invalid")
        result["location"] = location
        presentation = str(node.get("presentation") or "").strip().lower()
        if presentation:
            if presentation not in {"bootstrap-navbar", "ontario-mobile-navbar", "bootstrap-footer-columns"}:
                raise CompileError("Menu presentation is invalid")
            result["presentation"] = presentation
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
        # The editor iframe uses a transient blob URL for authenticated media.
        # A persisted GrapesJS document carries the stable media id alongside
        # it; always compile that id back to the authenticated API URL.  The
        # public renderer subsequently rewrites this to /media/{id}/file.
        # This also repairs documents saved by earlier editor versions.
        media_id = str(attributes.get("data-sc-media-id") or "").strip()
        if media_id and MEDIA_ID.fullmatch(media_id):
            attributes = {**attributes, "src": f"/api/web/media/{media_id}/file"}
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
                if isinstance(selector, dict):
                    name = str(selector.get("name") or "")
                    selector_type = selector.get("type", 1)
                    if selector_type in (2, "2") and ID_TOKEN.fullmatch(name):
                        selector_parts.append(f"#{name}")
                    elif selector_type in (None, 1, "1") and CLASS_TOKEN.fullmatch(name):
                        selector_parts.append(f".{name}")
                else:
                    raw = str(selector)
                    if raw.startswith("#") and ID_TOKEN.fullmatch(raw[1:]):
                        selector_parts.append(raw)
                    elif raw.startswith(".") and CLASS_TOKEN.fullmatch(raw[1:]):
                        selector_parts.append(raw)
                    elif CLASS_TOKEN.fullmatch(raw):
                        selector_parts.append(f".{raw}")
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
            if prop in {"--sc-edge-fill", "--sc-hero-tint", "--sc-overlay-color"} and not SAFE_COLOR.fullmatch(text):
                raise CompileError(f"CSS value for '{prop}' must be a safe color")
            if prop in {"--sc-hero-tint-opacity", "--sc-overlay-opacity"} and not re.fullmatch(r"(?:0(?:\.\d+)?|1(?:\.0+)?)", text):
                raise CompileError(f"CSS value for '{prop}' must be between 0 and 1")
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


def _bind_paginations_to_nearest_repeats(tree: dict[str, Any]) -> None:
    """Pair every automatic paginator with the nearest preceding Repeat.

    Authors naturally place pagination after a card grid, while the Repeat is
    often one level deeper inside that grid. A flat sibling lookup therefore
    misses the intended source. We use document reading order: the last Repeat
    before the paginator wins, with the first following Repeat as a fallback
    when the paginator was intentionally inserted before its collection.

    The pairing owns the page parameter and page size on both nodes. This is
    what makes the displayed records and the navigation ask the same data
    source for the same page instead of drifting apart as two copied configs.
    """
    nodes: list[tuple[tuple[int, ...], int, dict[str, Any]]] = []

    def visit(node: dict[str, Any], path: tuple[int, ...]) -> None:
        order = len(nodes)
        if node.get("type") in {"sc-repeat", "sc-pagination"}:
            nodes.append((path, order, node))
        for index, child in enumerate(node.get("components", [])):
            if isinstance(child, dict):
                visit(child, (*path, index))

    visit(tree, ())
    repeats = [(path, order, node) for path, order, node in nodes if node.get("type") == "sc-repeat"]
    page_binding = {"$scBinding": {"scope": "page", "field": "query.page"}}

    for _pagination_path, pagination_order, pagination in (
        item for item in nodes if item[2].get("type") == "sc-pagination"
    ):
        configured_size = pagination.pop("_configuredPageSize", None)
        if pagination.get("bindTo") != "nearest" or not repeats:
            pagination["limit"] = configured_size or pagination.get("limit", 10)
            continue

        preceding = [item for item in repeats if item[1] < pagination_order]
        pool = preceding or [item for item in repeats if item[1] > pagination_order]
        if not pool:
            continue
        _, _, repeat = preceding[-1] if preceding else pool[0]
        repeat_params = dict(repeat.get("params") or {})
        inherited_size = repeat_params.get("limit")
        try:
            page_size = int(configured_size or inherited_size or pagination.get("limit") or 10)
        except (TypeError, ValueError):
            page_size = 10
        page_size = max(1, min(page_size, MAX_REPEAT, 50))
        repeat_params.update(limit=page_size, page=page_binding)
        repeat["params"] = repeat_params

        pagination["source"] = repeat.get("source") or ""
        pagination["limit"] = page_size
        pagination["params"] = dict(repeat_params)

    # Manual paginations do not enter the pairing branch, but their temporary
    # marker must never leak into immutable compiled project data.
    for _, _, node in nodes:
        if node.get("type") == "sc-pagination":
            node.pop("_configuredPageSize", None)


def compile_project(project: dict[str, Any]) -> CompiledProject:
    """Validate and deterministically normalise a GrapesJS project."""
    root = _project_root(project)
    tree = _normalise_node(root, depth=0, counter=[0])
    _bind_paginations_to_nearest_repeats(tree)
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
        if format_name == "date_short":
            return f"{value.day}. {value.month}. {value.year}"
        if format_name == "datetime_short" and isinstance(value, datetime):
            return f"{value.day}. {value.month}. {value.year} {value.hour}:{value.minute:02d}"
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

    def resolve_params(self, params: dict[str, Any]) -> dict[str, Any]:
        """Resolve the explicitly normalised page-context parameter values."""
        result = {}
        for key, value in params.items():
            if isinstance(value, dict) and set(value) == {"$scBinding"}:
                result[key] = _binding_value(value["$scBinding"], self, None)
            else:
                result[key] = value
        return result


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


def _render_menu_items(
    items: Any, *, level: int = 0, bootstrap: bool = False, disclosure: bool = False,
) -> str:
    """Render a validated menu tree without flattening child relationships."""
    if not isinstance(items, (list, tuple)) or level > 8:
        return ""
    rows: list[str] = []
    for item in items[:100]:
        if not isinstance(item, dict):
            continue
        label = escape(_format_value(item.get("label"), None))
        href = _safe_url(item.get("url")) or "#"
        target = ' target="_blank" rel="noopener noreferrer"' if item.get("target") == "_blank" else ""
        children = _render_menu_items(
            item.get("children"), level=level + 1,
            bootstrap=bootstrap, disclosure=disclosure,
        )
        has_children = bool(children)
        item_class = "sc-menu-item"
        link_class = "sc-menu-link"
        submenu_class = "sc-menu-dropdown"
        if bootstrap:
            item_class += " nav-item" + (" dropdown has-children" if has_children else "")
            link_class += " " + ("dropdown-item" if level else "nav-link")
            if has_children and level == 0:
                link_class += " dropdown-toggle"
            submenu_class += " dropdown-menu"
        if bootstrap and disclosure and has_children:
            # Native details/summary gives the mobile navigation a real,
            # keyboard-operable accordion without shipping executable theme
            # JavaScript.  Desktop CSS keeps the familiar hover/focus dropdown.
            rows.append(
                f'<li class="{item_class}"><details class="sc-menu-details">'
                f'<summary class="{link_class}"><span>{label}</span>'
                '<i class="fa-solid fa-chevron-down sc-menu-chevron" aria-hidden="true"></i></summary>'
                f'<ul class="{submenu_class}">{children}</ul>'
                "</details></li>"
            )
        else:
            rows.append(
                f'<li class="{item_class}">'
                f'<a class="{link_class}" href="{escape(href, quote=True)}"{target}>{label}</a>'
                + (f'<ul class="{submenu_class}">{children}</ul>' if children else "")
                + "</li>"
            )
    return "".join(rows)


def _render_footer_menu(items: Any) -> str:
    if not isinstance(items, (list, tuple)):
        return ""
    columns: list[str] = []
    for item in items[:24]:
        if not isinstance(item, dict):
            continue
        label = escape(_format_value(item.get("label"), None))
        href = _safe_url(item.get("url"))
        target = ' target="_blank" rel="noopener noreferrer"' if item.get("target") == "_blank" else ""
        # Bootstrap's base anchor colour must not leak into column headings
        # when an older publication artifact still carries an earlier theme
        # stylesheet.  Utilities also make the intended presentation explicit
        # in the generated semantic markup.
        heading_class = "sc-menu-heading text-white text-decoration-none fw-bold"
        heading = (
            f'<a class="{heading_class}" href="{escape(href, quote=True)}"{target}>{label}</a>'
            if href else f'<span class="{heading_class}">{label}</span>'
        )
        children = _render_menu_items(item.get("children"), level=1, bootstrap=True)
        columns.append(
            '<div class="sc-menu-column col">'
            f"{heading}"
            + (f'<ul class="sc-menu-dropdown">{children}</ul>' if children else "")
            + "</div>"
        )
    return "".join(columns)


def _render_nodes(nodes: list[dict[str, Any]], state: _RenderState, context: Any, depth: int) -> str:
    return "".join(_render_node(node, state, context, depth) for node in nodes)


def _shift_month(value: date, months: int) -> date:
    absolute = value.year * 12 + value.month - 1 + months
    return date(absolute // 12, absolute % 12 + 1, 1)


def _calendar_month(value: Any, today: date) -> date:
    text = str(value or "").strip()
    if not re.fullmatch(r"\d{4}-\d{2}", text):
        return today.replace(day=1)
    try:
        selected = datetime.strptime(text, "%Y-%m").date()
    except ValueError:
        return today.replace(day=1)
    return selected if 1900 <= selected.year <= 2100 else today.replace(day=1)


def _calendar_event_markup(event: dict[str, Any], *, agenda: bool, show_description: bool) -> str:
    title = escape(_format_value(event.get("title"), None))
    href = _safe_url(event.get("url"))
    starts_at = event.get("start_at")
    time_text = starts_at.strftime("%H:%M") if isinstance(starts_at, datetime) else ""
    datetime_attr = starts_at.isoformat() if isinstance(starts_at, datetime) else ""
    time_html = (
        f'<time class="sc-calendar-event-time" datetime="{escape(datetime_attr, quote=True)}">'
        f"{escape(time_text)}</time> "
        if time_text else ""
    )
    title_html = (
        f'<a href="{escape(href, quote=True)}">{title}</a>' if agenda and href else
        title if agenda else
        f'{time_html}<span>{title}</span>'
    )
    if not agenda and href:
        title_html = f'<a class="sc-calendar-event" href="{escape(href, quote=True)}">{title_html}</a>'
    elif not agenda:
        title_html = f'<span class="sc-calendar-event">{title_html}</span>'
    description = escape(_format_value(event.get("description"), None))
    description_html = (
        f'<p class="sc-calendar-agenda-description">{description}</p>'
        if agenda and show_description and description else ""
    )
    color = str(event.get("color") or "").strip()
    style = (
        f' style="--sc-calendar-event-color:{escape(color, quote=True)}"'
        if SAFE_COLOR.fullmatch(color) else ""
    )
    class_name = "sc-calendar-agenda-event" if agenda else "sc-calendar-event-item"
    agenda_time = time_html if agenda else ""
    return f'<li class="{class_name}"{style}>{agenda_time}{title_html}{description_html}</li>'


def _render_calendar(node: dict[str, Any], state: _RenderState) -> str:
    today = date.today()
    selected = _calendar_month(_lookup(state.page, "query.month"), today)
    first_weekday = 0 if node.get("firstDayOfWeek") == "monday" else 6
    weeks = calendar_module.Calendar(firstweekday=first_weekday).monthdatescalendar(selected.year, selected.month)
    visible_start, visible_end = weeks[0][0], weeks[-1][-1]
    params: dict[str, Any] = {
        "from": datetime.combine(visible_start, time.min),
        "to": datetime.combine(visible_end, time.max),
        "limit": 50,
        "sort": "start_at_asc",
    }
    if node.get("kind") != "all":
        params["kind"] = node["kind"]
    if node.get("teamId") is not None:
        params["team_id"] = node["teamId"]
    records = state.resolve_source("core.events", params)
    records = records if isinstance(records, (list, tuple)) else []
    by_day: dict[date, list[dict[str, Any]]] = {}
    for record in records[:50]:
        if not isinstance(record, dict) or not isinstance(record.get("start_at"), datetime):
            continue
        by_day.setdefault(record["start_at"].date(), []).append(record)

    weekdays = list(CZECH_WEEKDAYS_MONDAY)
    if first_weekday == 6:
        weekdays = weekdays[-1:] + weekdays[:-1]
    headings = "".join(f'<th scope="col">{label}</th>' for label in weekdays)
    rows: list[str] = []
    for week in weeks:
        cells: list[str] = []
        for day_value in week:
            modifiers = []
            if day_value.month != selected.month:
                modifiers.append("sc-calendar-day--outside")
            if day_value == today:
                modifiers.append("sc-calendar-day--today")
            current_attr = ' aria-current="date"' if day_value == today else ""
            class_name = "sc-calendar-day" + (" " + " ".join(modifiers) if modifiers else "")
            items = "".join(
                _calendar_event_markup(item, agenda=False, show_description=False)
                for item in by_day.get(day_value, [])
            )
            cells.append(
                f'<td class="{class_name}" data-date="{day_value.isoformat()}">'
                f'<time class="sc-calendar-day-number" datetime="{day_value.isoformat()}"{current_attr}>{day_value.day}</time>'
                + (f'<ul class="sc-calendar-events">{items}</ul>' if items else "")
                + "</td>"
            )
        rows.append(f'<tr>{"".join(cells)}</tr>')

    agenda_days: list[str] = []
    for day_value in sorted(by_day):
        if day_value.month != selected.month:
            continue
        items = "".join(
            _calendar_event_markup(
                item, agenda=True, show_description=bool(node.get("showDescription")),
            )
            for item in by_day[day_value]
        )
        agenda_days.append(
            '<section class="sc-calendar-agenda-day">'
            f'<time class="sc-calendar-agenda-date" datetime="{day_value.isoformat()}">'
            f'{day_value.day}. {day_value.month}.</time>'
            f'<ul class="sc-calendar-agenda-events">{items}</ul></section>'
        )
    agenda = "".join(agenda_days) or '<p class="sc-calendar-empty">V tomto měsíci nejsou žádné akce.</p>'
    previous_month = _shift_month(selected, -1).strftime("%Y-%m")
    next_month = _shift_month(selected, 1).strftime("%Y-%m")
    current_month = today.strftime("%Y-%m")
    title = f"{CZECH_MONTHS[selected.month]} {selected.year}"
    minimum_month = _shift_month(today.replace(day=1), -12)
    maximum_month = _shift_month(today.replace(day=1), 18)
    previous_control = (
        f'<a class="sc-calendar-nav sc-calendar-nav--prev" rel="prev" href="?month={previous_month}" aria-label="Předchozí měsíc">‹</a>'
        if selected > minimum_month else
        '<span class="sc-calendar-nav sc-calendar-nav--prev" aria-hidden="true">‹</span>'
    )
    next_control = (
        f'<a class="sc-calendar-nav sc-calendar-nav--next" rel="next" href="?month={next_month}" aria-label="Následující měsíc">›</a>'
        if selected < maximum_month else
        '<span class="sc-calendar-nav sc-calendar-nav--next" aria-hidden="true">›</span>'
    )
    return (
        f'<section class="sc-calendar" data-sc-calendar-month="{selected.strftime("%Y-%m")}">'
        '<div class="sc-calendar-toolbar">'
        f'{previous_control}'
        f'<div><h2 class="sc-calendar-title">{title}</h2>'
        f'<a class="sc-calendar-today" href="?month={current_month}">Dnes</a></div>'
        f'{next_control}'
        f'</div><table class="sc-calendar-table" aria-label="Kalendář – {title}"><thead><tr>'
        f'{headings}</tr></thead><tbody>{"".join(rows)}</tbody></table>'
        f'<div class="sc-calendar-agenda">{agenda}</div></section>'
    )


def _render_node(node: dict[str, Any], state: _RenderState, context: Any, depth: int) -> str:
    state.nodes += 1
    if depth > MAX_DEPTH or state.nodes > MAX_NODES + MAX_REPEAT * 100:
        raise CompileError("Rendered page exceeds complexity limits")
    component_type = node.get("type")
    if component_type == "sc-repeat":
        source = node["source"]
        if not source:
            # No source configured yet: fail closed to the authored empty branch.
            return _render_nodes(node.get("empty", []), state, context, depth + 1)
        params = state.resolve_params(node.get("params") or {})
        records = (
            _lookup(context, source.removeprefix("context."))
            if source.startswith("context.") else
            state.resolve_source(source, params)
        )
        if not isinstance(records, (list, tuple)):
            records = []
        limit = min(int(params.get("limit", MAX_REPEAT)), MAX_REPEAT)
        if not records:
            return _render_nodes(node.get("empty", []), state, context, depth + 1)
        return "".join(_render_nodes(node.get("components", []), state, record, depth + 1) for record in records[:limit])
    if component_type == "sc-pagination":
        if not node["source"]:
            return ""
        params = state.resolve_params(node.get("params") or {})
        limit = node["limit"]
        records = state.resolve_source(node["source"], params)
        records = records if isinstance(records, (list, tuple)) else []
        try:
            current = max(1, int(_lookup(state.page, "query.page") or 1))
        except (TypeError, ValueError):
            current = 1
        has_next = len(records) > limit
        if not has_next and len(records) >= limit:
            # Probe the next page with the *same* page size. Increasing limit
            # here changes `(page - 1) * limit` in page-aware resolvers and
            # shifts page 2 onward, making the final record unreachable.
            next_params = dict(params)
            if "page" in next_params:
                next_params["page"] = current + 1
            elif "offset" in next_params:
                next_params["offset"] = int(next_params.get("offset") or 0) + limit
            else:
                next_params["page"] = current + 1
            next_records = state.resolve_source(node["source"], next_params)
            has_next = isinstance(next_records, (list, tuple)) and bool(next_records)
        if current == 1 and not has_next:
            return ""
        mode = node.get("mode", "simple")
        previous_label = escape(node.get("previousLabel") or "Předchozí")
        next_label = escape(node.get("nextLabel") or "Další")
        links: list[str] = []
        if current > 1:
            links.append(
                f'<a class="sc-pagination-link sc-pagination-prev" rel="prev" '
                f'href="?page={current - 1}">{previous_label}</a>'
            )
        if mode == "numbers":
            first = max(1, current - 2)
            last = current + (1 if has_next else 0)
            for number in range(first, last + 1):
                if number == current:
                    links.append(f'<span class="sc-pagination-current" aria-current="page">{number}</span>')
                else:
                    links.append(f'<a class="sc-pagination-link" href="?page={number}">{number}</a>')
        elif mode == "simple":
            links.append(f'<span class="sc-pagination-current" aria-current="page">{current}</span>')
        if has_next:
            links.append(
                f'<a class="sc-pagination-link sc-pagination-next" rel="next" '
                f'href="?page={current + 1}">{next_label}</a>'
            )
        return f'<nav class="sc-pagination" aria-label="Stránkování">{"".join(links)}</nav>'
    if component_type == "sc-calendar":
        return _render_calendar(node, state)
    if component_type == "sc-condition":
        return _render_nodes(node.get("components", []), state, context, depth + 1) if _condition_matches(node["condition"], state, context) else ""
    if component_type == "sc-bind":
        value = _binding_value(node["binding"], state, context)
        return _rich_text(value) if node.get("mode") == "richText" else escape(_format_value(value, node["binding"].get("format")))
    if component_type == "sc-empty":
        return _render_nodes(node.get("components", []), state, context, depth + 1)
    if component_type == "sc-detail-content":
        fragment = state.page.get("detail_html")
        return fragment if isinstance(fragment, str) else ""
    if component_type == "sc-menu":
        location = node.get("location", "main")
        items = state.resolve_source("web.menu", {"location": location})
        presentation = node.get("presentation") or (
            "bootstrap-footer-columns" if location == "footer" else ""
        )
        if presentation == "bootstrap-footer-columns":
            rendered_items = _render_footer_menu(items)
        else:
            rendered_items = _render_menu_items(
                items,
                bootstrap=presentation in {"bootstrap-navbar", "ontario-mobile-navbar"},
                disclosure=presentation == "ontario-mobile-navbar",
            )
        if not rendered_items:
            return ""
        modifier = " sc-menu--footer" if location == "footer" else ""
        if presentation:
            modifier += f" sc-menu--{presentation}"
        label = "Patičkové menu" if location == "footer" else "Navigace"
        tag = "div" if presentation == "bootstrap-footer-columns" else "ul"
        classes = (
            "sc-menu-list row" if tag == "div" else
            "sc-menu-list navbar-nav" if presentation in {"bootstrap-navbar", "ontario-mobile-navbar"} else
            "sc-menu-list"
        )
        return f'<nav class="sc-menu{modifier}" aria-label="{label}"><{tag} class="{classes}">{rendered_items}</{tag}></nav>'
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
        if component_type in {"sc-repeat", "sc-pagination", "sc-calendar", "sc-condition", "sc-menu", "sc-template-part", "sc-global-part", "sc-slot", "sc-detail-content"}:
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
    favicon: str = "",
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
    safe_favicon = _safe_url(favicon, image=True)
    favicon_link = f'<link rel="icon" href="{escape(safe_favicon, quote=True)}">' if safe_favicon else ""
    return (
        "<!doctype html><html lang=\"cs\"><head><meta charset=\"utf-8\">"
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        f"<title>{escape(title)}</title>"
        f'<meta name="description" content="{escape(description, quote=True)}">'
        f"{robots}{canonical}{favicon_link}<style>{BUILDER_LAYOUT_CSS}{root_css}{base_css}{css}</style></head>"
        f"<body>{body}</body></html>"
    )
