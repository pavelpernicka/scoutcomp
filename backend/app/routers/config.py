from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..dependencies import get_db, require_action
from ..models import Config, RegisteredModule, User
from ..schemas import ConfigResponse, ConfigUpdate

router = APIRouter(tags=["config"])
admin_router = APIRouter(prefix="/admin/config", tags=["admin", "config"])

# Default configuration values
DEFAULT_CONFIG = {
    "app_name": "ScoutComp",
    "app_icon": "",
    "leaderboard_default_view": "total",
    "leaderboard_show_only_default_mode": "false",
    "allow_self_registration": "false"
}


def get_config_value(db: Session, key: str) -> str:
    """Get a config value from database, with fallback to default."""
    # Competition preferences belong to the competitions module.  The legacy
    # global config remains a migration fallback for existing installations.
    if key in {"leaderboard_default_view", "leaderboard_show_only_default_mode"}:
        module = db.query(RegisteredModule).filter_by(code="competitions", installed=True).one_or_none()
        if module and key in (module.settings or {}):
            value = module.settings[key]
            return str(value).lower() if isinstance(value, bool) else str(value)
    config_record = db.query(Config).filter(Config.key == key).first()
    if config_record:
        return config_record.value
    return DEFAULT_CONFIG.get(key, "")


def set_config_value(db: Session, key: str, value: str) -> None:
    """Set a config value in the database."""
    config_record = db.query(Config).filter(Config.key == key).first()
    if config_record:
        config_record.value = value
    else:
        config_record = Config(key=key, value=value)
        db.add(config_record)
    db.commit()


def get_config_bool(db: Session, key: str) -> bool:
    """Get a boolean config value from database."""
    value = get_config_value(db, key)
    return value.lower() in ("true", "1", "yes", "on")


@router.get("/config", response_model=ConfigResponse)
def get_public_config(
    db: Session = Depends(get_db),
) -> ConfigResponse:
    """Get current configuration settings (public endpoint)."""
    return ConfigResponse(
        app_name=get_config_value(db, "app_name"),
        app_icon=get_config_value(db, "app_icon"),
        leaderboard_default_view=get_config_value(db, "leaderboard_default_view"),
        leaderboard_show_only_default_mode=get_config_bool(db, "leaderboard_show_only_default_mode"),
        allow_self_registration=get_config_bool(db, "allow_self_registration"),
    )


@admin_router.get("", response_model=ConfigResponse)
def get_config(
    db: Session = Depends(get_db),
    _: User = Depends(require_action("core.modules.manage")),
) -> ConfigResponse:
    """Get current configuration settings."""
    return ConfigResponse(
        app_name=get_config_value(db, "app_name"),
        app_icon=get_config_value(db, "app_icon"),
        leaderboard_default_view=get_config_value(db, "leaderboard_default_view"),
        leaderboard_show_only_default_mode=get_config_bool(db, "leaderboard_show_only_default_mode"),
        allow_self_registration=get_config_bool(db, "allow_self_registration"),
    )


@admin_router.patch("", response_model=ConfigResponse)
def update_config(
    payload: ConfigUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_action("core.modules.manage")),
) -> ConfigResponse:
    """Update configuration settings."""
    # Update only provided values
    if payload.app_name is not None:
        set_config_value(db, "app_name", payload.app_name)

    if payload.app_icon is not None:
        set_config_value(db, "app_icon", payload.app_icon)

    if payload.leaderboard_default_view is not None:
        set_config_value(db, "leaderboard_default_view", payload.leaderboard_default_view)

    if payload.leaderboard_show_only_default_mode is not None:
        set_config_value(
            db,
            "leaderboard_show_only_default_mode",
            str(payload.leaderboard_show_only_default_mode).lower(),
        )

    if payload.allow_self_registration is not None:
        set_config_value(db, "allow_self_registration", str(payload.allow_self_registration).lower())

    # Return updated configuration
    return ConfigResponse(
        app_name=get_config_value(db, "app_name"),
        app_icon=get_config_value(db, "app_icon"),
        leaderboard_default_view=get_config_value(db, "leaderboard_default_view"),
        leaderboard_show_only_default_mode=get_config_bool(db, "leaderboard_show_only_default_mode"),
        allow_self_registration=get_config_bool(db, "allow_self_registration"),
    )
