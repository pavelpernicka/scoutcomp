"""Bundled Ontario scout theme.

The source design is the Apache-2.0 Scout Bootstrap theme customised for the
Ontario troop.  Only the runtime assets used by these declarative resources
are vendored; the original builder, scripts and development dependencies are
intentionally excluded.
"""
from __future__ import annotations

import hashlib
import mimetypes
import re
import shutil
from copy import deepcopy
from pathlib import Path

from sqlalchemy.orm import Session

from ..models import (
    WebReusableComponent,
    WebMenu,
    WebMenuItem,
    WebMenuRevision,
    WebSection,
    WebTemplate,
    WebTheme,
    WebThemeAsset,
    WebThemeVersion,
)

ONTARIO_THEME_ID = "ontario"
ONTARIO_THEME_VERSION = "1.0.0"
ONTARIO_THEME_NAME = "Ontario"
ONTARIO_THEME_DESCRIPTION = (
    "Skautské Bootstrap 5 téma Ontario 1.0 s responzivní hierarchickou navigací, "
    "organickými okraji, datovými archivy, kalendářem a šablonami detailů."
)

_BUNDLE_ROOT = Path(__file__).with_name("builtin_themes") / "ontario"
_ASSET_ROOT = _BUNDLE_ROOT / "assets"


def _project(*components: dict) -> dict:
    return {
        "scoutcomp": {"schemaVersion": 2},
        "pages": [{
            "frames": [{
                "component": {"type": "wrapper", "components": list(components)},
                "styles": [],
            }],
        }],
    }


def _image(src: str, alt: str, classes: str, *, lazy: bool = True) -> dict:
    return {
        "type": "image",
        "tagName": "img",
        "attributes": {
            "src": src, "alt": alt, "class": classes,
            **({"loading": "lazy"} if lazy else {}),
        },
    }


def _element(tag: str, classes: str = "", *, components: list[dict] | None = None,
             content: str | None = None, name: str | None = None, **attributes) -> dict:
    attrs = {"class": classes, **attributes} if classes else dict(attributes)
    node: dict = {"type": "default", "tagName": tag}
    if attrs:
        node["attributes"] = attrs
    if components is not None:
        node["components"] = components
    if content is not None:
        node["content"] = content
    if name:
        node["name"] = name
    return node


def _heading(tag: str, text: str, classes: str = "") -> dict:
    return {"type": "heading", "tagName": tag, "attributes": {"class": classes}, "content": text}


def _text(text: str, classes: str = "", tag: str = "p") -> dict:
    return {"type": "text", "tagName": tag, "attributes": {"class": classes}, "content": text}


def _bind(field: str, *, scope: str = "context", mode: str = "text", fmt: str | None = None) -> dict:
    binding = {"scope": scope, "field": field}
    if fmt:
        binding["format"] = fmt
    return {"type": "sc-bind", "binding": binding, "mode": mode}


def _bound(tag: str, field: str, classes: str = "", *, scope: str = "context", fmt: str | None = None) -> dict:
    return _element(tag, classes, components=[_bind(field, scope=scope, fmt=fmt)])


def _icon(name: str, label: str = "") -> dict:
    return _element("i", f"fa-solid fa-{name} ontario-icon", **({"aria-label": label} if label else {"aria-hidden": "true"}))


ONTARIO_HEADER = _element("nav", "navbar ontario-navbar", name="Ontario – horní navigace",
    components=[_element("div", "container ontario-navbar-inner", components=[
        {"type": "link", "tagName": "a", "attributes": {"class": "navbar-brand", "href": "/", "aria-label": "Ontario – domů"},
         "components": [_image("assets/white_text_next.png", "Ontario", "ontario-wordmark ontario-wordmark-light", lazy=False),
                        _image("assets/blue_text_next.png", "Ontario", "ontario-wordmark ontario-wordmark-dark", lazy=False)]},
        _element("div", "ontario-desktop-menu", components=[
            {"type": "sc-menu", "location": "main", "presentation": "bootstrap-navbar"},
        ]),
        _element("details", "ontario-menu-shell", components=[
            _element("summary", "ontario-menu-toggle", components=[_element("span", "visually-hidden", content="Otevřít nebo zavřít menu")]),
            _element("div", "ontario-menu-panel", components=[
                _element("div", "ontario-menu-tools", components=[_element("span", "ontario-menu-close-label", content="Zavřít")]),
                {"type": "sc-menu", "location": "main", "presentation": "ontario-mobile-navbar"},
            ]),
        ]),
    ])], **{"aria-label": "Hlavní navigace"})

ONTARIO_EDGE = _element("div", "ontario-edge ontario-edge--white", name="Organický skautský okraj",
    components=[_element("span", "ontario-edge-blob ontario-edge-blob--one", **{"aria-hidden": "true"}),
                _element("span", "ontario-edge-blob ontario-edge-blob--two", **{"aria-hidden": "true"}),
                _element("span", "ontario-edge-blob ontario-edge-blob--three", **{"aria-hidden": "true"})],
    **{"aria-hidden": "true"})

ONTARIO_HERO = _element("header", "ontario-hero", name="Ontario – hero", components=[
    _element("div", "ontario-photo-mask ontario-hero-overlay", **{"aria-hidden": "true"}),
    _element("div", "container ontario-hero-content", components=[
        _image("assets/round_notext.png", "Znak oddílu Ontario", "ontario-round-logo", lazy=False),
        _heading("h1", "ONTARIO", "display-3 skaut"),
        _heading("h2", "51. oddíl skautů ve Zlíně při 6. středisku", "h4 fw-normal"),
    ]), deepcopy(ONTARIO_EDGE),
])

ONTARIO_COMPACT_HERO = _element("header", "ontario-compact-hero", name="Kompaktní záhlaví", components=[
    _element("div", "ontario-photo-mask", **{"aria-hidden": "true"}),
    _element("div", "container", components=[
        _heading("h1", "Název stránky", "display-4 skaut"),
        _text("Krátký úvod stránky", "lead"),
    ]), deepcopy(ONTARIO_EDGE),
])

ONTARIO_ABOUT = _element("section", "ontario-about ontario-section", name="O oddílu", components=[
    _element("div", "container", components=[_element("div", "row align-items-center g-5", components=[
        _element("div", "col-md-6", components=[_image("assets/mockups/scout-planning-v1.webp", "Ilustrovaná skautská výprava", "img-fluid ontario-mockup ontario-photo-tint")]),
        _element("div", "col-md-6", components=[
            _heading("h2", "Kdo jsme", "display-5 skaut"),
            _text("Jsme skautský oddíl pro kluky ve věku 11–15 let a spadáme pod 6. skautské středisko ve Zlíně.", "lead"),
            {"type": "link", "tagName": "a", "attributes": {"class": "btn btn-secondary btn-lg btn-skaut", "href": "/o-nas"}, "content": "Více o nás →"},
        ]),
    ])]),
])

ONTARIO_POST_CARD = _element("article", "card shadow-sm ontario-card ontario-post-card", name="Karta aktuality", components=[
    {"type": "image", "tagName": "img", "attributes": {"class": "card-img-top ontario-photo-tint", "alt": "", "loading": "lazy"},
     "scBindings": {"src": {"scope": "context", "field": "cover_url"}, "alt": {"scope": "context", "field": "title"}}},
    _element("div", "card-body", components=[
        _bound("time", "published_at", "ontario-meta", fmt="date"),
        _bound("h3", "title", "h4 card-title skaut"),
        _bound("p", "excerpt", "card-text"),
        {"type": "link", "tagName": "a", "attributes": {"class": "stretched-link ontario-read-more", "aria-label": "Číst příspěvek"},
         "scBindings": {"href": {"scope": "context", "field": "url"}}, "content": "Číst dále →"},
    ]),
])

ONTARIO_EVENT_CARD = _element("article", "card shadow-sm ontario-card ontario-event-card", name="Karta schůzky", components=[
    _element("div", "card-body", components=[
        _bound("time", "start_at", "ontario-meta", fmt="datetime"),
        _bound("h3", "title", "h4 skaut"),
        _bound("p", "description", "card-text"),
        {"type": "link", "tagName": "a", "attributes": {"class": "stretched-link ontario-read-more", "aria-label": "Detail schůzky"},
         "scBindings": {"href": {"scope": "context", "field": "url"}}, "content": "Detail →"},
    ]),
])

def _post_feed(limit: int, *, paginated: bool) -> dict:
    params: dict = {"limit": limit}
    if paginated:
        params["page"] = {"$scBinding": {"scope": "page", "field": "query.page"}}
    children: list[dict] = [_element("div", "row row-cols-1 row-cols-md-2 row-cols-lg-3 g-4", components=[{
        "type": "sc-repeat", "source": "core.posts", "params": params,
        "components": [_element("div", "col", components=[deepcopy(ONTARIO_POST_CARD)])],
        "empty": [_text("Zatím tu nejsou žádné příspěvky.", "ontario-empty")],
    }])]
    if paginated:
        children.append({"type": "sc-pagination", "source": "core.posts", "limit": limit, "params": params})
    return _element("div", "ontario-feed", components=children)


ONTARIO_POSTS = _element("section", "ontario-posts ontario-section", name="Aktuality", components=[
    _element("div", "container", components=[
        _heading("h2", "Příspěvky", "text-center display-6 skaut"),
        _text("Informace o blížících se akcích a novinkách v oddíle", "text-center lead text-muted ontario-section-lead"),
        _post_feed(3, paginated=False),
    ]),
])

ONTARIO_ARCHIVE = _element("section", "ontario-archive ontario-section", name="Archiv příspěvků", components=[
    _element("div", "container", components=[_heading("h1", "Aktuality", "display-4 skaut"), _post_feed(9, paginated=True)]),
])

def _event_feed(limit: int = 9, *, paginated: bool = True, team_id: int | None = None) -> dict:
    params: dict = {"limit": limit, "kind": "meeting"}
    if team_id:
        params["team_id"] = team_id
    if paginated:
        params["page"] = {"$scBinding": {"scope": "page", "field": "query.page"}}
    children: list[dict] = [_element("div", "row row-cols-1 row-cols-md-2 row-cols-lg-3 g-4", components=[{
        "type": "sc-repeat", "source": "core.events", "params": params,
        "components": [_element("div", "col", components=[deepcopy(ONTARIO_EVENT_CARD)])],
        "empty": [_text("Další schůzky právě připravujeme.", "ontario-empty")],
    }])]
    if paginated:
        children.append({"type": "sc-pagination", "source": "core.events", "limit": limit, "params": params})
    return _element("div", "ontario-feed", components=children)


ONTARIO_MEETINGS = _element("section", "ontario-meetings ontario-section", name="Schůzky s paginací", components=[
    _element("div", "container", components=[_heading("h1", "Schůzky", "display-4 skaut"), _event_feed()]),
])

ONTARIO_TEAM_HERO = _element("section", "ontario-team-heading ontario-section", name="Záhlaví družiny", components=[
    _element("div", "container ontario-team-heading-inner", components=[
        _image("assets/mockups/scout-planning-v1.webp", "Ilustrace družiny", "ontario-team-avatar ontario-photo-tint"),
        _element("div", components=[_heading("h1", "Schůzky družiny Lachtanů", "display-5 skaut"), _text("Pravidelně v pátky od 16:00 do 18:00", "lead")]),
    ]),
])

ONTARIO_CALENDAR = _element("section", "ontario-calendar ontario-section", name="Kalendář – přístupná agenda", components=[
    _element("div", "container", components=[
        _heading("h1", "Kalendář", "display-4 skaut"),
        _text("Nejbližší schůzky, výpravy a oddílové akce.", "lead ontario-section-lead"),
        _element("div", "list-group ontario-agenda", components=[{
            "type": "sc-repeat", "source": "core.events", "params": {"limit": 24, "sort": "start_at_asc"},
            "components": [{"type": "link", "tagName": "a", "attributes": {"class": "list-group-item list-group-item-action ontario-agenda-item"},
                "scBindings": {"href": {"scope": "context", "field": "url"}}, "components": [
                    _bound("time", "start_at", "ontario-agenda-date", fmt="datetime"),
                    _element("span", "ontario-agenda-copy", components=[_bound("strong", "title", "skaut"), _bound("span", "description")]),
                ]}],
            "empty": [_text("V kalendáři zatím nejsou žádné veřejné akce.", "ontario-empty")],
        }]),
    ]),
])

ONTARIO_CONTACT = _element("section", "ontario-contact ontario-section", name="Kontakt", components=[
    _element("div", "container", components=[_element("div", "row g-5 align-items-center", components=[
        _element("div", "col-lg-6", components=[
            _heading("h1", "Kontakt", "display-4 skaut"),
            _text("Napište nám nebo se přijďte podívat na schůzku. Rádi odpovíme rodičům i budoucím členům.", "lead"),
            _element("address", "ontario-contact-list", components=[
                _element("p", components=[_icon("location-dot"), _bind("contact_address", scope="site")]),
                _element("p", components=[_icon("phone"), _bind("contact_phone", scope="site")]),
                _element("p", components=[_icon("envelope"), _bind("contact_email", scope="site")]),
                _element("p", components=[_icon("clock"), _bind("contact_meeting_time", scope="site")]),
            ]),
        ]),
        _element("div", "col-lg-6", components=[_image("assets/mockups/scout-planning-v1.webp", "Ilustrace plánování oddílové akce", "img-fluid ontario-mockup ontario-photo-tint")]),
    ])]), deepcopy(ONTARIO_EDGE),
])

ONTARIO_GALLERY = _element("section", "ontario-gallery ontario-section", name="Galerie", components=[
    _element("div", "container", components=[_heading("h1", "Galerie", "display-4 skaut"),
        _element("div", "ontario-gallery-grid", components=[{
            "type": "sc-repeat", "source": "core.media", "params": {"limit": 24},
            "components": [_element("figure", "ontario-gallery-item", components=[
                {"type": "image", "tagName": "img", "attributes": {"alt": "", "loading": "lazy"},
                 "scBindings": {"src": {"scope": "context", "field": "url"}, "alt": {"scope": "context", "field": "alt"}}},
                _bound("figcaption", "caption"),
            ])], "empty": [_text("Galerie zatím neobsahuje veřejné fotografie.", "ontario-empty")],
        }]),
    ]),
])

ONTARIO_FAQ = _element("section", "ontario-faq ontario-section", name="Časté otázky", components=[
    _element("div", "container ontario-reading", components=[_heading("h2", "Časté otázky", "display-6 skaut"),
        _element("details", "ontario-accordion", components=[_element("summary", content="Co si vzít na první schůzku?"), _text("Pohodlné oblečení, pití a chuť poznat nové kamarády.")]),
        _element("details", "ontario-accordion", components=[_element("summary", content="Jak se přihlásit?"), _text("Ozvěte se nám přes kontakt a domluvíme návštěvu schůzky.")]),
    ]),
])

ONTARIO_FOOTER = {
    "type": "default",
    "tagName": "footer",
    "name": "Ontario – patička",
    "attributes": {"class": "ontario-footer bg-dark text-white"},
    "components": [{
        "type": "default",
        "tagName": "div",
        "attributes": {"class": "container"},
        "components": [
            {
                "type": "default",
                "tagName": "div",
                "attributes": {"class": "ontario-footer-grid"},
                "components": [
                    {
                        "type": "link",
                        "tagName": "a",
                        "attributes": {"class": "ontario-footer-brand", "href": "/"},
                        "components": [_image("assets/white_text_next.png", "Ontario", "ontario-footer-logo")],
                    },
                    {
                        "type": "sc-menu",
                        "location": "footer",
                        "presentation": "bootstrap-footer-columns",
                    },
                ],
            },
            {
                "type": "text",
                "tagName": "small",
                "attributes": {"class": "ontario-copyright"},
                "content": "© 2026 Ontario. Powered by Vyveh.",
            },
        ],
    }],
}

ONTARIO_MAIN = _project(
    deepcopy(ONTARIO_HEADER),
    {
        "type": "default",
        "tagName": "main",
        "components": [{
            "type": "sc-slot",
            "name": "content",
            "components": [deepcopy(ONTARIO_HERO), deepcopy(ONTARIO_ABOUT), deepcopy(ONTARIO_POSTS)],
        }],
    },
    deepcopy(ONTARIO_FOOTER),
)

ONTARIO_THEME_TEMPLATES = {
    "main": ONTARIO_MAIN,
    "home": deepcopy(ONTARIO_MAIN),
    "page": _project(
        deepcopy(ONTARIO_HEADER),
        {"type": "default", "tagName": "main", "attributes": {"class": "ontario-page ontario-page-top py-5"}, "components": [{
            "type": "default", "tagName": "div", "attributes": {"class": "container"}, "components": [
                {"type": "heading", "tagName": "h1", "attributes": {"class": "display-4 skaut"}, "scBindings": {"text": {"scope": "page", "field": "title"}}},
                {"type": "sc-slot", "name": "content", "components": []},
            ],
        }]},
        deepcopy(ONTARIO_FOOTER),
    ),
    "news": _project(deepcopy(ONTARIO_HEADER), _element("main", "ontario-page-top", components=[{"type": "sc-slot", "name": "content", "components": [deepcopy(ONTARIO_ARCHIVE)]}]), deepcopy(ONTARIO_FOOTER)),
    "archive": _project(deepcopy(ONTARIO_HEADER), _element("main", "ontario-page-top", components=[{"type": "sc-slot", "name": "content", "components": [deepcopy(ONTARIO_ARCHIVE)]}]), deepcopy(ONTARIO_FOOTER)),
    "team": _project(deepcopy(ONTARIO_HEADER), _element("main", "ontario-page-top", components=[{"type": "sc-slot", "name": "content", "components": [deepcopy(ONTARIO_TEAM_HERO), _element("section", "ontario-section", components=[_element("div", "container", components=[_event_feed(team_id=1)])])]}]), deepcopy(ONTARIO_FOOTER)),
    "article": _project(deepcopy(ONTARIO_HEADER), _element("main", "ontario-page-top ontario-detail", components=[_element("article", "container ontario-reading ontario-section", components=[{"type": "heading", "tagName": "h1", "attributes": {"class": "display-4 skaut"}, "scBindings": {"text": {"scope": "page", "field": "title"}}}, {"type": "sc-slot", "name": "content", "components": [{"type": "sc-detail-content"}]}])]), deepcopy(ONTARIO_FOOTER)),
    "meeting": _project(deepcopy(ONTARIO_HEADER), _element("main", "ontario-page-top ontario-detail", components=[_element("article", "container ontario-reading ontario-section", components=[{"type": "heading", "tagName": "h1", "attributes": {"class": "display-4 skaut"}, "scBindings": {"text": {"scope": "page", "field": "title"}}}, {"type": "sc-slot", "name": "content", "components": [{"type": "sc-detail-content"}]}])]), deepcopy(ONTARIO_FOOTER)),
    "meetings": _project(deepcopy(ONTARIO_HEADER), _element("main", "ontario-page-top", components=[{"type": "sc-slot", "name": "content", "components": [deepcopy(ONTARIO_MEETINGS)]}]), deepcopy(ONTARIO_FOOTER)),
    "calendar": _project(deepcopy(ONTARIO_HEADER), _element("main", "ontario-page-top", components=[{"type": "sc-slot", "name": "content", "components": [deepcopy(ONTARIO_CALENDAR)]}]), deepcopy(ONTARIO_FOOTER)),
    "contact": _project(deepcopy(ONTARIO_HEADER), _element("main", "ontario-page-top", components=[{"type": "sc-slot", "name": "content", "components": [deepcopy(ONTARIO_CONTACT)]}]), deepcopy(ONTARIO_FOOTER)),
    "gallery": _project(deepcopy(ONTARIO_HEADER), _element("main", "ontario-page-top", components=[{"type": "sc-slot", "name": "content", "components": [deepcopy(ONTARIO_GALLERY)]}]), deepcopy(ONTARIO_FOOTER)),
    "about": _project(deepcopy(ONTARIO_HEADER), _element("main", "ontario-page-top", components=[{"type": "sc-slot", "name": "content", "components": [deepcopy(ONTARIO_ABOUT), deepcopy(ONTARIO_FAQ)]}]), deepcopy(ONTARIO_FOOTER)),
    "support": _project(deepcopy(ONTARIO_HEADER), _element("main", "ontario-page-top", components=[deepcopy(ONTARIO_COMPACT_HERO), {"type": "sc-slot", "name": "content", "components": [_element("section", "ontario-section", components=[_element("div", "container ontario-reading", components=[_heading("h2", "Jak nás podpořit", "display-5 skaut"), _text("Pomoci můžete časem, materiálem i příspěvkem na oddílové aktivity.", "lead")])])]}]), deepcopy(ONTARIO_FOOTER)),
    "downloads": _project(deepcopy(ONTARIO_HEADER), _element("main", "ontario-page-top", components=[{"type": "sc-slot", "name": "content", "components": [_element("section", "ontario-section", components=[_element("div", "container ontario-reading", components=[_heading("h1", "Ke stažení", "display-4 skaut"), _element("div", "list-group", components=[_element("a", "list-group-item list-group-item-action", content="Přihláška a důležité dokumenty", href="#")])])])]}]), deepcopy(ONTARIO_FOOTER)),
    "links": _project(deepcopy(ONTARIO_HEADER), _element("main", "ontario-page-top", components=[{"type": "sc-slot", "name": "content", "components": [_element("section", "ontario-section", components=[_element("div", "container ontario-reading", components=[_heading("h1", "Odkazy", "display-4 skaut"), _element("div", "list-group", components=[_element("a", "list-group-item list-group-item-action", content="Skaut.cz", href="https://www.skaut.cz")])])])]}]), deepcopy(ONTARIO_FOOTER)),
}

ONTARIO_THEME_SECTIONS = {
    "hero": _project(deepcopy(ONTARIO_HERO)),
    "about": _project(deepcopy(ONTARIO_ABOUT)),
    "posts": _project(deepcopy(ONTARIO_POSTS)),
    "header": _project(deepcopy(ONTARIO_HEADER)),
    "footer": _project(deepcopy(ONTARIO_FOOTER)),
    "edge": _project(deepcopy(ONTARIO_EDGE)),
    "compact-hero": _project(deepcopy(ONTARIO_COMPACT_HERO)),
    "archive": _project(deepcopy(ONTARIO_ARCHIVE)),
    "meetings": _project(deepcopy(ONTARIO_MEETINGS)),
    "calendar": _project(deepcopy(ONTARIO_CALENDAR)),
    "contact": _project(deepcopy(ONTARIO_CONTACT)),
    "gallery": _project(deepcopy(ONTARIO_GALLERY)),
    "faq": _project(deepcopy(ONTARIO_FAQ)),
    "team-heading": _project(deepcopy(ONTARIO_TEAM_HERO)),
}

ONTARIO_THEME_COMPONENTS = {
    "post-card": _project(deepcopy(ONTARIO_POST_CARD)),
    "scout-logo": _project(_image(
        "assets/SKAUT_logo_podklad_bily.png",
        "Skautské logo",
        "img-fluid ontario-scout-symbol",
    )),
    "button": _project({
        "type": "link",
        "tagName": "a",
        "attributes": {"class": "btn btn-secondary btn-lg btn-skaut", "href": "#"},
        "content": "Tlačítko",
    }),
    "edge": _project(deepcopy(ONTARIO_EDGE)),
    "font-awesome-icon": _project(_icon("compass", "Kompas")),
    "meeting-card": _project(deepcopy(ONTARIO_EVENT_CARD)),
    "alert": _project(_element("div", "alert alert-info", content="Důležité sdělení", role="alert")),
    "badge": _project(_element("span", "badge bg-secondary", content="Štítek")),
    "breadcrumb": _project(_element("nav", components=[_element("ol", "breadcrumb", components=[_element("li", "breadcrumb-item", content="Domů"), _element("li", "breadcrumb-item active", content="Stránka", **{"aria-current": "page"})])], **{"aria-label": "Drobečková navigace"})),
    "accordion": _project(_element("details", "ontario-accordion", components=[_element("summary", content="Rozbalovací položka"), _text("Obsah rozbalovací položky.")])),
    "progress": _project(_element("div", "progress", components=[_element("div", "progress-bar", content="60 %", role="progressbar", **{"aria-label": "Postup", "aria-valuenow": "60", "aria-valuemin": "0", "aria-valuemax": "100"})])),
}

_ONTARIO_MENU_DEFAULTS = {
    "main": [
        ("Kalendář", "/kalendar", []),
        ("Schůzky", "#", [
            ("Lachtani", "/lachtani", []),
            ("Delfíni", "/delfini", []),
            ("Kanafásci", "/kanafasci", []),
            ("Medojedi", "/medojedi", []),
            ("Kanci", "/kanci", []),
        ]),
        ("Galerie", "/galerie", []),
        ("Kontakt", "/kontakt", []),
        ("Ostatní", "#", [
            ("Vybavení", "/vybaveni", []),
            ("Odkazy", "/odkazy", []),
            ("Ke stažení", "/ke-stazeni", []),
            ("Kronika", "/kronika", []),
            ("Mezidružinková soutěž", "/mezidruzinkova-soutez", []),
        ]),
        ("Domů", "/", []),
    ],
    "footer": [
        ("ODDÍL", None, [
            ("Galerie", "/galerie", []),
            ("Jak nás podpořit", "/jak-nas-podporit", []),
            ("Kalendář", "/kalendar", []),
            ("Kontakt", "/kontakt", []),
            ("Domů", "/", []),
        ]),
        ("SCHŮZKY DRUŽIN", None, [
            ("Kanci", "/kanci", []),
            ("Medojedi", "/medojedi", []),
            ("Lachtani", "/lachtani", []),
            ("Kanafásci", "/kanafasci", []),
            ("Delfíni", "/delfini", []),
        ]),
        ("OSTATNÍ", None, [
            ("Vybavení", "/vybaveni", []),
            ("Odkazy", "/odkazy", []),
            ("Ke stažení", "/ke-stazeni", []),
            ("Kronika", "/kronika", []),
            ("Mezidružinková soutěž", "/mezidruzinkova-soutez", []),
        ]),
    ],
}


def seed_ontario_menus(db: Session, *, created_by_id: int | None = None) -> None:
    """Create screenshot-compatible site menus only when a location is empty.

    Menus are site-owned data, so theme reactivation never overwrites an
    author's existing hierarchy.
    """
    for location, rows in _ONTARIO_MENU_DEFAULTS.items():
        if db.query(WebMenu.id).filter_by(location=location).first():
            continue
        menu = WebMenu(name="Hlavní menu" if location == "main" else "Patička", location=location)
        db.add(menu)
        db.flush()

        def insert(items, parent_id=None):
            tree = []
            for position, (label, url, children) in enumerate(items):
                item = WebMenuItem(
                    menu_id=menu.id,
                    label=label,
                    url=url,
                    item_type="external",
                    parent_id=parent_id,
                    position=position,
                )
                db.add(item)
                db.flush()
                tree.append({
                    "id": item.id,
                    "menu_id": menu.id,
                    "label": label,
                    "page_slug": None,
                    "url": url,
                    "item_type": "external",
                    "page_id": None,
                    "post_id": None,
                    "target": None,
                    "rel": None,
                    "parent_id": parent_id,
                    "position": position,
                    "children": insert(children, item.id),
                })
            return tree

        tree = insert(rows)
        revision = WebMenuRevision(
            menu_id=menu.id,
            revision_number=1,
            source_version=menu.draft_version,
            tree=tree,
            reason="theme-default",
            created_by_id=created_by_id,
        )
        db.add(revision)
        db.flush()
        menu.published_revision_id = revision.id

_ONTARIO_CSS = r"""
@font-face{font-family:"SKAUT Bold";src:url(assets/fonts/SKAUT-Bold.otf) format("opentype");font-display:swap}
@font-face{font-family:"TheMix";src:url(assets/fonts/TheMix_LT_400.woff) format("woff");font-weight:400;font-display:swap}
@font-face{font-family:"TheMix";src:url(assets/fonts/TheMix_LT_700.woff) format("woff");font-weight:700;font-display:swap}
:root{--ontario-blue:#255c9e;--ontario-blue-dark:#0a224e;--ontario-blue-pale:#bdd4df;--ontario-yellow:#f9b200;--ontario-cream:#f6ebd8;--ontario-link:#a9bed2;--ontario-dark:#212529;--ontario-radius:1rem}
html{overflow-x:hidden}body{font-family:"TheMix",Arial,sans-serif;color:#252b31;overflow-x:hidden}.skaut,.ontario-footer .sc-menu-heading{font-family:"SKAUT Bold","TheMix",sans-serif;text-transform:uppercase}.ontario-icon{width:1.4em;text-align:center}.ontario-page-top{padding-top:6.25rem}.ontario-section{position:relative;padding:5.5rem 0}.ontario-section-lead{margin:0 auto 2.25rem;max-width:42rem}.ontario-reading{max-width:820px}.ontario-empty{grid-column:1/-1;padding:3rem;text-align:center;background:var(--ontario-cream);border-radius:var(--ontario-radius)}
.ontario-navbar{position:absolute;inset:0 0 auto;z-index:100;padding:1.1rem 0;background:transparent}.ontario-navbar-inner{display:flex;align-items:center;justify-content:space-between;max-width:1300px}.ontario-wordmark{display:block;width:122px;height:auto}.ontario-wordmark-dark{display:none}.ontario-desktop-menu{display:flex;align-items:center}.ontario-menu-shell{display:none}.ontario-menu-panel{display:flex;align-items:center}.ontario-menu-tools{display:none}.ontario-navbar .sc-menu-list{display:flex;flex-direction:row;align-items:center;justify-content:flex-end;gap:.15rem;margin:0}.ontario-navbar .sc-menu-item{position:relative;list-style:none}.ontario-navbar .sc-menu-details>summary{list-style:none}.ontario-navbar .sc-menu-details>summary::-webkit-details-marker{display:none}.ontario-navbar .sc-menu-link{display:flex;align-items:center;gap:.55rem;padding:.6rem .72rem;color:rgba(255,255,255,.76);font-size:1rem;text-decoration:none;cursor:pointer}.ontario-navbar .sc-menu-item:hover>.sc-menu-link{color:#fff}.ontario-navbar .sc-menu-link:focus-visible,.ontario-navbar summary:focus-visible{color:#fff;outline:2px solid currentColor;outline-offset:2px}.ontario-navbar .sc-menu-details>summary:after{content:"";width:.6rem;height:.6rem;margin-top:-.2rem;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg);transition:transform .18s ease}.ontario-navbar .sc-menu-details[open]>summary:after{transform:rotate(225deg);margin-top:.2rem}.ontario-navbar .sc-menu-dropdown{display:none;position:absolute;top:100%;left:0;z-index:110;min-width:13.5rem;margin:0;padding:.55rem 0;background:#fff;border:1px solid rgba(10,34,78,.08);box-shadow:0 .75rem 1.6rem rgba(10,34,78,.15)}.ontario-navbar .sc-menu-item:hover .sc-menu-dropdown,.ontario-navbar .sc-menu-item:focus-within .sc-menu-dropdown,.ontario-navbar .sc-menu-details[open]>.sc-menu-dropdown{display:block}.ontario-navbar .sc-menu-dropdown .sc-menu-link{padding:.7rem 1.25rem;color:#272c31;white-space:nowrap}.ontario-navbar .sc-menu-dropdown .sc-menu-link:hover,.ontario-navbar .sc-menu-dropdown .sc-menu-link:focus-visible{background:#eef4fb;color:var(--ontario-blue)}body:has(.ontario-page-top) .ontario-navbar{background:#fff;box-shadow:0 1px 0 rgba(10,34,78,.08)}body:has(.ontario-page-top) .ontario-wordmark-light{display:none}body:has(.ontario-page-top) .ontario-wordmark-dark{display:block}body:has(.ontario-page-top) .ontario-navbar .sc-menu-link{color:#4b4f54}body:has(.ontario-page-top) .ontario-navbar .sc-menu-link:hover,body:has(.ontario-page-top) .ontario-navbar .sc-menu-link:focus-visible{color:var(--ontario-blue-dark)}
.ontario-hero{position:relative;min-height:100vh;min-height:100svh;display:flex;align-items:flex-start;background:url(assets/main_header.jpg) center top/cover no-repeat;color:#fff;overflow:hidden}.ontario-photo-mask{position:absolute;inset:0;background:rgba(10,34,78,.64);mix-blend-mode:multiply}.ontario-hero-content{position:relative;z-index:2;text-align:center;padding-top:clamp(6rem,12vh,9rem);padding-bottom:9rem}.ontario-round-logo{display:block;width:clamp(145px,15vw,210px);aspect-ratio:1;object-fit:contain;margin:0 auto 1.25rem}.ontario-hero h1{font-size:clamp(3rem,5vw,4.5rem);letter-spacing:.025em;margin:0}.ontario-hero h2{max-width:32rem;margin:.6rem auto 0;line-height:1.35}.ontario-edge{position:absolute;left:0;right:0;bottom:-1px;z-index:4;height:7.5rem;overflow:hidden;pointer-events:none}.ontario-edge:after{content:"";position:absolute;inset:55% 0 -1px;background:#fff}.ontario-edge-blob{position:absolute;bottom:-4.6rem;width:58%;height:10rem;background:#fff;border-radius:50% 50% 0 0}.ontario-edge-blob--one{left:-9%;transform:rotate(5deg)}.ontario-edge-blob--two{left:25%;bottom:-5.6rem;width:54%;transform:rotate(-5deg)}.ontario-edge-blob--three{right:-13%;bottom:-4.4rem;transform:rotate(7deg)}
.ontario-compact-hero{position:relative;min-height:360px;display:flex;align-items:center;padding:7rem 0 8rem;background:url(assets/mockups/scout-planning-v1.webp) center/cover no-repeat;color:#fff;overflow:hidden}.ontario-compact-hero>.container{position:relative;z-index:2}.ontario-about{background:#fff}.ontario-about .row,.ontario-contact .row{margin-left:0;margin-right:0}.ontario-mockup{display:block;width:100%;max-height:480px;object-fit:cover;border-radius:48% 52% 45% 55%/55% 45% 55% 45%}.ontario-photo-frame{position:relative;margin:0;overflow:hidden;isolation:isolate;background:var(--ontario-blue)}.ontario-photo-frame img{display:block;width:100%;mix-blend-mode:multiply}.ontario-photo-tint{filter:saturate(.78) contrast(1.04)}.btn-skaut{font-family:"SKAUT Bold","TheMix",sans-serif;text-transform:uppercase;border-radius:0}.ontario-posts{background:#f8f9fa}.ontario-card{height:100%;overflow:hidden;border:1px solid #d9e0e6;border-radius:var(--ontario-radius);box-shadow:0 .65rem 1.2rem rgba(10,34,78,.12)!important}.ontario-post-card .card-img-top{height:210px;object-fit:cover;background:var(--ontario-blue-pale)}.ontario-card .card-body{position:relative;padding:1.75rem}.ontario-card .card-title{color:#07366c}.ontario-meta{display:block;margin-bottom:1rem;color:#68717a}.ontario-read-more{color:var(--ontario-blue);font-weight:700;text-decoration:none}.ontario-feed>.sc-pagination,.sc-pagination{justify-content:flex-end;padding-top:1.25rem;border-top:1px solid #d9e0e6}.sc-pagination-link,.sc-pagination-current{border-color:#d5dde5;border-radius:0!important}.sc-pagination-current{background:var(--ontario-blue);color:#fff}
.ontario-team-heading-inner{display:flex;align-items:center;gap:2rem}.ontario-team-avatar{width:150px;height:150px;object-fit:cover;border:5px solid #111;border-radius:50%}.ontario-agenda{border-top:4px solid var(--ontario-blue)}.ontario-agenda-item{display:grid;grid-template-columns:minmax(10rem,14rem) 1fr;gap:1.5rem;align-items:start;padding:1.2rem}.ontario-agenda-date{font-weight:700;color:var(--ontario-blue)}.ontario-agenda-copy{display:grid;gap:.3rem}.ontario-contact{padding-bottom:10rem;background:var(--ontario-cream);overflow:hidden}.ontario-contact-list{display:grid;gap:.6rem;margin-top:2rem}.ontario-contact-list p{display:flex;gap:.75rem;align-items:baseline;margin:0}.ontario-gallery-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}.ontario-gallery-item{margin:0}.ontario-gallery-item img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover}.ontario-gallery-item figcaption{padding:.5rem 0;color:#68717a}.ontario-accordion{border-top:1px solid #d9e0e6}.ontario-accordion:last-child{border-bottom:1px solid #d9e0e6}.ontario-accordion summary{padding:1.2rem 0;font-family:"SKAUT Bold","TheMix",sans-serif;font-size:1.15rem;cursor:pointer}.ontario-accordion p{padding-bottom:1.25rem}
.ontario-footer{padding:4.25rem 0 0;background:var(--ontario-dark)!important}.ontario-footer-grid{display:grid;grid-template-columns:240px 1fr;gap:5rem;align-items:start;padding-bottom:5rem}.ontario-footer-logo{display:block;width:190px;height:auto}.ontario-footer .sc-menu-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3rem;margin-left:0;margin-right:0;width:100%}.ontario-footer .sc-menu-heading{display:block;padding:0 0 .65rem;color:#fff!important;text-decoration:none!important;font-weight:700}.ontario-footer .sc-menu-item{list-style:none}.ontario-footer .sc-menu-list>.sc-menu-item>.sc-menu-link{font-family:"SKAUT Bold","TheMix",sans-serif;color:#fff;text-transform:uppercase;font-weight:700;padding:0 0 .65rem}.ontario-footer .sc-menu-dropdown{display:block!important;position:static!important;min-width:0;padding:0!important;background:transparent!important;box-shadow:none!important}.ontario-footer .sc-menu-dropdown .sc-menu-link{display:block;padding:.25rem 0;color:var(--ontario-link);text-decoration:none}.ontario-footer .sc-menu-dropdown .sc-menu-link:hover{color:#fff}.ontario-copyright{display:block;padding:1.4rem 0;border-top:1px solid rgba(255,255,255,.08);color:#8fa1b1}
@media(max-width:991.98px){.ontario-page-top{padding-top:4.5rem}.ontario-navbar{position:absolute;padding:.9rem 0}.ontario-wordmark{width:116px}.ontario-desktop-menu{display:none}.ontario-menu-shell{display:block}.ontario-menu-shell>summary{display:flex;align-items:center;justify-content:center;position:relative;z-index:202;width:44px;height:44px;color:#fff;list-style:none;cursor:pointer}body:has(.ontario-page-top) .ontario-menu-shell>summary{color:var(--ontario-blue-dark)}.ontario-menu-shell>summary::-webkit-details-marker{display:none}.ontario-menu-shell>summary:before{content:"☰";font-size:1.55rem}.ontario-menu-shell[open]>summary{position:fixed;top:.75rem;right:1rem;width:auto;padding:.5rem;color:var(--ontario-blue-dark)}.ontario-menu-shell[open]>summary:before{content:"×  Zavřít";font-family:"TheMix",Arial,sans-serif;font-size:1rem;font-weight:400}.ontario-menu-panel{display:none}.ontario-menu-shell[open]>.ontario-menu-panel{display:block;position:fixed;inset:0;z-index:200;overflow-y:auto;padding:5.25rem 0 2rem;background:#fff;color:var(--ontario-blue-dark)}.ontario-menu-tools{display:block;width:13.6rem;margin:0 auto 1.2rem;padding:0 0 1.4rem;border-bottom:1px solid #d9e0e6;text-align:center}.ontario-menu-close-label{display:none}.ontario-navbar .sc-menu{width:100%}.ontario-navbar .sc-menu-list{display:block;width:100%;padding:0;margin:0}.ontario-navbar .sc-menu-item{border-bottom:1px solid #e3e5e8}.ontario-navbar .sc-menu-link{min-height:72px;padding:1rem 1.5rem;color:#111;font-size:1.22rem}.ontario-navbar .sc-menu-link:focus-visible,.ontario-navbar summary:focus-visible{color:var(--ontario-blue);outline-offset:-4px}.ontario-navbar .sc-menu-details>summary{justify-content:space-between}.ontario-navbar .sc-menu-dropdown,.ontario-navbar .sc-menu-item:hover .sc-menu-dropdown,.ontario-navbar .sc-menu-item:focus-within .sc-menu-dropdown{display:none;position:static;min-width:0;padding:0;background:#f5f5f5;border:0;box-shadow:none}.ontario-navbar .sc-menu-details[open]>.sc-menu-dropdown{display:block}.ontario-navbar .sc-menu-details[open]>summary{color:#06f;background:#f0f5fd}.ontario-navbar .sc-menu-dropdown .sc-menu-link{min-height:60px;padding-left:2.5rem;color:#111}.ontario-navbar .sc-menu-dropdown .sc-menu-item:last-child{border-bottom:0}.ontario-wordmark-dark{display:none}.ontario-hero-content{padding-top:7rem}.ontario-footer-grid{grid-template-columns:1fr;gap:2.5rem}.ontario-footer .sc-menu-list{grid-template-columns:repeat(2,minmax(0,1fr))}.ontario-gallery-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:575.98px){.ontario-section{padding:4rem 0}.ontario-hero{min-height:100svh}.ontario-hero-content{padding-top:6.2rem}.ontario-round-logo{width:145px}.ontario-hero h1{font-size:3rem}.ontario-edge{height:6.5rem}.ontario-team-heading-inner{align-items:flex-start;flex-direction:column}.ontario-team-avatar{width:124px;height:124px}.ontario-agenda-item{grid-template-columns:1fr;gap:.35rem}.ontario-gallery-grid{grid-template-columns:1fr}.ontario-footer .sc-menu-list{grid-template-columns:1fr;gap:1.75rem}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{scroll-behavior:auto!important;transition-duration:.01ms!important;animation-duration:.01ms!important;animation-iteration-count:1!important}}
"""


def ontario_css() -> str:
    bootstrap = (_BUNDLE_ROOT / "bootstrap.css").read_text(encoding="utf-8")
    # Bootstrap embeds control icons as data SVGs. Theme CSS deliberately
    # permits only DB-declared package assets, so those optional backgrounds
    # degrade to CSS/native controls instead of weakening the URL boundary.
    bootstrap = re.sub(r'url\("data:image/svg\+xml,[^"]*"\)', "none", bootstrap)
    bootstrap = re.sub(r"/\*.*?\*/", "", bootstrap, flags=re.S)
    fontawesome = (_BUNDLE_ROOT / "fontawesome.css").read_text(encoding="utf-8")
    fontawesome = re.sub(r"/\*.*?\*/", "", fontawesome, flags=re.S)
    # The packaged distribution also advertises TTF and v4 compatibility
    # fallbacks.  Ontario ships the smaller modern WOFF2 files only.
    fontawesome = re.sub(
        r',url\(\.\./webfonts/[^)]*\.ttf\) format\("truetype"\)',
        "",
        fontawesome,
    )
    fontawesome = re.sub(r"@font-face\{[^{}]*fa-v4compatibility[^{}]*\}", "", fontawesome)
    fontawesome = fontawesome.replace("../webfonts/", "assets/fonts/")
    # The package validator intentionally rejects the protocol-like token
    # ``file:``. Four Font Awesome selector names contain that exact substring
    # before their pseudo-element; escaping the colon disables only those
    # unused aliases while keeping the stylesheet package-safe.
    fontawesome = fontawesome.replace("file:before", r"file\:before")
    return bootstrap + "\n" + fontawesome + "\n" + _ONTARIO_CSS


def _copy_assets(version: WebThemeVersion, db: Session) -> None:
    from .theme_package import _storage_root

    package_root = _storage_root(None) / version.install_path
    target_root = package_root / "assets"
    target_root.mkdir(mode=0o700, parents=True, exist_ok=True)
    expected: set[str] = set()
    for source in sorted(_ASSET_ROOT.rglob("*")):
        if not source.is_file():
            continue
        relative = Path("assets") / source.relative_to(_ASSET_ROOT)
        expected.add(relative.as_posix())
        target = package_root / relative
        target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        if not target.is_file() or hashlib.sha256(target.read_bytes()).digest() != hashlib.sha256(source.read_bytes()).digest():
            shutil.copyfile(source, target)
        content = source.read_bytes()
        row = db.query(WebThemeAsset).filter_by(
            theme_version_id=version.id,
            relative_path=relative.as_posix(),
        ).one_or_none()
        values = {
            "mime": mimetypes.guess_type(source.name)[0] or "application/octet-stream",
            "size": len(content),
            "sha256": hashlib.sha256(content).hexdigest(),
        }
        if row is None:
            db.add(WebThemeAsset(
                theme_version_id=version.id,
                relative_path=relative.as_posix(),
                **values,
            ))
        else:
            row.mime = values["mime"]
            row.size = values["size"]
            row.sha256 = values["sha256"]
    for stale in db.query(WebThemeAsset).filter_by(theme_version_id=version.id).all():
        if stale.relative_path not in expected:
            db.delete(stale)


def seed_ontario_theme(db: Session) -> WebThemeVersion:
    """Idempotently install the bundled Ontario theme without activating it."""
    from .theme_package import (
        _legacy_template_key,
        _namespace_asset_references,
        _qualified_key,
    )

    theme = db.query(WebTheme).filter_by(stable_key=ONTARIO_THEME_ID).one_or_none()
    if theme is None:
        theme = WebTheme(
            stable_key=ONTARIO_THEME_ID,
            name=ONTARIO_THEME_NAME,
            author="Ontario / ScoutComp",
            description=ONTARIO_THEME_DESCRIPTION,
            license="Apache-2.0",
        )
        db.add(theme)
        db.flush()
    else:
        theme.name = ONTARIO_THEME_NAME
        theme.description = ONTARIO_THEME_DESCRIPTION

    base_css = ontario_css()
    package_hash = hashlib.sha256(
        (f"{ONTARIO_THEME_ID}:{ONTARIO_THEME_VERSION}\n{base_css}").encode()
        + b"".join(path.read_bytes() for path in sorted(_ASSET_ROOT.rglob("*")) if path.is_file())
    ).hexdigest()
    version = db.query(WebThemeVersion).filter_by(
        theme_id=theme.id,
        version=ONTARIO_THEME_VERSION,
    ).one_or_none()
    manifest = {
        "schema_version": 1,
        "id": ONTARIO_THEME_ID,
        "name": ONTARIO_THEME_NAME,
        "version": ONTARIO_THEME_VERSION,
        "author": "Ontario / ScoutComp",
        "description": ONTARIO_THEME_DESCRIPTION,
        "license": "Apache-2.0",
    }
    tokens = {
        "colors": {
            "primary": "#255c9e", "primary-dark": "#0a224e",
            "accent": "#f9b200", "cream": "#f6ebd8", "footer": "#212529",
        },
        "typography": {"font-family": '"TheMix",Arial,sans-serif'},
    }
    if version is None:
        version = WebThemeVersion(
            theme_id=theme.id,
            version=ONTARIO_THEME_VERSION,
            schema_version=1,
            manifest=manifest,
            default_tokens=tokens,
            base_css=base_css,
            package_hash=package_hash,
            install_path=f"system/{ONTARIO_THEME_ID}/{ONTARIO_THEME_VERSION}",
        )
        db.add(version)
        db.flush()
    else:
        version.manifest = manifest
        version.default_tokens = tokens
        version.base_css = base_css
        # package_hash is unique and represents the code-owned bundled source.
        version.package_hash = package_hash

    _copy_assets(version, db)
    names = {
        "main": "Ontario – hlavní rozvržení",
        "home": "Ontario – úvodní stránka",
        "page": "Ontario – běžná stránka",
        "news": "Ontario – aktuality",
        "archive": "Ontario – archiv příspěvků",
        "team": "Ontario – stránka družiny",
        "article": "Ontario – detail článku",
        "meeting": "Ontario – detail schůzky",
        "meetings": "Ontario – seznam schůzek",
        "calendar": "Ontario – kalendář",
        "contact": "Ontario – kontakt",
        "gallery": "Ontario – galerie",
        "support": "Ontario – jak nás podpořit",
        "downloads": "Ontario – ke stažení",
        "links": "Ontario – odkazy",
        "hero": "Ontario hero",
        "about": "O oddílu",
        "posts": "Aktuality",
        "header": "Horní navigace",
        "footer": "Patička",
        "edge": "Organický skautský okraj",
        "compact-hero": "Kompaktní hero",
        "faq": "Časté otázky",
        "team-heading": "Záhlaví družiny",
        "post-card": "Karta aktuality",
        "meeting-card": "Karta schůzky",
        "scout-logo": "Skautské logo",
        "button": "Skautské tlačítko",
        "font-awesome-icon": "Font Awesome ikona",
        "alert": "Bootstrap upozornění",
        "badge": "Bootstrap štítek",
        "breadcrumb": "Bootstrap drobečková navigace",
        "accordion": "Rozbalovací panel",
        "progress": "Bootstrap průběh",
    }

    for key, project in ONTARIO_THEME_TEMPLATES.items():
        qualified = _qualified_key(ONTARIO_THEME_ID, ONTARIO_THEME_VERSION, "templates", key)
        data = _namespace_asset_references(project, version.id)
        template_kind = "layout" if key in {"main", "home", "page"} else key
        row = db.query(WebTemplate).filter_by(qualified_key=qualified).one_or_none()
        if row is None:
            row = WebTemplate(
                key=_legacy_template_key(qualified),
                qualified_key=qualified,
                name=names[key],
                description=ONTARIO_THEME_DESCRIPTION,
                html="",
                css="",
                template_kind=template_kind,
                usage_mode="linked_layout",
                project_data=data,
                published_project_data=data,
                published_css="",
                published_version=1,
                theme_version_id=version.id,
                is_system=False,
            )
            db.add(row)
        else:
            pristine = (
                (row.draft_version or 1) == 1
                and (row.published_version or 0) <= 1
                and row.project_data == row.published_project_data
            )
            if not row.name:
                row.name = names[key]
            if not row.description:
                row.description = ONTARIO_THEME_DESCRIPTION
            if pristine or not row.project_data:
                row.project_data = data
            if pristine or not row.published_project_data:
                row.published_project_data = data
                row.published_version = max(row.published_version or 0, 1)
            row.theme_version_id = version.id
            row.is_system = False
            if pristine:
                row.template_kind = template_kind

    for model, resources, kind in (
        (WebSection, ONTARIO_THEME_SECTIONS, "sections"),
        (WebReusableComponent, ONTARIO_THEME_COMPONENTS, "components"),
    ):
        for key, project in resources.items():
            qualified = _qualified_key(ONTARIO_THEME_ID, ONTARIO_THEME_VERSION, kind, key)
            data = _namespace_asset_references(project, version.id)
            row = db.query(model).filter_by(qualified_key=qualified).one_or_none()
            if row is None:
                row = model(
                    qualified_key=qualified,
                    name=names[key],
                    description=ONTARIO_THEME_DESCRIPTION,
                    project_data=data,
                    css="",
                    prop_schema=[],
                    default_props={},
                    variants=[],
                    published_project_data=data,
                    published_css="",
                    published_prop_schema=[],
                    published_default_props={},
                    published_variants=[],
                    published_version=1,
                    theme_version_id=version.id,
                    is_locked=False,
                )
                db.add(row)
            else:
                pristine = (
                    (row.draft_version or 1) == 1
                    and (row.published_version or 0) <= 1
                    and row.project_data == row.published_project_data
                )
                if not row.name:
                    row.name = names[key]
                if not row.description:
                    row.description = ONTARIO_THEME_DESCRIPTION
                if pristine or not row.project_data:
                    row.project_data = data
                if pristine or not row.published_project_data:
                    row.published_project_data = data
                    row.published_version = max(row.published_version or 0, 1)
                row.theme_version_id = version.id
                row.is_locked = False
    db.commit()
    db.refresh(version)
    return version
