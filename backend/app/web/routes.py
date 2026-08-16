"""Authenticated CMS route aggregator.

Each subrouter owns one bounded HTTP area. Domain work remains in the service
modules so the authenticated API and public renderer share the same rules.
"""
from fastapi import APIRouter

from .routes_content import router as content_router
from .routes_design import router as design_router
from .routes_media import router as media_router
from .routes_pages import router as pages_router
from .routes_templates import (
    router as templates_router,
    seed_default_pages,
    seed_default_templates,
)


router = APIRouter()
router.include_router(pages_router)
router.include_router(content_router)
router.include_router(design_router)
router.include_router(templates_router)
router.include_router(media_router)
