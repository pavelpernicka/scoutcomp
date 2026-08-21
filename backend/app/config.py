from functools import lru_cache
from pathlib import Path
from typing import List, Optional
import os
from urllib.parse import urlsplit

import yaml
from pydantic import BaseModel, field_validator, ConfigDict


class DatabaseSettings(BaseModel):
    engine: str
    url: str


class TokenSettings(BaseModel):
    access_expire_minutes: int = 30
    refresh_expire_minutes: int = 60 * 24 * 7
    remember_me_refresh_expire_minutes: int = 60 * 24 * 30
    algorithm: str = "HS256"


class FeatureFlags(BaseModel):
    require_email_verification: bool = False
    allow_self_registration: bool = False


class PushSettings(BaseModel):
    enabled: bool = False
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = ""
    # Only browser-vendor Web Push services are valid delivery targets. This
    # allowlist prevents attacker-controlled DNS from becoming an SSRF hop.
    allowed_hosts: List[str] = [
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
        ".notify.windows.com",
    ]


class AppSettings(BaseModel):
    secret_key: str
    default_language: str = "cs"
    supported_languages: List[str] = ["cs", "en"]
    timezone: str = "Europe/Prague"
    token: TokenSettings = TokenSettings()
    features: FeatureFlags = FeatureFlags()
    push: PushSettings = PushSettings()
    developer_mode: bool = False
    web_media_dir: str = "uploads/web"

    @field_validator("supported_languages")
    @classmethod
    def ensure_default_in_languages(cls, value, info):
        default_language = info.data.get("default_language") if info.data else None
        if default_language and default_language not in value:
            return [default_language, *value]
        return value


class MailSettings(BaseModel):
    sender: Optional[str] = None
    smtp_url: Optional[str] = None


class SiteSettings(BaseModel):
    host: str = "0.0.0.0"
    port: int = 8090
    # Canonical public-site origin used by SEO output (e.g. https://web.oddil.cz).
    public_url: str = ""

    @field_validator("public_url")
    @classmethod
    def validate_public_url(cls, value: str) -> str:
        """Keep deployment URLs origin-only so generated public URLs stay portable."""
        text = str(value or "").strip().rstrip("/")
        if not text:
            return ""
        parsed = urlsplit(text)
        hostname = (parsed.hostname or "").lower()
        try:
            port = parsed.port
        except ValueError as exc:
            raise ValueError("site.public_url contains an invalid port") from exc
        if (
            parsed.scheme not in {"http", "https"}
            or not hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
            or parsed.path not in {"", "/"}
            or port == 0
        ):
            raise ValueError("site.public_url must be an absolute origin URL without a path")
        if parsed.scheme != "https" and hostname not in {"localhost", "127.0.0.1", "::1"}:
            raise ValueError("site.public_url must use HTTPS outside localhost")
        return f"{parsed.scheme}://{parsed.netloc}"


class Settings(BaseModel):
    app: AppSettings
    database: DatabaseSettings
    mail: MailSettings = MailSettings()
    site: SiteSettings = SiteSettings()

    model_config = ConfigDict(arbitrary_types_allowed=True)


CONFIG_PATH = Path(__file__).resolve().parents[2] / "config.yaml"
# Fallback for Docker environment where config.yaml should be in /app
if not CONFIG_PATH.exists():
    CONFIG_PATH = Path("/app/config.yaml")


def _read_config_file() -> dict:
    if CONFIG_PATH.exists():
        with CONFIG_PATH.open("r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    return {}


@lru_cache()
def get_settings() -> Settings:
    raw_cfg = _read_config_file()
    app_cfg = raw_cfg.get("app", {})
    database_cfg = raw_cfg.get("database", {})
    mail_cfg = raw_cfg.get("mail", {})
    site_cfg = raw_cfg.get("site", {})

    site_cfg_env_host = os.getenv("SCOUTCOMP_SITE_HOST")
    if site_cfg_env_host is not None:
        site_cfg["host"] = site_cfg_env_host
    site_cfg_env_port = os.getenv("SCOUTCOMP_SITE_PORT")
    if site_cfg_env_port is not None:
        site_cfg["port"] = int(site_cfg_env_port)
    site_cfg_env_url = os.getenv("SCOUTCOMP_SITE_PUBLIC_URL")
    if site_cfg_env_url is not None:
        site_cfg["public_url"] = site_cfg_env_url

    secret_key = os.getenv("SCOUTCOMP_SECRET_KEY", app_cfg.get("secret_key", "change-me"))
    database_url = os.getenv("SCOUTCOMP_DB_URL", database_cfg.get("url", "sqlite:///./database.db"))
    developer_mode_env = os.getenv("SCOUTCOMP_DEVELOPER_MODE")
    if developer_mode_env is not None:
        app_cfg["developer_mode"] = developer_mode_env.lower() in {"1", "true", "yes", "on"}
    web_media_dir_env = os.getenv("SCOUTCOMP_WEB_MEDIA_DIR")
    if web_media_dir_env is not None:
        app_cfg["web_media_dir"] = web_media_dir_env

    # Timezone from env
    timezone_env = os.getenv("SCOUTCOMP_TIMEZONE")
    if timezone_env is not None:
        app_cfg["timezone"] = timezone_env

    # Push settings from env
    push_cfg = app_cfg.get("push", {}) or {}
    push_enabled_env = os.getenv("SCOUTCOMP_PUSH_ENABLED")
    if push_enabled_env is not None:
        push_cfg["enabled"] = push_enabled_env.lower() in {"1", "true", "yes", "on"}
    push_public_key_env = os.getenv("SCOUTCOMP_PUSH_VAPID_PUBLIC_KEY") or os.getenv("SCOUTCOMP_VAPID_PUBLIC_KEY")
    if push_public_key_env is not None:
        push_cfg["vapid_public_key"] = push_public_key_env
    push_private_key_env = os.getenv("SCOUTCOMP_PUSH_VAPID_PRIVATE_KEY") or os.getenv("SCOUTCOMP_VAPID_PRIVATE_KEY")
    if push_private_key_env is not None:
        push_cfg["vapid_private_key"] = push_private_key_env
    push_subject_env = os.getenv("SCOUTCOMP_PUSH_VAPID_SUBJECT") or os.getenv("SCOUTCOMP_VAPID_SUBJECT")
    if push_subject_env is not None:
        push_cfg["vapid_subject"] = push_subject_env
    push_allowed_hosts_env = os.getenv("SCOUTCOMP_PUSH_ALLOWED_HOSTS")
    if push_allowed_hosts_env is not None:
        push_cfg["allowed_hosts"] = [
            host.strip().lower() for host in push_allowed_hosts_env.split(",") if host.strip()
        ]
    app_cfg["push"] = push_cfg

    app_cfg = {
        **app_cfg,
        "secret_key": secret_key,
    }

    if not database_cfg.get("engine"):
        database_cfg["engine"] = "sqlite"

    database_cfg = {
        **database_cfg,
        "url": database_url,
    }

    return Settings(
        app=AppSettings(**app_cfg),
        database=DatabaseSettings(**database_cfg),
        mail=MailSettings(**mail_cfg),
        site=SiteSettings(**site_cfg),
    )


settings = get_settings()
