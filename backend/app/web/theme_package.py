"""Secure installation of declarative ScoutComp theme packages.

Theme archives are data packages, never executable plugins.  This module owns
the archive trust boundary and deliberately does not expose a generic unzip
helper.  All package files are validated before a private staging directory is
created and every member is copied with explicit size accounting.
"""
from __future__ import annotations

import hashlib
import io
import json
import math
import logging
import mimetypes
import os
import re
import shutil
import stat
import tempfile
import unicodedata
import zipfile
from xml.etree import ElementTree
from pathlib import Path, PurePosixPath
from typing import Any, Iterable
from urllib.parse import quote

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import settings
from ..models import (
    WebPageRevision,
    WebPage,
    WebPattern,
    WebReusableComponent,
    WebSection,
    WebSiteStyle,
    WebTemplate,
    WebTheme,
    WebThemeAsset,
    WebThemeVersion,
)
from .previews import build_preview, theme_preview_svg
from .resource_props import (
    ResourcePropsError,
    normalise_default_props,
    normalise_prop_schema,
    normalise_variants,
)
from .linked_resources import validate_linked_resource_instances

logger = logging.getLogger(__name__)

PACKAGE_SCHEMA_VERSION = 1
MAX_ARCHIVE_SIZE = 16 * 1024 * 1024
MAX_FILE_COUNT = 256
MAX_MEMBER_SIZE = 8 * 1024 * 1024
MAX_TOTAL_SIZE = 64 * 1024 * 1024
MAX_COMPRESSION_RATIO = 100
MAX_PATH_LENGTH = 240
MAX_PATH_DEPTH = 8
MAX_JSON_DEPTH = 40
MAX_JSON_NODES = 50_000
MAX_JSON_STRING = 256_000

_ID_RE = re.compile(r"^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$")
_VERSION_RE = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?"
    r"(?:\+[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$"
)
_DANGEROUS_PROJECT_TEXT = re.compile(
    r"<\s*/?\s*(?:script|iframe|object|embed|base|meta|link)\b|"
    r"(?:javascript|vbscript)\s*:|data\s*:\s*text/html|"
    r"\bon[a-z]+\s*=|</\s*style\b",
    re.IGNORECASE,
)
_FORBIDDEN_CSS = re.compile(
    r"@import\b|</\s*style\b|expression\s*\(|(?<![-\w])behavior\s*:|"
    r"-moz-binding\s*:|(?:https?|javascript|vbscript|data|file)\s*:",
    re.IGNORECASE,
)
_CSS_URL = re.compile(r"url\(\s*(['\"]?)(.*?)\1\s*\)", re.IGNORECASE)
_CSS_IMAGE_SET = re.compile(r"(?:-webkit-)?image-set\s*\(", re.IGNORECASE)

_DESIGN_KINDS = {
    "templates": WebTemplate,
    "components": WebReusableComponent,
    "sections": WebSection,
    "patterns": WebPattern,
}
_RESOURCE_ALIASES = {
    "template_parts": "sections",
    "parts": "sections",
    "page-templates": "templates",
}

_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif"}
_FONT_EXTENSIONS = {".woff", ".woff2", ".otf", ".ttf"}
_VECTOR_EXTENSIONS = {".svg"}
_ALLOWED_PREFIX_EXTENSIONS = {
    "templates": {".json"},
    "components": {".json"},
    "sections": {".json"},
    "patterns": {".json"},
    "styles": {".css"},
    "assets": _IMAGE_EXTENSIONS | _FONT_EXTENSIONS | _VECTOR_EXTENSIONS,
    "previews": _IMAGE_EXTENSIONS,
}
_IMAGE_MAGIC = {
    ".png": (b"\x89PNG\r\n\x1a\n",),
    ".jpg": (b"\xff\xd8\xff",),
    ".jpeg": (b"\xff\xd8\xff",),
    ".gif": (b"GIF87a", b"GIF89a"),
    ".webp": (b"RIFF",),
    ".avif": (),  # checked separately: ISO-BMFF ftyp avif/avis
}
_MANIFEST_KEYS = {
    "schema_version", "package_schema_version", "id", "name", "version",
    "author", "description", "license", "compatible_scoutcomp",
    "scoutcomp_version", "resources", "preview", "config", "site_resources", "editor",
}
_CONFIG_TYPES = {"text", "color", "number", "select", "checkbox", "media"}
_CONFIG_STORAGE = {"tokens", "site_setting"}
_THEME_SITE_SETTINGS = {"site_logo"}
_EDITOR_CONTROL_FIELD_TYPES = {"text", "number", "color", "range", "select", "checkbox", "media"}
_EDITOR_CONTROL_BINDINGS = {"attribute", "style", "class_choice", "class_toggle", "media"}
_EDITOR_TARGET_SCOPES = {"self", "descendant"}
_THEME_KEYS = {"schema_version", "package_schema_version", "tokens", "default_tokens", "styles"}
_RESOURCE_ENTRY_KEYS = {"id", "file", "name", "description", "kind", "css", "usage_mode"}


class ThemePackageError(ValueError):
    """Invalid or unsafe theme package (normally maps to HTTP 422)."""

    code = "invalid_theme_package"


class ThemeConflictError(ThemePackageError):
    """A different immutable package already owns the requested identity."""

    code = "theme_conflict"


class ThemeNotFoundError(ThemePackageError):
    code = "theme_not_found"


class ThemeInUseError(ThemePackageError):
    code = "theme_in_use"


def _validate_editor_match(value: Any, label: str) -> None:
    """Validate the small, non-executable component matcher language.

    Theme packages deliberately cannot ship CSS selectors or JavaScript.  The
    editor evaluates these bounded tag/class/attribute predicates against the
    GrapesJS model, which gives themes control over their inspector UI without
    introducing an executable plugin boundary.
    """
    if not isinstance(value, dict) or set(value) - {"tags", "all_classes", "any_classes", "attributes"}:
        _fail(f"{label} is invalid")
    for key in ("tags", "all_classes", "any_classes"):
        items = value.get(key, [])
        if not isinstance(items, list) or len(items) > 30:
            _fail(f"{label}.{key} must be a bounded list")
        for item in items:
            if not isinstance(item, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{0,79}", item):
                _fail(f"{label}.{key} contains an invalid identifier")
    attributes = value.get("attributes", {})
    if not isinstance(attributes, dict) or len(attributes) > 30:
        _fail(f"{label}.attributes must be an object")
    for name, expected in attributes.items():
        if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z_:][A-Za-z0-9_.:-]{0,99}", name):
            _fail(f"{label}.attributes contains an invalid name")
        if expected is not None and (not isinstance(expected, str) or len(expected) > 200):
            _fail(f"{label}.attributes contains an invalid value")


def _validate_editor_metadata(editor_metadata: Any, archive_paths: set[str] | None = None) -> None:
    if not isinstance(editor_metadata, dict) or set(editor_metadata) - {"font_sets", "component_controls", "blocks"}:
        _fail("manifest.json editor metadata is invalid")
    font_sets = editor_metadata.get("font_sets", [])
    if not isinstance(font_sets, list) or len(font_sets) > 50:
        _fail("manifest.json editor.font_sets must be a bounded list")
    for item in font_sets:
        if not isinstance(item, dict) or set(item) != {"id", "label", "value"}:
            _fail("editor font set is invalid")
        if not _ID_RE.fullmatch(str(item.get("id", ""))):
            _fail("editor font set id is invalid")
        for field in ("label", "value"):
            value = item.get(field)
            if not isinstance(value, str) or not value.strip() or len(value) > 200:
                _fail(f"editor font set {field} is invalid")
        if any(token in item["value"].lower() for token in ("url(", "@import", ";", "{")):
            _fail("editor font set value is unsafe")

    blocks = editor_metadata.get("blocks", [])
    if not isinstance(blocks, list) or len(blocks) > 200:
        _fail("manifest.json editor.blocks must be a bounded list")
    for block in blocks:
        if not isinstance(block, dict) or set(block) - {"id", "label", "category", "icon", "content"}:
            _fail("editor block is invalid")
        if not _ID_RE.fullmatch(str(block.get("id", ""))):
            _fail("editor block id is invalid")
        for field in ("label", "category"):
            value = block.get(field)
            if not isinstance(value, str) or not value.strip() or len(value) > 200:
                _fail(f"editor block {field} is invalid")
        icon = block.get("icon")
        if icon is not None and (not isinstance(icon, str) or not re.fullmatch(r"[a-z0-9-]{1,80}", icon)):
            _fail("editor block icon is invalid")
        content = block.get("content")
        if not isinstance(content, (dict, list)):
            _fail("editor block content must be project data")
        if archive_paths is not None:
            project = content if isinstance(content, dict) else {"components": content}
            _validate_project_data(project, "editor block", archive_paths)
        _validate_json_shape(content, "editor block content")
        if _DANGEROUS_PROJECT_TEXT.search(json.dumps(content, ensure_ascii=False)):
            _fail("editor block contains executable markup or a dangerous URL")
        stack = [content]
        while stack:
            item = stack.pop()
            if isinstance(item, dict):
                for key, child in item.items():
                    lowered = key.casefold()
                    if lowered.startswith("on") and len(lowered) > 2:
                        _fail("editor block contains an event-handler property")
                    if lowered in {"script", "script-export", "componentscript"}:
                        _fail("editor block contains executable component code")
                    if lowered in {"tagname", "type"} and isinstance(child, str) and child.casefold() in {"script", "iframe", "object", "embed"}:
                        _fail("editor block contains an executable component type")
                    stack.append(child)
            elif isinstance(item, list):
                stack.extend(item)

    controls = editor_metadata.get("component_controls", [])
    if not isinstance(controls, list) or len(controls) > 200:
        _fail("manifest.json editor.component_controls must be a bounded list")
    for control in controls:
        allowed = {"id", "label", "icon", "match", "scope", "fields"}
        if not isinstance(control, dict) or set(control) - allowed:
            _fail("editor component control is invalid")
        if not _ID_RE.fullmatch(str(control.get("id", ""))):
            _fail("editor component control id is invalid")
        if not isinstance(control.get("label"), str) or not control["label"].strip() or len(control["label"]) > 200:
            _fail("editor component control label is invalid")
        icon = control.get("icon")
        if icon is not None and (not isinstance(icon, str) or not re.fullmatch(r"[A-Za-z0-9-]{1,80}", icon)):
            _fail("editor component control icon is invalid")
        if control.get("scope", "self") not in {"self", "closest"}:
            _fail("editor component control scope is invalid")
        _validate_editor_match(control.get("match"), "editor component control match")
        fields = control.get("fields")
        if not isinstance(fields, list) or not fields or len(fields) > 50:
            _fail("editor component control fields must be a non-empty bounded list")
        for field in fields:
            allowed_field = {"id", "label", "type", "bind", "default", "min", "max", "step", "scale", "options", "help"}
            if not isinstance(field, dict) or set(field) - allowed_field:
                _fail("editor component control field is invalid")
            if not _ID_RE.fullmatch(str(field.get("id", ""))):
                _fail("editor component control field id is invalid")
            if not isinstance(field.get("label"), str) or not field["label"].strip() or len(field["label"]) > 200:
                _fail("editor component control field label is invalid")
            field_type = field.get("type")
            if field_type not in _EDITOR_CONTROL_FIELD_TYPES:
                _fail("editor component control field type is invalid")
            default = field.get("default")
            if default is not None and (
                not isinstance(default, (str, int, float, bool))
                or isinstance(default, str) and len(default) > 500
                or isinstance(default, float) and not math.isfinite(default)
            ):
                _fail("editor component control field default is invalid")
            help_text = field.get("help")
            if help_text is not None and (not isinstance(help_text, str) or len(help_text) > 500):
                _fail("editor component control field help is invalid")
            bind = field.get("bind")
            allowed_bind = {"kind", "name", "class_name", "remove_prefix", "target"}
            if not isinstance(bind, dict) or set(bind) - allowed_bind or bind.get("kind") not in _EDITOR_CONTROL_BINDINGS:
                _fail("editor component control field binding is invalid")
            for key in ("name", "class_name", "remove_prefix"):
                value = bind.get(key)
                if value is not None and (not isinstance(value, str) or not re.fullmatch(r"--?[A-Za-z0-9_-]{1,98}|[A-Za-z][A-Za-z0-9_.:-]{0,99}", value)):
                    _fail("editor component control field binding name is invalid")
            binding_name = str(bind.get("name") or "").casefold()
            if bind.get("kind") == "attribute" and (
                binding_name.startswith("on")
                or binding_name in {"src", "srcset", "poster", "href", "ping", "action", "srcdoc", "style", "formaction", "xlink:href"}
            ):
                _fail("editor component control cannot bind an executable attribute")
            if bind.get("kind") in {"attribute", "style"} and not binding_name:
                _fail("editor component control binding requires a name")
            if bind.get("kind") == "style" and (
                binding_name in {"behavior", "-moz-binding"}
                or field_type in {"text", "media", "checkbox"}
            ):
                _fail("editor component control cannot bind an unsafe style")
            if bind.get("kind") == "class_choice" and field_type != "select":
                _fail("editor class choice must use a select field")
            if bind.get("kind") == "class_toggle" and (field_type != "checkbox" or not bind.get("class_name")):
                _fail("editor class toggle must use a checkbox and class_name")
            if bind.get("kind") == "media" and field_type != "media":
                _fail("editor media binding must use a media field")
            target = bind.get("target")
            if target is not None:
                if not isinstance(target, dict) or set(target) - {"scope", "match"} or target.get("scope") not in _EDITOR_TARGET_SCOPES:
                    _fail("editor component control target is invalid")
                if target.get("scope") == "descendant":
                    _validate_editor_match(target.get("match"), "editor component control target match")
            for key in ("min", "max", "step", "scale"):
                value = field.get(key)
                if value is not None and (not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value)):
                    _fail("editor component control numeric constraint is invalid")
            options = field.get("options", [])
            if not isinstance(options, list) or len(options) > 100:
                _fail("editor component control options are invalid")
            if field_type == "select" and not options:
                _fail("editor select field must declare options")
            if field_type != "select" and options:
                _fail("only editor select fields can declare options")
            for option in options:
                if not isinstance(option, dict) or set(option) - {"value", "label", "class_name"}:
                    _fail("editor component control option is invalid")
                if not isinstance(option.get("value"), str) or len(option["value"]) > 100:
                    _fail("editor component control option value is invalid")
                if not isinstance(option.get("label"), str) or not option["label"].strip() or len(option["label"]) > 200:
                    _fail("editor component control option label is invalid")
                class_name = option.get("class_name")
                if class_name is not None and (not isinstance(class_name, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{0,99}", class_name)):
                    _fail("editor component control option class is invalid")
                if bind.get("kind") == "style" and (
                    any(token in option["value"].casefold() for token in ("url(", "expression(", ";", "{", "}"))
                ):
                    _fail("editor component control style option is unsafe")


def _fail(message: str) -> None:
    raise ThemePackageError(message)


def _storage_root(value: str | Path | None) -> Path:
    if value is None:
        value = Path(settings.app.web_media_dir).expanduser().resolve().parent / "themes"
    root = Path(value).expanduser().resolve()
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    return root


def _safe_id(value: Any, label: str, *, max_length: int = 120) -> str:
    if not isinstance(value, str) or not (1 <= len(value) <= max_length) or not _ID_RE.fullmatch(value):
        _fail(f"{label} must be a lowercase stable identifier")
    return value


def _schema_version(document: dict[str, Any], label: str) -> int:
    first = document.get("schema_version")
    alternate = document.get("package_schema_version")
    if first is not None and alternate is not None and first != alternate:
        _fail(f"{label} has conflicting schema versions")
    value = first if first is not None else alternate
    if value != PACKAGE_SCHEMA_VERSION:
        _fail(f"Unsupported {label} schema version")
    return value


def _load_json(content: bytes, path: str) -> dict[str, Any]:
    try:
        value = json.loads(content.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ThemePackageError(f"{path} is not valid UTF-8 JSON") from exc
    if not isinstance(value, dict):
        _fail(f"{path} must contain a JSON object")
    _validate_json_shape(value, path)
    return value


def _validate_json_shape(value: Any, label: str) -> None:
    nodes = 0
    stack: list[tuple[Any, int]] = [(value, 1)]
    while stack:
        item, depth = stack.pop()
        nodes += 1
        if nodes > MAX_JSON_NODES or depth > MAX_JSON_DEPTH:
            _fail(f"{label} is too complex")
        if isinstance(item, dict):
            for key, child in item.items():
                if not isinstance(key, str) or len(key) > 200:
                    _fail(f"{label} contains an invalid object key")
                if key.casefold() in {"__proto__", "prototype", "constructor"}:
                    _fail(f"{label} contains a forbidden object key")
                stack.append((child, depth + 1))
        elif isinstance(item, list):
            stack.extend((child, depth + 1) for child in item)
        elif isinstance(item, str):
            if len(item) > MAX_JSON_STRING:
                _fail(f"{label} contains an oversized string")
        elif item is not None and not isinstance(item, (bool, int, float)):
            _fail(f"{label} contains a non-JSON value")
        elif isinstance(item, float) and not math.isfinite(item):
            _fail(f"{label} contains a non-finite number")


def _validate_asset_reference(value: str, label: str, archive_paths: set[str]) -> None:
    """Require static theme media references to stay in the package namespace."""
    references = [value]
    if "," in value:  # srcset: ``path 1x, path 2x``
        references = [item.strip().split()[0] for item in value.split(",") if item.strip()]
    for raw in references:
        if not raw:
            continue
        try:
            path = _normalise_member_name(raw)
        except ThemePackageError as exc:
            raise ThemePackageError(f"{label} contains an unsafe asset reference") from exc
        if not path.startswith("assets/") or path not in archive_paths:
            _fail(f"{label} references an asset outside its declared namespace")


def _validate_project_data(value: Any, label: str, archive_paths: set[str]) -> dict[str, Any]:
    if not isinstance(value, dict):
        _fail(f"{label} project_data must be an object")
    _validate_json_shape(value, label)
    stack: list[Any] = [value]
    while stack:
        item = stack.pop()
        if isinstance(item, dict):
            for key, child in item.items():
                lowered = key.casefold()
                if lowered.startswith("on") and len(lowered) > 2:
                    _fail(f"{label} contains an event-handler property")
                if lowered in {"script", "script-export", "componentscript"}:
                    _fail(f"{label} contains an executable component property")
                if lowered in {"tagname", "type"} and isinstance(child, str) and child.casefold() in {
                    "script", "iframe", "object", "embed",
                }:
                    _fail(f"{label} contains an executable component type")
                if lowered in {"src", "srcset", "poster"} and isinstance(child, str):
                    _validate_asset_reference(child, label, archive_paths)
                stack.append(child)
        elif isinstance(item, (list, tuple)):
            stack.extend(item)
        elif isinstance(item, str) and _DANGEROUS_PROJECT_TEXT.search(item):
            _fail(f"{label} contains executable markup or a dangerous URL")
    return value


def _validate_css(css: str, path: str, archive_paths: set[str]) -> str:
    if len(css.encode("utf-8")) > MAX_MEMBER_SIZE:
        _fail(f"{path} CSS is too large")
    if _FORBIDDEN_CSS.search(css):
        _fail(f"{path} contains forbidden CSS")
    # CSS Images permits quoted URLs inside image-set() without url().  Until
    # those values are parsed and rewritten, reject the construct rather than
    # allowing an untrusted theme to trigger third-party visitor requests.
    if _CSS_IMAGE_SET.search(css):
        _fail(f"{path} contains unsupported CSS image-set references")
    for match in _CSS_URL.finditer(css):
        raw = match.group(2).strip()
        if not raw or raw.startswith("#"):
            continue
        if any(ord(char) < 32 for char in raw) or raw.startswith(("/", "//")) or ":" in raw.split("/", 1)[0]:
            _fail(f"{path} contains an external or unsafe CSS URL")
        candidate = PurePosixPath(raw)
        if any(part in {"", ".", ".."} for part in candidate.parts):
            _fail(f"{path} contains a non-canonical CSS URL")
        if raw not in archive_paths or not raw.startswith("assets/"):
            _fail(f"{path} references an undeclared theme asset")
    return css


def _normalise_member_name(raw: str) -> str:
    if not raw or "\x00" in raw or "\\" in raw or len(raw) > MAX_PATH_LENGTH:
        _fail("Archive contains an invalid filename")
    normal = unicodedata.normalize("NFC", raw)
    path = PurePosixPath(normal)
    if path.is_absolute() or len(path.parts) > MAX_PATH_DEPTH:
        _fail(f"Unsafe archive path: {raw}")
    if any(part in {"", ".", ".."} or ":" in part for part in path.parts):
        _fail(f"Unsafe archive path: {raw}")
    return path.as_posix()


def _validate_member_type(info: zipfile.ZipInfo) -> None:
    mode = info.external_attr >> 16
    if not mode:
        return
    kind = stat.S_IFMT(mode)
    if info.is_dir():
        if kind not in {0, stat.S_IFDIR}:
            _fail(f"Archive directory has an unsafe type: {info.filename}")
    elif kind not in {0, stat.S_IFREG}:
        _fail(f"Archive contains a link or non-regular file: {info.filename}")


def _inspect_archive(file_bytes: bytes) -> tuple[zipfile.ZipFile, dict[str, zipfile.ZipInfo]]:
    if not isinstance(file_bytes, bytes) or not file_bytes or len(file_bytes) > MAX_ARCHIVE_SIZE:
        _fail("Theme archive is empty or too large")
    try:
        archive = zipfile.ZipFile(io.BytesIO(file_bytes), "r")
    except (zipfile.BadZipFile, zipfile.LargeZipFile) as exc:
        raise ThemePackageError("Theme package is not a valid ZIP archive") from exc

    files: dict[str, zipfile.ZipInfo] = {}
    canonical_names: set[str] = set()
    total_size = 0
    entry_count = 0
    try:
        for info in archive.infolist():
            entry_count += 1
            if entry_count > MAX_FILE_COUNT:
                _fail("Theme archive contains too many entries")
            name = _normalise_member_name(info.filename.rstrip("/") if info.is_dir() else info.filename)
            canonical = name.casefold()
            if canonical in canonical_names:
                _fail(f"Archive contains duplicate or ambiguous path: {name}")
            canonical_names.add(canonical)
            _validate_member_type(info)
            if info.flag_bits & 0x1:
                _fail(f"Encrypted archive members are not supported: {name}")
            if info.is_dir():
                continue
            if info.file_size > MAX_MEMBER_SIZE:
                _fail(f"Archive member is too large: {name}")
            total_size += info.file_size
            if total_size > MAX_TOTAL_SIZE:
                _fail("Theme archive expands beyond the allowed size")
            if info.file_size and info.file_size / max(info.compress_size, 1) > MAX_COMPRESSION_RATIO:
                _fail(f"Archive member has an unsafe compression ratio: {name}")
            files[name] = info
    except Exception:
        archive.close()
        raise
    return archive, files


def _resource_entries(manifest: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    resources = manifest.get("resources")
    if not isinstance(resources, dict):
        _fail("manifest.json must declare a resources object")
    result: dict[str, list[dict[str, Any]]] = {key: [] for key in (*_DESIGN_KINDS, "styles", "assets", "previews")}
    seen_ids: set[tuple[str, str]] = set()
    seen_paths: set[str] = set()
    for original_kind, values in resources.items():
        kind = _RESOURCE_ALIASES.get(original_kind, original_kind)
        if kind not in result or not isinstance(values, list):
            _fail(f"Unknown or invalid resource group: {original_kind}")
        # Legacy archives used directory names like parts/ and page-templates/.
        # Map those old directories to the consolidated kind for validation.
        path_kind = {"parts": "parts", "page-templates": "page-templates"}.get(original_kind, kind)
        for value in values:
            entry = {"file": value} if isinstance(value, str) else dict(value) if isinstance(value, dict) else None
            if entry is None or not isinstance(entry.get("file"), str):
                _fail(f"Invalid {kind} resource entry")
            if original_kind == "page-templates":
                entry.setdefault("usage_mode", "copy_on_create")
            if set(entry) - _RESOURCE_ENTRY_KEYS:
                _fail(f"{kind} resource entry contains unknown fields")
            path = _normalise_member_name(entry["file"])
            if path in seen_paths:
                _fail(f"Resource file is declared more than once: {path}")
            seen_paths.add(path)
            prefix = path_kind
            if not path.startswith(f"{prefix}/"):
                _fail(f"{kind} resource is outside its namespace: {path}")
            allowed_ext = _ALLOWED_PREFIX_EXTENSIONS.get(kind, _ALLOWED_PREFIX_EXTENSIONS.get(path_kind, {".json"}))
            if PurePosixPath(path).suffix.casefold() not in allowed_ext:
                _fail(f"Disallowed file type for {kind}: {path}")
            entry["file"] = path
            if kind in _DESIGN_KINDS:
                resource_id = _safe_id(entry.get("id"), f"{kind} resource id", max_length=80)
                marker = (kind, resource_id.casefold())
                if marker in seen_ids:
                    _fail(f"Duplicate {kind} resource id: {resource_id}")
                seen_ids.add(marker)
            result[kind].append(entry)
    return result


def _validate_image(content: bytes, path: str) -> None:
    extension = PurePosixPath(path).suffix.casefold()
    if extension == ".avif":
        if len(content) < 16 or content[4:8] != b"ftyp" or content[8:12] not in {b"avif", b"avis"}:
            _fail(f"Image content does not match its extension: {path}")
        return
    if not any(content.startswith(prefix) for prefix in _IMAGE_MAGIC[extension]):
        _fail(f"Image content does not match its extension: {path}")
    if extension == ".webp" and (len(content) < 12 or content[8:12] != b"WEBP"):
        _fail(f"Image content does not match its extension: {path}")


def _validate_asset(content: bytes, path: str) -> None:
    """Validate declarative raster, font, and inert vector assets."""
    extension = PurePosixPath(path).suffix.casefold()
    if extension in _IMAGE_EXTENSIONS:
        _validate_image(content, path)
        return
    if extension == ".svg":
        try:
            source = content.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ThemePackageError(f"SVG is not valid UTF-8: {path}") from exc
        lowered = source.casefold()
        if any(marker in lowered for marker in (
            "<!doctype", "<!entity", "<script", "foreignobject", "javascript:",
            "data:", "url(", "<style", "<animate", "<set", "<use", "<image",
        )):
            _fail(f"SVG contains active or external content: {path}")
        try:
            root = ElementTree.fromstring(source)
        except ElementTree.ParseError as exc:
            raise ThemePackageError(f"SVG is not valid XML: {path}") from exc
        allowed_tags = {"svg", "g", "path", "rect", "circle", "ellipse", "polygon", "polyline"}
        allowed_attrs = {
            "viewBox", "preserveAspectRatio", "width", "height", "fill", "fill-rule",
            "clip-rule", "transform", "d", "x", "y", "x1", "y1", "x2", "y2",
            "cx", "cy", "r", "rx", "ry", "points",
        }
        for element in root.iter():
            tag = element.tag.rsplit("}", 1)[-1]
            if tag not in allowed_tags or set(element.attrib) - allowed_attrs:
                _fail(f"SVG contains unsupported markup: {path}")
            if (element.text or "").strip() or (element.tail or "").strip():
                _fail(f"SVG contains unsupported text: {path}")
            if any(re.search(r"[<>]|(?:javascript|data|url)\s*:", value, re.I) for value in element.attrib.values()):
                _fail(f"SVG contains an unsafe attribute: {path}")
        return
    signatures = {
        ".woff": (b"wOFF",),
        ".woff2": (b"wOF2",),
        ".otf": (b"OTTO",),
        ".ttf": (b"\x00\x01\x00\x00", b"true"),
    }
    if extension not in signatures or not any(content.startswith(prefix) for prefix in signatures[extension]):
        _fail(f"Font content does not match its extension: {path}")


def _read_members(archive: zipfile.ZipFile, files: dict[str, zipfile.ZipInfo]) -> dict[str, bytes]:
    contents: dict[str, bytes] = {}
    actual_total = 0
    for path, info in files.items():
        chunks: list[bytes] = []
        actual_size = 0
        with archive.open(info, "r") as source:
            while True:
                chunk = source.read(64 * 1024)
                if not chunk:
                    break
                actual_size += len(chunk)
                actual_total += len(chunk)
                if actual_size > MAX_MEMBER_SIZE or actual_total > MAX_TOTAL_SIZE or actual_size > info.file_size:
                    _fail(f"Archive member exceeded its declared size: {path}")
                chunks.append(chunk)
        if actual_size != info.file_size:
            _fail(f"Archive member size mismatch: {path}")
        contents[path] = b"".join(chunks)
    return contents


def _qualified_key(theme_id: str, version: str, kind: str, resource_id: str) -> str:
    return f"{theme_id}@{version}:{kind}:{resource_id}"


def _legacy_template_key(qualified_key: str) -> str:
    if len(qualified_key) <= 50:
        return qualified_key
    digest = hashlib.sha256(qualified_key.encode()).hexdigest()[:16]
    return f"{qualified_key[:33]}-{digest}"


def _resource_payload(entry: dict[str, Any], content: bytes, kind: str, archive_paths: set[str]) -> dict[str, Any]:
    document = _load_json(content, entry["file"])
    project_data = document.get("project_data", document)
    project_data = _validate_project_data(project_data, entry["file"], archive_paths)
    name = entry.get("name", document.get("name", entry["id"]))
    description = entry.get("description", document.get("description"))
    if not isinstance(name, str) or not name.strip() or len(name) > 200:
        _fail(f"{entry['file']} has an invalid name")
    if description is not None and (not isinstance(description, str) or len(description) > 2000):
        _fail(f"{entry['file']} has an invalid description")
    css = document.get("css", "")
    css_file = entry.get("css")
    if css_file is not None:
        css_file = _normalise_member_name(css_file)
        if css_file not in archive_paths or not css_file.startswith("styles/"):
            _fail(f"{entry['file']} references a missing CSS file")
    if not isinstance(css, str):
        _fail(f"{entry['file']} CSS must be a string")
    usage_mode = "linked_layout"
    if kind == "templates":
        usage_mode = entry.get("usage_mode", document.get("usage_mode", "linked_layout"))
        if usage_mode not in {"linked_layout", "copy_on_create"}:
            _fail(f"{entry['file']} has an invalid template usage mode")
    prop_schema: list[dict[str, Any]] = []
    default_props: dict[str, Any] = {}
    variants: list[dict[str, Any]] = []
    if kind in {"components", "sections"}:
        try:
            prop_schema = normalise_prop_schema(document.get("prop_schema", document.get("props", [])))
            default_props = normalise_default_props(prop_schema, document.get("default_props", {}))
            variants = normalise_variants(prop_schema, default_props, document.get("variants", []))
        except ResourcePropsError as exc:
            _fail(f"{entry['file']} has invalid props: {exc}")
    return {
        "project_data": project_data,
        "name": name.strip(),
        "description": description,
        "css": css,
        "css_file": css_file,
        "prop_schema": prop_schema,
        "default_props": default_props,
        "variants": variants,
        "usage_mode": usage_mode,
    }


def _validate_tokens(tokens: dict[str, Any]) -> None:
    stack: list[Any] = [tokens]
    while stack:
        item = stack.pop()
        if isinstance(item, dict):
            for key, child in item.items():
                if not re.fullmatch(r"[a-z][a-z0-9_-]{0,79}", key):
                    _fail("Theme tokens contain an invalid token key")
                stack.append(child)
        elif isinstance(item, list):
            stack.extend(item)
        elif isinstance(item, str):
            if _FORBIDDEN_CSS.search(item) or _CSS_URL.search(item) or any(char in item for char in ";{}"):
                _fail("Theme tokens contain an unsafe CSS value")


def _namespace_linked_resources(value: Any, qualified_resources: dict[str, dict[str, str]]) -> Any:
    """Turn package-local linked resource IDs into immutable qualified IDs."""
    if isinstance(value, list):
        return [_namespace_linked_resources(item, qualified_resources) for item in value]
    if not isinstance(value, dict):
        return value
    result = {key: _namespace_linked_resources(child, qualified_resources) for key, child in value.items()}
    component_type = str(result.get("type", "")).casefold()
    resource_id = result.get("resourceId", result.get("resource_id"))
    resource_map: dict[str, str] = {}
    if component_type in {"sc-template-part", "sc-global-part"}:
        resource_map = qualified_resources.get("section", {})
    elif component_type == "sc-resource-instance":
        resource_kind = str(result.get("resourceKind", result.get("resource_kind", "component"))).casefold()
        resource_map = qualified_resources.get(resource_kind, {})
    if isinstance(resource_id, str) and resource_id in resource_map:
        if "resourceId" in result:
            result["resourceId"] = resource_map[resource_id]
        else:
            result["resource_id"] = resource_map[resource_id]
    return result


def _public_asset_url(theme_version_id: int, relative_path: str, *, api: bool = False) -> str:
    prefix = "/api/web/theme-assets" if api else "/theme-assets"
    encoded = "/".join(quote(part, safe="") for part in PurePosixPath(relative_path).parts)
    return f"{prefix}/{theme_version_id}/{encoded}"


def _namespace_asset_references(value: Any, theme_version_id: int) -> Any:
    if isinstance(value, list):
        return [_namespace_asset_references(item, theme_version_id) for item in value]
    if not isinstance(value, dict):
        return value
    result = {key: _namespace_asset_references(child, theme_version_id) for key, child in value.items()}
    for key in tuple(result):
        if key.casefold() not in {"src", "srcset", "poster"} or not isinstance(result[key], str):
            continue
        if key.casefold() == "srcset":
            candidates = []
            for item in result[key].split(","):
                pieces = item.strip().split(maxsplit=1)
                if pieces:
                    url = _public_asset_url(theme_version_id, pieces[0])
                    candidates.append(f"{url} {pieces[1]}" if len(pieces) > 1 else url)
            result[key] = ", ".join(candidates)
        elif result[key]:
            result[key] = _public_asset_url(theme_version_id, result[key])
    return result


def _portable_asset_references(value: Any, theme_version_id: int) -> Any:
    """Restore one installed theme's asset URLs to package-relative paths."""
    prefixes = (
        f"/theme-assets/{theme_version_id}/",
        f"/api/web/theme-assets/{theme_version_id}/",
    )
    if isinstance(value, list):
        return [_portable_asset_references(item, theme_version_id) for item in value]
    if isinstance(value, dict):
        return {key: _portable_asset_references(child, theme_version_id) for key, child in value.items()}
    if isinstance(value, str):
        for prefix in prefixes:
            if value.startswith(prefix):
                return value.removeprefix(prefix)
    return value


def rewrite_theme_asset_urls(css: str, theme_version_id: int, *, api: bool = False) -> str:
    """Rewrite already-validated package CSS assets to a namespaced endpoint."""
    def replace(match: re.Match[str]) -> str:
        quote_char, raw = match.group(1), match.group(2).strip()
        if not raw or raw.startswith("#"):
            return match.group(0)
        url = _public_asset_url(theme_version_id, raw, api=api)
        return f"url({quote_char}{url}{quote_char})"
    return _CSS_URL.sub(replace, css or "")


def resolve_theme_asset_path(version: WebThemeVersion, relative_path: str, *, storage_root: str | Path | None = None) -> Path:
    """Resolve one DB-validated theme asset without following paths outside storage."""
    normal = _normalise_member_name(relative_path)
    if not normal.startswith("assets/"):
        raise ThemePackageError("Theme asset is outside its namespace")
    root = _storage_root(storage_root)
    package = (root / PurePosixPath(version.install_path)).resolve()
    target = (package / PurePosixPath(normal)).resolve()
    if not package.is_relative_to(root) or not target.is_relative_to(package) or target.is_symlink():
        raise ThemePackageError("Theme asset path escapes controlled storage")
    # Bundled themes also have a read-only code-owned source. This fallback
    # keeps API/public/editor processes coherent when they use separate media
    # volumes; callers still verify the DB-declared size/hash metadata.
    if storage_root is None and not target.is_file():
        manifest = version.manifest if isinstance(version.manifest, dict) else {}
        if manifest.get("id") == "ontario" and str(version.install_path).startswith("system/ontario/"):
            bundled_root = (Path(__file__).with_name("builtin_themes") / "ontario").resolve()
            bundled = (bundled_root / PurePosixPath(normal)).resolve()
            if bundled.is_relative_to(bundled_root) and bundled.is_file() and not bundled.is_symlink():
                return bundled
    return target


def _linked_part_references(value: Any) -> set[str]:
    references: set[str] = set()
    stack = [value]
    while stack:
        item = stack.pop()
        if isinstance(item, dict):
            node_type = str(item.get("type", "")).casefold()
            if node_type in {"sc-template-part", "sc-global-part"}:
                resource_id = item.get("resourceId", item.get("resource_id"))
                if isinstance(resource_id, str):
                    references.add(resource_id)
            stack.extend(item.values())
        elif isinstance(item, list):
            stack.extend(item)
    return references


def _cleanup_tree(path: Path) -> None:
    try:
        shutil.rmtree(path)
    except FileNotFoundError:
        return
    except OSError:
        logger.warning("Could not remove theme staging/package directory %s", path, exc_info=True)


def _safe_install_relative(theme_id: str, version: str, package_hash: str) -> str:
    # Inputs already match strict ID/version alphabets. Hash suffix makes the
    # immutable directory unique even before the DB uniqueness check.
    return f"{theme_id}/{version}/{package_hash[:16]}"


def install_theme(
    db: Session,
    file_bytes: bytes,
    *,
    storage_root: str | Path | None = None,
    installed_by_id: int | None = None,
) -> WebThemeVersion:
    """Validate and atomically install one immutable theme version."""
    package_hash = hashlib.sha256(file_bytes).hexdigest() if isinstance(file_bytes, bytes) else ""
    archive, files = _inspect_archive(file_bytes)
    try:
        contents = _read_members(archive, files)
    finally:
        archive.close()
    if "manifest.json" not in contents or "theme.json" not in contents:
        _fail("Theme archive must contain manifest.json and theme.json")

    manifest = _load_json(contents["manifest.json"], "manifest.json")
    theme_data = _load_json(contents["theme.json"], "theme.json")
    if set(manifest) - _MANIFEST_KEYS:
        _fail("manifest.json contains unknown fields")
    if set(theme_data) - _THEME_KEYS:
        _fail("theme.json contains unknown fields")
    schema_version = _schema_version(manifest, "package")
    if "schema_version" in theme_data or "package_schema_version" in theme_data:
        _schema_version(theme_data, "theme")
    theme_id = _safe_id(manifest.get("id"), "theme id")
    version = manifest.get("version")
    if not isinstance(version, str) or len(version) > 50 or not _VERSION_RE.fullmatch(version):
        _fail("Theme version must be semantic-version-like (for example 1.2.3)")
    name = manifest.get("name")
    if not isinstance(name, str) or not name.strip() or len(name) > 200:
        _fail("Theme name is required")
    for field, maximum in (("author", 200), ("description", 4000), ("license", 100)):
        value = manifest.get(field)
        if value is not None and (not isinstance(value, str) or len(value) > maximum):
            _fail(f"Theme {field} is invalid")

    # Validate the theme's declared config schema. Each entry is a typed
    # field used by Template settings (key -> input type + default).
    config_schema = manifest.get("config")
    if config_schema is not None:
        if not isinstance(config_schema, dict) or len(config_schema) > 200:
            _fail("manifest.json config must be an object")
        for key, spec in config_schema.items():
            if not _ID_RE.fullmatch(str(key)):
                _fail(f"config key is invalid: {key}")
            if not isinstance(spec, dict):
                _fail(f"config entry for '{key}' must be an object")
            if set(spec) - {"type", "label", "default", "help", "options", "min", "max", "step", "storage"}:
                _fail(f"config entry for '{key}' contains unknown fields")
            field_type = str(spec.get("type", "text"))
            if field_type not in _CONFIG_TYPES:
                _fail(f"config entry for '{key}' has an unsupported type")
            label = spec.get("label")
            if label is not None and (not isinstance(label, str) or len(label) > 200):
                _fail(f"config entry for '{key}' has an invalid label")
            if "default" in spec and not isinstance(spec["default"], (str, int, float, bool)):
                _fail(f"config entry for '{key}' has an invalid default")
            help_text = spec.get("help")
            if help_text is not None and (not isinstance(help_text, str) or len(help_text) > 500):
                _fail(f"config entry for '{key}' has invalid help text")
            storage = spec.get("storage", "tokens")
            if storage not in _CONFIG_STORAGE:
                _fail(f"config entry for '{key}' has invalid storage")
            if storage == "site_setting" and key not in _THEME_SITE_SETTINGS:
                _fail(f"config entry for '{key}' cannot write that site setting")
            if field_type == "media" and storage != "site_setting":
                _fail(f"config media entry for '{key}' must use site_setting storage")
            options = spec.get("options")
            if field_type == "select":
                if not isinstance(options, list) or not options or len(options) > 100:
                    _fail(f"config select entry for '{key}' must declare options")
                for option in options:
                    if not isinstance(option, dict) or set(option) != {"value", "label"}:
                        _fail(f"config select entry for '{key}' has invalid options")
                    if not isinstance(option["value"], (str, int, float, bool)) or not isinstance(option["label"], str):
                        _fail(f"config select entry for '{key}' has invalid options")
            elif options is not None:
                _fail(f"config entry for '{key}' cannot declare options")
            for bound in ("min", "max", "step"):
                if bound in spec and (not isinstance(spec[bound], (int, float)) or isinstance(spec[bound], bool)):
                    _fail(f"config entry for '{key}' has invalid {bound}")

    # Editor metadata is declarative only. It describes the theme-owned block
    # catalogue and bounded inspector fields; it never executes package code.
    editor_metadata = manifest.get("editor")

    entries = _resource_entries(manifest)
    declared_paths = {entry["file"] for values in entries.values() for entry in values}
    site_resources = manifest.get("site_resources")
    if site_resources is not None:
        if not isinstance(site_resources, str) or _normalise_member_name(site_resources) != "site-resources.json":
            _fail("manifest.json site_resources is invalid")
        declared_paths.add(site_resources)
    allowed_paths = {"manifest.json", "theme.json", *declared_paths}
    unexpected = set(files) - allowed_paths
    missing = declared_paths - set(files)
    if unexpected:
        _fail(f"Archive contains undeclared files: {sorted(unexpected)[0]}")
    if missing:
        _fail(f"Archive is missing a declared file: {sorted(missing)[0]}")

    archive_paths = set(files)
    if editor_metadata is not None:
        _validate_editor_metadata(editor_metadata, archive_paths)
    for kind in ("assets", "previews"):
        for entry in entries[kind]:
            _validate_asset(contents[entry["file"]], entry["file"])

    css_by_path: dict[str, str] = {}
    for entry in entries["styles"]:
        path = entry["file"]
        try:
            css = contents[path].decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ThemePackageError(f"{path} is not UTF-8 CSS") from exc
        css_by_path[path] = _validate_css(css, path, archive_paths)

    design_payloads: dict[str, list[tuple[dict[str, Any], dict[str, Any]]]] = {kind: [] for kind in _DESIGN_KINDS}
    for kind in _DESIGN_KINDS:
        for entry in entries[kind]:
            payload = _resource_payload(entry, contents[entry["file"]], kind, archive_paths)
            if payload["css_file"]:
                payload["css"] = css_by_path[payload["css_file"]]
            payload["css"] = _validate_css(payload["css"], entry["file"], archive_paths)
            design_payloads[kind].append((entry, payload))
    if not design_payloads["templates"]:
        _fail("A theme must provide at least one layout")
    qualified_resources = {
        "component": {
            entry["id"]: _qualified_key(theme_id, version, "components", entry["id"])
            for entry, _payload in design_payloads["components"]
        },
        "section": {
            entry["id"]: _qualified_key(theme_id, version, "sections", entry["id"])
            for entry, _payload in design_payloads["sections"]
        },
    }
    for resources in design_payloads.values():
        for _entry, payload in resources:
            payload["project_data"] = _namespace_linked_resources(payload["project_data"], qualified_resources)

    tokens = theme_data.get("tokens", theme_data.get("default_tokens", {}))
    if not isinstance(tokens, dict):
        _fail("theme.json tokens must be an object")
    _validate_json_shape(tokens, "theme tokens")
    _validate_tokens(tokens)
    requested_styles = theme_data.get("styles", [entry["file"] for entry in entries["styles"]])
    if not isinstance(requested_styles, list) or any(not isinstance(path, str) for path in requested_styles):
        _fail("theme.json styles must be a list")
    if set(requested_styles) - set(css_by_path):
        _fail("theme.json references an undeclared stylesheet")
    base_css = "\n".join(css_by_path[path] for path in requested_styles)

    existing_theme = db.query(WebTheme).filter_by(stable_key=theme_id).one_or_none()
    if existing_theme:
        existing = db.query(WebThemeVersion).filter_by(theme_id=existing_theme.id, version=version).one_or_none()
        if existing:
            if existing.package_hash == package_hash:
                return existing
            raise ThemeConflictError("This theme version is already installed from a different package")

    root = _storage_root(storage_root)
    relative_install_path = _safe_install_relative(theme_id, version, package_hash)
    final_path = (root / PurePosixPath(relative_install_path)).resolve()
    if not final_path.is_relative_to(root):  # defense in depth around future ID format changes
        _fail("Resolved theme path escapes the theme storage root")
    if final_path.exists():
        raise ThemeConflictError("Theme package directory already exists")

    staging = Path(tempfile.mkdtemp(prefix=".theme-staging-", dir=root))
    moved = False
    try:
        for path, content in contents.items():
            target = (staging / PurePosixPath(path)).resolve()
            if not target.is_relative_to(staging):
                _fail("Theme member escaped the staging directory")
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            with target.open("xb") as stream:
                stream.write(content)
        final_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.replace(staging, final_path)
        moved = True

        theme = existing_theme
        if theme is None:
            theme = WebTheme(
                stable_key=theme_id,
                name=name.strip(),
                author=manifest.get("author"),
                description=manifest.get("description"),
                license=manifest.get("license"),
            )
            db.add(theme)
            db.flush()
        theme_version = WebThemeVersion(
            theme_id=theme.id,
            version=version,
            schema_version=schema_version,
            manifest=manifest,
            default_tokens=tokens,
            base_css=base_css,
            package_hash=package_hash,
            install_path=relative_install_path,
            installed_by_id=installed_by_id,
        )
        db.add(theme_version)
        db.flush()
        if editor_metadata is not None:
            stored_manifest = dict(manifest)
            stored_manifest["editor"] = _namespace_asset_references(editor_metadata, theme_version.id)
            theme_version.manifest = stored_manifest

        for path, content in contents.items():
            mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
            db.add(WebThemeAsset(
                theme_version_id=theme_version.id,
                relative_path=path,
                mime=mime,
                size=len(content),
                sha256=hashlib.sha256(content).hexdigest(),
            ))

        installed_projects: list[dict[str, Any]] = []
        # Keep the concrete rows as well as their projects. Package files stay
        # the install baseline while DB drafts are first-class editable catalog
        # entries and therefore need preview artifacts as well.
        installed_preview_items: list[tuple[str, Any]] = []
        for kind, model in _DESIGN_KINDS.items():
            for entry, payload in design_payloads[kind]:
                qualified = _qualified_key(theme_id, version, kind, entry["id"])
                namespaced_project = _namespace_asset_references(payload["project_data"], theme_version.id)
                common = dict(
                    name=payload["name"],
                    description=payload["description"],
                    project_data=namespaced_project,
                    css=payload["css"],
                    theme_version_id=theme_version.id,
                    created_by_id=installed_by_id,
                )
                if model is WebTemplate:
                    row = model(
                        key=_legacy_template_key(qualified),
                        qualified_key=qualified,
                        html="",
                        template_kind=entry.get("kind", "layout"),
                        usage_mode=payload["usage_mode"],
                        published_project_data=namespaced_project,
                        published_css=payload["css"],
                        published_version=1,
                        is_system=False,
                        **common,
                    )
                else:
                    resource_values = {}
                    if model in {WebReusableComponent, WebSection}:
                        resource_values = {
                            "prop_schema": payload["prop_schema"],
                            "default_props": payload["default_props"],
                            "variants": payload["variants"],
                            "published_project_data": namespaced_project,
                            "published_css": payload["css"],
                            "published_prop_schema": payload["prop_schema"],
                            "published_default_props": payload["default_props"],
                            "published_variants": payload["variants"],
                            "published_version": 1,
                        }
                    row = model(qualified_key=qualified, is_locked=True, **resource_values, **common)
                db.add(row)
                installed_projects.append(namespaced_project)
                installed_preview_items.append((kind, row))
        db.flush()
        try:
            for project_data in installed_projects:
                validate_linked_resource_instances(db, project_data, published=True)
        except ResourcePropsError as exc:
            _fail(f"Theme contains an invalid linked resource: {exc}")
        # Generate artifacts while the installation transaction still owns the
        # resource rows.  A failed preview must not make a valid declarative
        # theme un-installable: catalog serialization retains its SVG fallback
        # and a later regenerate operation can fill the artifact in.
        for kind, row in installed_preview_items:
            try:
                build_preview(
                    db,
                    kind,
                    row.id,
                    row.project_data or {},
                    row.css or "",
                    base_css=base_css,
                    tokens=tokens,
                    title=row.name,
                    browser_render=False,
                )
            except Exception:  # noqa: BLE001 - previews are best-effort artifacts
                logger.warning(
                    "Could not generate preview for installed theme resource %s/%s",
                    kind,
                    row.id,
                    exc_info=True,
                )
        db.commit()
        db.refresh(theme_version)
        return theme_version
    except IntegrityError as exc:
        db.rollback()
        if moved:
            _cleanup_tree(final_path)
        raise ThemeConflictError("Theme identity or resource namespace is already installed") from exc
    except Exception:
        db.rollback()
        if moved:
            _cleanup_tree(final_path)
        raise
    finally:
        if staging.exists():
            _cleanup_tree(staging)


def activate_theme(db: Session, theme_version_id: int, *, updated_by_id: int | None = None) -> WebSiteStyle:
    version = db.get(WebThemeVersion, theme_version_id)
    if version is None:
        raise ThemeNotFoundError("Theme version was not found")
    templates = db.query(WebTemplate).filter_by(theme_version_id=version.id).all()
    if not templates or not any(template.published_project_data for template in templates):
        raise ThemePackageError("Theme has no usable published page template")
    # Installation validates the archive boundary; activation additionally
    # proves that every linked runtime tree is compilable before changing the
    # live pointer.
    from .renderer import CompileError, compile_project
    try:
        for template in templates:
            if template.published_project_data:
                compile_project(template.published_project_data)
                validate_linked_resource_instances(db, template.published_project_data, published=True)
        for model in (WebReusableComponent, WebSection):
            for resource in db.query(model).filter_by(theme_version_id=version.id).all():
                if resource.published_project_data:
                    compile_project(resource.published_project_data)
                    validate_linked_resource_instances(db, resource.published_project_data, published=True)
    except (CompileError, ResourcePropsError) as exc:
        raise ThemePackageError(f"Theme contains an invalid published template: {exc}") from exc
    all_sections = db.query(WebSection).all()
    available_section_keys = {row.qualified_key for row in all_sections}
    referenced_by_templates = {
        reference
        for template in templates
        for reference in _linked_part_references(template.published_project_data or template.project_data)
    }
    referenced_by_parts = {
        reference
        for section in all_sections
        if section.theme_version_id == version.id
        for reference in _linked_part_references(section.published_project_data or section.project_data)
    }
    missing_parts = {
        reference
        for reference in referenced_by_templates | referenced_by_parts
        if reference not in available_section_keys
    }
    if missing_parts:
        raise ThemePackageError(f"Theme references a missing template part: {sorted(missing_parts)[0]}")
    package_parts = {section.qualified_key: section for section in all_sections if section.theme_version_id == version.id}
    try:
        for part in package_parts.values():
            if part.published_project_data:
                compile_project(part.published_project_data)
    except CompileError as exc:
        raise ThemePackageError(f"Theme contains an invalid published template part: {exc}") from exc
    graph = {
        key: _linked_part_references(part.published_project_data or part.project_data) & set(package_parts)
        for key, part in package_parts.items()
    }
    visiting: set[str] = set()
    visited: set[str] = set()

    def _visit(key: str) -> None:
        if key in visiting:
            raise ThemePackageError("Theme template parts contain a reference cycle")
        if key in visited:
            return
        visiting.add(key)
        for dependency in graph[key]:
            _visit(dependency)
        visiting.remove(key)
        visited.add(key)

    for key in graph:
        _visit(key)
    style = db.get(WebSiteStyle, 1)
    if style is None:
        style = WebSiteStyle(id=1)
        db.add(style)
    # Site-local token and CSS overrides intentionally survive activation.
    style.active_theme_version_id = version.id
    style.updated_by_id = updated_by_id
    theme = db.get(WebTheme, version.theme_id)
    if theme is not None and theme.stable_key == "ontario":
        from .ontario_theme import seed_ontario_menus
        seed_ontario_menus(db, created_by_id=updated_by_id)
    # Public pages serve immutable documents, so the new theme must be
    # materialised before atomically switching the active-theme pointer.
    from .pages import rebuild_published_page_artifacts
    rebuild_published_page_artifacts(db)
    db.commit()
    db.refresh(style)
    return style


def _version_resource_ids(db: Session, version_id: int) -> tuple[list[int], list[int]]:
    template_ids = [row[0] for row in db.query(WebTemplate.id).filter_by(theme_version_id=version_id).all()]
    section_ids = [row[0] for row in db.query(WebSection.id).filter_by(theme_version_id=version_id).all()]
    return template_ids, section_ids


def _contains_resource_reference(value: Any, qualified_keys: set[str]) -> bool:
    if not qualified_keys:
        return False
    stack = [value]
    while stack:
        item = stack.pop()
        if isinstance(item, dict):
            resource = item.get("resourceId", item.get("resource_id"))
            if isinstance(resource, str) and resource in qualified_keys:
                return True
            stack.extend(item.values())
        elif isinstance(item, list):
            stack.extend(item)
    return False


def _contains_theme_asset_reference(value: Any, theme_version_id: int) -> bool:
    needle = f"/theme-assets/{theme_version_id}/"
    stack = [value]
    while stack:
        item = stack.pop()
        if isinstance(item, dict):
            stack.extend(item.values())
        elif isinstance(item, (list, tuple)):
            stack.extend(item)
        elif isinstance(item, str) and needle in item:
            return True
    return False


def uninstall_theme(db: Session, theme_version_id: int, *, storage_root: str | Path | None = None) -> None:
    version = db.get(WebThemeVersion, theme_version_id)
    if version is None:
        raise ThemeNotFoundError("Theme version was not found")
    style = db.get(WebSiteStyle, 1)
    if style and style.active_theme_version_id == version.id:
        raise ThemeInUseError("The active theme cannot be uninstalled")
    template_ids, section_ids = _version_resource_ids(db, version.id)
    # Older versions created editable copies outside the theme scope. Treat
    # provenance as ownership as well, so uninstall/reinstall cannot leave
    # those stale definitions in the database or catalog.
    theme_template_ids = list(template_ids)
    template_ids.extend(row[0] for row in db.query(WebTemplate.id).filter(WebTemplate.forked_from_id.in_(theme_template_ids)).all()) if theme_template_ids else None
    owned_resource_ids: dict[type, list[int]] = {}
    for model in (WebReusableComponent, WebSection, WebPattern):
        imported = [row[0] for row in db.query(model.id).filter_by(theme_version_id=version.id).all()]
        owned_resource_ids[model] = imported + ([row[0] for row in db.query(model.id).filter(model.origin_resource_id.in_(imported)).all()] if imported else [])
    templates = db.query(WebTemplate).filter(WebTemplate.id.in_(template_ids)).all() if template_ids else []
    sections = db.query(WebSection).filter(WebSection.id.in_(owned_resource_ids[WebSection])).all() if owned_resource_ids[WebSection] else []
    qualified_keys = {row.qualified_key for row in (*templates, *sections) if row.qualified_key}
    for model in (WebReusableComponent, WebSection, WebPattern):
        ids = owned_resource_ids[model]
        if ids:
            qualified_keys.update(row[0] for row in db.query(model.qualified_key).filter(model.id.in_(ids)).all() if row[0])
    legacy_template_keys = {row.key for row in templates}
    if template_ids and db.query(WebPageRevision).filter(WebPageRevision.template_id.in_(template_ids)).first():
        raise ThemeInUseError("A page revision references this theme")
    if template_ids and db.query(WebPage).filter(WebPage.template_id.in_(template_ids)).first():
        raise ThemeInUseError("A page draft references this theme")
    if legacy_template_keys and db.query(WebPage).filter(WebPage.template.in_(legacy_template_keys)).first():
        raise ThemeInUseError("A page draft references this theme")
    json_owners: list[tuple[Any, ...]] = []
    json_owners.extend((page.data,) for page in db.query(WebPage).all())
    json_owners.extend((revision.data, revision.compiled_tree) for revision in db.query(WebPageRevision).all())
    json_owners.extend(
        (row.project_data, row.published_project_data)
        for row in db.query(WebTemplate).all()
        if row.theme_version_id != version.id
    )

    for model in (WebReusableComponent, WebSection, WebPattern):
        json_owners.extend(
            (row.project_data, getattr(row, "published_project_data", None))
            for row in db.query(model).all()
            if row.theme_version_id != version.id
        )
    for values in json_owners:
        if any(_contains_resource_reference(value, qualified_keys) for value in values):
            raise ThemeInUseError("CMS content references a linked resource from this theme")
    asset_owners: list[Any] = []
    asset_owners.extend((page.data, page.html) for page in db.query(WebPage).all())
    asset_owners.extend(
        (revision.data, revision.compiled_tree, revision.compiled_css, revision.html)
        for revision in db.query(WebPageRevision).all()
    )
    asset_owners.extend(
        (row.project_data, row.published_project_data, row.css, row.published_css)
        for row in db.query(WebTemplate).all() if row.theme_version_id != version.id
    )

    for model in (WebReusableComponent, WebSection, WebPattern):
        asset_owners.extend(
            (
                row.project_data,
                getattr(row, "published_project_data", None),
                row.css,
                getattr(row, "published_css", None),
            )
            for row in db.query(model).all() if row.theme_version_id != version.id
        )
    style_row = db.get(WebSiteStyle, 1)
    if style_row:
        asset_owners.append((style_row.draft_css, style_row.published_css))
    if any(_contains_theme_asset_reference(owner, version.id) for owner in asset_owners):
        raise ThemeInUseError("CMS content references an asset from this theme")

    root = _storage_root(storage_root)
    package_path = (root / PurePosixPath(version.install_path)).resolve()
    if not package_path.is_relative_to(root):
        raise ThemePackageError("Stored theme path escapes the controlled root")
    moved_path: Path | None = None
    delete_stage: Path | None = None
    if package_path.exists():
        if package_path.is_symlink() or not package_path.is_dir():
            raise ThemePackageError("Stored theme path is not a regular directory")
        delete_stage = Path(tempfile.mkdtemp(prefix=".theme-delete-", dir=root))
        moved_path = delete_stage / "package"
        os.replace(package_path, moved_path)

    try:
        # Theme-owned custom definitions share the same lifecycle as their
        # active theme. Uninstall must not leave detached catalog remnants.
        if template_ids:
            db.query(WebTemplate).filter(WebTemplate.id.in_(template_ids)).delete(synchronize_session=False)
        for model in (WebReusableComponent, WebSection, WebPattern):
            ids = owned_resource_ids[model]
            if ids:
                db.query(model).filter(model.id.in_(ids)).delete(synchronize_session=False)
        db.query(WebThemeAsset).filter_by(theme_version_id=version.id).delete(synchronize_session=False)
        theme_id = version.theme_id
        db.delete(version)
        db.flush()
        if db.query(WebThemeVersion).filter_by(theme_id=theme_id).count() == 0:
            theme = db.get(WebTheme, theme_id)
            if theme:
                db.delete(theme)
        db.commit()
    except Exception:
        db.rollback()
        if moved_path and moved_path.exists() and not package_path.exists():
            package_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            os.replace(moved_path, package_path)
        raise
    if delete_stage and delete_stage.exists():
        _cleanup_tree(delete_stage)


def list_themes(db: Session) -> list[dict[str, Any]]:
    active = db.get(WebSiteStyle, 1)
    active_id = active.active_theme_version_id if active else None
    result = []
    for theme in db.query(WebTheme).order_by(WebTheme.name.asc()).all():
        versions = db.query(WebThemeVersion).filter_by(theme_id=theme.id).order_by(WebThemeVersion.installed_at.desc()).all()
        theme_preview = None
        version_items = []
        for version in versions:
            preview = _theme_preview_asset(db, version.id)
            if not preview:
                # Fall back to a wireframe derived from the theme's page
                # templates so the theme card always shows a preview.
                templates = db.query(WebTemplate).filter_by(theme_version_id=version.id).all()
                if templates:
                    preview = theme_preview_svg(
                        [{"project_data": tpl.project_data or tpl.published_project_data} for tpl in templates],
                        name=theme.name,
                    )
            if not theme_preview and preview:
                theme_preview = preview
            version_items.append({
                "id": version.id,
                "version": version.version,
                "schema_version": version.schema_version,
                "installed_at": version.installed_at.isoformat() if version.installed_at else None,
                "active": version.id == active_id,
                "preview_url": preview,
                "config": (version.manifest or {}).get("config", {}),
            })
        result.append({
            "id": theme.id,
            "stable_key": theme.stable_key,
            "name": theme.name,
            "author": theme.author,
            "description": theme.description,
            "license": theme.license,
            "preview_url": theme_preview,
            "versions": version_items,
        })
    return result


def _theme_preview_asset(db: Session, theme_version_id: int) -> str | None:
    for name in ("preview.png", "preview.jpg", "previews/preview.png", "previews/preview.jpg"):
        asset = db.query(WebThemeAsset).filter_by(
            theme_version_id=theme_version_id, relative_path=name,
        ).one_or_none()
        if asset:
            return f"/api/web/theme-assets/{theme_version_id}/{asset.relative_path}"
    return None


def inspect_theme(db: Session, theme_version_id: int) -> dict[str, Any]:
    version = db.get(WebThemeVersion, theme_version_id)
    if version is None:
        raise ThemeNotFoundError("Theme version was not found")
    theme = db.get(WebTheme, version.theme_id)
    assets = db.query(WebThemeAsset).filter_by(theme_version_id=version.id).order_by(WebThemeAsset.relative_path).all()
    return {
        "id": version.id,
        "theme": {
            "id": theme.id,
            "stable_key": theme.stable_key,
            "name": theme.name,
            "author": theme.author,
            "description": theme.description,
            "license": theme.license,
        },
        "version": version.version,
        "schema_version": version.schema_version,
        "manifest": version.manifest,
        "config": (version.manifest or {}).get("config", {}),
        "default_tokens": version.default_tokens or {},
        "package_hash": version.package_hash,
        "assets": [
            {"path": asset.relative_path, "mime": asset.mime, "size": asset.size, "sha256": asset.sha256}
            for asset in assets
        ],
    }



def export_theme_archive(db: Session, theme_version_id: int, *, include_site_resources: bool = True) -> bytes:
    """Export an installed theme as a ZIP archive suitable for reinstall.

    For system themes with no physical storage directory we build a minimal
    redistributable archive from the database records (manifest + css).
    """
    version = db.get(WebThemeVersion, theme_version_id)
    if version is None:
        raise ThemeNotFoundError("Theme version was not found")
    root = _storage_root(None)
    package_path = (root / PurePosixPath(version.install_path)).resolve()

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        manifest_payload: dict[str, Any] | None = None
        if package_path.is_dir() and package_path.is_relative_to(root):
            for path in sorted(package_path.rglob("*")):
                if not path.is_file():
                    continue
                relative = path.relative_to(package_path).as_posix()
                # The manifest is rewritten below when the export contains
                # site-owned definitions, otherwise a second ZIP member would
                # make a package deliberately fail duplicate-path validation.
                if relative == "manifest.json" and include_site_resources:
                    try:
                        manifest_payload = json.loads(path.read_text(encoding="utf-8"))
                    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
                        raise ThemePackageError("Installed theme manifest is invalid") from exc
                    continue
                archive.write(path, arcname=relative)

        # Build manifest.json and theme.json from DB when the physical
        # package directory is missing (system / cloned themes).
        has_manifest = any(n == "manifest.json" for n in archive.namelist())
        if not has_manifest:
            manifest_payload = manifest_payload or dict(version.manifest or {})
            theme = db.get(WebTheme, version.theme_id)
            manifest_payload.setdefault("id", "theme")
            manifest_payload.setdefault("name", "Theme")
            manifest_payload.setdefault("version", version.version)
            manifest_payload.setdefault("schema_version", PACKAGE_SCHEMA_VERSION)
            if theme is not None:
                manifest_payload.update({
                    "id": theme.stable_key,
                    "name": theme.name,
                    "author": theme.author,
                    "description": theme.description,
                    "license": theme.license,
                    "version": version.version,
                })

            archive.writestr("styles/theme.css", version.base_css or "")
            archive.writestr("theme.json", json.dumps({
                "tokens": version.default_tokens or {},
                "styles": ["styles/theme.css"],
            }, indent=2, ensure_ascii=False))

            def portable_project(value: Any) -> Any:
                return _portable_asset_references(value, version.id)

            if isinstance(manifest_payload.get("editor"), dict):
                manifest_payload["editor"] = portable_project(manifest_payload["editor"])

            resources: dict[str, list[Any]] = {
                "templates": [], "components": [], "sections": [], "patterns": [],
                "styles": ["styles/theme.css"], "assets": [], "previews": [],
            }
            for kind, model in _DESIGN_KINDS.items():
                rows = db.query(model).filter_by(theme_version_id=version.id).order_by(model.id).all()
                for row in rows:
                    key = (row.qualified_key or str(row.id)).split(":")[-1]
                    file_name = f"{kind}/{key}.json"
                    document = {
                        "name": row.name,
                        "description": row.description,
                        "project_data": portable_project(
                            getattr(row, "published_project_data", None) or row.project_data or {}
                        ),
                        "css": getattr(row, "published_css", None) or row.css or "",
                    }
                    entry: dict[str, Any] = {"id": key, "file": file_name}
                    if kind == "templates":
                        document["usage_mode"] = row.usage_mode or "linked_layout"
                        entry["usage_mode"] = document["usage_mode"]
                    if kind in {"components", "sections"}:
                        document.update({
                            "prop_schema": getattr(row, "published_prop_schema", None) or row.prop_schema or [],
                            "default_props": getattr(row, "published_default_props", None) or row.default_props or {},
                            "variants": getattr(row, "published_variants", None) or row.variants or [],
                        })
                    archive.writestr(file_name, json.dumps(document, indent=2, ensure_ascii=False))
                    resources[kind].append(entry)

            archive_names = set(archive.namelist())
            for asset in db.query(WebThemeAsset).filter_by(theme_version_id=version.id).order_by(WebThemeAsset.relative_path):
                if asset.relative_path in archive_names:
                    group = "previews" if asset.relative_path.startswith("previews/") else "assets"
                    if asset.relative_path.startswith(f"{group}/"):
                        resources[group].append(asset.relative_path)
            manifest_payload["resources"] = resources

        if include_site_resources:
            # A downloaded theme is also the natural hand-off format for an
            # author's own designs.  Keep those definitions in a separate
            # namespace so they cannot overwrite immutable package resources
            # if this ZIP is installed as a theme again.
            def design_record(item, fields: tuple[str, ...]) -> dict[str, Any]:
                return {field: getattr(item, field) for field in fields}

            archive.writestr("site-resources.json", json.dumps({
                "format": "scoutcomp-site-resources",
                "version": 1,
                "templates": [design_record(item, (
                    "key", "qualified_key", "name", "description", "project_data", "css",
                    "published_project_data", "published_css", "template_kind", "usage_mode",
                    "preview_media_id",
                )) for item in db.query(WebTemplate).filter(WebTemplate.theme_version_id.is_(None)).order_by(WebTemplate.id)],
                "components": [design_record(item, (
                    "qualified_key", "name", "description", "project_data", "css", "prop_schema",
                    "default_props", "variants", "published_project_data", "published_css",
                    "published_prop_schema", "published_default_props", "published_variants", "preview_media_id",
                )) for item in db.query(WebReusableComponent).filter(WebReusableComponent.theme_version_id.is_(None)).order_by(WebReusableComponent.id)],
                "sections": [design_record(item, (
                    "qualified_key", "name", "description", "project_data", "css", "prop_schema",
                    "default_props", "variants", "published_project_data", "published_css",
                    "published_prop_schema", "published_default_props", "published_variants", "preview_media_id",
                )) for item in db.query(WebSection).filter(WebSection.theme_version_id.is_(None)).order_by(WebSection.id)],
            }, ensure_ascii=False, indent=2, default=str))

            # Make the author-owned definitions a declared part of the theme
            # archive.  The installer keeps them site-owned (rather than
            # mutating immutable package resources), but accepts and carries
            # the bundle across exports/imports.
            manifest_payload = manifest_payload or dict(version.manifest or {})
            manifest_payload["site_resources"] = "site-resources.json"

        if manifest_payload is not None:
            archive.writestr("manifest.json", json.dumps(manifest_payload, indent=2, ensure_ascii=False))


    return buffer.getvalue()


def duplicate_theme(db: Session, theme_version_id: int, *, new_name: str, installed_by_id: int | None = None) -> WebThemeVersion:
    """Clone an installed theme under a new stable key and name."""
    version = db.get(WebThemeVersion, theme_version_id)
    if version is None:
        raise ThemeNotFoundError("Theme version was not found")

    # Build a new theme entry with a unique stable key derived from the name.
    base = re.sub(r"[^a-z0-9]+", "-", new_name.lower()).strip("-") or "theme-copy"
    base = re.sub(r"-{2,}", "-", base)
    stable_key = base
    counter = 2
    while db.query(WebTheme).filter_by(stable_key=stable_key).one_or_none():
        stable_key = f"{base}-{counter}"
        counter += 1

    theme = WebTheme(
        stable_key=stable_key,
        name=new_name.strip(),
        author=version.manifest.get("author") if isinstance(version.manifest, dict) else None,
        description=version.manifest.get("description") if isinstance(version.manifest, dict) else None,
        license=version.manifest.get("license") if isinstance(version.manifest, dict) else None,
    )
    db.add(theme)
    db.flush()

    # Clone the version. package_hash is UNIQUE and install_path must not
    # collide with the source package, so derive fresh values for the copy.
    clone_hash = hashlib.sha256(
        f"duplicate:{theme.stable_key}:{version.package_hash}".encode()
    ).hexdigest()
    relative_install_path = _safe_install_relative(
        stable_key, version.version, clone_hash
    )
    new_version = WebThemeVersion(
        theme_id=theme.id,
        version=version.version,
        schema_version=version.schema_version,
        manifest=dict(version.manifest or {}),
        default_tokens=version.default_tokens,
        base_css=version.base_css,
        package_hash=clone_hash,
        install_path=relative_install_path,
        installed_by_id=installed_by_id,
    )
    db.add(new_version)
    db.flush()
    source_manifest = dict(version.manifest or {})
    if isinstance(source_manifest.get("editor"), dict):
        portable_editor = _portable_asset_references(source_manifest["editor"], version.id)
        source_manifest["editor"] = _namespace_asset_references(portable_editor, new_version.id)
        new_version.manifest = source_manifest

    # A clone owns its package directory. Reusing only DB rows would leave all
    # image/font endpoints pointing at files that do not exist under the new
    # install path.
    root = _storage_root(None)
    source_path = (root / PurePosixPath(version.install_path)).resolve()
    target_path = (root / PurePosixPath(new_version.install_path)).resolve()
    if source_path.is_dir() and source_path.is_relative_to(root) and target_path.is_relative_to(root):
        shutil.copytree(source_path, target_path)

    # Copy theme asset declarations for the clone (same bytes, new owner).
    for asset in db.query(WebThemeAsset).filter_by(theme_version_id=version.id).all():
        db.add(WebThemeAsset(
            theme_version_id=new_version.id,
            relative_path=asset.relative_path,
            mime=asset.mime,
            size=asset.size,
            sha256=asset.sha256,
        ))
    db.flush()

    # Clone templates/resources from the source theme
    for key, project_data in _copy_design_resources(db, version.id, new_version.id, stable_key):
        if key.startswith("templates:"):
            db.add(WebTemplate(
                key=_legacy_template_key(key),
                name=project_data.get("name", "Cloned template"),
                description=project_data.get("description"),
                html="",
                css=project_data.get("css", ""),
                qualified_key=key,
                template_kind=project_data.get("template_kind", "layout"),
                usage_mode=project_data.get("usage_mode", "linked_layout"),
                project_data=project_data["project_data"],
                published_project_data=project_data["project_data"],
                published_css=project_data.get("css", ""),
                published_version=1,
                theme_version_id=new_version.id,
                is_system=False,
                created_by_id=installed_by_id,
            ))
        elif key.startswith("parts:") or key.startswith("page-templates:"):
            # Legacy parts and page templates consolidated into sections.
            db.add(WebSection(
                qualified_key=key,
                name=project_data.get("name", "Cloned section"),
                description=project_data.get("description"),
                project_data=project_data["project_data"],
                css=project_data.get("css", ""),
                prop_schema=[],
                default_props={},
                variants=[],
                published_project_data=project_data["project_data"],
                published_css=project_data.get("css", ""),
                published_prop_schema=[],
                published_default_props={},
                published_variants=[],
                published_version=1,
                theme_version_id=new_version.id,
                is_locked=False,
                created_by_id=installed_by_id,
            ))
        elif key.startswith("components:"):
            db.add(WebReusableComponent(
                qualified_key=key,
                name=project_data.get("name", "Cloned component"),
                description=project_data.get("description"),
                project_data=project_data["project_data"],
                css=project_data.get("css", ""),
                prop_schema=project_data.get("prop_schema", []),
                default_props=project_data.get("default_props", {}),
                variants=project_data.get("variants", []),
                published_project_data=project_data["project_data"],
                published_css=project_data.get("css", ""),
                published_prop_schema=project_data.get("prop_schema", []),
                published_default_props=project_data.get("default_props", {}),
                published_variants=project_data.get("variants", []),
                published_version=1,
                theme_version_id=new_version.id,
                is_locked=False,
                created_by_id=installed_by_id,
            ))
        elif key.startswith("sections:"):
            db.add(WebSection(
                qualified_key=key,
                name=project_data.get("name", "Cloned section"),
                description=project_data.get("description"),
                project_data=project_data["project_data"],
                css=project_data.get("css", ""),
                prop_schema=project_data.get("prop_schema", []),
                default_props=project_data.get("default_props", {}),
                variants=project_data.get("variants", []),
                published_project_data=project_data["project_data"],
                published_css=project_data.get("css", ""),
                published_prop_schema=project_data.get("prop_schema", []),
                published_default_props=project_data.get("default_props", {}),
                published_variants=project_data.get("variants", []),
                published_version=1,
                theme_version_id=new_version.id,
                is_locked=False,
                created_by_id=installed_by_id,
            ))
        elif key.startswith("patterns:"):
            db.add(WebPattern(
                qualified_key=key,
                name=project_data.get("name", "Cloned pattern"),
                description=project_data.get("description"),
                project_data=project_data["project_data"],
                css=project_data.get("css", ""),
                theme_version_id=new_version.id,
                is_locked=False,
                created_by_id=installed_by_id,
            ))
    db.commit()
    db.refresh(new_version)
    return new_version


def _copy_design_resources(db: Session, source_version_id: int, target_version_id: int, theme_prefix: str):
    """Collect all design resources from a theme version for cloning."""
    result = []
    for model, kind in (
        (WebTemplate, "templates"),
        (WebReusableComponent, "components"),
        (WebSection, "sections"),
        (WebPattern, "patterns"),
    ):
        for row in db.query(model).filter_by(theme_version_id=source_version_id).all():
            old_key = row.qualified_key
            new_key = f"{theme_prefix}@{target_version_id}:{kind}:{old_key.split(':')[-1] if old_key else row.id}"
            result.append((f"{kind}:{new_key}", {
                "name": row.name,
                "description": row.description,
                "project_data": row.project_data or {"scoutcomp": {"schemaVersion": 2}, "pages": []},
                "css": row.css or "",
                "prop_schema": getattr(row, "prop_schema", None) or [],
                "default_props": getattr(row, "default_props", None) or {},
                "variants": getattr(row, "variants", None) or [],
                "template_kind": getattr(row, "template_kind", None) or "layout",
                "usage_mode": getattr(row, "usage_mode", None) or "linked_layout",
            }))
    return result



__all__ = [
    "ThemePackageError",
    "ThemeConflictError",
    "ThemeNotFoundError",
    "ThemeInUseError",
    "install_theme",
    "activate_theme",
    "uninstall_theme",
    "list_themes",
    "inspect_theme",
    "rewrite_theme_asset_urls",
    "resolve_theme_asset_path",
]
