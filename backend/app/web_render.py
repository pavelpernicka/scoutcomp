"""Legacy compatibility renderer for pre-v2 published web pages.

The public site server (and optionally the in-app preview) renders the stored
page HTML into a complete static document: theme stylesheet, navigation,
rewritten media URLs and fully rendered web components – no JavaScript, no
authentication needed by visitors. New publications use ``app.web.renderer``;
do not add new authoring primitives or presentation components here.
"""
from __future__ import annotations

import calendar
import html as html_module
import re
from datetime import datetime, timedelta
from html import escape
from html.parser import HTMLParser
from typing import Iterable
from urllib.parse import urlparse

from sqlalchemy.orm import Session

from .models import ScoutEvent, WebMedia, WebPage
from .web_defaults import COMPONENT_TAG, THEME_CSS
from .web.renderer import (
    CSS_VALUE_BREAKOUT,
    SAFE_ATTRS,
    SAFE_CSS_PROPERTIES,
    SAFE_TAGS,
    UNSAFE_CSS,
    VOID_TAGS,
)

CZECH_MONTHS = (
    "ledna", "února", "března", "dubna", "května", "června",
    "července", "srpna", "září", "října", "listopadu", "prosince",
)
CZECH_MONTHS_SHORT = ("led", "úno", "bře", "dub", "kvě", "čvn", "čvc", "srp", "zář", "říj", "lis", "pro")
CZECH_WEEKDAYS = ("pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota", "neděle")

KIND_LABELS = {
    "meeting": "Schůzka",
    "trip": "Výprava",
    "other": "Akce",
}
KIND_ICONS = {
    "meeting": "fa-people-group",
    "trip": "fa-campground",
    "other": "fa-star",
}

SITE_CSS = THEME_CSS

_LEGACY_DROP_CONTENT = {"script", "style", "object", "embed", "svg", "math", "template"}
_RICH_TEXT_TAGS = {"iframe", "video"}
_RICH_TEXT_VOID_TAGS = {"source"}
_EMBED_HOSTS = {"www.youtube.com", "www.youtube-nocookie.com", "player.vimeo.com"}


def _safe_legacy_url(value: str, *, image: bool = False) -> str:
    text = str(value or "").strip()
    if not text or any(ord(char) < 32 for char in text) or text.startswith("//"):
        return ""
    parsed = urlparse(text)
    allowed = {"http", "https"} if image else {"http", "https", "mailto", "tel"}
    if parsed.scheme and parsed.scheme.lower() not in allowed:
        return ""
    return text


def _safe_embed_url(value: str) -> str:
    """Allow only standard HTTPS YouTube/Vimeo player URLs in rich text."""
    safe_url = _safe_legacy_url(value, image=True)
    parsed = urlparse(safe_url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or host not in _EMBED_HOSTS:
        return ""
    if host in {"www.youtube.com", "www.youtube-nocookie.com"} and parsed.path.startswith("/embed/"):
        return safe_url
    if host == "player.vimeo.com" and parsed.path.startswith("/video/"):
        return safe_url
    return ""


def _safe_legacy_style(value: str) -> str:
    declarations = []
    for declaration in value.split(";"):
        prop, separator, raw_value = declaration.partition(":")
        prop = prop.strip().lower()
        css_value = raw_value.strip()
        if not separator or prop not in SAFE_CSS_PROPERTIES or prop in {"position", "z-index"}:
            continue
        if len(css_value) > 500 or UNSAFE_CSS.search(css_value) or CSS_VALUE_BREAKOUT.search(css_value):
            continue
        declarations.append(f"{prop}:{css_value}")
    return ";".join(declarations)


class _LegacyHTMLSanitizer(HTMLParser):
    """Small allowlist sanitizer isolated to pre-v2 migration content."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.output: list[str] = []
        self.suppressed_tags: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag in _LEGACY_DROP_CONTENT:
            self.suppressed_tags.append(tag)
            return
        if self.suppressed_tags:
            return
        if tag == "iframe":
            src = next((value or "" for key, value in attrs if key.lower() == "src"), "")
            if not _safe_embed_url(src):
                self.suppressed_tags.append(tag)
                return
        if tag not in SAFE_TAGS and tag not in _RICH_TEXT_TAGS and tag != COMPONENT_TAG:
            return
        clean = []
        for raw_key, raw_value in attrs:
            key = raw_key.lower()
            value = raw_value or ""
            if key.startswith("on"):
                continue
            if tag == COMPONENT_TAG and (key == "data-component" or key.startswith("data-")):
                if re.fullmatch(r"data-[a-z0-9_-]{1,80}", key):
                    clean.append((key, value[:1000]))
                continue
            if tag == "iframe" and key == "src":
                safe_url = _safe_embed_url(value)
                if safe_url:
                    clean.append((key, safe_url))
            elif key in {"href", "src"}:
                safe_url = _safe_legacy_url(value, image=key == "src")
                if safe_url:
                    clean.append((key, safe_url))
            elif key == "style":
                style = _safe_legacy_style(value)
                if style:
                    clean.append((key, style))
            elif key in SAFE_ATTRS or key in {"allow", "allowfullscreen", "controls", "data-media-id", "frameborder", "loop", "muted", "playsinline", "poster", "preload", "referrerpolicy"} or key.startswith("aria-"):
                clean.append((key, value[:1000]))
        attr_html = "".join(f' {key}="{escape(value, quote=True)}"' for key, value in clean)
        self.output.append(f"<{tag}{attr_html}>")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if self.suppressed_tags:
            if tag == self.suppressed_tags[-1]:
                self.suppressed_tags.pop()
            return
        if (tag in SAFE_TAGS or tag in _RICH_TEXT_TAGS or tag == COMPONENT_TAG) and tag not in (VOID_TAGS | _RICH_TEXT_VOID_TAGS):
            self.output.append(f"</{tag}>")

    def handle_data(self, data: str) -> None:
        if not self.suppressed_tags:
            self.output.append(escape(data))


def sanitize_legacy_html(value: str | None) -> str:
    parser = _LegacyHTMLSanitizer()
    parser.feed(value or "")
    parser.close()
    return "".join(parser.output)


def _extract_styles(html: str | None) -> str:
    """Return the content of the page's <style> block (if any)."""
    if not html:
        return ""
    match = re.search(r"<style[^>]*>(.*?)</style>", html, re.DOTALL | re.IGNORECASE)
    return match.group(1) if match else ""


def _strip_styles(html: str | None) -> str:
    if not html:
        return ""
    return re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.DOTALL | re.IGNORECASE)


def _rewrite_media_urls(html: str, base: str = "") -> str:
    """Rewrite /api/web/media/{id}/file URLs to the public site's own path."""
    pattern = re.compile(r"(/api/web/media/(\d+)/file)")
    if not base:
        return pattern.sub(r"/media/\2/file", html)

    def _replace(match: re.Match) -> str:
        return f"{base}/media/{match.group(2)}/file"

    return pattern.sub(_replace, html)


def _fmt_date(value: datetime) -> str:
    return f"{value.day}. {CZECH_MONTHS[value.month - 1]} {value.year}"


def _fmt_datetime(value: datetime) -> str:
    return f"{value.day}. {CZECH_MONTHS[value.month - 1]} {value.year}, {value.strftime('%H:%M')}"


def _fmt_weekday(value: datetime) -> str:
    return CZECH_WEEKDAYS[value.weekday()]


def _fmt_time_range(starts: datetime, ends: datetime | None) -> str:
    if not ends or ends.date() == starts.date():
        return f"{starts.strftime('%H:%M')}–{ends.strftime('%H:%M')}" if ends else starts.strftime("%H:%M")
    return f"{_fmt_datetime(starts)} – {_fmt_datetime(ends)}"


def _now() -> datetime:
    """Events are stored as naive UTC datetimes."""
    return datetime.now().astimezone().replace(tzinfo=None) + timedelta(hours=0)


def _event_query(db: Session, team_id: int | None = None) -> Iterable[ScoutEvent]:
    query = db.query(ScoutEvent).filter(ScoutEvent.audience == "members")
    if team_id:
        query = query.filter(ScoutEvent.team_id == team_id)
    return query


def _int_param(value: str | None) -> int | None:
    if not value:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------- components


def render_events_list(db: Session, params: dict, *, team_id: int | None = None, current_slug: str | None = None, media_base: str = "") -> str:
    try:
        limit = max(1, min(int(params.get("limit", 10)), 50))
    except (TypeError, ValueError):
        limit = 10
    events = (
        _event_query(db, team_id or _int_param(params.get("team_id")))
        .filter(ScoutEvent.starts_at >= _now())
        .order_by(ScoutEvent.starts_at.asc())
        .limit(limit)
        .all()
    )
    if not events:
        return '<div class="web-empty">Zatím žádné plánované akce.</div>'
    cards = []
    for event in events:
        title = escape(event.title)
        location = escape(event.location) if event.location else None
        kind = event.kind or "other"
        icon = KIND_ICONS.get(kind, KIND_ICONS["other"])
        label = KIND_LABELS.get(kind, "Akce")
        meta = f"{_fmt_datetime(event.starts_at)} · {location}" if location else _fmt_datetime(event.starts_at)
        team_name = escape(event.team.name) if event.team and event.team.name else None
        if team_name:
            meta = f"{meta} · {team_name}"
        description = escape((event.description or "").strip()[:160])
        desc_html = f'<p class="web-list-desc">{description}</p>' if description else ""
        cards.append(
            f'<article class="web-event-card">'
            f'<div class="web-event-date"><span class="web-event-day">{event.starts_at.day}</span>'
            f'<span class="web-event-month">{CZECH_MONTHS_SHORT[event.starts_at.month - 1]}</span></div>'
            f'<div class="web-event-body">'
            f'<p class="web-list-title">{title}<span class="web-badge"><i class="fa-solid {icon}"></i> {label}</span></p>'
            f'<p class="web-list-meta">{meta}</p>{desc_html}'
            f'</div></article>'
        )
    return f'<div class="web-event-grid">{"".join(cards)}</div>'


def render_meetups(db: Session, params: dict, *, team_id: int | None = None, current_slug: str | None = None, media_base: str = "") -> str:
    target_team = _int_param(params.get("team_id")) or team_id
    events = (
        _event_query(db, target_team)
        .filter(ScoutEvent.kind == "meeting", ScoutEvent.starts_at >= _now())
        .order_by(ScoutEvent.starts_at.asc())
        .limit(20)
        .all()
    )
    if not events:
        return '<div class="web-empty">Zatím žádné naplánované schůzky.</div>'
    items = []
    for event in events:
        team_name = escape(event.team.name) if event.team and event.team.name else ""
        location = escape(event.location) if event.location else None
        items.append(
            f'<li class="web-list-item">'
            f'<div class="web-list-icon"><i class="fa-solid fa-people-group" aria-hidden="true"></i></div>'
            f'<div class="web-list-body">'
            f'<p class="web-list-title">{escape(event.title)}{f"<span class=web-badge>{team_name}</span>" if team_name else ""}</p>'
            f'<p class="web-list-meta">{_fmt_weekday(event.starts_at)}, {_fmt_datetime(event.starts_at)}'
            f'{" · " + location if location else ""}</p>'
            f'</div></li>'
        )
    return f'<ul class="web-list">{"".join(items)}</ul>'


def render_events_calendar(db: Session, params: dict, *, team_id: int | None = None, current_slug: str | None = None, media_base: str = "") -> str:
    today = _now().date()
    year = today.year
    month = today.month
    try:
        if params.get("month"):
            parsed = datetime.strptime(params["month"], "%Y-%m")
            year, month = parsed.year, parsed.month
    except (TypeError, ValueError):
        pass
    team = team_id or _int_param(params.get("team_id"))
    events = (
        _event_query(db, team)
        .filter(ScoutEvent.starts_at >= datetime(year, month, 1), ScoutEvent.starts_at < datetime(year, month, 1) + timedelta(days=32))
        .order_by(ScoutEvent.starts_at.asc())
        .all()
    )
    by_day: dict[int, list] = {}
    for event in events:
        by_day.setdefault(event.starts_at.day, []).append(event)

    month_name = CZECH_MONTHS[month - 1]
    header = (
        f'<div class="cal-head"><span class="cal-title">{month_name} {year}</span>'
        f'<span class="cal-title" style="font-weight:500;font-size:.95rem">{_fmt_datetime(today)}</span></div>'
    )
    rows = []
    first = datetime(year, month, 1)
    cal = calendar.Calendar(firstweekday=0)
    days = list(cal.itermonthdays(year, month))
    week_row = []
    for index, day in enumerate(days):
        if day == 0:
            week_row.append(f'<td class="web-calendar web-cal-out"></td>')
        else:
            day_events = by_day.get(day, [])
            is_today = day == today.day and month == today.month and year == today.year
            cells = []
            for event in day_events[:3]:
                color = event.color or "#0a224e"
                cells.append(f'<span class="cal-event show-mobile" style="background:{html_module.escape(color)}">{escape(event.title[:14])}</span>')
            week_row.append(
                f'<td class="{"cal-today" if is_today else ""}"><span class="cal-day">{day}</span>{"".join(cells)}</td>'
            )
        if (index + 1) % 7 == 0:
            rows.append(f'<tr>{"".join(week_row)}</tr>')
            week_row = []
    if week_row:
        rows.append(f'<tr>{"".join(week_row)}</tr>')
    return (
        f'<div class="web-calendar">{header}'
        f'<table><thead><tr>{"".join(f"<th>{day}</th>" for day in ("Po", "Út", "St", "Čt", "Pá", "So", "Ne"))}</tr></thead>'
        f'<tbody>{"".join(rows)}</tbody></table></div>'
    )


def render_page_menu(db: Session, params: dict, *, team_id: int | None = None, current_slug: str | None = None, media_base: str = "") -> str:
    from .models import WebPageRevision
    revisions = (
        db.query(WebPageRevision)
        .join(WebPage, WebPage.published_revision_id == WebPageRevision.id)
        .filter(WebPage.published.is_(True), WebPage.deleted_at.is_(None))
        .order_by(WebPage.position.asc(), WebPageRevision.created_at.desc())
        .all()
    )
    if not revisions:
        return '<div class="web-empty">Zatím zde nejsou žádné publikované stránky.</div>'
    items = []
    for revision in revisions:
        path = revision.path or f"/{revision.path_segment}"
        active = " class='web-menu-link active'" if revision.path_segment == current_slug else " class='web-menu-link'"
        items.append(f'<li><a href="{escape(path, quote=True)}" {active}>{escape(revision.title or "")}</a></li>')
    return f'<ul class="web-menu">{"".join(items)}</ul>'


def render_news_list(db: Session, params: dict, *, team_id: int | None = None, current_slug: str | None = None, media_base: str = "") -> str:
    from .models import WebPost

    try:
        limit = max(1, min(int(params.get("limit", 3)), 20))
    except (TypeError, ValueError):
        limit = 3
    posts = (
        db.query(WebPost)
        .filter(WebPost.published.is_(True))
        .order_by(WebPost.published_at.desc())
        .limit(limit)
        .all()
    )
    if not posts:
        return '<div class="web-empty">Zatím žádné novinky.</div>'
    cards = []
    for post in posts:
        href = f"/post/{escape(post.slug)}"
        title = escape(post.title)
        date = _fmt_date(post.published_at) if post.published_at else ""
        excerpt = escape((post.excerpt or post.body or "").strip()[:180])
        cover = ""
        if post.cover_media_id:
            cover = (
                f'<a class="web-news-cover" href="{href}">'
                f'<img src="{media_base}/media/{post.cover_media_id}/file" alt="{title}" loading="lazy"></a>'
            )
        cards.append(
            f'<article class="web-news-card">{cover}'
            f'<div class="web-news-body">'
            f'<p class="web-list-meta">{date}</p>'
            f'<h3 class="web-news-title"><a href="{href}">{title}</a></h3>'
            f'<p class="web-list-desc">{excerpt}</p>'
            f'<a class="web-news-more" href="{href}">Celý příspěvek <i class="fa-solid fa-arrow-right"></i></a>'
            f'</div></article>'
        )
    return f'<div class="web-news-grid">{"".join(cards)}</div>'


def render_markdown(markdown_text: str) -> str:
    """A small, safe markdown renderer for news posts (no external dependency)."""
    lines = (markdown_text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    output: list[str] = []
    paragraph: list[str] = []
    in_code = False
    in_list: list[str] = []
    list_type = ""

    def _inline(text: str) -> str:
        text = escape(text)
        text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
        text = re.sub(r"(?<!\*)\*([^*]+?)\*(?!\*)", r"<em>\1</em>", text)
        text = re.sub(r"\[([^\]]+)\]\((https?://[^ )]+)\)", r'<a href="\2" target="_blank" rel="noopener">\1</a>', text)
        return text

    def _flush_paragraph():
        if paragraph:
            output.append(f"<p>{_inline(' '.join(paragraph))}</p>")
            paragraph.clear()

    def _flush_list():
        if in_list:
            tag = "ol" if list_type == "ol" else "ul"
            output.append(f"<{tag}>" + "".join(f"<li>{_inline(item)}</li>" for item in in_list) + f"</{tag}>")
            in_list.clear()

    for line in lines:
        if line.strip().startswith("```"):
            _flush_paragraph()
            _flush_list()
            if in_code:
                output.append("</pre>")
                in_code = False
            else:
                output.append("<pre>")
                in_code = True
            continue
        if in_code:
            # Fenced code is text, never an HTML escape hatch.  Without this,
            # a published post could close <pre> and inject arbitrary markup
            # (including inline styles allowed by the public CSP).
            output.append(escape(line))
            continue
        if not line.strip():
            _flush_paragraph()
            _flush_list()
            continue
        heading = re.match(r"^(#{1,4})\s+(.*)$", line)
        if heading:
            _flush_paragraph()
            _flush_list()
            level = len(heading.group(1))
            output.append(f"<h{level}>{_inline(heading.group(2))}</h{level}>")
            continue
        if line.strip() in {"---", "***"}:
            _flush_paragraph()
            _flush_list()
            output.append("<hr>")
            continue
        bullet = re.match(r"^[-*]\s+(.*)$", line)
        if bullet:
            _flush_paragraph()
            if list_type != "ul":
                _flush_list()
                list_type = "ul"
            in_list.append(bullet.group(1))
            continue
        numbered = re.match(r"^\d+[.)]\s+(.*)$", line)
        if numbered:
            _flush_paragraph()
            if list_type != "ol":
                _flush_list()
                list_type = "ol"
            in_list.append(numbered.group(1))
            continue
        _flush_list()
        paragraph.append(line.strip())
    _flush_paragraph()
    _flush_list()
    if in_code:
        output.append("</pre>")
    return "\n".join(output)


def render_article_body(value: str | None) -> str:
    """Render legacy Markdown and rich-editor HTML through a safe boundary."""
    content = (value or "").strip()
    if content.startswith("<"):
        return _rewrite_media_urls(sanitize_legacy_html(content))
    return render_markdown(content)


def render_news_post(db: Session, params: dict, *, team_id: int | None = None, current_slug: str | None = None, media_base: str = "") -> str:
    from .models import WebPost

    post = db.query(WebPost).filter_by(slug=current_slug or "", published=True).one_or_none()
    if not post:
        return '<div class="web-empty">Příspěvek nebyl nalezen.</div>'
    cover = ""
    if post.cover_media_id:
        cover = f'<img src="{media_base}/media/{post.cover_media_id}/file" alt="{escape(post.title)}" class="web-post-cover">'
    body = render_article_body(post.body)
    return (
        f'<article class="web-post">'
        f'<p class="web-list-meta">{_fmt_datetime(post.published_at) if post.published_at else ""}</p>'
        f'<h2 class="web-post-title">{escape(post.title)}</h2>'
        f'{cover}<div class="web-post-body">{body}</div>'
        f'</article>'
    )


def render_media_gallery(db: Session, params: dict, *, team_id: int | None = None, current_slug: str | None = None, media_base: str = "") -> str:
    album = (params.get("album") or "").strip()
    query = db.query(WebMedia).order_by(WebMedia.created_at.desc())
    if album:
        query = query.filter(WebMedia.album == album)
    items = query.limit(120).all()
    if not items:
        return '<div class="web-empty">Zatím zde nejsou žádné fotografie.</div>'
    figures = []
    for item in items:
        src = f"{media_base}/media/{item.id}/file"
        alt = escape((item.alt or item.filename or "fotografie").strip())
        caption = escape(item.caption) if item.caption else ""
        fig = f'<figure class="web-media-figure"><img src="{src}" alt="{alt}" loading="lazy">'
        if caption:
            fig += f'<figcaption class="web-media-caption">{caption}</figcaption>'
        fig += "</figure>"
        figures.append(fig)
    return f'<div class="web-media-grid">{"".join(figures)}</div>'


RENDERERS = {
    "events_list": render_events_list,
    "events_calendar": render_events_calendar,
    "meetups": render_meetups,
    "page_menu": render_page_menu,
    "media_gallery": render_media_gallery,
    "news_list": render_news_list,
    "news_post": render_news_post,
}


def render_components_in_html(
    db: Session,
    html: str,
    *,
    current_slug: str | None = None,
    enabled_components: set[str] | None = None,
    media_base: str = "",
) -> str:
    """Replace every <scoutcomp-web-component> placeholder with server-rendered HTML."""

    pattern = re.compile(
        rf"<{COMPONENT_TAG}([^>]*?)>\s*</{COMPONENT_TAG}>", re.IGNORECASE
    )

    def _replace(match: re.Match) -> str:
        attributes = match.group(1)
        component_match = re.search(r'data-component="([^"]+)"', attributes)
        if not component_match:
            return ""
        name = component_match.group(1)
        params: dict[str, str] = {}
        for key, value in re.findall(r'data-([a-zA-Z0-9_-]+)="([^"]*)"', attributes):
            if key in {"component"}:
                continue
            params[key.replace("-", "_")] = html_module.unescape(value)
        if enabled_components is not None and name not in enabled_components:
            return ""
        renderer = RENDERERS.get(name)
        if not renderer:
            return ""
        try:
            return renderer(db, params, team_id=None, current_slug=current_slug, media_base=media_base)
        except Exception:
            return ""

    return pattern.sub(_replace, html)


def _nav_links_from_pages(db: Session, current_slug: str | None, nav_pages: list[WebPage] | None) -> list[str]:
    nav_pages = nav_pages if nav_pages is not None else (
        db.query(WebPage).filter(WebPage.published.is_(True)).order_by(WebPage.position.asc(), WebPage.updated_at.desc()).all()
    )
    links = []
    for item in nav_pages:
        href = "/" if item.slug == "main" else f"/{escape(item.slug)}"
        active = " class='web-nav-link active'" if item.slug == current_slug else " class='web-nav-link'"
        links.append(f'<a href="{href}"{active}>{escape(item.title)}</a>')
    return links


def render_site_page(
    db: Session,
    page: WebPage,
    *,
    site_title: str = "ScoutComp",
    site_tagline: str = "",
    site_logo: str = "",
    site_meta: str = "",
    nav_items: list[tuple[str, str]] | None = None,
    media_base: str = "",
    include_site_css: bool = True,
    enabled_components: set[str] | None = None,
    extra_head: str = "",
    social_links: list[tuple[str, str]] | None = None,
    footer_extra: str = "",
    body_override: str | None = None,
    document_title: str = "",
    favicon: str = "",
    canonical_url: str = "",
    og_image: str = "",
    og_type: str = "website",
) -> str:
    """Render a WebPage into a complete standalone HTML document."""
    body = sanitize_legacy_html(_strip_styles(page.html or ""))
    body = _rewrite_media_urls(body, base=media_base)
    body = render_components_in_html(
        db, body,
        current_slug=page.slug,
        enabled_components=enabled_components,
        media_base=media_base,
    )
    if body_override is not None:
        body = body_override

    if nav_items is not None:
        nav_links = []
        for label, href in nav_items:
            active = " class='web-nav-link active'" if href == f"/{page.slug}" else " class='web-nav-link'"
            safe_href = _safe_legacy_url(href)
            if safe_href:
                nav_links.append(f'<a href="{escape(safe_href, quote=True)}"{active}>{escape(label)}</a>')
    else:
        nav_links = _nav_links_from_pages(db, page.slug, None)

    safe_logo = _safe_legacy_url(site_logo, image=True)
    brand_logo = f'<img src="{escape(safe_logo, quote=True)}" alt="" class="web-nav-logo">' if safe_logo else '<i class="fa-solid fa-campground" aria-hidden="true"></i>'
    brand = f'<a class="web-nav-brand" href="/">{brand_logo}{escape(site_title)}</a>'

    social_html = ""
    if social_links:
        icons = {
            "facebook": "fa-brands fa-facebook-f",
            "instagram": "fa-brands fa-instagram",
            "whatsapp": "fa-brands fa-whatsapp",
            "email": "fa-solid fa-envelope",
        }
        chips = []
        for label, url in social_links:
            safe_url = _safe_legacy_url(url)
            if not safe_url:
                continue
            icon = icons.get(label, "fa-solid fa-link")
            chips.append(f'<a class="web-social" href="{escape(safe_url, quote=True)}" aria-label="{escape(label, quote=True)}"><i class="{icon}"></i></a>')
        social_html = f'<div class="web-socials">{"".join(chips)}</div>'

    styles = _extract_styles(page.html or "")
    if styles and UNSAFE_CSS.search(styles):
        styles = ""
    css = SITE_CSS if include_site_css else ""
    meta_description = (site_meta or site_tagline or f"{page.title} – {site_title}").strip()
    safe_favicon = _safe_legacy_url(favicon, image=True)
    favicon_link = f'<link rel="icon" href="{escape(safe_favicon, quote=True)}">\n' if safe_favicon else ""
    rendered_title = document_title or f"{page.title} – {site_title}"
    safe_canonical = _safe_legacy_url(canonical_url) or f"/{page.slug}"
    safe_og_image = _safe_legacy_url(og_image, image=True)
    social_image = (
        f'<meta property="og:image" content="{escape(safe_og_image, quote=True)}">\n'
        f'<meta name="twitter:image" content="{escape(safe_og_image, quote=True)}">\n'
        if safe_og_image else ""
    )
    return (
        "<!DOCTYPE html>\n"
        '<html lang="cs">\n'
        "<head>\n"
        '<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        f"<title>{escape(rendered_title)}</title>\n"
        f'<meta name="description" content="{escape(meta_description)}">\n'
        f'<meta property="og:type" content="{escape(og_type, quote=True)}">\n'
        f'<meta property="og:title" content="{escape(rendered_title)}">\n'
        f'<meta property="og:description" content="{escape(meta_description)}">\n'
        f'<meta property="og:url" content="{escape(safe_canonical, quote=True)}">\n'
        f'<meta name="twitter:card" content="{"summary_large_image" if safe_og_image else "summary"}">\n'
        f'<meta name="twitter:title" content="{escape(rendered_title, quote=True)}">\n'
        f'<meta name="twitter:description" content="{escape(meta_description, quote=True)}">\n'
        f'{social_image}'
        f'<link rel="canonical" href="{escape(safe_canonical, quote=True)}">\n'
        f"{favicon_link}"
        f"{extra_head}\n"
        '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">\n'
        '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
        '<link href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,400;0,600;1,400&family=Poppins:wght@500;600;700;800&display=swap" rel="stylesheet">\n'
        f"<style>{css}\n{styles}</style>\n"
        "</head>\n"
        "<body>\n"
        f'<nav class="web-nav"><div class="web-nav-inner">{brand}<div class="web-nav-links">{"".join(nav_links)}</div></div></nav>\n'
        f'<main class="web-main">{body}</main>\n'
        f'<footer class="web-footer"><div class="web-container">'
        f'<div class="web-footer-row"><span class="web-footer-brand">{brand_logo}{escape(site_title)}</span>{social_html}</div>'
        f'{footer_extra}'
        f'<small>© {datetime.now().year} {escape(site_title)} · webové stránky oddílu</small>'
        f'</div></footer>\n'
        "</body>\n"
        "</html>\n"
    )
