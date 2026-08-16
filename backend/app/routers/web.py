"""Compatibility aggregator for the authenticated CMS API.

The module registry imports ``router`` from this historical location. Route
groups and their handlers live under :mod:`app.web` alongside the CMS domain
services; the unauthenticated visitor application never imports this router.
"""
from ..web.routes import (
    router,
    seed_default_pages,
    seed_default_templates,
)
