"""Public web hosting server.

A separate, dependency-free HTTP app that serves *published* pages of the web
module. It is meant to run on its own port (default 8090) behind a reverse
proxy (nginx), so visitors never touch the authenticated API.

Run with::

    uvicorn app.site_app:app --host 0.0.0.0 --port 8090

Everything is server-rendered static HTML (web components are expanded
server-side), so it needs no JavaScript and no login.
"""
from __future__ import annotations

from html import escape
from pathlib import Path
from urllib.parse import quote, urlparse

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, Response
from sqlalchemy.orm import Session

from .config import settings
from .database import SessionLocal
from .models import (
    RegisteredModule,
    ScoutEvent,
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
from .web_render import render_article_body, render_site_page
from .web.renderer import CompileError, compile_project, render_document, render_project
from .web.data_sources import is_media_published
from .web.url_schemes import (
    DEFAULT_MEETING_URL_PATTERN,
    DEFAULT_POST_URL_PATTERN,
    match_pattern,
    meeting_url,
    post_url,
)

register_all_modules()

app = FastAPI(title="ScoutComp Public Site", docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware("http")
async def public_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; media-src 'self' https:; "
        "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com; "
        "font-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    )
    return response

DEFAULT_SITE_TITLE = "ScoutComp"


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
        "site_tagline": _get("web.site_tagline"),
        "site_meta": _get("web.site_meta"),
        "site_logo": _get("web.site_logo"),
        "contact_address": _get("web.contact_address"),
        "contact_phone": _get("web.contact_phone"),
        "contact_email": _get("web.contact_email"),
        "contact_meeting_time": _get("web.contact_meeting_time"),
        "social_facebook": _get("web.social_facebook"),
        "social_instagram": _get("web.social_instagram"),
        "social_whatsapp": _get("web.social_whatsapp"),
    }


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
        .join(WebPageRevision, WebPage.published_revision_id == WebPageRevision.id)
        .filter(WebPage.published.is_(True), WebPage.deleted_at.is_(None))
        .order_by(WebPageRevision.created_at.desc())
        .first()
    )
    if page:
        return page
    return db.query(WebPage).filter(
        WebPage.published.is_(True), WebPage.published_revision_id.is_(None),
        WebPage.deleted_at.is_(None),
    ).order_by(WebPage.updated_at.desc()).first()


def _find_published_page(db: Session, path: str) -> WebPage | None:
    path = "/" + path.strip("/") if path != "/" else "/"
    page = (
        db.query(WebPage)
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
    query = db.query(WebPage).filter(
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
    description: str = "",
    canonical_url: str = "",
    noindex: bool = False,
) -> str:
    """Render a safe article/event fragment through an optional layout."""
    raw_id = get_config_value(db, setting_key)
    try:
        template_id = int(raw_id) if raw_id else None
    except (TypeError, ValueError):
        template_id = None
    template = db.query(WebTemplate).filter_by(id=template_id, usage_mode="linked_layout").one_or_none() if template_id else None
    tokens, global_css, base_css = _published_style(db)
    if template and isinstance(template.published_project_data, dict):
        try:
            tree = compile_project(template.published_project_data).tree
            part_css: list[str] = []
            body = render_project(
                db, tree, slot_tree={"type": "sc-detail-content"},
                page={"title": title, "detail_html": detail_html}, site=_site_settings(db), css_layers=part_css,
            )
            template_css = template.published_css or ""
            if template.theme_version_id:
                from .web.theme_package import rewrite_theme_asset_urls
                template_css = rewrite_theme_asset_urls(template_css, template.theme_version_id)
            return render_document(
                body, title=title, description=description, canonical_url=canonical_url, noindex=noindex,
                css=f"{global_css}\n{'\n'.join(part_css)}\n{template_css}", base_css=base_css, tokens=tokens,
            )
        except CompileError:
            # A deleted/inconsistent setting must not take a public detail down.
            pass
    return render_document(
        detail_html, title=title, description=description, canonical_url=canonical_url, noindex=noindex,
        css=global_css, base_css=base_css, tokens=tokens,
    )


def _render(db: Session, page: WebPage, extra_head: str = "", query: dict[str, str] | None = None) -> str:
    if page.published_revision_id:
        revision = db.query(WebPageRevision).filter_by(id=page.published_revision_id, page_id=page.id).one_or_none()
        if not revision:
            raise HTTPException(404, "Published page is unavailable")
        return _render_revision(db, page, revision, query=query)
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
    page = (query or {}).get("page")
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
        variants = revision.rendered_variants if isinstance(revision.rendered_variants, dict) else {}
        document = revision.rendered_html if key == "" else variants.get(key)
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
            render_tree = compile_project(template.published_project_data).tree
            slot_tree = tree
            template_css = template.published_css or ""
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
    return render_document(
        body,
        title=revision.seo_title or revision.title or page.title,
        description=revision.meta_description or "",
        canonical_url=revision.canonical_url or "",
        noindex=revision.noindex,
        css=f"{global_css}\n{linked_css}\n{css}",
        base_css=base_css,
        tokens=tokens,
    )


@app.get("/healthz", tags=["meta"])
def healthcheck():
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


def _public_base(value: str | None) -> str:
    parsed = urlparse(value or "")
    return (value or "").rstrip("/") if parsed.scheme in {"http", "https"} and parsed.netloc else ""


@app.get("/sitemap.xml")
def sitemap():
    session = SessionLocal()
    try:
        base = _public_base(get_config_value(session, "web.site_base_url"))
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
            urls.append(f"<url><loc>{escape((base or '').rstrip('/') + meeting_url(session, event.id))}</loc></url>")
        body = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
            f'{"".join(urls)}</urlset>'
        )
        return Response(body, media_type="application/xml")
    finally:
        session.close()


@app.get("/robots.txt")
def robots():
    session = SessionLocal()
    try:
        base = _public_base(get_config_value(session, "web.site_base_url"))
    finally:
        session.close()
    return Response(
        "User-agent: *\n"
        "Disallow:\n"
        f"Sitemap: {base}/sitemap.xml\n",
        media_type="text/plain",
    )


@app.get("/meeting/{event_id}", response_class=HTMLResponse)
def site_meeting(event_id: int):
    """Public detail of an event that is explicitly safe for the website."""
    session = SessionLocal()
    try:
        event = session.query(ScoutEvent).filter(
            ScoutEvent.id == event_id,
            ScoutEvent.is_public.is_(True),
        ).one_or_none()
        if not event:
            raise HTTPException(404, "Schůzka nebyla nalezena")
        details = []
        if event.starts_at:
            details.append(f'<p><strong>Začátek:</strong> {escape(event.starts_at.isoformat(sep=" ", timespec="minutes"))}</p>')
        if event.ends_at:
            details.append(f'<p><strong>Konec:</strong> {escape(event.ends_at.isoformat(sep=" ", timespec="minutes"))}</p>')
        if event.location:
            details.append(f'<p><strong>Místo:</strong> {escape(event.location)}</p>')
        body = (
            '<article class="sc-event-detail"><header>'
            f'<p>{escape(event.kind or "event")}</p><h1>{escape(event.title)}</h1>'
            f'</header>{"".join(details)}<div>{render_article_body(event.description or "")}</div></article>'
        )
        return HTMLResponse(_detail_document(
            session, setting_key="web.meeting_detail_template_id", detail_html=body,
            title=event.title, description=(event.description or "")[:300],
        ))
    finally:
        session.close()

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
        post_body = (
            f'<article class="web-post">'
            f'<h2 class="web-post-title">{escape(title)}</h2>'
            f'{cover}<div class="web-post-body">{render_article_body(body_text)}</div>'
            f'</article>'
        )
        if revision is not None:
            return HTMLResponse(_detail_document(
                session, setting_key="web.post_detail_template_id", detail_html=post_body,
                title=seo_title, description=description, canonical_url=canonical_url, noindex=noindex,
            ))
        return HTMLResponse(render_site_page(
            session, page, site_title=settings_data["site_title"],
            site_tagline=settings_data["site_tagline"], site_logo=settings_data["site_logo"],
            site_meta=settings_data["site_meta"], nav_items=_main_nav(session),
            enabled_components=_enabled_components(session), social_links=_social_links(session, settings_data),
            footer_extra=_footer_extra(settings_data), body_override=post_body,
        ))
    finally:
        session.close()


@app.get("/media/{media_id}/file")
def site_media(media_id: int):
    session = SessionLocal()
    try:
        record = session.query(WebMedia).filter_by(id=media_id).one_or_none()
        if not record or not _media_is_published(session, media_id):
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
        meeting_id = match_pattern(
            session, "web.meeting_url_pattern", DEFAULT_MEETING_URL_PATTERN, "id", path, label="Meeting",
        )
        if meeting_id is not None:
            return site_meeting(int(meeting_id))
        page = _find_published_page(session, f"/{page_path}")
        if not page:
            raise HTTPException(404, "Stránka nebyla nalezena")
        return HTMLResponse(_render(session, page, query=dict(request.query_params)))
    finally:
        session.close()
