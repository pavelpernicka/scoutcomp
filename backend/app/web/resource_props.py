"""Typed props and linked design-resource validation.

The schema is declarative data shared by theme packages, site-owned resource
definitions, the editor inspector, and the public renderer. It deliberately
does not permit executable callbacks or arbitrary component code.
"""
from __future__ import annotations

import re
from copy import deepcopy
from typing import Any


PROP_TYPES = frozenset({
    "text", "textarea", "richtext", "number", "boolean", "select",
    "multiselect", "color", "icon", "media", "link", "page", "menu",
    "data-source", "data-field", "alignment", "spacing", "group", "repeater",
})

_PROP_ID = re.compile(r"^[A-Za-z_][A-Za-z0-9_.-]{0,79}$")
_ALIGNMENTS = {"start", "center", "end", "left", "right", "justify"}
_SCALAR_TYPES = {"text", "textarea", "richtext", "color", "icon", "page", "menu", "data-source", "data-field"}
_DEFINITION_KEYS = {
    "id", "type", "label", "help", "category", "required", "default",
    "options", "minimum", "maximum", "step", "placeholder", "fields",
}


class ResourcePropsError(ValueError):
    """A linked resource schema or instance prop payload is invalid."""


def _bounded_json(value: Any, *, depth: int = 0, counter: list[int] | None = None) -> Any:
    if counter is None:
        counter = [0]
    counter[0] += 1
    if counter[0] > 2000 or depth > 8:
        raise ResourcePropsError("Prop value is too complex")
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        if len(value) > 20_000:
            raise ResourcePropsError("Prop text is too long")
        return value
    if isinstance(value, list):
        if len(value) > 100:
            raise ResourcePropsError("Prop list contains too many items")
        return [_bounded_json(item, depth=depth + 1, counter=counter) for item in value]
    if isinstance(value, dict):
        if len(value) > 100:
            raise ResourcePropsError("Prop object contains too many fields")
        result = {}
        for key, item in value.items():
            key = str(key)
            if not _PROP_ID.fullmatch(key):
                raise ResourcePropsError(f"Prop object key is invalid: {key}")
            result[key] = _bounded_json(item, depth=depth + 1, counter=counter)
        return result
    raise ResourcePropsError("Prop value must be JSON-compatible")


def _normalise_options(value: Any) -> list[dict[str, Any]]:
    if value is None:
        return []
    if not isinstance(value, list) or len(value) > 100:
        raise ResourcePropsError("Prop options must be a bounded list")
    result = []
    for option in value:
        if isinstance(option, (str, int, float, bool)):
            result.append({"value": option, "label": str(option)})
            continue
        if not isinstance(option, dict) or set(option) - {"value", "label"} or "value" not in option:
            raise ResourcePropsError("Prop option must contain value and optional label")
        option_value = option["value"]
        if not isinstance(option_value, (str, int, float, bool)):
            raise ResourcePropsError("Prop option value must be scalar")
        label = option.get("label", option_value)
        if not isinstance(label, str) or len(label) > 200:
            raise ResourcePropsError("Prop option label is invalid")
        result.append({"value": option_value, "label": label})
    return result


def normalise_prop_schema(value: Any, *, depth: int = 0) -> list[dict[str, Any]]:
    if value in (None, {}):
        return []
    if not isinstance(value, list) or len(value) > 100:
        raise ResourcePropsError("Prop schema must be a bounded list")
    if depth > 3:
        raise ResourcePropsError("Nested prop schema is too deep")
    result = []
    seen: set[str] = set()
    for raw in value:
        if not isinstance(raw, dict) or set(raw) - _DEFINITION_KEYS:
            raise ResourcePropsError("Prop definition contains unsupported fields")
        prop_id = raw.get("id")
        prop_type = str(raw.get("type", "text"))
        if not isinstance(prop_id, str) or not _PROP_ID.fullmatch(prop_id):
            raise ResourcePropsError("Prop id is invalid")
        if prop_id in seen:
            raise ResourcePropsError(f"Duplicate prop id: {prop_id}")
        if prop_type not in PROP_TYPES:
            raise ResourcePropsError(f"Unsupported prop type: {prop_type}")
        seen.add(prop_id)
        definition: dict[str, Any] = {"id": prop_id, "type": prop_type}
        for key in ("label", "help", "category", "placeholder"):
            item = raw.get(key)
            if item is not None:
                if not isinstance(item, str) or len(item) > (1000 if key == "help" else 200):
                    raise ResourcePropsError(f"Prop {key} is invalid")
                definition[key] = item
        if raw.get("required"):
            definition["required"] = True
        options = _normalise_options(raw.get("options"))
        if options:
            definition["options"] = options
        for key in ("minimum", "maximum", "step"):
            item = raw.get(key)
            if item is not None:
                if not isinstance(item, (int, float)) or isinstance(item, bool):
                    raise ResourcePropsError(f"Prop {key} must be numeric")
                definition[key] = item
        if prop_type in {"group", "repeater"}:
            definition["fields"] = normalise_prop_schema(raw.get("fields") or [], depth=depth + 1)
        if "default" in raw:
            definition["default"] = _normalise_prop_value(definition, raw["default"])
        result.append(definition)
    return result


def _option_values(definition: dict[str, Any]) -> set[Any]:
    return {option["value"] for option in definition.get("options", [])}


def _normalise_prop_value(definition: dict[str, Any], value: Any) -> Any:
    prop_type = definition["type"]
    if value is None:
        if definition.get("required"):
            raise ResourcePropsError(f"Required prop is missing: {definition['id']}")
        return None
    if prop_type in _SCALAR_TYPES:
        if not isinstance(value, str):
            raise ResourcePropsError(f"Prop '{definition['id']}' must be text")
        if len(value) > 20_000:
            raise ResourcePropsError(f"Prop '{definition['id']}' is too long")
        return value
    if prop_type == "number":
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            raise ResourcePropsError(f"Prop '{definition['id']}' must be numeric")
        if definition.get("minimum") is not None and value < definition["minimum"]:
            raise ResourcePropsError(f"Prop '{definition['id']}' is below its minimum")
        if definition.get("maximum") is not None and value > definition["maximum"]:
            raise ResourcePropsError(f"Prop '{definition['id']}' is above its maximum")
        return value
    if prop_type == "boolean":
        if not isinstance(value, bool):
            raise ResourcePropsError(f"Prop '{definition['id']}' must be boolean")
        return value
    if prop_type in {"select", "alignment"}:
        if not isinstance(value, (str, int, float, bool)):
            raise ResourcePropsError(f"Prop '{definition['id']}' must be scalar")
        allowed = _option_values(definition)
        if prop_type == "alignment" and not allowed:
            allowed = _ALIGNMENTS
        if allowed and value not in allowed:
            raise ResourcePropsError(f"Prop '{definition['id']}' has an unsupported value")
        return value
    if prop_type == "multiselect":
        if not isinstance(value, list) or len(value) > 100:
            raise ResourcePropsError(f"Prop '{definition['id']}' must be a bounded list")
        allowed = _option_values(definition)
        if any(not isinstance(item, (str, int, float, bool)) or (allowed and item not in allowed) for item in value):
            raise ResourcePropsError(f"Prop '{definition['id']}' contains an unsupported value")
        return list(dict.fromkeys(value))
    if prop_type == "link":
        if not isinstance(value, str) or len(value) > 2000:
            raise ResourcePropsError(f"Prop '{definition['id']}' must be a link string")
        return value
    if prop_type == "media":
        if not isinstance(value, (str, int, dict)):
            raise ResourcePropsError(f"Prop '{definition['id']}' must be a media reference")
        return _bounded_json(value)
    if prop_type == "spacing":
        if not isinstance(value, (str, int, float, dict)) or isinstance(value, bool):
            raise ResourcePropsError(f"Prop '{definition['id']}' must be spacing data")
        return _bounded_json(value)
    if prop_type == "group":
        if not isinstance(value, dict):
            raise ResourcePropsError(f"Prop '{definition['id']}' must be an object")
        return normalise_prop_values(definition.get("fields", []), {}, value)
    if prop_type == "repeater":
        if not isinstance(value, list) or len(value) > 100:
            raise ResourcePropsError(f"Prop '{definition['id']}' must be a bounded list")
        if any(not isinstance(item, dict) for item in value):
            raise ResourcePropsError(f"Prop '{definition['id']}' repeater items must be objects")
        fields = definition.get("fields", [])
        return [normalise_prop_values(fields, {}, item) for item in value]
    return _bounded_json(value)


def normalise_prop_values(
    schema: Any,
    defaults: Any,
    values: Any,
    *,
    require_required: bool = True,
) -> dict[str, Any]:
    definitions = normalise_prop_schema(schema)
    if defaults is None:
        defaults = {}
    if values is None:
        values = {}
    if not isinstance(defaults, dict) or not isinstance(values, dict):
        raise ResourcePropsError("Resource props must be objects")
    by_id = {definition["id"]: definition for definition in definitions}
    unknown = (set(defaults) | set(values)) - set(by_id)
    if unknown:
        raise ResourcePropsError(f"Unknown resource prop: {sorted(unknown)[0]}")
    result: dict[str, Any] = {}
    for prop_id, definition in by_id.items():
        if prop_id in values:
            raw = values[prop_id]
        elif prop_id in defaults:
            raw = defaults[prop_id]
        elif "default" in definition:
            raw = definition["default"]
        else:
            if definition.get("required") and require_required:
                raise ResourcePropsError(f"Required prop is missing: {prop_id}")
            continue
        normalised = _normalise_prop_value(definition, raw)
        if normalised is not None:
            result[prop_id] = normalised
    return result


def normalise_default_props(schema: Any, values: Any) -> dict[str, Any]:
    return normalise_prop_values(schema, {}, values, require_required=False)


def normalise_variants(schema: Any, defaults: Any, value: Any) -> list[dict[str, Any]]:
    if value in (None, {}):
        return []
    if not isinstance(value, list) or len(value) > 50:
        raise ResourcePropsError("Resource variants must be a bounded list")
    result = []
    seen: set[str] = set()
    for raw in value:
        if not isinstance(raw, dict) or set(raw) - {"id", "label", "props"}:
            raise ResourcePropsError("Resource variant is invalid")
        variant_id = raw.get("id")
        label = raw.get("label", variant_id)
        if not isinstance(variant_id, str) or not _PROP_ID.fullmatch(variant_id) or variant_id in seen:
            raise ResourcePropsError("Resource variant id is invalid or duplicated")
        if not isinstance(label, str) or not label or len(label) > 200:
            raise ResourcePropsError("Resource variant label is invalid")
        seen.add(variant_id)
        merged = normalise_prop_values(schema, defaults, raw.get("props") or {})
        result.append({"id": variant_id, "label": label, "props": merged})
    return result


def clone_json(value: Any) -> Any:
    return deepcopy(value)
