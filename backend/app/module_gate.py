"""Runtime gate: disabling a module immediately disables its API surface."""
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from .database import SessionLocal
from .models import RegisteredModule
from .modules import registry


class ModuleGateMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        path = request.url.path.rstrip("/") or "/"
        # The module catalogue is Core and must stay available.
        if path.startswith("/modules") or path.startswith("/admin/access"):
            return await call_next(request)
        owner = None
        for manifest in registry.manifests():
            if manifest.code == "core":
                continue
            if any(path == prefix or path.startswith(f"{prefix}/") for prefix in manifest.api_prefixes):
                owner = manifest.code
                break
        if owner:
            with SessionLocal() as db:
                module = db.query(RegisteredModule).filter_by(code=owner).one_or_none()
                if not module or not module.installed or not module.enabled:
                    return JSONResponse(status_code=404, content={"detail": "Module is not available"})
        return await call_next(request)
