from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..dependencies import get_current_active_user, get_db, require_action
from ..models import RegisteredModule, User
from ..permissions import permission_keys
from ..modules import registry
from ..modules.translations import localized_widget, module_translation_keys

router = APIRouter(prefix="/widgets", tags=["widgets"])
admin_router = APIRouter(prefix="/admin/widgets", tags=["admin", "widgets"])


def _core_settings(db: Session) -> dict:
    record = db.query(RegisteredModule).filter_by(code="core").one_or_none()
    return record.settings or {} if record else {}


def _enabled_ids(core: dict) -> set[str] | None:
    """Enabled widget ids stored in core settings; None means not configured (all enabled)."""
    stored = core.get("widgets_enabled")
    if stored is None:
        return None
    return set(stored)


def _widget_config(core: dict, widget_id: str) -> dict:
    overrides = core.get("widget_config") or {}
    return overrides.get(widget_id) or {}


def _localized_widget_with_config(module_code: str, item: dict, config: dict) -> dict:
    """Keep administrator-provided copy verbatim instead of translating it as a catalogue default."""
    result = {**localized_widget(module_code, item), **config}
    for field in ("title", "text"):
        if field in config:
            result.pop(f"{field}_key", None)
    return result


def _known_widget_ids() -> set[str]:
    return {
        (item.get("id") or f"{manifest.code}.{item['component']}")
        for manifest in registry.manifests()
        for item in manifest.widgets
    }


@router.get("")
def list_widgets(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    """Registered dashboard widgets visible to the current user (enabled modules + permissions)."""
    registry.seed(db)
    permissions = permission_keys(db, current_user)
    records = {m.code: m for m in db.query(RegisteredModule).filter_by(enabled=True, installed=True)}
    core = _core_settings(db)
    enabled_ids = _enabled_ids(core)
    result = []
    for manifest in registry.manifests():
        if manifest.code not in records:
            continue
        for item in manifest.widgets:
            widget_id = item.get("id") or f"{manifest.code}.{item['component']}"
            if item.get("permission") and item["permission"] not in permissions:
                continue
            if enabled_ids is not None and widget_id not in enabled_ids:
                continue
            config = _widget_config(core, widget_id)
            result.append(dict(
                _localized_widget_with_config(manifest.code, item, config),
                id=widget_id,
                module=manifest.code,
            ))
    return result


@admin_router.get("")
def admin_list_widgets(db: Session = Depends(get_db), _: User = Depends(require_action("core.modules.manage"))):
    """All registered widgets across modules with their enabled state."""
    registry.seed(db)
    core = _core_settings(db)
    enabled_ids = _enabled_ids(core)
    modules = {m.code: m for m in registry.manifests()}
    records = {m.code: m for m in db.query(RegisteredModule).filter_by(installed=True)}
    result = []
    for code, manifest in modules.items():
        for item in manifest.widgets:
            widget_id = item.get("id") or f"{manifest.code}.{item['component']}"
            config = _widget_config(core, widget_id)
            localized = _localized_widget_with_config(code, item, config)
            result.append({
                "id": widget_id,
                "module": code,
                "module_name": records[code].name if code in records else manifest.name,
                "module_name_key": module_translation_keys(code)["name_key"],
                "module_installed": code in records,
                "title": localized.get("title", ""),
                "text": localized.get("text", ""),
                "icon": item.get("icon", "fa-puzzle-piece"),
                "component": item.get("component", "link"),
                "width": item.get("width", "col-xl-4"),
                "route": item.get("route"),
                "permission": item.get("permission"),
                "enabled": enabled_ids is None or widget_id in enabled_ids,
                **{key: localized[key] for key in ("title_key", "text_key") if key in localized},
                **{key: value for key, value in config.items() if key == "icon"},
            })
    return result


class WidgetConfig(BaseModel):
    enabled_ids: list[str]


class WidgetItemConfig(BaseModel):
    title: str | None = None
    text: str | None = None
    icon: str | None = None


@admin_router.put("")
def save_widgets(payload: WidgetConfig, db: Session = Depends(get_db), _: User = Depends(require_action("core.modules.manage"))):
    """Persist which registered widgets are shown on the dashboard."""
    unknown = set(payload.enabled_ids) - _known_widget_ids()
    if unknown:
        from fastapi import HTTPException
        raise HTTPException(400, f"Unknown widgets: {', '.join(sorted(unknown))}")
    record = db.query(RegisteredModule).filter_by(code="core").one_or_none()
    if record is None:
        from fastapi import HTTPException
        raise HTTPException(409, "Core module is not installed; cannot store widget configuration")
    settings = dict(record.settings or {})
    settings["widgets_enabled"] = list(payload.enabled_ids)
    record.settings = settings
    db.commit()
    return {"enabled_ids": settings["widgets_enabled"]}


@admin_router.put("/{widget_id}/config")
def update_widget_config(widget_id: str, payload: WidgetItemConfig, db: Session = Depends(get_db), _: User = Depends(require_action("core.modules.manage"))):
    """Store per-widget display overrides (title, text, icon) in core settings."""
    if widget_id not in _known_widget_ids():
        from fastapi import HTTPException
        raise HTTPException(400, f"Unknown widget: {widget_id}")
    record = db.query(RegisteredModule).filter_by(code="core").one_or_none()
    if record is None:
        from fastapi import HTTPException
        raise HTTPException(409, "Core module is not installed; cannot store widget configuration")
    overrides = {key: value for key, value in payload.model_dump().items() if value is not None}
    settings = dict(record.settings or {})
    config = dict(settings.get("widget_config") or {})
    config[widget_id] = {**config.get(widget_id, {}), **overrides}
    settings["widget_config"] = config
    record.settings = settings
    db.commit()
    return {"id": widget_id, **config[widget_id]}
