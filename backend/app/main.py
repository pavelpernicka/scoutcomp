from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
from fastapi.openapi.utils import get_openapi

from .config import settings
from .database import Base, engine
from .migrations import run_migrations
from .routers import (
    auth,
    completions,
    config,
    dashboard_messages,
    leaderboard,
    notifications,
    stat_categories,
    static_pages,
    tasks,
    teams,
    users,
)

Base.metadata.create_all(bind=engine)
run_migrations(engine)

app = FastAPI(
    title="ScoutComp API",
    version="0.2.0",
    description="API for ScoutComp - Scout Competition Management System",
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


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(teams.router)
app.include_router(tasks.router)
app.include_router(completions.router)
app.include_router(leaderboard.router)
app.include_router(notifications.router)
app.include_router(dashboard_messages.router)
app.include_router(stat_categories.router)
app.include_router(static_pages.router)
app.include_router(config.router)
app.include_router(config.admin_router)


@app.get("/", tags=["meta"])
def root():
    return {
        "message": "ScoutComp backend is running",
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
        title="Scout Competition API - Documentation"
    )


@app.get("/redoc", include_in_schema=False)
def get_redoc():
    """ReDoc documentation."""
    return get_redoc_html(
        openapi_url="./openapi.json",  # use relative URL for proxied use
        title="Scout Competition API - Documentation"
    )




