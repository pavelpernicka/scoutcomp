from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from html import escape
from pathlib import Path
from urllib.parse import urlparse

from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
from fastapi.openapi.utils import get_openapi

from .config import settings
from .database import Base, engine, SessionLocal
from .dependencies import get_db
from .modules import registry
from .modules.registration import register_all_modules
from .migrations import run_migrations
from .module_gate import ModuleGateMiddleware
from .services.web_push import start_push_dispatcher, stop_push_dispatcher
from .routers import (
    announcements,
    auth,
    completions,
    config,
    leaderboard,
    notifications,
    stat_categories,
    static_pages,
    tasks,
    teams,
    users,
    web,
)
from sqlalchemy.orm import Session


_FRONTEND_DIST_DIR = Path("/frontend-dist")
_APP_SHELL_TITLE = "__SCOUTCOMP_APP_TITLE__"
_APP_SHELL_ICON = "__SCOUTCOMP_APP_ICON__"


def _favicon_href(value: str) -> str:
    """Keep the persisted icon usable without allowing an unsafe URL scheme."""
    if value.startswith("data:image/") or value.startswith("/"):
        return value
    if urlparse(value).scheme in {"http", "https"}:
        return value
    return "/favicon.svg"


def _app_shell(db: Session) -> str:
    """Render the SPA document with the persisted brand before JavaScript runs."""
    index_path = _FRONTEND_DIST_DIR / "index.html"
    try:
        template = index_path.read_text(encoding="utf-8")
    except OSError:
        # This only applies to source-only development/test checkouts. The
        # production image always copies the built document beside the API.
        template = (
            "<!doctype html><html lang=\"cs\"><head><meta charset=\"UTF-8\">"
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover\">"
            '<meta name="robots" content="noindex,nofollow">'
            f"<title>{_APP_SHELL_TITLE}</title><link rel=\"icon\" href=\"{_APP_SHELL_ICON}\"></head>"
            "<body><div id=\"root\"></div><script type=\"module\" src=\"/src/main.jsx\"></script></body></html>"
        )

    app_name = config.get_config_value(db, "app_name") or "ScoutComp"
    app_icon = _favicon_href(config.get_config_value(db, "app_icon"))
    return template.replace(_APP_SHELL_TITLE, escape(app_name)).replace(
        _APP_SHELL_ICON, escape(app_icon, quote=True)
    )

Base.metadata.create_all(bind=engine)
run_migrations(engine)


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    dispatcher = start_push_dispatcher()
    try:
        yield
    finally:
        stop_push_dispatcher(dispatcher)


app = FastAPI(
    title="ScoutComp API",
    version="1.0.1",
    description="Modulární aplikace pro skautské oddíly",
    openapi_url=None, # disable automatic docs - managed by myself to fix issue with proxy
    docs_url=None,
    redoc_url=None,
    lifespan=_lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Feature modules are declared in one place (app/modules/registration.py).
# Removing a module is a database switch in administration; new modules
# register the same small manifest.
register_all_modules()
with SessionLocal() as module_session:
    registry.install(app, module_session)
    web.seed_default_pages(module_session)
    from app.web.routes_media import _ensure_root_folder
    _ensure_root_folder(module_session)
app.add_middleware(ModuleGateMiddleware)


@app.get("/", tags=["meta"])
def root():
    return {
        "message": "ScoutComp běží",
        "default_language": settings.app.default_language,
        "supported_languages": settings.app.supported_languages,
    }


@app.get("/healthz", tags=["meta"]) # healthchecks
def healthcheck():
    return {"status": "ok"}


@app.get("/app-shell", include_in_schema=False, response_class=HTMLResponse)
def app_shell(db: Session = Depends(get_db)):
    """Server-rendered HTML shell used by the production SPA web server."""
    return HTMLResponse(
        _app_shell(db),
        headers={"Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow"},
    )


# Custom documentation endpoints
@app.get("/openapi.json", include_in_schema=False)
def get_custom_openapi():
    """Custom OpenAPI schema with forced 3.0.2 version for compatibility."""
    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    openapi_schema["openapi"] = "3.0.2"  # force 3.0.2 for compatibility
    return JSONResponse(openapi_schema)


@app.get("/docs", include_in_schema=False)
def get_docs():
    """Swagger UI documentation."""
    return get_swagger_ui_html(
        openapi_url="./openapi.json",  # use relative URL for proxied use
        title="ScoutComp API – dokumentace"
    )


@app.get("/redoc", include_in_schema=False)
def get_redoc():
    """ReDoc documentation."""
    return get_redoc_html(
        openapi_url="./openapi.json",  # use relative URL for proxied use
        title="Scout Competition API - Documentation"
    )
