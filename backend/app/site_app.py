"""Public web hosting server.

A separate, dependency-free HTTP app that serves *published* pages of the web
module. It is meant to run on its own port (default 8090) behind a reverse
proxy (nginx), so visitors never touch the authenticated API.

Run with::

    uvicorn app.site_app:app --host 0.0.0.0 --port 8090

Everything is server-rendered HTML (web components are expanded server-side).
A tiny first-party runtime progressively enhances calendar navigation; the
links remain fully functional without JavaScript and no login is required.
"""
from __future__ import annotations

import re
from datetime import datetime
from html import escape
from pathlib import Path
from urllib.parse import quote, urlparse

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, Response
from sqlalchemy import text
from sqlalchemy.orm import Session, defer, load_only

from .config import settings
from .database import SessionLocal
from .models import (
    Config,
    RegisteredModule,
    ScoutEvent,
    User,
    WebMedia,
    WebMenuItem,
    WebMenu,
    WebMenuRevision,
    WebPage,
    WebPageRevision,
    WebPost,
    WebPostRevision,
    WebSiteStyle,
    WebTemplate,
    WebThemeVersion,
    WebThemeAsset,
)
from .modules import registry
from .modules.registration import register_all_modules
from .routers.config import get_config_value
from .timezones import utc_storage_to_local
from .web_render import render_article_body, render_site_page
from .web.renderer import CompileError, compile_project, render_document, render_project
from .web.data_sources import is_media_published, safe_public_avatar
from .web.url_schemes import (
    DEFAULT_POST_URL_PATTERN,
    event_url,
    match_event_pattern,
    match_pattern,
    post_url,
)
from .web.site_identity import DEFAULT_TITLE_PATTERN, format_document_title, public_asset_url

register_all_modules()

app = FastAPI(title="ScoutComp Public Site", docs_url=None, redoc_url=None, openapi_url=None)

_SITE_RUNTIME_JS = r'''(() => {
  "use strict";
  const navigationSelector = ".sc-calendar-nav[href],.sc-calendar-today[href]";
  const requests = new WeakMap();
  // The class fallback keeps already-published Ontario snapshots working;
  // newly rendered themes opt in through the generic data attribute.
  const scrollNavigations = Array.from(document.querySelectorAll("[data-sc-scroll-nav],.ontario-navbar"));
  let scrollFrame = 0;
  const updateScrollNavigations = () => {
    scrollFrame = 0;
    const scrollTop = window.scrollY || document.scrollingElement?.scrollTop || 0;
    scrollNavigations.forEach((navigation) => {
      navigation.classList.toggle("sc-scroll-nav--scrolled", scrollTop > 24);
    });
  };
  const scheduleScrollNavigationUpdate = () => {
    if (!scrollFrame) scrollFrame = window.requestAnimationFrame(updateScrollNavigations);
  };
  if (scrollNavigations.length) {
    updateScrollNavigations();
    window.addEventListener("scroll", scheduleScrollNavigationUpdate, { passive: true });
    window.addEventListener("pageshow", scheduleScrollNavigationUpdate);
  }
  const documentLocation = (value = window.location.href) => {
    const url = new URL(value, window.location.href);
    return `${url.origin}${url.pathname}${url.search}`;
  };
  let renderedLocation = documentLocation();

  async function replaceCalendar(source, targetUrl, updateHistory) {
    const calendars = Array.from(document.querySelectorAll(".sc-calendar"));
    const index = Math.max(0, calendars.indexOf(source));
    const currentView = source.querySelector(".sc-calendar-view-list")?.checked ? "list" : "month";
    const focusClass = source.ownerDocument.activeElement?.classList.contains("sc-calendar-nav--prev")
      ? "sc-calendar-nav--prev"
      : source.ownerDocument.activeElement?.classList.contains("sc-calendar-nav--next")
        ? "sc-calendar-nav--next"
        : "sc-calendar-today";
    const request = (requests.get(source) || 0) + 1;
    requests.set(source, request);
    const response = await fetch(targetUrl, {
      credentials: "same-origin",
      headers: { "X-ScoutComp-Fragment": "calendar" },
    });
    if (!response.ok) throw new Error("Calendar navigation failed");
    const parsed = new DOMParser().parseFromString(await response.text(), "text/html");
    const replacement = parsed.querySelectorAll(".sc-calendar")[index];
    if (!replacement || request !== requests.get(source)) return;
    const imported = document.importNode(replacement, true);
    if (currentView === "list") {
      const listControl = imported.querySelector(".sc-calendar-view-list");
      if (listControl) listControl.checked = true;
    }
    source.replaceWith(imported);
    renderedLocation = documentLocation(targetUrl);
    if (updateHistory) history.pushState({ scoutcompCalendar: true }, "", targetUrl);
    imported.querySelector(`.${focusClass}`)?.focus({ preventScroll: true });
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest?.(navigationSelector);
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const calendar = link.closest(".sc-calendar");
    if (!calendar) return;
    const targetUrl = new URL(link.href, window.location.href);
    if (targetUrl.origin !== window.location.origin) return;
    event.preventDefault();
    replaceCalendar(calendar, targetUrl, true).catch(() => { window.location.assign(targetUrl); });
  });

  window.addEventListener("popstate", () => {
    // Opening and closing the CSS-only day dialog changes only the fragment.
    // Browsers also expose that history movement through popstate; replacing
    // the calendar in that case removes the :target element and makes the
    // dialog flash and immediately disappear.
    if (documentLocation() === renderedLocation) return;
    document.querySelectorAll(".sc-calendar").forEach((calendar) => {
      replaceCalendar(calendar, window.location.href, false).catch(() => window.location.reload());
    });
  });
})();'''


@app.get("/site-runtime.js", include_in_schema=False)
def site_runtime() -> Response:
    return Response(
        _SITE_RUNTIME_JS,
        media_type="application/javascript",
        headers={"Cache-Control": "public, max-age=0, must-revalidate", "X-Content-Type-Options": "nosniff"},
    )


@app.middleware("http")
async def public_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; media-src 'self' https:; "
        "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com; "
        "font-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    )
    # Public output contains no session-specific data. Short HTML caching lets
    # an edge proxy absorb crawlers and traffic spikes while keeping publishes
    # visible quickly; immutable theme assets retain their route-level policy.
    if response.status_code == 200 and "Cache-Control" not in response.headers:
        if request.url.path == "/robots.txt":
            response.headers["Cache-Control"] = "public, max-age=3600"
        elif request.url.path == "/sitemap.xml":
            response.headers["Cache-Control"] = "public, max-age=300, stale-if-error=86400"
        elif request.url.path.startswith("/media/"):
            response.headers["Cache-Control"] = "public, max-age=3600, stale-if-error=86400"
        elif response.headers.get("content-type", "").startswith("text/html"):
            response.headers["Cache-Control"] = (
                "public, max-age=60, stale-while-revalidate=300, stale-if-error=86400"
            )
    return response

DEFAULT_SITE_TITLE = "Skautský oddíl"


def _enabled_components(db: Session) -> set[str]:
    """Component ids offered by enabled+installed modules (security gate)."""
    records = {m.code for m in db.query(RegisteredModule).filter_by(enabled=True, installed=True)}
    enabled: set[str] = {"page_menu"}
    for manifest in registry.manifests():
        if manifest.code not in records:
            continue
        for item in manifest.web_components:
            enabled.add(item.get("id") or item["component"])
            enabled.add(item["component"])
    return enabled


def _site_title(db: Session) -> str:
    try:
        return get_config_value(db, "web.site_title") or get_config_value(db, "app_name") or DEFAULT_SITE_TITLE
    except Exception:
        return DEFAULT_SITE_TITLE


def _site_settings(db: Session) -> dict:
    def _get(key: str, default: str = "") -> str:
        try:
            return get_config_value(db, key) or default
        except Exception:
            return default
    return {
        "site_title": _get("web.site_title", _site_title(db)),
        "title_pattern": _get("web.title_pattern", DEFAULT_TITLE_PATTERN),
        "favicon": public_asset_url(_get("web.favicon")),
        "site_tagline": _get("web.site_tagline"),
        "site_meta": _get("web.site_meta"),
        "site_logo": public_asset_url(_get("web.site_logo")),
        "meta_description": _get("web.meta_description"),
        "og_title": _get("web.og_title"),
        "og_description": _get("web.og_description"),
        "og_image": public_asset_url(_get("web.og_image")),
        "og_type": _get("web.og_type", "website"),
        "contact_address": _get("web.contact_address"),
        "contact_phone": _get("web.contact_phone"),
        "contact_email": _get("web.contact_email"),
        "contact_meeting_time": _get("web.contact_meeting_time"),
        "social_facebook": _get("web.social_facebook"),
        "social_instagram": _get("web.social_instagram"),
        "social_whatsapp": _get("web.social_whatsapp"),
    }


def _normalise_public_base(value: str | None) -> str:
    """Return an absolute HTTP(S) origin, never a user-controlled path."""
    parsed = urlparse(value or "")
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.netloc
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or parsed.path not in {"", "/"}
    ):
        return ""
    return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")


def _public_site_base(db: Session, request: Request | None = None) -> str:
    """Resolve the one deployment-owned public origin used by SEO output.

    ``SCOUTCOMP_SITE_PUBLIC_URL`` is authoritative. The DB key is retained as
    a migration fallback only. Request origin keeps local development usable,
    but production should always configure the environment value so Host input
    never becomes part of immutable publication artifacts.
    """
    configured = _normalise_public_base(settings.site.public_url)
    if configured:
        return configured
    legacy = _normalise_public_base(get_config_value(db, "web.site_base_url"))
    if legacy:
        return legacy
    return _normalise_public_base(str(request.base_url)) if request is not None else ""


def _absolute_public_url(
    db: Session,
    path: str,
    *,
    explicit: str = "",
    request: Request | None = None,
) -> str:
    """Resolve a safe explicit canonical or build a self-canonical URL."""
    explicit_value = str(explicit or "").strip()
    if explicit_value:
        parsed = urlparse(explicit_value)
        if parsed.scheme in {"http", "https"} and parsed.netloc and not parsed.username and not parsed.password:
            return explicit_value
        if explicit_value.startswith("/"):
            base = _public_site_base(db, request)
            return f"{base}{explicit_value}" if base else ""
    base = _public_site_base(db, request)
    safe_path = path if str(path or "").startswith("/") else f"/{path}"
    return f"{base}{safe_path}" if base else ""


def _absolute_public_asset(db: Session, value: str, request: Request | None = None) -> str:
    if not value:
        return ""
    parsed = urlparse(value)
    if parsed.scheme in {"http", "https"} and parsed.netloc:
        return value
    if value.startswith("/"):
        base = _public_site_base(db, request)
        return f"{base}{value}" if base else value
    return ""


def _main_nav(db: Session) -> list[tuple[str, str]]:
    menu = db.query(WebMenu).filter_by(location="main").order_by(WebMenu.id.asc()).first()
    if menu and menu.published_revision_id:
        revision = db.query(WebMenuRevision).filter_by(id=menu.published_revision_id, menu_id=menu.id).one_or_none()
        items = revision.tree if revision and isinstance(revision.tree, list) else []
        nav = []
        for item in items:
            page_slug = item.get("page_slug")
            url = item.get("url")
            if item.get("item_type") in {"page", "post"} and url:
                nav.append((item.get("label") or page_slug or url, url))
            elif page_slug:
                href = "/" if page_slug == "main" else f"/{page_slug}"
                nav.append((item.get("label") or page_slug, href))
            elif url:
                nav.append((item.get("label") or url, url))
        if nav:
            return nav
    revisions = (
        db.query(WebPageRevision)
        .join(WebPage, WebPage.published_revision_id == WebPageRevision.id)
        .filter(WebPage.deleted_at.is_(None), WebPage.published.is_(True))
        .order_by(WebPage.position.asc())
        .all()
    )
    return [(item.title or "", item.path or f"/{item.path_segment}") for item in revisions]


def _social_links(db: Session, settings_data: dict) -> list[tuple[str, str]]:
    links = []
    if settings_data.get("social_facebook"):
        links.append(("facebook", settings_data["social_facebook"]))
    if settings_data.get("social_instagram"):
        links.append(("instagram", settings_data["social_instagram"]))
    if settings_data.get("social_whatsapp"):
        links.append(("whatsapp", settings_data["social_whatsapp"]))
    if settings_data.get("contact_email"):
        links.append(("email", f"mailto:{settings_data['contact_email']}"))
    return links


def _footer_extra(settings_data: dict) -> str:
    blocks = []
    if settings_data.get("contact_address"):
        blocks.append(f'<span class="web-footer-contact"><i class="fa-solid fa-location-dot"></i> {escape(settings_data["contact_address"])}</span>')
    if settings_data.get("contact_phone"):
        blocks.append(f'<span class="web-footer-contact"><i class="fa-solid fa-phone"></i> {escape(settings_data["contact_phone"])}</span>')
    if settings_data.get("contact_email"):
        blocks.append(f'<span class="web-footer-contact"><i class="fa-solid fa-envelope"></i> {escape(settings_data["contact_email"])}</span>')
    if settings_data.get("contact_meeting_time"):
        blocks.append(f'<span class="web-footer-contact"><i class="fa-solid fa-clock"></i> {escape(settings_data["contact_meeting_time"])}</span>')
    return f'<div class="web-footer-contacts">{"".join(blocks)}</div>' if blocks else ""


def _main_page(db: Session) -> WebPage | None:
    page = _find_published_page(db, "/")
    if page:
        return page
    page = (
        db.query(WebPage)
        .options(defer(WebPage.data), defer(WebPage.html))
        .join(WebPageRevision, WebPage.published_revision_id == WebPageRevision.id)
        .filter(WebPage.published.is_(True), WebPage.deleted_at.is_(None))
        .order_by(WebPageRevision.created_at.desc())
        .first()
    )
    if page:
        return page
    return db.query(WebPage).options(defer(WebPage.data), defer(WebPage.html)).filter(
        WebPage.published.is_(True), WebPage.published_revision_id.is_(None),
        WebPage.deleted_at.is_(None),
    ).order_by(WebPage.updated_at.desc()).first()


def _find_published_page(db: Session, path: str) -> WebPage | None:
    path = "/" + path.strip("/") if path != "/" else "/"
    page = (
        db.query(WebPage)
        .options(defer(WebPage.data), defer(WebPage.html))
        .join(WebPageRevision, WebPage.published_revision_id == WebPageRevision.id)
        .filter(
            WebPageRevision.path == path,
            WebPageRevision.is_publication.is_(True),
            WebPage.published.is_(True),
            WebPage.deleted_at.is_(None),
        )
        .order_by(WebPageRevision.id.desc())
        .first()
    )
    if page:
        return page
    # Pre-snapshot compatibility only.
    query = db.query(WebPage).options(defer(WebPage.data), defer(WebPage.html)).filter(
        WebPage.published.is_(True), WebPage.published_revision_id.is_(None), WebPage.deleted_at.is_(None)
    )
    if path == "/":
        return query.filter((WebPage.path == "/") | (WebPage.slug == "main")).first()
    return query.filter((WebPage.path == path) | (WebPage.slug == path.strip("/"))).first()


def _media_dir() -> Path:
    path = Path(settings.app.web_media_dir).expanduser().resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path


def _media_path(record: WebMedia) -> Path:
    root = _media_dir()
    candidate = (root / record.path).resolve()
    if not candidate.is_relative_to(root) or candidate.is_symlink():
        raise HTTPException(404, "Media file is missing")
    return candidate


def _media_is_published(db: Session, media_id: int) -> bool:
    return is_media_published(db, media_id)


def _detail_document(
    db: Session,
    *,
    setting_key: str,
    detail_html: str,
    title: str,
    seo_title: str | None = None,
    description: str = "",
    canonical_url: str = "",
    public_path: str = "/",
    og_image: str = "",
    og_type: str = "website",
    noindex: bool = False,
) -> str:
    """Render a safe article/event fragment through an optional layout."""
    raw_id = get_config_value(db, setting_key)
    site_settings = _site_settings(db)
    document_title = format_document_title(seo_title or title, site_settings["site_title"], site_settings["title_pattern"])
    effective_description = description or site_settings["meta_description"]
    effective_canonical = _absolute_public_url(
        db, public_path, explicit=canonical_url,
    )
    effective_image = _absolute_public_asset(db, og_image or site_settings["og_image"])
    try:
        template_id = int(raw_id) if raw_id else None
    except (TypeError, ValueError):
        template_id = None
    template = db.query(WebTemplate).filter_by(id=template_id, usage_mode="linked_layout").one_or_none() if template_id else None
    tokens, global_css, base_css = _published_style(db)
    if template and isinstance(template.published_project_data, dict):
        try:
            compiled_template = compile_project(template.published_project_data)
            tree = compiled_template.tree
            part_css: list[str] = []
            body = render_project(
                db, tree, slot_tree={"type": "sc-detail-content"},
                page={"title": title, "detail_html": detail_html}, site=_site_settings(db), css_layers=part_css,
            )
            # GrapesJS can persist layout rules in Project Data, in the
            # dedicated CSS field, or in both.  Both belong to the linked
            # template publication and must survive template updates.
            template_css = f"{compiled_template.css}\n{template.published_css or ''}"
            if template.theme_version_id:
                from .web.theme_package import rewrite_theme_asset_urls
                template_css = rewrite_theme_asset_urls(template_css, template.theme_version_id)
            linked_part_css = "\n".join(part_css)
            return render_document(
                body, title=document_title, description=effective_description, canonical_url=effective_canonical,
                favicon=site_settings["favicon"], noindex=noindex,
                og_title=document_title,
                og_description=site_settings["og_description"] or effective_description,
                og_image=effective_image,
                og_type=og_type or site_settings["og_type"],
                site_name=site_settings["site_title"],
                css=f"{global_css}\n{linked_part_css}\n{template_css}", base_css=base_css, tokens=tokens,
                site_runtime=True,
            )
        except CompileError:
            # A deleted/inconsistent setting must not take a public detail down.
            pass
    return render_document(
        f'<main class="web-detail-fallback"><h1>{escape(title)}</h1>{detail_html}</main>',
        title=document_title, description=effective_description, canonical_url=effective_canonical,
        favicon=site_settings["favicon"], noindex=noindex,
        og_title=document_title,
        og_description=site_settings["og_description"] or effective_description,
        og_image=effective_image,
        og_type=og_type or site_settings["og_type"],
        site_name=site_settings["site_title"],
        css=global_css, base_css=base_css, tokens=tokens, site_runtime=True,
    )


def _detail_meta(author: User | None, published_date: datetime | None, *, date_label: str) -> str:
    """Render public author/date metadata from verified profile fields only."""
    author_name = (author.real_name or author.username).strip() if author else "ScoutComp"
    if not author_name:
        author_name = "ScoutComp"
    avatar = safe_public_avatar(author.avatar if author else None)
    if avatar:
        portrait = (
            f'<img class="web-detail-author-avatar" src="{escape(avatar, quote=True)}" '
            'alt="">'
        )
    else:
        initial = next((character.upper() for character in author_name if character.isalnum()), "S")
        portrait = f'<span class="web-detail-author-fallback" aria-hidden="true">{escape(initial)}</span>'
    date_html = ""
    if published_date is not None:
        date_html = (
            f'<time class="web-detail-date" datetime="{escape(published_date.isoformat(), quote=True)}">'
            f'{escape(date_label)} {published_date.day}. {published_date.month}. {published_date.year}</time>'
        )
    return (
        '<div class="web-detail-meta">'
        f'<span class="web-detail-author">{portrait}<span>{escape(author_name)}</span></span>'
        f'{date_html}</div>'
    )


def _render(db: Session, page: WebPage, extra_head: str = "", query: dict[str, str] | None = None) -> str:
    if page.published_revision_id:
        key = _artifact_query_key(query)
        document_column = (
            WebPageRevision.rendered_html
            if key == ""
            else WebPageRevision.rendered_variants[key].as_string()
        )
        artifact = db.query(
            document_column.label("document"),
            WebPageRevision.reason,
        ).filter_by(id=page.published_revision_id, page_id=page.id).one_or_none()
        if not artifact:
            raise HTTPException(404, "Published page is unavailable")
        if isinstance(artifact.document, str) and artifact.document:
            return artifact.document
        if artifact.reason != "migration":
            raise HTTPException(503, "Published output is being generated")
        # Only old migration snapshots may fall back to compilation. Load
        # their full record lazily; ordinary visitor requests never deserialize
        # the multi-megabyte variant map or draft/compiler payloads.
        revision = db.query(WebPageRevision).filter_by(
            id=page.published_revision_id, page_id=page.id,
        ).one()
        return _render_revision(db, page, revision, query=query, use_artifact=False)
    # Compatibility path for records published before immutable snapshots were
    # introduced. Any subsequent publish sets the pointer and bypasses it.
    settings_data = _site_settings(db)
    return render_site_page(
        db,
        page,
        site_title=settings_data["site_title"],
        site_tagline=settings_data["site_tagline"],
        site_logo=settings_data["site_logo"],
        site_meta=settings_data["site_meta"],
        nav_items=_main_nav(db),
        enabled_components=_enabled_components(db),
        social_links=_social_links(db, settings_data),
        footer_extra=_footer_extra(settings_data),
        document_title=format_document_title(page.title, settings_data["site_title"], settings_data["title_pattern"]),
        favicon=settings_data["favicon"],
        canonical_url=_absolute_public_url(db, page.path or ("/" if page.slug == "main" else f"/{page.slug}")),
        og_image=_absolute_public_asset(db, settings_data["og_image"]),
        og_type=settings_data["og_type"],
        extra_head=extra_head,
    )


def _published_style(db: Session) -> tuple[dict, str, str]:
    style = db.query(WebSiteStyle).filter_by(id=1).one_or_none()
    if not style:
        return {}, "", ""
    base_css = ""
    tokens = style.published_tokens or {}
    if style.active_theme_version_id:
        theme = db.query(WebThemeVersion).filter_by(id=style.active_theme_version_id).one_or_none()
        if theme:
            from .web.theme_package import rewrite_theme_asset_urls
            base_css = rewrite_theme_asset_urls(theme.base_css or "", theme.id)
            tokens = _deep_merge(theme.default_tokens or {}, tokens)
    return tokens, style.published_css or "", base_css


def _deep_merge(base: dict, override: dict) -> dict:
    result = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def _artifact_query_key(query: dict[str, str] | None) -> str:
    """Canonical allowlisted public-document variant key."""
    supplied = dict(query or {})
    page = supplied.get("page")
    month = supplied.get("month")
    if month not in (None, ""):
        if page not in (None, "", "1") or not isinstance(month, str) or not re.fullmatch(r"\d{4}-\d{2}", month):
            return "__invalid__"
        try:
            parsed_month = datetime.strptime(month, "%Y-%m")
        except ValueError:
            return "__invalid__"
        if not 1900 <= parsed_month.year <= 2100:
            return "__invalid__"
        return f"month={month}"
    if page is None or page == "" or page == "1":
        return ""
    try:
        number = int(page)
    except (TypeError, ValueError):
        return "__invalid__"
    return f"page={number}" if 1 < number <= 100 else "__invalid__"


def _render_revision(
    db: Session,
    page: WebPage,
    revision: WebPageRevision,
    *,
    query: dict[str, str] | None = None,
    use_artifact: bool = True,
) -> str:
    # A visitor request must never invoke the compiler/data-source renderer.
    # Publication produces the immutable document variants atomically instead.
    if use_artifact:
        key = _artifact_query_key(query)
        if key == "":
            document = revision.rendered_html
        else:
            variants = revision.rendered_variants if isinstance(revision.rendered_variants, dict) else {}
            document = variants.get(key)
        if isinstance(document, str) and document:
            return document
        if revision.reason != "migration":
            raise HTTPException(503, "Published output is being generated")
    tree = revision.compiled_tree
    css = revision.compiled_css or ""
    if not isinstance(tree, dict):
        try:
            if not isinstance(revision.data, dict):
                raise CompileError("Legacy snapshot has no project data")
            compiled = compile_project(revision.data)
            tree, css = compiled.tree, compiled.css
        except CompileError:
            # Explicit compatibility reader for migration snapshots. It is not
            # used after the first successful publish through the new compiler.
            if revision.reason != "migration" or not revision.html:
                raise HTTPException(404, "Published page is unavailable")
            legacy = WebPage(
                id=page.id, slug=revision.path_segment or page.slug,
                title=revision.title or page.title, html=revision.html,
                meta_description=revision.meta_description,
            )
            settings_data = _site_settings(db)
            return render_site_page(
                db, legacy, site_title=settings_data["site_title"],
                site_tagline=settings_data["site_tagline"], site_logo=settings_data["site_logo"],
                site_meta=settings_data["site_meta"], nav_items=_main_nav(db),
                enabled_components=_enabled_components(db), social_links=_social_links(db, settings_data),
                footer_extra=_footer_extra(settings_data),
                canonical_url=_absolute_public_url(
                    db,
                    revision.path or page.path or f"/{revision.path_segment or page.slug}",
                    explicit=revision.canonical_url or "",
                ),
                og_image=(
                    _absolute_public_asset(db, f"/media/{revision.og_image_id}/file")
                    if revision.og_image_id else _absolute_public_asset(db, settings_data["og_image"])
                ),
                og_type=settings_data["og_type"],
            )
    page_context = {
        "id": page.id,
        "query": dict(query or {}),
        "title": revision.title or page.title,
        "path": revision.path or page.path,
        "slug": revision.path_segment or page.path_segment or page.slug,
        "meta_description": revision.meta_description,
    }
    render_tree = tree
    slot_tree = None
    if revision.template_id or revision.template_key:
        template = (
            db.query(WebTemplate).filter_by(id=revision.template_id).one_or_none()
            if revision.template_id else db.query(WebTemplate).filter_by(key=revision.template_key).one_or_none()
        )
        if template and template.published_project_data:
            compiled_template = compile_project(template.published_project_data)
            render_tree = compiled_template.tree
            slot_tree = tree
            template_css = f"{compiled_template.css}\n{template.published_css or ''}"
            if template.theme_version_id:
                from .web.theme_package import rewrite_theme_asset_urls
                template_css = rewrite_theme_asset_urls(template_css, template.theme_version_id)
            css = f"{template_css}\n{css}"
    part_css: list[str] = []
    body = render_project(
        db,
        render_tree,
        slot_tree=slot_tree,
        page=page_context,
        site=_site_settings(db),
        css_layers=part_css,
    )
    # Editor assets use the authenticated API URL; the visitor application
    # serves only publication-referenced media from its own public endpoint.
    body = body.replace('"/api/web/media/', '"/media/')
    tokens, global_css, base_css = _published_style(db)
    linked_css = "\n".join(part_css)
    settings_data = _site_settings(db)
    page_title = revision.seo_title or revision.title or page.title
    page_path = revision.path or page.path or f"/{revision.path_segment or page.slug}"
    canonical_url = _absolute_public_url(
        db, page_path, explicit=revision.canonical_url or "",
    )
    og_image = (
        _absolute_public_asset(db, f"/media/{revision.og_image_id}/file")
        if revision.og_image_id else _absolute_public_asset(db, settings_data["og_image"])
    )
    description = revision.meta_description or settings_data["meta_description"]
    return render_document(
        body,
        title=format_document_title(page_title, settings_data["site_title"], settings_data["title_pattern"]),
        description=description,
        canonical_url=canonical_url,
        favicon=settings_data["favicon"],
        noindex=revision.noindex,
        og_title=(
            settings_data["og_title"]
            if page_path == "/" and settings_data["og_title"]
            else format_document_title(page_title, settings_data["site_title"], settings_data["title_pattern"])
        ),
        og_description=settings_data["og_description"] or description,
        og_image=og_image,
        og_type=settings_data["og_type"],
        site_name=settings_data["site_title"],
        css=f"{global_css}\n{linked_css}\n{css}",
        base_css=base_css,
        tokens=tokens,
        site_runtime=True,
    )


@app.get("/healthz", tags=["meta"])
def healthcheck():
    # Readiness also warms the site's pooled database connection, avoiding a
    # cold SQLite/WAL setup penalty on the first real visitor request.
    session = SessionLocal()
    try:
        session.execute(text("SELECT 1"))
        _main_page(session)
    finally:
        session.close()
    return {"status": "ok"}


@app.get("/", response_class=HTMLResponse)
def homepage(request: Request):
    session = SessionLocal()
    try:
        page = _main_page(session)
        if not page:
            return HTMLResponse(
                "<!DOCTYPE html><html lang='cs'><head><meta charset='utf-8'><title>ScoutComp</title></head>"
                "<body style='font-family:sans-serif;padding:3rem;text-align:center'>"
                "<h1>Stránky zatím nejsou připravené</h1>"
                "<p>Webový modul ještě nemá publikovanou stránku.</p></body></html>",
                status_code=404,
            )
        return HTMLResponse(_render(session, page, query=dict(request.query_params)))
    finally:
        session.close()


@app.get("/sitemap.xml")
def sitemap(request: Request):
    session = SessionLocal()
    try:
        base = _public_site_base(session, request)
        pages = session.query(WebPage).filter(
            WebPage.published.is_(True), WebPage.deleted_at.is_(None),
        ).order_by(WebPage.path.asc()).all()
        posts = session.query(WebPost).filter(
            WebPost.published.is_(True), WebPost.deleted_at.is_(None),
        ).order_by(WebPost.slug.asc()).all()
        urls = []
        for p in pages:
            if p.published_revision_id:
                rev = session.query(WebPageRevision).filter_by(id=p.published_revision_id).one_or_none()
                if not rev or rev.noindex or not rev.sitemap_include:
                    continue
                path = rev.path or f"/{p.slug}"
            else:
                if p.noindex or not p.sitemap_include:
                    continue
                path = p.path or f"/{p.slug}"
            urls.append(f"<url><loc>{escape((base or '').rstrip('/') + path)}</loc></url>")
        for p in posts:
            if p.published_revision_id:
                rev = session.query(WebPostRevision).filter_by(id=p.published_revision_id).one_or_none()
                if not rev or rev.noindex or not rev.sitemap_include:
                    continue
                slug = rev.slug
            else:
                if p.noindex or not p.sitemap_include:
                    continue
                slug = p.slug
            urls.append(f"<url><loc>{escape((base or '').rstrip('/') + post_url(session, slug))}</loc></url>")
        events = session.query(ScoutEvent).filter(ScoutEvent.is_public.is_(True)).order_by(ScoutEvent.id.asc()).all()
        for event in events:
            urls.append(f"<url><loc>{escape((base or '').rstrip('/') + event_url(session, event.id))}</loc></url>")
        body = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
            f'{"".join(urls)}</urlset>'
        )
        return Response(body, media_type="application/xml")
    finally:
        session.close()


@app.get("/robots.txt")
def robots(request: Request):
    session = SessionLocal()
    try:
        base = _public_site_base(session, request)
    finally:
        session.close()
    return Response(
        "User-agent: *\n"
        "Disallow:\n"
        f"Sitemap: {base}/sitemap.xml\n",
        media_type="text/plain",
    )


_CZECH_WEEKDAYS = ("pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota", "neděle")
_CZECH_MONTHS_GENITIVE = (
    "", "ledna", "února", "března", "dubna", "května", "června",
    "července", "srpna", "září", "října", "listopadu", "prosince",
)


def _event_schedule(start: datetime, end: datetime | None) -> str:
    """Render one concise, timezone-aware event schedule."""
    def visible_point(value: datetime) -> str:
        return (
            f"{_CZECH_WEEKDAYS[value.weekday()]} {value.day}. "
            f"{_CZECH_MONTHS_GENITIVE[value.month]} {value.year} · {value:%H:%M}"
        )

    day = f"{_CZECH_WEEKDAYS[start.weekday()]} {start.day}. {_CZECH_MONTHS_GENITIVE[start.month]} {start.year}"
    if end is None:
        visible = f"{day} · {start:%H:%M}"
    elif start.date() == end.date():
        visible = f"{day} · {start:%H:%M}–{end:%H:%M}"
    else:
        return (
            '<div class="sc-event-fact sc-event-fact--schedule">'
            '<i class="fa-solid fa-calendar-days" aria-hidden="true"></i>'
            '<div class="sc-event-date-points">'
            '<div class="sc-event-date-point"><span class="sc-event-fact-label">Začátek</span> '
            f'<time datetime="{escape(start.isoformat(), quote=True)}">{escape(visible_point(start))}</time></div>'
            '<div class="sc-event-date-point"><span class="sc-event-fact-label">Konec</span> '
            f'<time datetime="{escape(end.isoformat(), quote=True)}">{escape(visible_point(end))}</time></div>'
            '</div></div>'
        )
    return (
        '<div class="sc-event-fact">'
        '<i class="fa-solid fa-calendar-days" aria-hidden="true"></i>'
        '<div><span class="sc-event-fact-label">Termín</span>'
        f'<time datetime="{escape(start.isoformat(), quote=True)}">{escape(visible)}</time></div></div>'
    )


@app.get("/event/{event_id}", response_class=HTMLResponse)
def site_event(event_id: int):
    """Public detail of an event that is explicitly safe for the website."""
    session = SessionLocal()
    try:
        event = session.query(ScoutEvent).filter(
            ScoutEvent.id == event_id,
            ScoutEvent.is_public.is_(True),
        ).one_or_none()
        if not event:
            raise HTTPException(404, "Událost nebyla nalezena")
        starts_at = utc_storage_to_local(event.starts_at)
        ends_at = utc_storage_to_local(event.ends_at)
        details = [_event_schedule(starts_at, ends_at)] if starts_at else []
        if event.location:
            details.append(
                '<div class="sc-event-fact">'
                '<i class="fa-solid fa-location-dot" aria-hidden="true"></i>'
                '<div><span class="sc-event-fact-label">Místo</span>'
                f'<span>{escape(event.location)}</span></div></div>'
            )
        author = session.query(User).filter(User.id == event.created_by_id).one_or_none() if event.created_by_id else None
        meta = _detail_meta(author, None, date_label="")
        description = render_article_body(event.description or "")
        body = (
            '<article class="sc-event-detail">'
            f'<div class="sc-event-facts">{"".join(details)}</div>'
            f'{meta}'
            f'<div class="sc-event-description">{description}</div>'
            '</article>'
        )
        event_template_setting = session.query(Config).filter_by(
            key="web.event_detail_template_id",
        ).one_or_none()
        return HTMLResponse(_detail_document(
            session,
            setting_key=(
                "web.event_detail_template_id"
                if event_template_setting is not None
                else "web.meeting_detail_template_id"
            ),
            detail_html=body,
            title=event.title,
            description=(event.description or "")[:300],
            public_path=event_url(session, event.id),
        ))
    finally:
        session.close()


@app.get("/meeting/{event_id}", include_in_schema=False)
def legacy_site_meeting(event_id: int):
    """Preserve historic links while exposing /event as the canonical route."""
    session = SessionLocal()
    try:
        return RedirectResponse(event_url(session, event_id), status_code=308)
    finally:
        session.close()


# Compatibility for internal callers and older tests. It renders the canonical
# event detail without leaking the historic meeting terminology publicly.
site_meeting = site_event

@app.get("/theme-assets/{theme_version_id}/{asset_path:path}")
def site_theme_asset(theme_version_id: int, asset_path: str):
    """Serve immutable, manifest-declared theme assets from their namespace."""
    from .web.theme_package import ThemePackageError, resolve_theme_asset_path
    session = SessionLocal()
    try:
        version = session.query(WebThemeVersion).filter_by(id=theme_version_id).one_or_none()
        asset = session.query(WebThemeAsset).filter_by(
            theme_version_id=theme_version_id, relative_path=asset_path,
        ).one_or_none()
        if not version or not asset:
            raise HTTPException(404, "Theme asset not found")
        try:
            path = resolve_theme_asset_path(version, asset.relative_path)
        except ThemePackageError as exc:
            raise HTTPException(404, "Theme asset not found") from exc
        if not path.is_file() or path.stat().st_size != asset.size:
            raise HTTPException(404, "Theme asset not found")
        return FileResponse(
            path, media_type=asset.mime,
            headers={"Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"},
        )
    finally:
        session.close()


@app.get("/{slug}", response_class=HTMLResponse)
def site_page(slug: str, request: Request):
    if "/" in slug:
        raise HTTPException(404, "Not found")
    session = SessionLocal()
    try:
        page = _find_published_page(session, f"/{slug}")
        if not page:
            raise HTTPException(404, "Stránka nebyla nalezena")
        return HTMLResponse(_render(session, page, query=dict(request.query_params)))
    finally:
        session.close()


@app.get("/post/{slug}", response_class=HTMLResponse)
def site_post(slug: str):
    session = SessionLocal()
    try:
        published = (
            session.query(WebPost, WebPostRevision)
            .join(WebPostRevision, WebPost.published_revision_id == WebPostRevision.id)
            .filter(
                WebPost.published.is_(True),
                WebPost.deleted_at.is_(None),
                WebPostRevision.is_publication.is_(True),
                WebPostRevision.slug == slug,
            )
            .order_by(WebPostRevision.id.desc())
            .first()
        )
        if published:
            post, revision = published
            title, body_text, cover_id = revision.title, revision.body or "", revision.cover_media_id
            seo_title = revision.seo_title or title
            description = revision.meta_description or revision.excerpt or ""
            canonical_url = revision.canonical_url or ""
            noindex = revision.noindex
        else:
            # Compatibility only for records published before post snapshots
            # existed. Draft edits never use this branch after first publish.
            post = session.query(WebPost).filter(
                WebPost.published.is_(True), WebPost.deleted_at.is_(None),
                WebPost.published_revision_id.is_(None), WebPost.slug == slug,
            ).one_or_none()
            if not post:
                raise HTTPException(404, "Příspěvek nebyl nalezen")
            revision = None
            title, body_text, cover_id = post.title, post.body or "", post.cover_media_id
            seo_title = post.seo_title or title
            description = post.meta_description or post.excerpt or ""
            canonical_url = post.canonical_url or ""
            noindex = post.noindex
        settings_data = _site_settings(session)
        page = WebPage(
            slug=post.slug,
            title=title,
            html="",
            template="blank",
            published=True,
        )
        cover = (
            f'<img class="web-post-cover" src="/media/{cover_id}/file" alt="">'
            if cover_id else ""
        )
        author = session.query(User).filter(User.id == post.created_by_id).one_or_none() if post.created_by_id else None
        published_date = post.published_at or (revision.created_at if revision is not None else post.created_at)
        meta = _detail_meta(author, published_date, date_label="Publikováno")
        detail_body = (
            f'<article class="web-post">'
            f'{meta}{cover}<div class="web-post-body">{render_article_body(body_text)}</div>'
            f'</article>'
        )
        if revision is not None:
            return HTMLResponse(_detail_document(
                session, setting_key="web.post_detail_template_id", detail_html=detail_body,
                title=title,
                seo_title=seo_title,
                description=description,
                canonical_url=canonical_url,
                public_path=post_url(session, revision.slug or post.slug),
                og_image=(f"/media/{revision.og_image_id or cover_id}/file" if (revision.og_image_id or cover_id) else ""),
                og_type="article",
                noindex=noindex,
            ))
        # Pre-snapshot compatibility has no linked layout to render the page
        # heading, therefore it retains one semantic title of its own.
        legacy_post_body = (
            f'<article class="web-post"><h1 class="web-post-title">{escape(title)}</h1>'
            f'{meta}{cover}<div class="web-post-body">{render_article_body(body_text)}</div></article>'
        )
        return HTMLResponse(render_site_page(
            session, page, site_title=settings_data["site_title"],
            site_tagline=settings_data["site_tagline"], site_logo=settings_data["site_logo"],
            site_meta=settings_data["site_meta"], nav_items=_main_nav(session),
            enabled_components=_enabled_components(session), social_links=_social_links(session, settings_data),
            footer_extra=_footer_extra(settings_data), body_override=legacy_post_body,
            document_title=format_document_title(seo_title, settings_data["site_title"], settings_data["title_pattern"]),
            favicon=settings_data["favicon"],
            canonical_url=_absolute_public_url(
                session, post_url(session, post.slug), explicit=canonical_url,
            ),
            og_image=_absolute_public_asset(
                session, f"/media/{post.og_image_id or cover_id}/file"
                if (post.og_image_id or cover_id) else settings_data["og_image"],
            ),
            og_type="article",
        ))
    finally:
        session.close()


@app.get("/media/{media_id}/file")
def site_media(media_id: int):
    session = SessionLocal()
    try:
        record = session.query(WebMedia).options(load_only(
            WebMedia.id,
            WebMedia.filename,
            WebMedia.path,
            WebMedia.mime,
            WebMedia.size,
            WebMedia.is_public,
        )).filter_by(id=media_id).one_or_none()
        # Avoid a second database lookup for explicitly public files. Media
        # referenced only by a publication still goes through the exact
        # snapshot-boundary check.
        if not record or (not record.is_public and not _media_is_published(session, media_id)):
            raise HTTPException(404, "Media not found")
        path = _media_path(record)
        if not path.is_file():
            raise HTTPException(404, "Media file is missing")
        filename = quote(record.filename or "file")
        return FileResponse(
            path,
            media_type=record.mime or "application/octet-stream",
            headers={"Content-Disposition": f'inline; filename*=UTF-8\'\'{filename}', "X-Content-Type-Options": "nosniff"},
        )
    finally:
        session.close()


@app.get("/{page_path:path}", response_class=HTMLResponse)
def nested_site_page(page_path: str, request: Request):
    """Resolve immutable published paths, including nested page hierarchies."""
    session = SessionLocal()
    try:
        path = f"/{page_path.strip('/')}"
        post_slug = match_pattern(
            session, "web.post_url_pattern", DEFAULT_POST_URL_PATTERN, "slug", path, label="Article",
        )
        if post_slug is not None:
            return site_post(post_slug)
        event_id = match_event_pattern(session, path)
        if event_id is not None:
            return site_event(int(event_id))
        page = _find_published_page(session, f"/{page_path}")
        if not page:
            raise HTTPException(404, "Stránka nebyla nalezena")
        return HTMLResponse(_render(session, page, query=dict(request.query_params)))
    finally:
        session.close()
