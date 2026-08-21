"""Declarative, public data sources consumed by the website renderer.

The contracts in this module deliberately expose dictionaries rather than ORM
objects.  Resolvers are trusted application code, but their output is projected
through the declared public schema before it reaches a page or a preview.
"""
from __future__ import annotations

import base64
import binascii
from dataclasses import dataclass, field
from datetime import datetime
from html import unescape
import json
import re
from types import MappingProxyType
from typing import Any, Callable, Mapping, MutableMapping, Sequence

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..models import Config, RegisteredModule, ScoutEvent, Team, User, WebMedia, WebMenu, WebMenuRevision, WebPage, WebPageRevision, WebPost, WebPostRevision
from ..timezones import utc_storage_to_local
from .url_schemes import event_url, post_url


class DataSourceError(ValueError):
    """Base error raised by the public data-source boundary."""


class DataSourceValidationError(DataSourceError):
    """The caller supplied an unknown or invalid query parameter."""


class DataSourceUnavailableError(DataSourceError):
    """The source is unknown, uninstalled, or disabled."""


@dataclass(frozen=True)
class PublicField:
    """A single explicitly public result field."""

    type: str
    label: str
    description: str = ""
    nullable: bool = True
    fields: Mapping[str, "PublicField"] = field(default_factory=dict)
    recursive: bool = False
    label_key: str | None = None
    description_key: str | None = None

    def __post_init__(self) -> None:
        if self.type not in {"string", "integer", "number", "boolean", "datetime", "url", "object", "array"}:
            raise ValueError(f"Unsupported public field type: {self.type}")
        object.__setattr__(self, "fields", MappingProxyType(dict(self.fields)))

    def as_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "type": self.type,
            "label": self.label,
            "description": self.description,
            "nullable": self.nullable,
            "recursive": self.recursive,
            "label_key": self.label_key,
            "description_key": self.description_key,
        }
        if self.fields:
            result["fields"] = {name: item.as_dict() for name, item in self.fields.items()}
        return result


@dataclass(frozen=True)
class QueryParameter:
    """A validated resolver parameter accepted from persisted page data."""

    type: str
    label: str
    description: str = ""
    required: bool = False
    default: Any = None
    choices: tuple[Any, ...] = ()
    minimum: int | float | None = None
    maximum: int | float | None = None
    label_key: str | None = None
    description_key: str | None = None

    def __post_init__(self) -> None:
        if self.type not in {"string", "integer", "number", "boolean", "datetime"}:
            raise ValueError(f"Unsupported query parameter type: {self.type}")

    def as_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "label": self.label,
            "description": self.description,
            "required": self.required,
            "default": self.default,
            "choices": list(self.choices),
            "minimum": self.minimum,
            "maximum": self.maximum,
            "label_key": self.label_key,
            "description_key": self.description_key,
        }


@dataclass(frozen=True)
class ResolveContext:
    """Safe request metadata available to resolvers."""

    request_path: str = "/"
    locale: str = "cs"
    site_base_url: str = ""
    page_id: int | None = None
    now: datetime | None = None

    @property
    def cache_key(self) -> tuple[Any, ...]:
        return (self.request_path, self.locale, self.site_base_url, self.page_id, self.now)


Resolver = Callable[[Session, Mapping[str, Any], ResolveContext], Mapping[str, Any] | Sequence[Mapping[str, Any]] | None]

# Stored editor documents from before the ownership move retain their original
# source IDs.  Resolve those IDs as Core content while exposing only the new
# canonical IDs in authoring catalogues.
_SOURCE_ALIASES = {
    "web.posts": "core.posts",
    "web.media": "core.media",
}


@dataclass(frozen=True)
class WebDataSourceManifest:
    """Declarative public schema and resolver owned by a ScoutComp module."""

    id: str
    label: str
    description: str
    collection: bool
    fields: Mapping[str, PublicField]
    parameters: Mapping[str, QueryParameter]
    resolver: Resolver
    cache_ttl_seconds: int = 0
    label_key: str | None = None
    description_key: str | None = None

    def __post_init__(self) -> None:
        if not self.id or not all(character.isalnum() or character in {"_", "-"} for character in self.id):
            raise ValueError(f"Invalid data-source id: {self.id!r}")
        if not self.fields:
            raise ValueError(f"Data source '{self.id}' must expose at least one field")
        if self.cache_ttl_seconds < 0:
            raise ValueError("cache_ttl_seconds cannot be negative")
        object.__setattr__(self, "fields", MappingProxyType(dict(self.fields)))
        object.__setattr__(self, "parameters", MappingProxyType(dict(self.parameters)))


DataSourceCache = MutableMapping[tuple[Any, ...], Any]


def _coerce_parameter(name: str, definition: QueryParameter, value: Any) -> Any:
    if value is None or value == "":
        if definition.required and definition.default is None:
            raise DataSourceValidationError(f"Missing required parameter '{name}'")
        return definition.default
    try:
        if definition.type == "string":
            result = str(value)
        elif definition.type == "integer":
            if isinstance(value, bool):
                raise ValueError
            result = int(value)
        elif definition.type == "number":
            if isinstance(value, bool):
                raise ValueError
            result = float(value)
        elif definition.type == "boolean":
            if isinstance(value, bool):
                result = value
            elif str(value).lower() in {"true", "1"}:
                result = True
            elif str(value).lower() in {"false", "0"}:
                result = False
            else:
                raise ValueError
        else:
            result = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError) as exc:
        raise DataSourceValidationError(f"Invalid value for parameter '{name}'") from exc
    if definition.choices and result not in definition.choices:
        raise DataSourceValidationError(f"Invalid value for parameter '{name}'")
    if definition.minimum is not None and result < definition.minimum:
        raise DataSourceValidationError(f"Parameter '{name}' is below its minimum")
    if definition.maximum is not None and result > definition.maximum:
        raise DataSourceValidationError(f"Parameter '{name}' exceeds its maximum")
    return result


def validate_parameters(manifest: WebDataSourceManifest, params: Mapping[str, Any] | None) -> dict[str, Any]:
    supplied = dict(params or {})
    unknown = sorted(set(supplied) - set(manifest.parameters))
    if unknown:
        raise DataSourceValidationError(f"Unknown parameter(s): {', '.join(unknown)}")
    return {
        name: _coerce_parameter(name, definition, supplied.get(name))
        for name, definition in manifest.parameters.items()
        if name in supplied or definition.default is not None or definition.required
    }


def _project_value(value: Any, definition: PublicField, enclosing_fields: Mapping[str, PublicField]) -> Any:
    if value is None:
        return None
    if definition.type == "object":
        fields = enclosing_fields if definition.recursive else definition.fields
        return _project_record(value, fields) if isinstance(value, Mapping) else None
    if definition.type == "array":
        if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
            return []
        fields = enclosing_fields if definition.recursive else definition.fields
        return [_project_record(item, fields) for item in value if isinstance(item, Mapping)]
    return value


def _project_record(record: Mapping[str, Any], fields: Mapping[str, PublicField]) -> dict[str, Any]:
    return {name: _project_value(record.get(name), definition, fields) for name, definition in fields.items()}


def _find_manifest(source_id: str) -> tuple[str, WebDataSourceManifest] | None:
    from ..modules import registry

    source_id = _SOURCE_ALIASES.get(source_id, source_id)
    module_code, separator, local_id = source_id.partition(".")
    if not separator:
        return None
    module = registry.get(module_code)
    if module is None:
        return None
    source = next((item for item in module.web_data_sources if item.id == local_id), None)
    return (module_code, source) if source is not None else None


def _enabled_module_codes(db: Session) -> set[str]:
    return {
        item.code
        for item in db.query(RegisteredModule.code)
        .filter(RegisteredModule.installed.is_(True), RegisteredModule.enabled.is_(True))
        .all()
    }


def _available_module_codes(db: Session) -> set[str]:
    """Enabled modules whose declared dependency chain is also enabled."""
    from ..modules import registry

    enabled = _enabled_module_codes(db)
    available: set[str] = set()
    pending = set(enabled)
    while pending:
        progressed = {
            code for code in pending
            if (manifest := registry.get(code)) is not None
            and set(manifest.dependencies).issubset(available)
        }
        if not progressed:
            break
        available.update(progressed)
        pending -= progressed
    return available


def list_data_sources(db: Session) -> list[dict[str, Any]]:
    """Return the public catalog of enabled sources without mutating registry state."""
    from ..modules import registry

    enabled = _available_module_codes(db)
    result = []
    for module in registry.manifests():
        if module.code not in enabled:
            continue
        for source in module.web_data_sources:
            result.append({
                "id": f"{module.code}.{source.id}",
                "module": module.code,
                "label": source.label,
                "label_key": source.label_key,
                "description": source.description,
                "description_key": source.description_key,
                "collection": source.collection,
                "fields": {name: item.as_dict() for name, item in source.fields.items()},
                "parameters": {name: item.as_dict() for name, item in source.parameters.items()},
                "cache_ttl_seconds": source.cache_ttl_seconds,
            })
    return result


def resolve_data_source(
    db: Session,
    source_id: str,
    params: Mapping[str, Any] | None = None,
    context: ResolveContext | None = None,
    cache: DataSourceCache | None = None,
) -> dict[str, Any] | list[dict[str, Any]] | None:
    """Validate, resolve, and project one enabled public source."""
    canonical_source_id = _SOURCE_ALIASES.get(source_id, source_id)
    found = _find_manifest(canonical_source_id)
    if found is None:
        raise DataSourceUnavailableError(f"Unknown data source '{source_id}'")
    module_code, manifest = found
    if module_code not in _available_module_codes(db):
        raise DataSourceUnavailableError(f"Data source '{source_id}' is unavailable")
    validated = validate_parameters(manifest, params)
    resolve_context = context or ResolveContext()
    canonical_params = json.dumps(validated, sort_keys=True, separators=(",", ":"), default=lambda value: value.isoformat())
    cache_key = (canonical_source_id, canonical_params, resolve_context.cache_key)
    if cache is not None and cache_key in cache:
        return cache[cache_key]
    raw = manifest.resolver(db, validated, resolve_context)
    if manifest.collection:
        if raw is None:
            projected: Any = []
        elif isinstance(raw, Sequence) and not isinstance(raw, (str, bytes)):
            projected = [_project_record(item, manifest.fields) for item in raw if isinstance(item, Mapping)]
        else:
            raise DataSourceError(f"Collection source '{source_id}' returned a scalar")
    else:
        if raw is None:
            projected = None
        elif isinstance(raw, Mapping):
            projected = _project_record(raw, manifest.fields)
        else:
            raise DataSourceError(f"Scalar source '{source_id}' returned a collection")
    if cache is not None:
        cache[cache_key] = projected
    return projected


def resolve_public_source(
    db: Session,
    source_id: str,
    params: Mapping[str, Any] | None = None,
    cache: DataSourceCache | None = None,
) -> dict[str, Any] | list[dict[str, Any]] | None:
    """Renderer-compatible alias for resolving a source in public context."""
    return resolve_data_source(db, source_id, params, ResolveContext(), cache)


_MEDIA_REFERENCE = re.compile(r"/(?:api/web/)?media/(\d+)/file(?:[?#][^\s\"']*)?")


def _media_references(value: Any) -> set[int]:
    if value is None:
        return set()
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, default=str)
    return {int(match) for match in _MEDIA_REFERENCE.findall(text)}


def published_media_ids(db: Session) -> set[int]:
    """Media reachable from the current immutable public snapshots.

    The public data-source catalogue and the public file endpoint share this
    exact boundary, so draft-only uploads and metadata cannot be enumerated by
    visitor-facing repeaters.
    """
    result: set[int] = {
        row[0] for row in db.query(WebMedia.id).filter(WebMedia.is_public.is_(True)).all()
    }
    page_revisions = (
        db.query(WebPageRevision)
        .join(WebPage, WebPage.published_revision_id == WebPageRevision.id)
        .filter(WebPage.published.is_(True), WebPage.deleted_at.is_(None))
        .all()
    )
    for revision in page_revisions:
        if revision.og_image_id is not None:
            result.add(revision.og_image_id)
        result.update(_media_references(revision.compiled_tree or revision.data))
        if revision.reason == "migration":
            result.update(_media_references(revision.html))

    post_revisions = (
        db.query(WebPostRevision)
        .join(WebPost, WebPost.published_revision_id == WebPostRevision.id)
        .filter(WebPost.published.is_(True), WebPost.deleted_at.is_(None))
        .all()
    )
    for revision in post_revisions:
        if revision.cover_media_id is not None:
            result.add(revision.cover_media_id)
        if revision.og_image_id is not None:
            result.add(revision.og_image_id)

    identity_assets = db.query(Config.value).filter(
        Config.key.in_(("web.site_logo", "web.favicon", "web.og_image")),
    ).all()
    for (asset_url,) in identity_assets:
        result.update(_media_references(asset_url))
    return result


def is_media_published(db: Session, media_id: int) -> bool:
    return media_id in published_media_ids(db)


def _plain_public_text(value: str | None, *, limit: int = 500) -> str:
    """Project legacy rich text to safe readable text for repeat/card data."""
    text = re.sub(r"<[^>]*>", " ", value or "")
    return re.sub(r"\s+", " ", unescape(text)).strip()[:limit]


_PUBLIC_AVATAR = re.compile(
    r"^data:image/(?P<format>png|jpeg|webp|gif);base64,(?P<data>[A-Za-z0-9+/=\r\n]+)$",
    re.I,
)


def safe_public_avatar(value: Any) -> str | None:
    """Return a verified raster data URL, never an SVG or executable URL.

    The API stores avatars as user-managed text.  Public CMS data is a
    separate trust boundary, so both the declared MIME type and the decoded
    file signature are checked before an avatar reaches rendered pages.
    """
    text = value.strip() if isinstance(value, str) else ""
    match = _PUBLIC_AVATAR.fullmatch(text)
    if not match:
        return None
    encoded = re.sub(r"\s+", "", match.group("data"))
    try:
        payload = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError):
        return None
    image_format = match.group("format").lower()
    valid_signature = (
        (image_format == "png" and payload.startswith(b"\x89PNG\r\n\x1a\n"))
        or (image_format == "jpeg" and payload.startswith(b"\xff\xd8\xff"))
        or (image_format == "gif" and payload.startswith((b"GIF87a", b"GIF89a")))
        or (
            image_format == "webp" and len(payload) >= 12
            and payload.startswith(b"RIFF") and payload[8:12] == b"WEBP"
        )
    )
    return text if valid_signature else None


def _event_source(db: Session, params: Mapping[str, Any], context: ResolveContext) -> list[dict[str, Any]]:
    is_public = getattr(ScoutEvent, "is_public", None)
    if is_public is None:  # Additive migrations must fail closed on older schemas.
        return []
    # Publicity belongs to the event itself. It must not depend on whether an
    # unrelated CMS page happens to be linked to the same team.
    query = db.query(ScoutEvent).filter(is_public.is_(True))
    if params.get("kind"):
        query = query.filter(ScoutEvent.kind == params["kind"])
    if params.get("team_id") is not None:
        query = query.filter(ScoutEvent.team_id == params["team_id"])
    if params.get("from"):
        if params.get("overlap"):
            # Calendar windows include events which started before the first
            # visible day but are still in progress. An end exactly at the
            # boundary is excluded: both the internal and public calendars
            # treat midnight as the exclusive end of a multi-day event.
            query = query.filter(or_(
                ScoutEvent.starts_at >= params["from"],
                ScoutEvent.ends_at > params["from"],
            ))
        else:
            query = query.filter(ScoutEvent.starts_at >= params["from"])
    if params.get("to"):
        query = query.filter(ScoutEvent.starts_at <= params["to"])
    order = (
        (ScoutEvent.starts_at.desc(), ScoutEvent.id.desc())
        if params.get("sort") == "start_at_desc"
        else (ScoutEvent.starts_at.asc(), ScoutEvent.id.asc())
    )
    limit = params.get("limit", 10)
    offset = (params["page"] - 1) * limit if params.get("page") else params.get("offset", 0)
    events = (
        query
        .outerjoin(User, User.id == ScoutEvent.created_by_id)
        .with_entities(ScoutEvent, User.real_name, User.username, User.avatar)
        .order_by(*order)
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [{
        "id": event.id,
        "title": event.title,
        "description": _plain_public_text(event.description),
        "kind": event.kind,
        "start_at": utc_storage_to_local(event.starts_at),
        "end_at": utc_storage_to_local(event.ends_at),
        "url": event_url(db, event.id),
        "color": event.color,
        "author": real_name or username or "ScoutComp",
        "author_avatar": safe_public_avatar(avatar),
    } for event, real_name, username, avatar in events]


def _plain_public_excerpt(value: str | None) -> str:
    """Compatibility name for the article data-source contract."""
    return _plain_public_text(value)


def _posts_source(db: Session, params: Mapping[str, Any], context: ResolveContext) -> list[dict[str, Any]]:
    publication_time = func.coalesce(WebPost.published_at, WebPostRevision.created_at)
    order = publication_time.asc() if params.get("sort") == "published_at_asc" else publication_time.desc()
    limit = params.get("limit", 10)
    # ``page`` is author-facing pagination. Offset remains available for
    # integrations, but an explicit page deliberately wins for site blocks.
    offset = (params["page"] - 1) * limit if params.get("page") else params.get("offset", 0)
    posts = (
        db.query(WebPostRevision, WebPost.published_at, User.real_name, User.username, User.avatar)
        .join(WebPost, WebPost.published_revision_id == WebPostRevision.id)
        .outerjoin(User, User.id == WebPost.created_by_id)
        .filter(WebPost.deleted_at.is_(None), WebPostRevision.is_publication.is_(True))
        .order_by(order)
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [{
        "id": post.post_id,
        "title": post.title,
        "slug": post.slug,
        # Authors often leave the optional excerpt empty. Cards must still
        # have useful copy, so derive a safe, bounded fallback from the
        # published article body instead of rendering an empty paragraph.
        "excerpt": _plain_public_excerpt(post.excerpt or post.body),
        "published_at": published_at or post.created_at,
        "author": real_name or username or "ScoutComp",
        "author_avatar": safe_public_avatar(avatar),
        "url": post_url(db, post.slug),
        "cover_url": f"/media/{post.cover_media_id}/file" if post.cover_media_id else None,
    } for post, published_at, real_name, username, avatar in posts]


_SAFE_TEAM_LOGO = re.compile(r"^data:image/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$", re.I)


def _teams_source(db: Session, params: Mapping[str, Any], context: ResolveContext) -> list[dict[str, Any]]:
    """Expose team cards independently from CMS pages.

    A CMS page is generic content, not a representation of a team. Team cards
    therefore contain only public profile data; authors choose where they link
    from their own page/menu configuration.
    """
    order = Team.name.desc() if params.get("sort") == "name_desc" else Team.name.asc()
    limit = params.get("limit", 24)
    offset = (params["page"] - 1) * limit if params.get("page") else params.get("offset", 0)
    teams = db.query(Team).order_by(order).offset(offset).limit(limit).all()
    return [{
        "id": team.id,
        "name": team.name,
        "description": team.description,
        "logo_url": (team.logo or "").strip() if _SAFE_TEAM_LOGO.fullmatch((team.logo or "").strip()) else None,
    } for team in teams]

def _media_source(db: Session, params: Mapping[str, Any], context: ResolveContext) -> list[dict[str, Any]]:
    public_ids = published_media_ids(db)
    if not public_ids:
        return []
    query = db.query(WebMedia).filter(WebMedia.id.in_(public_ids))
    deleted_at = getattr(WebMedia, "deleted_at", None)
    if deleted_at is not None:
        query = query.filter(deleted_at.is_(None))
    if params.get("album"):
        query = query.filter(WebMedia.album == params["album"])
    order = WebMedia.created_at.asc() if params.get("sort") == "created_at_asc" else WebMedia.created_at.desc()
    limit = params.get("limit", 24)
    offset = (params["page"] - 1) * limit if params.get("page") else params.get("offset", 0)
    media = query.order_by(order).offset(offset).limit(limit).all()
    return [{
        "id": item.id,
        "filename": item.filename,
        "mime": item.mime,
        "album": item.album,
        "alt": item.alt,
        "caption": item.caption,
        "url": f"/media/{item.id}/file",
    } for item in media]


def _menu_source(db: Session, params: Mapping[str, Any], context: ResolveContext) -> list[dict[str, Any]]:
    menu = db.query(WebMenu).filter(WebMenu.location == params.get("location", "main")).one_or_none()
    if menu is None or menu.published_revision_id is None:
        return []
    revision = db.query(WebMenuRevision).filter_by(id=menu.published_revision_id, menu_id=menu.id).one_or_none()
    return list(revision.tree or []) if revision is not None else []


EVENTS_DATA_SOURCE = WebDataSourceManifest(
    id="events", label="Events", description="Public ScoutComp events.", collection=True,
    fields={
        "id": PublicField("integer", "ID", nullable=False),
        "title": PublicField("string", "Title", nullable=False),
        "description": PublicField("string", "Description"),
        "kind": PublicField("string", "Kind", nullable=False),
        "start_at": PublicField("datetime", "Starts at", nullable=False),
        "end_at": PublicField("datetime", "Ends at"),
        "author": PublicField("string", "Author", nullable=False),
        "author_avatar": PublicField("url", "Author avatar"),
        "url": PublicField("url", "URL"),
        "color": PublicField("string", "Color"),
    },
    parameters={
        "kind": QueryParameter("string", "Kind", choices=("meeting", "trip", "other")),
        "team_id": QueryParameter("integer", "Team", minimum=1),
        # Repeats are compiler-capped at 100. The slightly larger resolver
        # bound lets the calendar fetch 500 events plus one overflow sentinel
        # in a single deterministic publication query.
        "limit": QueryParameter("integer", "Limit", default=10, minimum=1, maximum=501),
        "offset": QueryParameter("integer", "Offset", default=0, minimum=0, maximum=10_000),
        "page": QueryParameter("integer", "Page", minimum=1, maximum=10_000),
        "from": QueryParameter("datetime", "From"),
        "to": QueryParameter("datetime", "To"),
        # Opt-in keeps the long-standing list/repeat meaning of ``from``
        # (starts within the interval) while calendars can request interval
        # overlap semantics for multi-day events.
        "overlap": QueryParameter("boolean", "Include overlapping events", default=False),
        "sort": QueryParameter("string", "Sort", default="start_at_asc", choices=("start_at_asc", "start_at_desc")),
    }, resolver=_event_source, cache_ttl_seconds=60,
    label_key="web.dataSources.events.label", description_key="web.dataSources.events.description",
)

POSTS_DATA_SOURCE = WebDataSourceManifest(
    id="posts", label="Posts", description="Published website posts.", collection=True,
    fields={
        "id": PublicField("integer", "ID", nullable=False), "title": PublicField("string", "Title", nullable=False),
        "slug": PublicField("string", "Slug", nullable=False), "excerpt": PublicField("string", "Excerpt"),
        "published_at": PublicField("datetime", "Published at"), "url": PublicField("url", "URL", nullable=False),
        "cover_url": PublicField("url", "Cover image URL"), "author": PublicField("string", "Author", nullable=False),
        "author_avatar": PublicField("url", "Author avatar"),
    },
    parameters={
        "limit": QueryParameter("integer", "Limit", default=10, minimum=1, maximum=50),
        "offset": QueryParameter("integer", "Offset", default=0, minimum=0, maximum=10_000),
        "page": QueryParameter("integer", "Page", minimum=1, maximum=10_000),
        "sort": QueryParameter("string", "Sort", default="published_at_desc", choices=("published_at_asc", "published_at_desc")),
    }, resolver=_posts_source, cache_ttl_seconds=60,
    label_key="web.dataSources.posts.label", description_key="web.dataSources.posts.description",
)

TEAMS_DATA_SOURCE = WebDataSourceManifest(
    id="teams", label="Teams", description="Public team profile cards independent of CMS pages.", collection=True,
    fields={
        "id": PublicField("integer", "ID", nullable=False),
        "name": PublicField("string", "Name", nullable=False),
        "description": PublicField("string", "Description"),
        "logo_url": PublicField("url", "Logo image URL"),
    },
    parameters={
        "limit": QueryParameter("integer", "Limit", default=24, minimum=1, maximum=50),
        "offset": QueryParameter("integer", "Offset", default=0, minimum=0, maximum=10_000),
        "page": QueryParameter("integer", "Page", minimum=1, maximum=10_000),
        "sort": QueryParameter("string", "Sort", default="name_asc", choices=("name_asc", "name_desc")),
    }, resolver=_teams_source, cache_ttl_seconds=60,
    label_key="web.dataSources.teams.label", description_key="web.dataSources.teams.description",
)

MEDIA_DATA_SOURCE = WebDataSourceManifest(
    id="media", label="Media", description="Website media library.", collection=True,
    fields={
        "id": PublicField("integer", "ID", nullable=False), "filename": PublicField("string", "Filename", nullable=False),
        "mime": PublicField("string", "Media type"), "album": PublicField("string", "Album"),
        "alt": PublicField("string", "Alternative text"), "caption": PublicField("string", "Caption"),
        "url": PublicField("url", "URL", nullable=False),
    },
    parameters={
        "album": QueryParameter("string", "Album"),
        "limit": QueryParameter("integer", "Limit", default=24, minimum=1, maximum=100),
        "offset": QueryParameter("integer", "Offset", default=0, minimum=0, maximum=10_000),
        "page": QueryParameter("integer", "Page", minimum=1, maximum=10_000),
        "sort": QueryParameter("string", "Sort", default="created_at_desc", choices=("created_at_asc", "created_at_desc")),
    }, resolver=_media_source, cache_ttl_seconds=300,
    label_key="web.dataSources.media.label", description_key="web.dataSources.media.description",
)

MENU_CHILD_FIELDS = {
    "id": PublicField("integer", "ID", nullable=False), "label": PublicField("string", "Label", nullable=False),
    "url": PublicField("url", "URL"), "target": PublicField("string", "Target"),
}
MENU_DATA_SOURCE = WebDataSourceManifest(
    id="menu", label="Menu", description="Items from a published website menu.", collection=True,
    fields={**MENU_CHILD_FIELDS, "children": PublicField("array", "Children", recursive=True)},
    parameters={"location": QueryParameter("string", "Location", default="main")},
    resolver=_menu_source, cache_ttl_seconds=60,
    label_key="web.dataSources.menu.label", description_key="web.dataSources.menu.description",
)
