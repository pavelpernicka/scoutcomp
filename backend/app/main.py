from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
from fastapi.openapi.utils import get_openapi

from .config import settings
from .database import Base, engine, SessionLocal
from .modules import registry
from .modules.registration import register_all_modules
from .migrations import run_migrations
from .module_gate import ModuleGateMiddleware
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

Base.metadata.create_all(bind=engine)
run_migrations(engine)

app = FastAPI(
    title="ScoutComp API",
    version="1.0.0",
    description="Modulární aplikace pro skautské oddíly",
    openapi_url=None, # disable automatic docs - managed by myself to fix issue with proxy
    docs_url=None,
    redoc_url=None
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
