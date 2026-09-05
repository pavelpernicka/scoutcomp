"""Bundled Scout troop theme.

The source design is based on the Apache-2.0 Scout Bootstrap theme. Only the
runtime assets used by these declarative resources
are vendored; the original builder, scripts and development dependencies are
intentionally excluded.
"""
from __future__ import annotations

import hashlib
import json
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
    WebSiteStyle,
    WebTemplate,
    WebTheme,
    WebThemeAsset,
    WebThemeVersion,
)

ONTARIO_THEME_ID = "ontario"
ONTARIO_THEME_VERSION = "1.4.1"
ONTARIO_THEME_NAME = "Skautský oddíl"
ONTARIO_THEME_DESCRIPTION = (
    "Téma pro skautský oddíl nebo středisko založené na Bootstrap 5 "
    "s bohatou sadou prvků a sekcí."
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


def _component_instance(key: str, name: str, props: dict | None = None) -> dict:
    return {
        "type": "sc-resource-instance",
        "resourceKind": "component",
        "resourceId": f"{ONTARIO_THEME_ID}@{ONTARIO_THEME_VERSION}:components:{key}",
        "resourceName": name,
        "props": deepcopy(props or {}),
    }


def _image(src: str, alt: str, classes: str, *, lazy: bool = True,
           template_logo: str | None = None) -> dict:
    return {
        "type": "image",
        "tagName": "img",
        "attributes": {
            "src": src, "alt": alt, "class": classes,
            **({"loading": "lazy"} if lazy else {}),
            **({"data-sc-template-logo": template_logo} if template_logo else {}),
        },
    }


def _logo_fallback(role: str, classes: str, *, tag: str = "span") -> dict:
    """Render the site title only when the adjacent template logo is disabled."""
    return {
        "type": "text",
        "tagName": tag,
        "attributes": {
            "class": classes,
            "data-sc-template-logo-fallback": role,
        },
        "content": "Skautský oddíl",
        "scBindings": {"text": {"scope": "site", "field": "site_title"}},
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


def _prop_link(label_field: str, href_field: str, classes: str = "") -> dict:
    node = _element("a", classes, components=[_bind(label_field, scope="props")], href="#")
    node["scBindings"] = {"href": {"scope": "props", "field": href_field}}
    return node


def _bound_time(field: str, classes: str = "", *, fmt: str = "datetime_short") -> dict:
    return {
        "type": "default",
        "tagName": "time",
        "attributes": {"class": classes},
        "scBindings": {"datetime": {"scope": "context", "field": field}},
        "components": [_bind(field, fmt=fmt)],
    }


def _icon(name: str, label: str = "") -> dict:
    return _element("i", f"fa-solid fa-{name} ontario-icon", **({"aria-label": label} if label else {"aria-hidden": "true"}))


ONTARIO_HEADER = _element("nav", "navbar ontario-navbar", name="Horní navigace",
    components=[_element("div", "container ontario-navbar-inner", components=[
        {"type": "link", "tagName": "a", "attributes": {"class": "navbar-brand", "href": "/", "aria-label": "Skautský oddíl – domů"},
         "components": [_image("assets/white_text_next.png", "Skautský oddíl", "ontario-wordmark ontario-wordmark-light", lazy=False, template_logo="navigation-light"),
                        _logo_fallback("navigation-light", "ontario-wordmark-fallback ontario-wordmark-fallback-light"),
                        _image("assets/blue_text_next.png", "Skautský oddíl", "ontario-wordmark ontario-wordmark-dark", lazy=False, template_logo="navigation-dark"),
                        _logo_fallback("navigation-dark", "ontario-wordmark-fallback ontario-wordmark-fallback-dark")]},
        _element("div", "ontario-desktop-menu", components=[
            {"type": "sc-menu", "location": "main", "presentation": "bootstrap-navbar"},
        ]),
        _element("details", "ontario-menu-shell", components=[
            _element("summary", "ontario-menu-toggle", components=[
                _icon("bars"),
                _icon("xmark"),
                _element("span", "ontario-menu-close-label", content="Zavřít"),
                _element("span", "visually-hidden", content="Otevřít nebo zavřít menu"),
            ]),
            _element("div", "ontario-menu-panel", components=[
                {"type": "sc-menu", "location": "main", "presentation": "ontario-mobile-navbar"},
            ]),
        ]),
    ])], **{"aria-label": "Hlavní navigace", "data-sc-scroll-nav": "true"})

ONTARIO_HERO = _element("header", "ontario-hero sc-edge-bottom-shape-rolling sc-edge-bottom-color-white sc-edge-size-lg", name="Hero", components=[
    _element("div", "ontario-photo-mask ontario-hero-overlay", **{"aria-hidden": "true"}),
    _element("div", "container ontario-hero-content", components=[
        _image("assets/round_notext.png", "Znak skautského oddílu", "ontario-round-logo", lazy=False, template_logo="hero-mark"),
        _logo_fallback("hero-mark", "display-3 skaut ontario-hero-logo-fallback", tag="h1"),
        _heading("h2", "Skautský oddíl pro děti a mladé lidi", "h4 fw-normal"),
    ]),
], **{"data-sc-overlay": "true"})

ONTARIO_COMPACT_HERO = _element("header", "ontario-compact-hero sc-edge-bottom-shape-soft sc-edge-bottom-color-white sc-edge-size-md", name="Kompaktní záhlaví", components=[
    _element("div", "ontario-photo-mask", **{"aria-hidden": "true"}),
    _element("div", "container", components=[
        _heading("h1", "Název stránky", "display-4 skaut"),
        _text("Krátký úvod stránky", "lead"),
    ]),
], **{"data-sc-overlay": "true"})

ONTARIO_PAGE_INTRO = _element("div", "ontario-page-intro", name="Úvod stránky", components=[
    _bound("h2", "heading", "display-5 skaut", scope="props"),
    _bound("p", "description", "lead", scope="props"),
])

ONTARIO_TEXT_CARD = _element("article", "ontario-content-card", name="Textová karta", components=[
    _bound("h3", "heading", "h4 skaut", scope="props"),
    _bound("p", "description", "ontario-content-card-text", scope="props"),
])

ONTARIO_CALL_TO_ACTION = _element("aside", "ontario-call-to-action", name="Výzva k akci", components=[
    _element("div", "ontario-call-to-action-copy", components=[
        _bound("h2", "heading", "h3 skaut", scope="props"),
        _bound("p", "description", scope="props"),
    ]),
    _prop_link("button_label", "button_url", "btn btn-primary btn-lg btn-skaut sc-mask-button-soft"),
])

ONTARIO_QUOTE = _element("blockquote", "ontario-quote", name="Citace", components=[
    _bound("p", "quote", "ontario-quote-text", scope="props"),
    _element("footer", "ontario-quote-author", components=[_bound("cite", "author", scope="props")]),
])

ONTARIO_CONTACT_CARD = _element("article", "ontario-contact-card", name="Kontaktní údaj", components=[
    _icon("address-card"),
    _element("div", components=[
        _bound("h3", "heading", "h5 skaut", scope="props"),
        _bound("p", "description", scope="props"),
        _prop_link("link_label", "link_url", "ontario-contact-link"),
    ]),
])

ONTARIO_STATISTIC = _element("div", "ontario-statistic", name="Číselný údaj", components=[
    _bound("strong", "value", "ontario-statistic-value skaut", scope="props"),
    _bound("span", "label", "ontario-statistic-label", scope="props"),
])

ONTARIO_ABOUT = _element("section", "ontario-about ontario-section", name="O oddílu", components=[
    _element("div", "container", components=[_element("div", "row align-items-center g-5", components=[
        _element("div", "col-md-6", components=[_image("assets/mockups/scout-planning-v1.webp", "Ilustrovaná skautská výprava", "img-fluid ontario-mockup ontario-photo-tint")]),
        _element("div", "col-md-6", components=[
            _heading("h2", "Kdo jsme", "display-5 skaut"),
            _text("Jsme skautský oddíl, který nabízí dobrodružství, přátelství a smysluplný program.", "lead"),
            {"type": "link", "tagName": "a", "attributes": {"class": "btn btn-secondary btn-lg btn-skaut ontario-btn-organic", "href": "/o-nas"}, "content": "Více o nás →"},
        ]),
    ])]),
])

ONTARIO_POST_CARD = _element("article", "card shadow-sm ontario-card ontario-post-card", name="Karta aktuality", components=[
    {"type": "image", "tagName": "img", "attributes": {"class": "card-img-top ontario-photo-tint", "alt": "", "loading": "lazy"},
     "scBindings": {"src": {"scope": "context", "field": "cover_url"}, "alt": {"scope": "context", "field": "title"}}},
    _element("div", "card-body", components=[
        _element("div", "ontario-card-meta", components=[
            _element("span", "ontario-card-author", components=[
                {"type": "image", "tagName": "img", "attributes": {"class": "ontario-author-avatar", "alt": "", "loading": "lazy"},
                 "scBindings": {"src": {"scope": "context", "field": "author_avatar"}}},
                _element("span", "ontario-author-fallback", components=[_icon("user")], **{"aria-hidden": "true"}),
                _bound("span", "author"),
            ]),
            _element("span", components=[_icon("calendar-days"), _bound_time("published_at", fmt="date_short")]),
        ]),
        _bound("h3", "title", "h4 card-title skaut"),
        _bound("p", "excerpt", "card-text"),
        {"type": "link", "tagName": "a", "attributes": {"class": "stretched-link ontario-read-more", "aria-label": "Číst příspěvek"},
         "scBindings": {"href": {"scope": "context", "field": "url"}}, "content": "Číst dále →"},
    ]),
])

ONTARIO_EVENT_CARD = _element("article", "card shadow-sm ontario-card ontario-event-card", name="Karta události", components=[
    _element("div", "card-img-top sc-image-placeholder sc-image-placeholder--event", **{"aria-hidden": "true"}),
    _element("div", "card-body", components=[
        _element("div", "ontario-card-meta", components=[
            _element("span", "ontario-card-author", components=[
                {"type": "image", "tagName": "img", "attributes": {"class": "ontario-author-avatar", "alt": "", "loading": "lazy"},
                 "scBindings": {"src": {"scope": "context", "field": "author_avatar"}}},
                _element("span", "ontario-author-fallback", components=[_icon("user")], **{"aria-hidden": "true"}),
                _bound("span", "author"),
            ]),
            _element("span", components=[_icon("calendar-days"), _bound_time("start_at")]),
        ]),
        _bound("h3", "title", "h4 skaut"),
        _bound("p", "description", "card-text"),
        {"type": "link", "tagName": "a", "attributes": {"class": "stretched-link ontario-read-more", "aria-label": "Detail události"},
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
    params: dict = {"limit": limit}
    if team_id:
        params["team_id"] = team_id
    if paginated:
        params["page"] = {"$scBinding": {"scope": "page", "field": "query.page"}}
    children: list[dict] = [_element("div", "row row-cols-1 row-cols-md-2 row-cols-lg-3 g-4", components=[{
        "type": "sc-repeat", "source": "core.events", "params": params,
        "components": [_element("div", "col", components=[deepcopy(ONTARIO_EVENT_CARD)])],
        "empty": [_text("Další události právě připravujeme.", "ontario-empty")],
    }])]
    if paginated:
        children.append({"type": "sc-pagination", "source": "core.events", "limit": limit, "params": params})
    return _element("div", "ontario-feed", components=children)


ONTARIO_MEETINGS = _element("section", "ontario-meetings ontario-section", name="Události s paginací", components=[
    _element("div", "container", components=[_heading("h1", "Události", "display-4 skaut"), _event_feed()]),
])

ONTARIO_TEAM_HERO = _element("section", "ontario-team-heading ontario-section", name="Záhlaví družiny", components=[
    _element("div", "container ontario-team-heading-inner", components=[
        _image("assets/mockups/scout-planning-v1.webp", "Ilustrace družiny", "ontario-team-avatar ontario-photo-tint"),
        _element("div", components=[_heading("h1", "Schůzky družiny Lachtanů", "display-5 skaut"), _text("Pravidelně v pátky od 16:00 do 18:00", "lead")]),
    ]),
])

ONTARIO_CALENDAR = _element("section", "ontario-calendar ontario-section", name="Kalendář – měsíční přehled", components=[
    _element("div", "container", components=[
        _heading("h1", "Kalendář", "display-4 skaut"),
        _text("Nejbližší schůzky, výpravy a oddílové akce.", "lead ontario-section-lead"),
        {"type": "sc-calendar", "kind": "all", "firstDayOfWeek": "monday", "showDescription": True},
    ]),
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

ONTARIO_MEDIA_LINK_CARD = {
    "type": "link", "tagName": "a",
    "attributes": {"class": "ontario-media-link sc-shape-rounded", "href": "#", "data-sc-overlay": "true"},
    "components": [
        _image("assets/mockups/scout-planning-v1.webp", "Skauti na výpravě", "ontario-media-link-image"),
        _element("span", "ontario-media-link-mask", **{"aria-hidden": "true"}),
        _element("span", "ontario-media-link-content", components=[
            _heading("h3", "FOTOGALERIE", "h3 skaut"),
            _text("Prohlédněte si fotografie z našich akcí."),
        ]),
    ],
}

ONTARIO_GALLERY_HUB = _element("section", "ontario-gallery-hub ontario-section", name="Rozcestník galerie", components=[
    _element("div", "container", components=[
        _heading("h2", "Galerie", "text-center display-5 skaut"),
        _element("div", "row g-4 mt-4", components=[
            _element("div", "col-md-6", components=[deepcopy(ONTARIO_MEDIA_LINK_CARD)]),
            _element("div", "col-md-6", components=[{
                **deepcopy(ONTARIO_MEDIA_LINK_CARD),
                "attributes": {"class": "ontario-media-link sc-shape-rounded", "href": "#", "data-sc-overlay": "true"},
                "components": [
                    _image("assets/main_header.jpg", "Videa z oddílových akcí", "ontario-media-link-image"),
                    _element("span", "ontario-media-link-mask", **{"aria-hidden": "true"}),
                    _element("span", "ontario-media-link-content", components=[
                        _heading("h3", "VIDEA", "h3 skaut"), _text("Podívejte se na videa z výprav a táborů."),
                    ]),
                ],
            }]),
        ]),
    ]),
])

def _person_card(
    name: str,
    role: str,
    *,
    phone: str = "1234567789",
    email: str = "mail@etc.com",
) -> dict:
    return _element("article", "ontario-person text-center", components=[
        _image("assets/mockups/scout-planning-v1.webp", name, "ontario-person-photo sc-shape-oval"),
        _text(role, "ontario-person-role skaut mb-1"),
        _heading("h3", name, "h5 skaut"),
        _element("p", "ontario-person-contact", components=[
            _element("span", content="Telefon: "),
            _element("a", content=phone, href=f"tel:{phone}"),
        ]),
        _element("p", "ontario-person-contact", components=[
            _element("span", content="E-mail: "),
            _element("a", content=email, href=f"mailto:{email}"),
        ]),
    ])


ONTARIO_CONTACT_HERO = _element("header", "ontario-contact-hero", name="Kontaktní hero", components=[
    _element("div", "ontario-photo-mask", **{"aria-hidden": "true"}),
    _element("div", "container ontario-contact-hero-content", components=[
        _heading("h1", "Kontaktujte nás", "display-4 skaut"),
        _heading("h2", "Máte dotazy a nevíte, na koho se obrátit?", "h4 skaut"),
    ]),
], **{"data-sc-overlay": "true"})

ONTARIO_LEADERS = _element("section", "ontario-leaders ontario-section text-center sc-section-edges sc-edge-bottom-shape-peaks sc-edge-bottom-color-pale sc-edge-size-md", name="Vedoucí oddílu", components=[
    _element("div", "container", components=[
        _heading("h2", "Vedoucí oddílu", "text-center display-5 skaut"),
        _element("div", "ontario-competencies", components=[
            _text("Kompetence:", "text-muted", "span"),
            _element("span", "badge bg-primary", content="Registrace"),
            _element("span", "badge bg-danger", content="Tábory"),
            _element("span", "badge ontario-badge-magenta", content="Oddílové věci"),
        ]),
        _element("div", "row row-cols-1 row-cols-sm-2 g-5 justify-content-center ontario-leader-grid", components=[
            _element("div", "col", components=[_person_card("Jan Novák", "Vůdce")]),
            _element("div", "col", components=[_person_card("Petr Svoboda", "Zástupce vůdce")]),
        ]),
    ]),
])

ONTARIO_COUNCIL = _element("section", "ontario-council ontario-section text-center sc-section-edges", name="Oddílová rada", components=[
    _element("div", "container", components=[
        _heading("h2", "Oddílová rada", "text-center display-5 skaut"),
        _element("div", "ontario-competencies", components=[
            _text("Kompetence:", "text-muted", "span"),
            _element("span", "badge ontario-badge-magenta", content="Organizační věci"),
            _element("span", "badge bg-primary", content="Výpravy"),
        ]),
        _element("div", "row row-cols-1 row-cols-sm-2 row-cols-lg-4 g-5 mt-4 justify-content-center", components=[
            _element("div", "col", components=[_person_card("Eva Novotná", "Rádkyně")]),
            _element("div", "col", components=[_person_card("Tomáš Dvořák", "Rádce")]),
            _element("div", "col", components=[_person_card("Anna Černá", "Vedoucí družiny")]),
            _element("div", "col", components=[_person_card("Martin Procházka", "Vedoucí družiny")]),
        ]),
    ]),
])

ONTARIO_CONTACT = _element("div", "ontario-contact-page", name="Kontakt", components=[
    deepcopy(ONTARIO_CONTACT_HERO), deepcopy(ONTARIO_LEADERS), deepcopy(ONTARIO_COUNCIL),
])

def _social_link(label: str, network: str) -> dict:
    return {
        "type": "link", "tagName": "a",
        "attributes": {
            "class": f"ontario-social-link ontario-social-{network}", "href": "#", "aria-label": label,
        },
        "components": [_element("i", f"fa-brands fa-{network}", **{"aria-hidden": "true"})],
    }


ONTARIO_SOCIAL_LINKS = _element("section", "ontario-socials ontario-section", name="Sociální sítě a odkazy", components=[
    _element("div", "container", components=[
        _heading("h1", "Odkazy", "display-4 skaut text-center ontario-social-page-title"),
        _heading("h2", "Jsme i na sociálních sítích", "h3 skaut text-center"),
        _element("div", "ontario-social-row", components=[
            _social_link("Instagram", "instagram"),
            _social_link("YouTube", "youtube"),
            _social_link("GitHub", "github"),
        ]),
        _heading("h2", "Další oddíly ve středisku", "h3 skaut text-center ontario-related-title"),
        _element("div", "row row-cols-1 row-cols-sm-3 g-5 ontario-related-links", components=[
            _element("div", "col", components=[_element("a", "ontario-related-link", href="#", components=[_image("assets/round_notext.png", "Skautské středisko", "ontario-related-logo"), _text("Skautské středisko", "skaut")])]),
            _element("div", "col", components=[_element("a", "ontario-related-link", href="https://www.skaut.cz", components=[_image("assets/SKAUT_logo_podklad_bily.png", "Junák – český skaut", "ontario-related-logo"), _text("Stránky Junáka", "skaut")])]),
            _element("div", "col", components=[_element("a", "ontario-related-link", href="#", components=[_icon("compass"), _text("Albion", "skaut")])]),
        ]),
    ]),
])

ONTARIO_DOWNLOAD_CARDS = _element("section", "ontario-downloads ontario-section", name="Materiály ke stažení", components=[
    _element("div", "container", components=[
        _heading("h2", "Naše oddílové materiály", "display-5 skaut"),
        _element("div", "row row-cols-1 row-cols-lg-2 g-4 mt-3", components=[
            _element("div", "col", components=[_element("article", "card ontario-resource-card h-100", components=[
                _element("div", "card-body", components=[_heading("h3", "Oddílový zpěvník", "h4 skaut"), _text("Stáhněte si zpěvník do mobilu nebo k tisku."), _element("a", "btn btn-info btn-skaut sc-mask-button-soft", content="Stáhnout PDF", href="#")]),
            ])]),
            _element("div", "col", components=[_element("article", "card ontario-resource-card h-100", components=[
                _element("div", "card-body", components=[_heading("h3", "Kronika", "h4 skaut"), _text("Prolistujte si oddílovou kroniku online."), _element("a", "btn btn-info btn-skaut sc-mask-button-rugged", content="Otevřít kroniku", href="#")]),
            ])]),
        ]),
    ]),
])

ONTARIO_FOOTER = {
    "type": "default",
    "tagName": "footer",
    "name": "Patička",
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
                        "components": [
                            _image("assets/white_text_next.png", "Skautský oddíl", "ontario-footer-logo", template_logo="footer"),
                            _logo_fallback("footer", "ontario-footer-logo-fallback skaut"),
                        ],
                    },
                    {
                        "type": "sc-menu",
                        "location": "footer",
                        "presentation": "bootstrap-footer-columns",
                    },
                ],
            },
            _element("small", "ontario-copyright", components=[
                _text("© 2026 ", "", "span"),
                {
                    "type": "text",
                    "tagName": "span",
                    "content": "Skautský oddíl",
                    "scBindings": {"text": {"scope": "site", "field": "site_title"}},
                },
                _text(". Powered by ", "", "span"),
                _element("a", content="ScoutComp", href="https://scoutcomp.pernicka.cz"),
                _text(".", "", "span"),
            ]),
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
    "support": _project(deepcopy(ONTARIO_HEADER), _element("main", "ontario-page-top", components=[deepcopy(ONTARIO_COMPACT_HERO), {"type": "sc-slot", "name": "content", "components": [_element("section", "ontario-section", components=[_element("div", "container ontario-reading", components=[_component_instance("page-intro", "Úvod stránky", {"heading": "Jak nás podpořit", "description": "Pomoci můžete časem, materiálem i příspěvkem na oddílové aktivity."})])])]}]), deepcopy(ONTARIO_FOOTER)),
    "text-page": _project(deepcopy(ONTARIO_HEADER), _element("main", "ontario-page-top", components=[deepcopy(ONTARIO_COMPACT_HERO), {"type": "sc-slot", "name": "content", "components": [_element("section", "ontario-section", components=[_element("div", "container ontario-reading", components=[_component_instance("page-intro", "Úvod stránky")])])]}]), deepcopy(ONTARIO_FOOTER)),
    "downloads": _project(deepcopy(ONTARIO_HEADER), _element("main", "ontario-page-top", components=[{"type": "sc-slot", "name": "content", "components": [_element("section", "ontario-section", components=[_element("div", "container ontario-reading", components=[_heading("h1", "Ke stažení", "display-4 skaut"), _element("div", "list-group", components=[_element("a", "list-group-item list-group-item-action", content="Přihláška a důležité dokumenty", href="#")])])])]}]), deepcopy(ONTARIO_FOOTER)),
    "links": _project(deepcopy(ONTARIO_HEADER), _element("main", "ontario-page-top", components=[{"type": "sc-slot", "name": "content", "components": [deepcopy(ONTARIO_SOCIAL_LINKS)]}]), deepcopy(ONTARIO_FOOTER)),
}

ONTARIO_THEME_SECTIONS = {
    "hero": _project(deepcopy(ONTARIO_HERO)),
    "about": _project(deepcopy(ONTARIO_ABOUT)),
    "posts": _project(deepcopy(ONTARIO_POSTS)),
    "header": _project(deepcopy(ONTARIO_HEADER)),
    "footer": _project(deepcopy(ONTARIO_FOOTER)),
    "compact-hero": _project(deepcopy(ONTARIO_COMPACT_HERO)),
    "archive": _project(deepcopy(ONTARIO_ARCHIVE)),
    "meetings": _project(deepcopy(ONTARIO_MEETINGS)),
    "calendar": _project(deepcopy(ONTARIO_CALENDAR)),
    "contact": _project(deepcopy(ONTARIO_CONTACT)),
    "contact-hero": _project(deepcopy(ONTARIO_CONTACT_HERO)),
    "gallery": _project(deepcopy(ONTARIO_GALLERY)),
    "faq": _project(deepcopy(ONTARIO_FAQ)),
    "team-heading": _project(deepcopy(ONTARIO_TEAM_HERO)),
    "gallery-hub": _project(deepcopy(ONTARIO_GALLERY_HUB)),
    "leaders": _project(deepcopy(ONTARIO_LEADERS)),
    "council": _project(deepcopy(ONTARIO_COUNCIL)),
    "social-links": _project(deepcopy(ONTARIO_SOCIAL_LINKS)),
    "download-cards": _project(deepcopy(ONTARIO_DOWNLOAD_CARDS)),
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
    "font-awesome-icon": _project(_icon("compass", "Kompas")),
    "meeting-card": _project(deepcopy(ONTARIO_EVENT_CARD)),
    "alert": _project(_element("div", "alert alert-info", content="Důležité sdělení", role="alert")),
    "badge": _project(_element("span", "badge bg-secondary", content="Štítek")),
    "breadcrumb": _project(_element("nav", components=[_element("ol", "breadcrumb", components=[_element("li", "breadcrumb-item", content="Domů"), _element("li", "breadcrumb-item active", content="Stránka", **{"aria-current": "page"})])], **{"aria-label": "Drobečková navigace"})),
    "accordion": _project(_element("details", "ontario-accordion", components=[_element("summary", content="Rozbalovací položka"), _text("Obsah rozbalovací položky.")])),
    "progress": _project(_element("div", "progress", components=[_element("div", "progress-bar", content="60 %", role="progressbar", **{"aria-label": "Postup", "aria-valuenow": "60", "aria-valuemin": "0", "aria-valuemax": "100"})])),
    "media-link-card": _project(deepcopy(ONTARIO_MEDIA_LINK_CARD)),
    "person-card": _project(_person_card("Jméno vedoucího", "Vedoucí družiny")),
    "download-card": _project(_element("article", "card ontario-resource-card", components=[_element("div", "card-body", components=[_heading("h3", "Dokument", "h4 skaut"), _text("Krátký popis dokumentu."), _element("a", "btn btn-info btn-skaut sc-mask-button-soft", content="Stáhnout", href="#")])])),
    "social-icon": _project(_social_link("Instagram", "instagram")),
    "photo-mask": _project(_element(
        "figure",
        "ontario-photo-frame sc-shape-soft",
        name="Fotografie s barevnou maskou",
        components=[_image("assets/mockups/scout-planning-v1.webp", "Fotografie z oddílové akce", "img-fluid w-100")],
        **{"data-sc-overlay": "true"},
    )),
    "page-intro": _project(deepcopy(ONTARIO_PAGE_INTRO)),
    "text-card": _project(deepcopy(ONTARIO_TEXT_CARD)),
    "call-to-action": _project(deepcopy(ONTARIO_CALL_TO_ACTION)),
    "quote": _project(deepcopy(ONTARIO_QUOTE)),
    "contact-card": _project(deepcopy(ONTARIO_CONTACT_CARD)),
    "statistic": _project(deepcopy(ONTARIO_STATISTIC)),
}

ONTARIO_COMPONENT_PROPS = {
    "page-intro": {
        "schema": [
            {"id": "heading", "type": "text", "label": "Nadpis", "required": True},
            {"id": "description", "type": "textarea", "label": "Popis", "required": True},
        ],
        "defaults": {
            "heading": "Nadpis stránky",
            "description": "Sem napište krátký úvodní text, který návštěvníkovi představí obsah stránky.",
        },
    },
    "text-card": {
        "schema": [
            {"id": "heading", "type": "text", "label": "Nadpis", "required": True},
            {"id": "description", "type": "textarea", "label": "Text", "required": True},
        ],
        "defaults": {
            "heading": "Nadpis karty",
            "description": "Stručně představte důležitou informaci nebo část obsahu.",
        },
    },
    "call-to-action": {
        "schema": [
            {"id": "heading", "type": "text", "label": "Nadpis", "required": True},
            {"id": "description", "type": "textarea", "label": "Popis", "required": True},
            {"id": "button_label", "type": "text", "label": "Text tlačítka", "required": True},
            {"id": "button_url", "type": "text", "label": "Adresa odkazu", "required": True, "placeholder": "/kontakt"},
        ],
        "defaults": {
            "heading": "Chcete se přidat?",
            "description": "Ozvěte se nám a přijďte se podívat na naši nejbližší schůzku.",
            "button_label": "Kontaktujte nás",
            "button_url": "/kontakt",
        },
    },
    "quote": {
        "schema": [
            {"id": "quote", "type": "textarea", "label": "Citace", "required": True},
            {"id": "author", "type": "text", "label": "Autor", "required": True},
        ],
        "defaults": {
            "quote": "Skauting je příležitost zažít dobrodružství a naučit se pomáhat druhým.",
            "author": "Jan Novák",
        },
    },
    "contact-card": {
        "schema": [
            {"id": "heading", "type": "text", "label": "Nadpis", "required": True},
            {"id": "description", "type": "textarea", "label": "Popis", "required": True},
            {"id": "link_label", "type": "text", "label": "Text odkazu", "required": True},
            {"id": "link_url", "type": "text", "label": "Adresa odkazu", "required": True, "placeholder": "mailto:oddil@example.cz"},
        ],
        "defaults": {
            "heading": "Kontakt na oddíl",
            "description": "Máte otázku? Napište nám a rádi vám odpovíme.",
            "link_label": "oddil@example.cz",
            "link_url": "mailto:oddil@example.cz",
        },
    },
    "statistic": {
        "schema": [
            {"id": "value", "type": "text", "label": "Hodnota", "required": True},
            {"id": "label", "type": "text", "label": "Popisek", "required": True},
        ],
        "defaults": {"value": "25", "label": "let společných dobrodružství"},
    },
}


_EDGE_SHAPES = (
    ("soft", "Křivkový"),
    ("rolling", "Vlnkový"),
    ("scallop", "Vroubkovaný"),
    ("peaks", "Horské vrcholky"),
    ("zigzag", "Cikcak"),
    ("diagonal", "Šikmý"),
)
_EDGE_COLORS = (
    ("white", "Bílá"),
    ("cream", "Krémová"),
    ("pale", "Světlá doplňková"),
    ("primary", "Hlavní"),
    ("dark", "Tmavá hlavní"),
    ("accent", "Akcentní"),
)
_EDGE_SIZES = (
    ("subtle", "Jemný"),
    ("sm", "Malý"),
    ("md", "Střední"),
    ("lg", "Velký"),
)


def _edge_shape_options(class_prefix: str) -> list[dict]:
    return [
        {"value": "none", "label": "Bez předělu"},
        *[
            {"value": value, "label": label, "class_name": f"{class_prefix}{value}"}
            for value, label in _EDGE_SHAPES
        ],
    ]


def _edge_color_options(class_prefix: str) -> list[dict]:
    return [
        {"value": value, "label": label, "class_name": f"{class_prefix}{value}"}
        for value, label in _EDGE_COLORS
    ]


def _edge_size_options() -> list[dict]:
    return [
        {"value": value, "label": label, "class_name": f"sc-edge-size-{value}"}
        for value, label in _EDGE_SIZES
    ]


def _decorative_divider(shape: str, name: str) -> dict:
    return _element(
        "div",
        f"sc-decorative-divider sc-divider-shape-{shape} sc-divider-color-pale sc-edge-size-md",
        name=name,
        **{"aria-hidden": "true"},
    )


_ONTARIO_EDITOR = {
    "font_sets": [
        {"id": "themix", "label": "TheMix", "value": '"TheMix", Arial, sans-serif'},
        {"id": "skaut", "label": "SKAUT Bold", "value": '"SKAUT Bold", "TheMix", sans-serif'},
    ],
    "blocks": [
        {
            "id": f"divider-{shape}",
            "label": f"Předěl – {label.lower()}",
            "category": "Předěly a okraje",
            "icon": "water" if shape == "rolling" else "grip-lines",
            "content": _decorative_divider(shape, f"{label} předěl"),
        }
        for shape, label in _EDGE_SHAPES
    ],
    "resource_groups": [
        {
            "id": "content", "kind": "components", "label": "Text a obsah", "order": 10,
            "resources": ["page-intro", "text-card", "quote", "accordion"],
        },
        {
            "id": "actions", "kind": "components", "label": "Akce a odkazy", "order": 20,
            "resources": ["button", "call-to-action", "media-link-card", "download-card", "social-icon"],
        },
        {
            "id": "information", "kind": "components", "label": "Informace a kontakty", "order": 30,
            "resources": ["contact-card", "person-card", "statistic", "alert", "badge", "progress"],
        },
        {
            "id": "media", "kind": "components", "label": "Média a identita", "order": 40,
            "resources": ["photo-mask", "scout-logo", "font-awesome-icon"],
        },
        {
            "id": "navigation", "kind": "components", "label": "Navigace", "order": 50,
            "resources": ["breadcrumb"],
        },
        {
            "id": "dynamic", "kind": "components", "label": "Dynamický obsah", "order": 60,
            "resources": ["post-card", "meeting-card"],
        },
        {
            "id": "section-intros", "kind": "sections", "label": "Záhlaví a úvody", "order": 10,
            "resources": ["hero", "compact-hero", "contact-hero", "team-heading"],
        },
        {
            "id": "section-content", "kind": "sections", "label": "Obsahové sekce", "order": 20,
            "resources": ["about", "faq", "contact", "gallery", "gallery-hub", "leaders", "council"],
        },
        {
            "id": "section-resources", "kind": "sections", "label": "Odkazy a materiály", "order": 30,
            "resources": ["social-links", "download-cards"],
        },
        {
            "id": "section-dynamic", "kind": "sections", "label": "Dynamické výpisy", "order": 40,
            "resources": ["posts", "archive", "meetings", "calendar"],
        },
        {
            "id": "section-global", "kind": "sections", "label": "Globální části", "order": 50,
            "resources": ["header", "footer"],
        },
    ],
    # Theme-specific component settings are declarative data.  The editor
    # supplies generic field renderers, while this theme decides where those
    # fields appear and which CSS/attributes/classes they modify.
    "component_controls": [
        {
            "id": "decorative-divider",
            "label": "Dekorativní předěl",
            "icon": "water",
            "match": {"all_classes": ["sc-decorative-divider"]},
            "fields": [
                {
                    "id": "shape", "label": "Tvar", "type": "select", "default": "rolling",
                    "options": _edge_shape_options("sc-divider-shape-"),
                    "bind": {"kind": "class_choice", "remove_prefix": "sc-divider-shape-"},
                },
                {
                    "id": "color", "label": "Barva", "type": "select", "default": "pale",
                    "options": _edge_color_options("sc-divider-color-"),
                    "bind": {"kind": "class_choice", "remove_prefix": "sc-divider-color-"},
                },
                {
                    "id": "size", "label": "Výška", "type": "select", "default": "md",
                    "options": _edge_size_options(),
                    "bind": {"kind": "class_choice", "remove_prefix": "sc-edge-size-"},
                },
            ],
        },
        {
            "id": "section-edges",
            "label": "Dekorativní okraje sekce",
            "icon": "water",
            "match": {"tags": ["section", "header", "footer", "main", "article", "aside"]},
            "fields": [
                {
                    "id": "top-shape", "label": "Horní okraj", "type": "select", "default": "none",
                    "options": _edge_shape_options("sc-edge-top-shape-"),
                    "bind": {"kind": "class_choice", "remove_prefix": "sc-edge-top-shape-"},
                },
                {
                    "id": "top-color", "label": "Barva horního okraje", "type": "select", "default": "white",
                    "options": _edge_color_options("sc-edge-top-color-"),
                    "bind": {"kind": "class_choice", "remove_prefix": "sc-edge-top-color-"},
                },
                {
                    "id": "bottom-shape", "label": "Dolní okraj", "type": "select", "default": "none",
                    "options": _edge_shape_options("sc-edge-bottom-shape-"),
                    "bind": {"kind": "class_choice", "remove_prefix": "sc-edge-bottom-shape-"},
                },
                {
                    "id": "bottom-color", "label": "Barva dolního okraje", "type": "select", "default": "white",
                    "options": _edge_color_options("sc-edge-bottom-color-"),
                    "bind": {"kind": "class_choice", "remove_prefix": "sc-edge-bottom-color-"},
                },
                {
                    "id": "edge-size", "label": "Výška okraje", "type": "select", "default": "md",
                    "options": _edge_size_options(),
                    "bind": {"kind": "class_choice", "remove_prefix": "sc-edge-size-"},
                },
            ],
        },
        {
            "id": "photo-mask",
            "label": "Fotografie s barevnou maskou",
            "icon": "fill-drip",
            "scope": "closest",
            "match": {"all_classes": ["ontario-photo-frame"]},
            "fields": [
                {
                    "id": "photo",
                    "label": "Fotografie",
                    "type": "media",
                    "bind": {"kind": "media", "target": {"scope": "descendant", "match": {"tags": ["img"]}}},
                },
                {
                    "id": "position",
                    "label": "Pozice fotografie",
                    "type": "select",
                    "default": "center center",
                    "options": [
                        {"value": "center center", "label": "Uprostřed"},
                        {"value": "center top", "label": "Nahoře"},
                        {"value": "center bottom", "label": "Dole"},
                        {"value": "left center", "label": "Vlevo"},
                        {"value": "right center", "label": "Vpravo"},
                    ],
                    "bind": {"kind": "style", "name": "object-position", "target": {"scope": "descendant", "match": {"tags": ["img"]}}},
                },
                {"id": "enabled", "label": "Zobrazit masku", "type": "checkbox", "default": True, "bind": {"kind": "attribute", "name": "data-sc-overlay-enabled"}},
                {"id": "color", "label": "Barva masky", "type": "color", "default": "#0a224e", "bind": {"kind": "style", "name": "--sc-overlay-color"}},
                {"id": "opacity", "label": "Intenzita masky", "type": "range", "default": 64, "min": 0, "max": 100, "step": 1, "scale": 0.01, "bind": {"kind": "style", "name": "--sc-overlay-opacity"}},
                {
                    "id": "shape",
                    "label": "Tvar fotografie",
                    "type": "select",
                    "default": "soft",
                    "options": [
                        {"value": "none", "label": "Bez masky"},
                        {"value": "soft", "label": "Měkký organický", "class_name": "sc-shape-soft"},
                        {"value": "blob", "label": "Organický blob", "class_name": "sc-shape-blob"},
                        {"value": "oval", "label": "Ovál", "class_name": "sc-shape-oval"},
                        {"value": "rounded", "label": "Zaoblený obdélník", "class_name": "sc-shape-rounded"},
                    ],
                    "bind": {"kind": "class_choice", "remove_prefix": "sc-shape-"},
                },
            ],
        },
        {
            "id": "hero-overlay",
            "label": "Fotografické pozadí a maska",
            "icon": "images",
            "scope": "closest",
            "match": {"any_classes": ["ontario-hero", "ontario-compact-hero", "ontario-contact-hero"]},
            "fields": [
                {"id": "background", "label": "Fotografie na pozadí", "type": "media", "bind": {"kind": "media"}},
                {"id": "position", "label": "Pozice obrázku", "type": "select", "default": "center center", "options": [{"value": "center center", "label": "Uprostřed"}, {"value": "center top", "label": "Nahoře"}, {"value": "center bottom", "label": "Dole"}, {"value": "left center", "label": "Vlevo"}, {"value": "right center", "label": "Vpravo"}], "bind": {"kind": "style", "name": "background-position"}},
                {"id": "enabled", "label": "Zobrazit masku", "type": "checkbox", "default": True, "bind": {"kind": "attribute", "name": "data-sc-overlay-enabled"}},
                {"id": "color", "label": "Barva masky", "type": "color", "default": "#0a224e", "bind": {"kind": "style", "name": "--sc-overlay-color"}},
                {"id": "opacity", "label": "Intenzita masky", "type": "range", "default": 64, "min": 0, "max": 100, "step": 1, "scale": 0.01, "bind": {"kind": "style", "name": "--sc-overlay-opacity"}},
            ],
        },
        {
            "id": "media-link-overlay",
            "label": "Fotografická karta",
            "icon": "image",
            "scope": "closest",
            "match": {"all_classes": ["ontario-media-link"]},
            "fields": [
                {"id": "photo", "label": "Fotografie", "type": "media", "bind": {"kind": "media", "target": {"scope": "descendant", "match": {"all_classes": ["ontario-media-link-image"]}}}},
                {"id": "position", "label": "Pozice obrázku", "type": "select", "default": "center center", "options": [{"value": "center center", "label": "Uprostřed"}, {"value": "center top", "label": "Nahoře"}, {"value": "center bottom", "label": "Dole"}, {"value": "left center", "label": "Vlevo"}, {"value": "right center", "label": "Vpravo"}], "bind": {"kind": "style", "name": "object-position", "target": {"scope": "descendant", "match": {"all_classes": ["ontario-media-link-image"]}}}},
                {"id": "enabled", "label": "Zobrazit masku", "type": "checkbox", "default": True, "bind": {"kind": "attribute", "name": "data-sc-overlay-enabled"}},
                {"id": "color", "label": "Barva masky", "type": "color", "default": "#081a3b", "bind": {"kind": "style", "name": "--sc-overlay-color"}},
                {"id": "opacity", "label": "Intenzita masky", "type": "range", "default": 62, "min": 0, "max": 100, "step": 1, "scale": 0.01, "bind": {"kind": "style", "name": "--sc-overlay-opacity"}},
            ],
        },
        {
            "id": "button-style",
            "label": "Vzhled tlačítka",
            "icon": "hand-pointer",
            "match": {"all_classes": ["btn"]},
            "fields": [
                {
                    "id": "variant", "label": "Varianta", "type": "select", "default": "primary",
                    "options": [
                        {"value": value, "label": value.replace("-", " ").title(), "class_name": f"btn-{value}"}
                        for value in tuple(
                            variant
                            for color in ("primary", "secondary", "success", "danger", "warning", "info", "light", "dark")
                            for variant in (color, f"outline-{color}")
                        )
                    ],
                    "bind": {"kind": "class_choice"},
                },
                {
                    "id": "size", "label": "Velikost", "type": "select", "default": "normal",
                    "options": [
                        {"value": "normal", "label": "Běžná"},
                        {"value": "small", "label": "Malá", "class_name": "btn-sm"},
                        {"value": "large", "label": "Velká", "class_name": "btn-lg"},
                    ],
                    "bind": {"kind": "class_choice"},
                },
                {
                    "id": "mask", "label": "Tvar", "type": "select", "default": "none",
                    "options": [
                        {"value": "none", "label": "Výchozí"},
                        {"value": "soft", "label": "Měkký", "class_name": "sc-mask-button-soft"},
                        {"value": "flow", "label": "Plynulý", "class_name": "sc-mask-button-flow"},
                        {"value": "pebble", "label": "Oblázek", "class_name": "sc-mask-button-pebble"},
                        {"value": "natural", "label": "Přírodní", "class_name": "sc-mask-button-natural"},
                        {"value": "rounded-asymmetric", "label": "Asymetrický", "class_name": "sc-mask-button-rounded-asymmetric"},
                        {"value": "soft-capsule", "label": "Měkká kapsle", "class_name": "sc-mask-button-soft-capsule"},
                        {"value": "oval-wave", "label": "Oválná vlna", "class_name": "sc-mask-button-oval-wave"},
                    ],
                    "bind": {"kind": "class_choice"},
                },
                {"id": "full-width", "label": "Přes celou šířku", "type": "checkbox", "default": False, "bind": {"kind": "class_toggle", "class_name": "w-100"}},
            ],
        },
        {
            "id": "alert-variant",
            "label": "Vzhled upozornění",
            "icon": "triangle-exclamation",
            "match": {"all_classes": ["alert"]},
            "fields": [{
                "id": "variant", "label": "Varianta", "type": "select", "default": "info",
                "options": [{"value": value, "label": value.title(), "class_name": f"alert-{value}"} for value in ("primary", "secondary", "success", "danger", "warning", "info", "light", "dark")],
                "bind": {"kind": "class_choice", "remove_prefix": "alert-"},
            }],
        },
        {
            "id": "badge-variant",
            "label": "Vzhled štítku",
            "icon": "tag",
            "match": {"all_classes": ["badge"]},
            "fields": [{
                "id": "variant", "label": "Varianta", "type": "select", "default": "secondary",
                "options": [{"value": value, "label": value.title(), "class_name": f"bg-{value}"} for value in ("primary", "secondary", "success", "danger", "warning", "info", "light", "dark")],
                "bind": {"kind": "class_choice", "remove_prefix": "bg-"},
            }],
        },
        {
            "id": "table-style",
            "label": "Vzhled tabulky",
            "icon": "table",
            "match": {"tags": ["table"]},
            "fields": [
                {
                    "id": "variant", "label": "Varianta", "type": "select", "default": "default",
                    "options": [
                        {"value": "default", "label": "Výchozí"},
                        *[
                            {"value": value, "label": value.title(), "class_name": f"table-{value}"}
                            for value in ("primary", "secondary", "success", "danger", "warning", "info", "light", "dark")
                        ],
                    ],
                    "bind": {"kind": "class_choice"},
                },
                {"id": "striped", "label": "Pruhované řádky", "type": "checkbox", "default": False, "bind": {"kind": "class_toggle", "class_name": "table-striped"}},
                {"id": "hover", "label": "Zvýraznit řádek pod kurzorem", "type": "checkbox", "default": False, "bind": {"kind": "class_toggle", "class_name": "table-hover"}},
                {"id": "compact", "label": "Kompaktní", "type": "checkbox", "default": False, "bind": {"kind": "class_toggle", "class_name": "table-sm"}},
                {
                    "id": "border", "label": "Ohraničení", "type": "select", "default": "default",
                    "options": [
                        {"value": "default", "label": "Výchozí"},
                        {"value": "bordered", "label": "Ohraničená", "class_name": "table-bordered"},
                        {"value": "borderless", "label": "Bez čar", "class_name": "table-borderless"},
                    ],
                    "bind": {"kind": "class_choice"},
                },
            ],
        },
    ],
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
:root{--ontario-blue:var(--sc-primary-color,#255c9e);--ontario-blue-dark:var(--sc-primary-dark-color,#0a224e);--ontario-blue-pale:var(--sc-primary-pale-color,#bdd4df);--ontario-yellow:var(--sc-accent-color,#f9b200);--ontario-cream:var(--sc-warm-surface-color,#f6ebd8);--ontario-link:var(--sc-footer-link-color,#a9bed2);--ontario-dark:var(--sc-footer-color,#212529);--ontario-text:var(--sc-text-color,#252b31);--ontario-radius:1rem}
:root{--sc-bs-primary:var(--sc-bootstrap-primary,#0d6efd);--sc-bs-secondary:var(--sc-bootstrap-secondary,#6c757d);--sc-bs-success:var(--sc-bootstrap-success,#198754);--sc-bs-danger:var(--sc-bootstrap-danger,#dc3545);--sc-bs-warning:var(--sc-bootstrap-warning,#ffc107);--sc-bs-info:var(--sc-bootstrap-info,#0dcaf0);--sc-bs-light:var(--sc-bootstrap-light,#f8f9fa);--sc-bs-dark:var(--sc-bootstrap-dark,#212529)}
.bg-primary,.text-bg-primary{background-color:var(--sc-bs-primary)!important}.bg-secondary,.text-bg-secondary{background-color:var(--sc-bs-secondary)!important}.bg-success,.text-bg-success{background-color:var(--sc-bs-success)!important}.bg-danger,.text-bg-danger{background-color:var(--sc-bs-danger)!important}.bg-warning,.text-bg-warning{background-color:var(--sc-bs-warning)!important}.bg-info,.text-bg-info{background-color:var(--sc-bs-info)!important}.bg-light,.text-bg-light{background-color:var(--sc-bs-light)!important}.bg-dark,.text-bg-dark{background-color:var(--sc-bs-dark)!important}
.text-primary{color:var(--sc-bs-primary)!important}.text-secondary{color:var(--sc-bs-secondary)!important}.text-success{color:var(--sc-bs-success)!important}.text-danger{color:var(--sc-bs-danger)!important}.text-warning{color:var(--sc-bs-warning)!important}.text-info{color:var(--sc-bs-info)!important}.text-light{color:var(--sc-bs-light)!important}.text-dark{color:var(--sc-bs-dark)!important}
.border-primary{border-color:var(--sc-bs-primary)!important}.border-secondary{border-color:var(--sc-bs-secondary)!important}.border-success{border-color:var(--sc-bs-success)!important}.border-danger{border-color:var(--sc-bs-danger)!important}.border-warning{border-color:var(--sc-bs-warning)!important}.border-info{border-color:var(--sc-bs-info)!important}.border-light{border-color:var(--sc-bs-light)!important}.border-dark{border-color:var(--sc-bs-dark)!important}
.btn-primary{--bs-btn-bg:var(--sc-bs-primary);--bs-btn-border-color:var(--sc-bs-primary);--bs-btn-hover-bg:color-mix(in srgb,var(--sc-bs-primary) 84%,#000);--bs-btn-hover-border-color:color-mix(in srgb,var(--sc-bs-primary) 78%,#000)}.btn-secondary{--bs-btn-bg:var(--sc-bs-secondary);--bs-btn-border-color:var(--sc-bs-secondary)}.btn-success{--bs-btn-bg:var(--sc-bs-success);--bs-btn-border-color:var(--sc-bs-success)}.btn-danger{--bs-btn-bg:var(--sc-bs-danger);--bs-btn-border-color:var(--sc-bs-danger)}.btn-warning{--bs-btn-bg:var(--sc-bs-warning);--bs-btn-border-color:var(--sc-bs-warning)}.btn-info{--bs-btn-bg:var(--sc-bs-info);--bs-btn-border-color:var(--sc-bs-info)}.btn-light{--bs-btn-bg:var(--sc-bs-light);--bs-btn-border-color:var(--sc-bs-light)}.btn-dark{--bs-btn-bg:var(--sc-bs-dark);--bs-btn-border-color:var(--sc-bs-dark)}
.btn-outline-primary{--bs-btn-color:var(--sc-bs-primary);--bs-btn-border-color:var(--sc-bs-primary);--bs-btn-hover-bg:var(--sc-bs-primary);--bs-btn-hover-border-color:var(--sc-bs-primary)}.btn-outline-secondary{--bs-btn-color:var(--sc-bs-secondary);--bs-btn-border-color:var(--sc-bs-secondary);--bs-btn-hover-bg:var(--sc-bs-secondary)}.btn-outline-success{--bs-btn-color:var(--sc-bs-success);--bs-btn-border-color:var(--sc-bs-success);--bs-btn-hover-bg:var(--sc-bs-success)}.btn-outline-danger{--bs-btn-color:var(--sc-bs-danger);--bs-btn-border-color:var(--sc-bs-danger);--bs-btn-hover-bg:var(--sc-bs-danger)}.btn-outline-warning{--bs-btn-color:var(--sc-bs-warning);--bs-btn-border-color:var(--sc-bs-warning);--bs-btn-hover-bg:var(--sc-bs-warning)}.btn-outline-info{--bs-btn-color:var(--sc-bs-info);--bs-btn-border-color:var(--sc-bs-info);--bs-btn-hover-bg:var(--sc-bs-info)}.btn-outline-light{--bs-btn-color:var(--sc-bs-light);--bs-btn-border-color:var(--sc-bs-light);--bs-btn-hover-bg:var(--sc-bs-light)}.btn-outline-dark{--bs-btn-color:var(--sc-bs-dark);--bs-btn-border-color:var(--sc-bs-dark);--bs-btn-hover-bg:var(--sc-bs-dark)}
.alert-primary{--bs-alert-border-color:var(--sc-bs-primary);--bs-alert-bg:color-mix(in srgb,var(--sc-bs-primary) 14%,#fff)}.alert-secondary{--bs-alert-border-color:var(--sc-bs-secondary);--bs-alert-bg:color-mix(in srgb,var(--sc-bs-secondary) 14%,#fff)}.alert-success{--bs-alert-border-color:var(--sc-bs-success);--bs-alert-bg:color-mix(in srgb,var(--sc-bs-success) 14%,#fff)}.alert-danger{--bs-alert-border-color:var(--sc-bs-danger);--bs-alert-bg:color-mix(in srgb,var(--sc-bs-danger) 14%,#fff)}.alert-warning{--bs-alert-border-color:var(--sc-bs-warning);--bs-alert-bg:color-mix(in srgb,var(--sc-bs-warning) 18%,#fff)}.alert-info{--bs-alert-border-color:var(--sc-bs-info);--bs-alert-bg:color-mix(in srgb,var(--sc-bs-info) 14%,#fff)}.alert-light{--bs-alert-border-color:var(--sc-bs-light);--bs-alert-bg:var(--sc-bs-light)}.alert-dark{--bs-alert-border-color:var(--sc-bs-dark);--bs-alert-bg:color-mix(in srgb,var(--sc-bs-dark) 18%,#fff)}
.table-primary{--bs-table-bg:color-mix(in srgb,var(--sc-bs-primary) 20%,#fff)}.table-secondary{--bs-table-bg:color-mix(in srgb,var(--sc-bs-secondary) 20%,#fff)}.table-success{--bs-table-bg:color-mix(in srgb,var(--sc-bs-success) 20%,#fff)}.table-danger{--bs-table-bg:color-mix(in srgb,var(--sc-bs-danger) 20%,#fff)}.table-warning{--bs-table-bg:color-mix(in srgb,var(--sc-bs-warning) 24%,#fff)}.table-info{--bs-table-bg:color-mix(in srgb,var(--sc-bs-info) 20%,#fff)}.table-light{--bs-table-bg:var(--sc-bs-light)}.table-dark{--bs-table-bg:var(--sc-bs-dark)}
html,body{overflow-x:clip}body{min-height:100vh;min-height:100svh;display:flex;flex-direction:column;font-family:"TheMix",Arial,sans-serif;color:var(--ontario-text)}body>main{flex:1 0 auto;display:flex;flex-direction:column}.skaut,.ontario-footer .sc-menu-heading{font-family:"SKAUT Bold","TheMix",sans-serif;text-transform:uppercase}.ontario-icon{width:1.4em;text-align:center}.ontario-page-top{padding-top:5rem}.ontario-section{position:relative;padding:5.5rem 0}.ontario-section-lead{margin:0 auto 2.25rem;max-width:42rem}.ontario-reading{max-width:820px}.ontario-empty{grid-column:1/-1;padding:3rem;text-align:center;background:var(--ontario-cream);border-radius:var(--ontario-radius)}
@keyframes ontario-dropdown-in{from{opacity:0;transform:translateY(-.5rem)}to{opacity:1;transform:translateY(0)}}@keyframes ontario-menu-in{from{opacity:0;transform:translateX(2rem)}to{opacity:1;transform:translateX(0)}}
.ontario-navbar{position:sticky;top:0;z-index:100;margin-bottom:-4.75rem;padding:.7rem 0;background:rgba(10,34,78,.88);box-shadow:0 1px 0 rgba(255,255,255,.1)}.ontario-navbar-inner{display:flex;align-items:center;justify-content:space-between;max-width:1300px}.ontario-wordmark{display:block;width:118px;height:auto}.ontario-wordmark-dark{display:none}.ontario-desktop-menu{display:flex;align-items:center}.ontario-menu-shell{display:none}.ontario-menu-panel{display:flex;align-items:center}.ontario-menu-tools{display:none}.ontario-navbar .sc-menu-list{display:flex;flex-direction:row;align-items:center;justify-content:flex-end;gap:.1rem;margin:0}.ontario-navbar .sc-menu-item{position:relative;list-style:none}.ontario-navbar .sc-menu-details>summary{list-style:none}.ontario-navbar .sc-menu-details>summary::-webkit-details-marker{display:none}.ontario-navbar .sc-menu-link{display:flex;align-items:center;gap:.45rem;padding:.45rem .65rem;color:rgba(255,255,255,.82);font-size:.96rem;text-decoration:none;cursor:pointer;transition:color .16s ease,background-color .16s ease}.ontario-navbar .sc-menu-item:hover>.sc-menu-link,.ontario-navbar .sc-menu-item:hover>.sc-menu-details>.sc-menu-link{color:#fff}.ontario-navbar .sc-menu-link:focus-visible,.ontario-navbar summary:focus-visible{color:#fff;outline:2px solid currentColor;outline-offset:2px}.ontario-navbar .sc-menu-details>summary:after{content:"";width:.55rem;height:.55rem;margin-top:-.2rem;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg);transition:transform .18s ease}.ontario-navbar .sc-menu-details[open]>summary:after{transform:rotate(225deg);margin-top:.2rem}.ontario-navbar .sc-menu-dropdown{display:none;position:absolute;top:100%;left:0;z-index:110;min-width:13.5rem;margin:0;padding:.4rem 0;background:#fff;border:1px solid rgba(10,34,78,.08);box-shadow:0 .75rem 1.6rem rgba(10,34,78,.15)}.ontario-navbar .sc-menu-item:hover .sc-menu-dropdown,.ontario-navbar .sc-menu-item:focus-within .sc-menu-dropdown,.ontario-navbar .sc-menu-details[open]>.sc-menu-dropdown{display:block;animation:ontario-dropdown-in .18s ease-out both}.ontario-navbar .sc-menu-dropdown .sc-menu-link{padding:.6rem 1.1rem;color:#272c31;white-space:nowrap}.ontario-navbar .sc-menu-dropdown .sc-menu-link:hover,.ontario-navbar .sc-menu-dropdown .sc-menu-link:focus-visible{background:#eef4fb;color:var(--ontario-blue)}body:has(.ontario-page-top) .ontario-navbar{animation:none;background:#fff;box-shadow:0 1px 0 rgba(10,34,78,.08)}body:has(.ontario-page-top) .ontario-wordmark-light{display:none}body:has(.ontario-page-top) .ontario-wordmark-dark{display:block}body:has(.ontario-page-top) .ontario-navbar .sc-menu-link{color:#4b4f54}body:has(.ontario-page-top) .ontario-navbar .sc-menu-item:hover>.sc-menu-link,body:has(.ontario-page-top) .ontario-navbar .sc-menu-item:hover>.sc-menu-details>.sc-menu-link,body:has(.ontario-page-top) .ontario-navbar .sc-menu-link:focus-visible{color:var(--ontario-blue-dark)}
.ontario-hero{position:relative;min-height:100vh;min-height:100svh;display:flex;align-items:flex-start;background:url(assets/main_header.jpg) center top/cover no-repeat;color:#fff;overflow:hidden;--sc-hero-tint:var(--ontario-blue-dark);--sc-hero-tint-opacity:.64}.ontario-photo-mask{position:absolute;inset:0;background:var(--sc-hero-tint,var(--ontario-blue-dark));opacity:var(--sc-hero-tint-opacity,.64);mix-blend-mode:multiply}.ontario-hero-content{position:relative;z-index:2;text-align:center;padding-top:clamp(6rem,12vh,9rem);padding-bottom:9rem}.ontario-round-logo{display:block;width:clamp(145px,15vw,210px);aspect-ratio:1;object-fit:contain;margin:0 auto 1.25rem}.ontario-hero h1{font-size:clamp(3rem,5vw,4.5rem);letter-spacing:.025em;margin:0}.ontario-hero h2{max-width:32rem;margin:.6rem auto 0;line-height:1.35}.ontario-edge{position:absolute;left:0;right:0;bottom:-1px;z-index:4;height:7.5rem;overflow:hidden;pointer-events:none}.ontario-edge:after{content:"";position:absolute;inset:55% 0 -1px;background:#fff}.ontario-edge-blob{position:absolute;bottom:-4.6rem;width:58%;height:10rem;background:#fff;border-radius:50% 50% 0 0}.ontario-edge-blob--one{left:-9%;transform:rotate(5deg)}.ontario-edge-blob--two{left:25%;bottom:-5.6rem;width:54%;transform:rotate(-5deg)}.ontario-edge-blob--three{right:-13%;bottom:-4.4rem;transform:rotate(7deg)}
.sc-edge-soft,.sc-edge-rolling,.sc-edge-diagonal,.sc-edge-peaks{position:relative;isolation:isolate;--sc-edge-fill:#fff;--sc-edge-height:6rem}.sc-edge-sm{--sc-edge-height:3.5rem}.sc-edge-md{--sc-edge-height:6rem}.sc-edge-lg{--sc-edge-height:8rem}.sc-edge-white{--sc-edge-fill:#fff}.sc-edge-cream{--sc-edge-fill:var(--ontario-cream)}.sc-edge-blue{--sc-edge-fill:var(--ontario-blue-dark)}.sc-edge-soft:after,.sc-edge-rolling:after,.sc-edge-diagonal:after,.sc-edge-peaks:after{content:"";position:absolute;left:0;right:0;bottom:-1px;z-index:5;height:var(--sc-edge-height);background:var(--sc-edge-fill);pointer-events:none}.sc-edge-top:after{top:-1px;bottom:auto;transform:rotate(180deg)}.sc-edge-soft:after{clip-path:ellipse(105% 57% at 50% 100%)}.sc-edge-rolling:after{left:-2%;right:-2%;border-radius:52% 48% 0 0/18% 22% 0 0;transform:rotate(-.25deg)}.sc-edge-top.sc-edge-rolling:after{transform:rotate(179.75deg)}.sc-edge-diagonal:after{clip-path:polygon(0 58%,100% 4%,100% 100%,0 100%)}.sc-edge-peaks:after{clip-path:polygon(0 62%,16% 36%,34% 66%,54% 28%,75% 62%,100% 38%,100% 100%,0 100%)}
.ontario-compact-hero{position:relative;min-height:360px;display:flex;align-items:center;padding:7rem 0 8rem;background:url(assets/mockups/scout-planning-v1.webp) center/cover no-repeat;color:#fff;overflow:hidden;--sc-hero-tint:var(--ontario-blue-dark);--sc-hero-tint-opacity:.64}.ontario-compact-hero>.container{position:relative;z-index:2}.ontario-about{background:#fff}.ontario-about .row,.ontario-contact .row{margin-left:0;margin-right:0}.ontario-mockup{display:block;width:100%;max-height:480px;object-fit:cover;border-radius:48% 52% 45% 55%/55% 45% 55% 45%}.ontario-photo-frame{position:relative;margin:0;overflow:hidden;isolation:isolate;background:var(--ontario-blue)}.ontario-photo-frame img{display:block;width:100%;mix-blend-mode:multiply}.ontario-photo-tint{filter:saturate(.78) contrast(1.04)}.sc-shape-soft{border-radius:42% 58% 46% 54%/55% 42% 58% 45%!important}.sc-shape-blob{border-radius:61% 39% 48% 52%/44% 58% 42% 56%!important}.sc-shape-oval{border-radius:50%!important}.sc-shape-rounded{border-radius:1rem!important}.btn-skaut{font-family:"SKAUT Bold","TheMix",sans-serif;text-transform:uppercase}.sc-mask-button-soft,.sc-mask-button-flow,.sc-mask-button-pebble,.sc-mask-button-natural,.sc-mask-button-rugged{-webkit-mask-position:center;-webkit-mask-repeat:no-repeat;-webkit-mask-size:100% 100%;mask-position:center;mask-repeat:no-repeat;mask-size:100% 100%;border:0!important;border-radius:0!important;padding:.8em 1.55em}.sc-mask-button-soft{-webkit-mask-image:url(assets/masks/button-soft.svg);mask-image:url(assets/masks/button-soft.svg)}.sc-mask-button-flow{-webkit-mask-image:url(assets/masks/button-flow.svg);mask-image:url(assets/masks/button-flow.svg)}.sc-mask-button-pebble{-webkit-mask-image:url(assets/masks/button-pebble.svg);mask-image:url(assets/masks/button-pebble.svg)}.sc-mask-button-natural,.sc-mask-button-rugged{-webkit-mask-image:url(assets/masks/button-natural.svg);mask-image:url(assets/masks/button-natural.svg)}.ontario-posts{background:#f8f9fa}.ontario-card{height:100%;overflow:hidden;border:1px solid #d9e0e6;border-radius:var(--ontario-radius);box-shadow:0 .65rem 1.2rem rgba(10,34,78,.12)!important}.ontario-card>.card-img-top{width:100%;height:210px;object-fit:cover;background:var(--ontario-blue-pale)}.ontario-card>.sc-image-placeholder{display:grid;place-items:center;border-bottom:1px solid color-mix(in srgb,var(--ontario-blue-dark) 12%,transparent);color:color-mix(in srgb,var(--ontario-blue-dark) 58%,var(--ontario-blue-pale))}.ontario-card>.sc-image-placeholder:before{display:grid;width:4.5rem;height:4.5rem;place-items:center;border:2px solid currentColor;border-radius:50%;font-family:"Font Awesome 6 Free";font-size:2rem;font-weight:900;opacity:.72}.ontario-post-card>.sc-image-placeholder:before{content:"\f1ea"}.ontario-event-card>.sc-image-placeholder:before{content:"\f073"}.ontario-card .card-body{position:relative;padding:1.75rem}.ontario-card .card-title{color:#07366c}.ontario-card-meta{display:flex;flex-wrap:wrap;gap:.45rem 1rem;margin-bottom:1rem;color:#68717a;font-size:.92rem}.ontario-card-meta>span{display:inline-flex;align-items:center;gap:.35rem}.ontario-card-meta .ontario-icon{width:auto}.ontario-read-more{color:var(--ontario-blue);font-weight:700;text-decoration:none}.ontario-feed>.sc-pagination,.sc-pagination{justify-content:flex-end;padding-top:1.25rem;border-top:1px solid #d9e0e6}.sc-pagination-link,.sc-pagination-current{border-color:#d5dde5;border-radius:0!important}.sc-pagination-current{background:var(--ontario-blue);color:#fff}
.ontario-event-card:not(:has(>.card-img-top)):before{content:"\f073";display:grid;width:100%;height:210px;flex:0 0 210px;place-items:center;border-bottom:1px solid color-mix(in srgb,var(--ontario-blue-dark) 12%,transparent);background:var(--ontario-blue-pale);color:color-mix(in srgb,var(--ontario-blue-dark) 58%,var(--ontario-blue-pale));font-family:"Font Awesome 6 Free";font-size:2.75rem;font-weight:900;opacity:.72}
.ontario-team-heading-inner{display:flex;align-items:center;gap:2rem}.ontario-team-avatar{width:150px;height:150px;object-fit:cover;border:5px solid #111;border-radius:50%}.ontario-agenda{border-top:4px solid var(--ontario-blue)}.ontario-agenda-item{display:grid;grid-template-columns:minmax(10rem,14rem) 1fr;gap:1.5rem;align-items:start;padding:1.2rem}.ontario-agenda-date{font-weight:700;color:var(--ontario-blue)}.ontario-agenda-copy{display:grid;gap:.3rem}.ontario-contact{padding-bottom:10rem;background:var(--ontario-cream);overflow:hidden}.ontario-contact-list{display:grid;gap:.6rem;margin-top:2rem}.ontario-contact-list p{display:flex;gap:.75rem;align-items:baseline;margin:0}.ontario-gallery-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}.ontario-gallery-item{margin:0}.ontario-gallery-item img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover}.ontario-gallery-item figcaption{padding:.5rem 0;color:#68717a}.ontario-accordion{border-top:1px solid #d9e0e6}.ontario-accordion:last-child{border-bottom:1px solid #d9e0e6}.ontario-accordion summary{padding:1.2rem 0;font-family:"SKAUT Bold","TheMix",sans-serif;font-size:1.15rem;cursor:pointer}.ontario-accordion p{padding-bottom:1.25rem}
.ontario-media-link{position:relative;display:grid;min-height:270px;overflow:hidden;color:#fff;text-decoration:none;isolation:isolate}.ontario-media-link-image,.ontario-media-link-mask{position:absolute;inset:0;width:100%;height:100%}.ontario-media-link-image{object-fit:cover;transition:transform .3s ease}.ontario-media-link-mask{z-index:1;background:#081a3b;opacity:.62}.ontario-media-link-content{position:relative;z-index:2;display:grid;place-content:center;padding:2rem;text-align:center}.ontario-media-link:hover{color:#fff}.ontario-media-link:hover .ontario-media-link-image{transform:scale(1.035)}.ontario-media-link:focus-visible{outline:4px solid var(--ontario-yellow);outline-offset:3px}.ontario-person-photo{display:block;width:180px;height:180px;margin:auto;object-fit:cover}.ontario-person a{color:var(--ontario-blue-dark)}.ontario-resource-card{border:1px solid #d9e0e6;box-shadow:0 .45rem .9rem rgba(10,34,78,.1)}.ontario-resource-card .card-body{display:flex;flex-direction:column;align-items:flex-start;gap:.75rem;padding:1.5rem}.ontario-resource-card .btn{margin-top:auto}
.ontario-page-intro{max-width:68ch}.ontario-page-intro>:last-child{margin-bottom:0}.ontario-content-card{height:100%;padding:1.5rem;border:1px solid #d9e0e6;border-left:5px solid var(--ontario-blue);background:#fff}.ontario-content-card>:last-child{margin-bottom:0}.ontario-call-to-action{display:flex;align-items:center;justify-content:space-between;gap:2rem;padding:2rem;border-left:6px solid var(--ontario-yellow);background:var(--ontario-blue-pale)}.ontario-call-to-action-copy{max-width:46rem}.ontario-call-to-action-copy>:last-child{margin-bottom:0}.ontario-call-to-action .btn{flex:none}.ontario-quote{margin:0;padding:1.75rem 2rem;border-left:6px solid var(--ontario-blue);background:#eef4f7}.ontario-quote-text{margin:0;font-size:1.25rem;line-height:1.55}.ontario-quote-author{margin-top:1rem;color:#5d6872}.ontario-contact-card{display:grid;grid-template-columns:auto minmax(0,1fr);gap:1rem;padding:1.5rem;border-top:4px solid var(--ontario-blue);background:#f5f7f8}.ontario-contact-card>.ontario-icon{margin-top:.15rem;color:var(--ontario-blue);font-size:1.5rem}.ontario-contact-card p{margin-bottom:.45rem}.ontario-contact-link{font-weight:700}.ontario-statistic{display:grid;gap:.2rem;padding:1rem 0;border-bottom:2px solid var(--ontario-yellow)}.ontario-statistic-value{color:var(--ontario-blue-dark);font-size:2.75rem;line-height:1}.ontario-statistic-label{color:#5d6872}
@media(max-width:767.98px){.ontario-call-to-action{align-items:flex-start;flex-direction:column;padding:1.5rem}.ontario-call-to-action .btn{width:100%}.ontario-quote{padding:1.4rem 1.5rem}.ontario-statistic-value{font-size:2.3rem}}
.sc-progress-thin{height:.35rem}.sc-progress-large{height:1.75rem}
.ontario-footer{padding:4.25rem 0 0;background:var(--ontario-dark)!important}.ontario-footer-grid{display:grid;grid-template-columns:240px 1fr;gap:5rem;align-items:start;padding-bottom:5rem}.ontario-footer-logo{display:block;width:190px;height:auto}.ontario-footer .sc-menu-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3rem;margin-left:0;margin-right:0;width:100%}.ontario-footer .sc-menu-heading{display:block;padding:0 0 .65rem;color:#fff!important;text-decoration:none!important;font-weight:700}.ontario-footer .sc-menu-item{list-style:none}.ontario-footer .sc-menu-list>.sc-menu-item>.sc-menu-link{font-family:"SKAUT Bold","TheMix",sans-serif;color:#fff;text-transform:uppercase;font-weight:700;padding:0 0 .65rem}.ontario-footer .sc-menu-dropdown{display:block!important;position:static!important;min-width:0;padding:0!important;background:transparent!important;box-shadow:none!important}.ontario-footer .sc-menu-dropdown .sc-menu-link{display:block;padding:.25rem 0;color:var(--ontario-link);text-decoration:none}.ontario-footer .sc-menu-dropdown .sc-menu-link:hover{color:#fff}.ontario-copyright{display:block;padding:1.4rem 0;border-top:1px solid rgba(255,255,255,.08);color:#8fa1b1}
.ontario-footer{margin-top:auto}
@media(max-width:991.98px){.ontario-page-top{padding-top:4.5rem}.ontario-navbar{padding:.65rem 0}.ontario-wordmark{width:112px}.ontario-desktop-menu{display:none}.ontario-menu-shell{display:block}.ontario-menu-shell>summary{display:flex;align-items:center;justify-content:center;position:relative;z-index:202;width:44px;height:44px;color:#fff;list-style:none;cursor:pointer}body:has(.ontario-page-top) .ontario-menu-shell>summary{color:var(--ontario-blue-dark)}.ontario-menu-shell>summary::-webkit-details-marker{display:none}.ontario-menu-shell>summary:before{content:"☰";font-size:1.55rem}.ontario-menu-shell[open]>summary{position:fixed;top:.75rem;right:1rem;width:auto;padding:.5rem;color:var(--ontario-blue-dark)}.ontario-menu-shell[open]>summary:before{content:"×  Zavřít";font-family:"TheMix",Arial,sans-serif;font-size:1rem;font-weight:400}.ontario-menu-panel{display:none}.ontario-menu-shell[open]>.ontario-menu-panel{display:block;position:fixed;inset:0;z-index:200;overflow-y:auto;padding:5.25rem 0 2rem;background:#fff;color:var(--ontario-blue-dark)}.ontario-menu-tools{display:block;width:13.6rem;margin:0 auto 1.2rem;padding:0 0 1.4rem;border-bottom:1px solid #d9e0e6;text-align:center}.ontario-menu-close-label{display:none}.ontario-navbar .sc-menu{width:100%}.ontario-navbar .sc-menu-list{display:block;width:100%;padding:0;margin:0}.ontario-navbar .sc-menu-item{border-bottom:1px solid #e3e5e8}.ontario-navbar .sc-menu-link{min-height:64px;padding:.85rem 1.5rem;color:#111;font-size:1.12rem}.ontario-navbar .sc-menu-item:hover>.sc-menu-link,.ontario-navbar .sc-menu-item:hover>.sc-menu-details>.sc-menu-link{color:#111}.ontario-navbar .sc-menu-link:focus-visible,.ontario-navbar summary:focus-visible{color:var(--ontario-blue);outline-offset:-4px}.ontario-navbar .sc-menu-details>summary{justify-content:space-between}.ontario-navbar .sc-menu-dropdown,.ontario-navbar .sc-menu-item:hover .sc-menu-dropdown,.ontario-navbar .sc-menu-item:focus-within .sc-menu-dropdown{display:none;position:static;min-width:0;padding:0;background:#f5f5f5;border:0;box-shadow:none}.ontario-navbar .sc-menu-details[open]>.sc-menu-dropdown{display:block}.ontario-navbar .sc-menu-details[open]>summary,.ontario-navbar .sc-menu-details[open]>summary:hover{color:var(--ontario-blue);background:#f0f5fd}.ontario-navbar .sc-menu-dropdown .sc-menu-link,.ontario-navbar .sc-menu-dropdown .sc-menu-link:hover{min-height:56px;padding-left:2.5rem;color:#111;background:#f5f5f5}.ontario-navbar .sc-menu-dropdown .sc-menu-item:last-child{border-bottom:0}.ontario-wordmark-dark{display:none}.ontario-hero-content{padding-top:7rem}.ontario-footer-grid{grid-template-columns:1fr;gap:2.5rem}.ontario-footer .sc-menu-list{grid-template-columns:repeat(2,minmax(0,1fr))}.ontario-gallery-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:991.98px){.ontario-navbar{position:sticky;inset:auto;top:0;margin-bottom:-4.5rem}.ontario-menu-shell>summary{gap:.35rem;width:auto;min-width:44px}.ontario-menu-shell>summary:before,.ontario-menu-shell[open]>summary:before{content:none}.ontario-menu-shell>summary .fa-xmark,.ontario-menu-shell>summary .ontario-menu-close-label{display:none}.ontario-menu-shell[open]>summary .fa-bars{display:none}.ontario-menu-shell[open]>summary .fa-xmark,.ontario-menu-shell[open]>summary .ontario-menu-close-label{display:inline-block}.ontario-menu-shell[open]>.ontario-menu-panel{padding-top:4.75rem;animation:ontario-menu-in .22s ease-out both}.ontario-navbar .sc-menu-details>summary:after{display:none}.ontario-navbar .sc-menu-chevron{display:inline-block;width:1rem;transition:transform .18s ease}.ontario-navbar .sc-menu-details[open]>summary .sc-menu-chevron{transform:rotate(180deg)}.ontario-navbar .sc-menu-details[open]>.sc-menu-dropdown{animation:ontario-dropdown-in .18s ease-out both}.ontario-navbar .sc-menu-details[open]>summary{color:var(--ontario-blue)}.ontario-menu-tools{display:none}}
@media(max-width:575.98px){.ontario-section{padding:4rem 0}.ontario-hero{min-height:100svh}.ontario-hero-content{padding-top:6.2rem}.ontario-round-logo{width:145px}.ontario-hero h1{font-size:3rem}.ontario-edge{height:6.5rem}.ontario-team-heading-inner{align-items:flex-start;flex-direction:column}.ontario-team-avatar{width:124px;height:124px}.ontario-agenda-item{grid-template-columns:1fr;gap:.35rem}.ontario-gallery-grid{grid-template-columns:1fr}.ontario-footer .sc-menu-list{grid-template-columns:1fr;gap:1.75rem}}
/* Ontario layout corrections and reusable scout primitives. Keep navigation
   in normal flow on inner pages; only the home hero intentionally sits under
   its transparent sticky navigation. */
html,body{margin:0}.ontario-page-top{padding-top:0}
.ontario-navbar{margin-bottom:0;background:var(--ontario-blue-dark);box-shadow:0 1px 0 rgba(255,255,255,.12)}
.ontario-wordmark-light{display:block}.ontario-wordmark-dark{display:none!important}
body:has(.ontario-page-top) .ontario-navbar{animation:none;background:var(--ontario-blue-dark);box-shadow:0 1px 0 rgba(255,255,255,.12)}
body:has(.ontario-page-top) .ontario-wordmark-light{display:block}
body:has(.ontario-page-top) .ontario-navbar .sc-menu-link{color:rgba(255,255,255,.84)}
body:has(.ontario-page-top) .ontario-navbar .sc-menu-item:hover>.sc-menu-link,body:has(.ontario-page-top) .ontario-navbar .sc-menu-item:hover>.sc-menu-details>.sc-menu-link,body:has(.ontario-page-top) .ontario-navbar .sc-menu-link:focus-visible{color:#fff}
body:has(.ontario-page-top) .ontario-navbar .sc-menu-dropdown .sc-menu-link{min-height:44px;color:#252b31}
body:has(.ontario-page-top) .ontario-navbar .sc-menu-dropdown .sc-menu-link:hover,body:has(.ontario-page-top) .ontario-navbar .sc-menu-dropdown .sc-menu-link:focus-visible{color:var(--ontario-blue-dark);background:#eef4fb;outline:0}
body:not(:has(.ontario-page-top)) .ontario-navbar{position:fixed;inset:0 0 auto;margin-bottom:0;background:transparent;box-shadow:none;transition:background-color .18s ease,box-shadow .18s ease}
body:not(:has(.ontario-page-top)) .ontario-navbar.sc-scroll-nav--scrolled{background:var(--sc-nav-scrolled,#0a224e);box-shadow:0 1px 0 rgba(255,255,255,.14)}
.ontario-footer{background:var(--ontario-dark)!important}

/* Gentle organic edges never extend beyond the viewport and therefore cannot
   expose a second, detached white band. */
.sc-edge-soft,.sc-edge-rolling,.sc-edge-diagonal,.sc-edge-peaks{--sc-edge-height:3.25rem}
.sc-edge-subtle{--sc-edge-height:clamp(12px,1.4vw,22px)}
.sc-edge-sm{--sc-edge-height:1.75rem}.sc-edge-md{--sc-edge-height:3.25rem}.sc-edge-lg{--sc-edge-height:4.75rem}
.sc-edge-pale{--sc-edge-fill:var(--ontario-blue-pale)}
.sc-edge-diagonal:after,.sc-edge-peaks:after{left:0;right:0;transform:none;border-radius:0}
@supports ((mask-image:none) or (-webkit-mask-image:none)){.sc-edge-soft:after,.sc-edge-rolling:after{left:0;right:0;transform:none;border-radius:0;-webkit-mask-position:center;-webkit-mask-repeat:no-repeat;-webkit-mask-size:100% 100%;mask-position:center;mask-repeat:no-repeat;mask-size:100% 100%;clip-path:none}.sc-edge-soft:after{-webkit-mask-image:url(assets/masks/edge-soft.svg);mask-image:url(assets/masks/edge-soft.svg)}.sc-edge-rolling:after{-webkit-mask-image:url(assets/masks/edge-rolling.svg);mask-image:url(assets/masks/edge-rolling.svg)}}
.sc-edge-diagonal:after{clip-path:polygon(0 62%,100% 30%,100% 100%,0 100%)}
.sc-edge-peaks:after{clip-path:polygon(0 55%,9% 45%,17% 58%,27% 43%,38% 56%,49% 42%,61% 57%,72% 44%,84% 58%,93% 46%,100% 54%,100% 100%,0 100%)}
.sc-edge-top:after{top:-1px;bottom:auto;transform:rotate(180deg)}

/* Theme-owned decorative dividers. The top and bottom edge classes use
   separate pseudo-elements, so both sides of one section can be configured
   independently by the generic editor without theme-specific JavaScript. */
.sc-edge-size-subtle{--sc-edge-height:clamp(12px,1.4vw,22px)}
.sc-edge-size-sm{--sc-edge-height:1.75rem}.sc-edge-size-md{--sc-edge-height:3.25rem}.sc-edge-size-lg{--sc-edge-height:4.75rem}
:is(.sc-edge-top-shape-soft,.sc-edge-top-shape-rolling,.sc-edge-top-shape-scallop,.sc-edge-top-shape-peaks,.sc-edge-top-shape-zigzag,.sc-edge-top-shape-diagonal,.sc-edge-bottom-shape-soft,.sc-edge-bottom-shape-rolling,.sc-edge-bottom-shape-scallop,.sc-edge-bottom-shape-peaks,.sc-edge-bottom-shape-zigzag,.sc-edge-bottom-shape-diagonal){position:relative;isolation:isolate;--sc-edge-top-fill:#fff;--sc-edge-bottom-fill:#fff}
:is(.sc-edge-top-shape-soft,.sc-edge-top-shape-rolling,.sc-edge-top-shape-scallop,.sc-edge-top-shape-peaks,.sc-edge-top-shape-zigzag,.sc-edge-top-shape-diagonal):before,:is(.sc-edge-bottom-shape-soft,.sc-edge-bottom-shape-rolling,.sc-edge-bottom-shape-scallop,.sc-edge-bottom-shape-peaks,.sc-edge-bottom-shape-zigzag,.sc-edge-bottom-shape-diagonal):after{content:"";position:absolute;left:0;right:0;z-index:5;height:var(--sc-edge-height,3.25rem);pointer-events:none}
:is(.sc-edge-top-shape-soft,.sc-edge-top-shape-rolling,.sc-edge-top-shape-scallop,.sc-edge-top-shape-peaks,.sc-edge-top-shape-zigzag,.sc-edge-top-shape-diagonal):before{top:-1px;background:var(--sc-edge-top-fill);transform:rotate(180deg)}
:is(.sc-edge-bottom-shape-soft,.sc-edge-bottom-shape-rolling,.sc-edge-bottom-shape-scallop,.sc-edge-bottom-shape-peaks,.sc-edge-bottom-shape-zigzag,.sc-edge-bottom-shape-diagonal):after{bottom:-1px;background:var(--sc-edge-bottom-fill)}
.sc-edge-top-color-white{--sc-edge-top-fill:#fff}.sc-edge-top-color-cream{--sc-edge-top-fill:var(--ontario-cream)}.sc-edge-top-color-pale{--sc-edge-top-fill:var(--ontario-blue-pale)}.sc-edge-top-color-primary{--sc-edge-top-fill:var(--ontario-blue)}.sc-edge-top-color-dark{--sc-edge-top-fill:var(--ontario-blue-dark)}.sc-edge-top-color-accent{--sc-edge-top-fill:var(--ontario-yellow)}
.sc-edge-bottom-color-white{--sc-edge-bottom-fill:#fff}.sc-edge-bottom-color-cream{--sc-edge-bottom-fill:var(--ontario-cream)}.sc-edge-bottom-color-pale{--sc-edge-bottom-fill:var(--ontario-blue-pale)}.sc-edge-bottom-color-primary{--sc-edge-bottom-fill:var(--ontario-blue)}.sc-edge-bottom-color-dark{--sc-edge-bottom-fill:var(--ontario-blue-dark)}.sc-edge-bottom-color-accent{--sc-edge-bottom-fill:var(--ontario-yellow)}

.sc-decorative-divider{position:relative;width:100%;height:var(--sc-edge-height,3.25rem);overflow:hidden;flex:0 0 auto;--sc-divider-fill:var(--ontario-blue-pale)}
.sc-decorative-divider:after{content:"";position:absolute;inset:0;background:var(--sc-divider-fill);pointer-events:none}
.sc-divider-color-white{--sc-divider-fill:#fff}.sc-divider-color-cream{--sc-divider-fill:var(--ontario-cream)}.sc-divider-color-pale{--sc-divider-fill:var(--ontario-blue-pale)}.sc-divider-color-primary{--sc-divider-fill:var(--ontario-blue)}.sc-divider-color-dark{--sc-divider-fill:var(--ontario-blue-dark)}.sc-divider-color-accent{--sc-divider-fill:var(--ontario-yellow)}

:is(.sc-edge-top-shape-soft):before,:is(.sc-edge-bottom-shape-soft):after,.sc-divider-shape-soft:after{clip-path:ellipse(105% 57% at 50% 100%)}
:is(.sc-edge-top-shape-rolling):before,:is(.sc-edge-bottom-shape-rolling):after,.sc-divider-shape-rolling:after{clip-path:polygon(0 56%,8% 48%,17% 59%,27% 46%,38% 58%,49% 44%,61% 57%,72% 45%,84% 58%,93% 47%,100% 55%,100% 100%,0 100%)}
:is(.sc-edge-top-shape-peaks):before,:is(.sc-edge-bottom-shape-peaks):after,.sc-divider-shape-peaks:after{clip-path:polygon(0 55%,9% 45%,17% 58%,27% 43%,38% 56%,49% 42%,61% 57%,72% 44%,84% 58%,93% 46%,100% 54%,100% 100%,0 100%)}
:is(.sc-edge-top-shape-zigzag):before,:is(.sc-edge-bottom-shape-zigzag):after,.sc-divider-shape-zigzag:after{clip-path:polygon(0 58%,6.25% 34%,12.5% 58%,18.75% 34%,25% 58%,31.25% 34%,37.5% 58%,43.75% 34%,50% 58%,56.25% 34%,62.5% 58%,68.75% 34%,75% 58%,81.25% 34%,87.5% 58%,93.75% 34%,100% 58%,100% 100%,0 100%)}
:is(.sc-edge-top-shape-diagonal):before,:is(.sc-edge-bottom-shape-diagonal):after,.sc-divider-shape-diagonal:after{clip-path:polygon(0 62%,100% 30%,100% 100%,0 100%)}
:is(.sc-edge-top-shape-scallop):before,:is(.sc-edge-bottom-shape-scallop):after,.sc-divider-shape-scallop:after{background:radial-gradient(circle at 50% 0,transparent 0 38%,var(--sc-divider-effective-fill) 40% 100%) 0 0/2.25rem 72% repeat-x,linear-gradient(var(--sc-divider-effective-fill),var(--sc-divider-effective-fill)) 0 70%/100% 31% no-repeat;--sc-divider-effective-fill:var(--sc-divider-fill,var(--sc-edge-bottom-fill,#fff))}
:is(.sc-edge-top-shape-scallop):before{--sc-divider-effective-fill:var(--sc-edge-top-fill,#fff)}

@supports ((mask-image:none) or (-webkit-mask-image:none)){
  :is(.sc-edge-top-shape-soft,.sc-edge-top-shape-rolling):before,
  :is(.sc-edge-bottom-shape-soft,.sc-edge-bottom-shape-rolling):after,
  :is(.sc-divider-shape-soft,.sc-divider-shape-rolling):after{-webkit-mask-position:center;-webkit-mask-repeat:no-repeat;-webkit-mask-size:100% 100%;mask-position:center;mask-repeat:no-repeat;mask-size:100% 100%;clip-path:none}
  .sc-edge-top-shape-soft:before,.sc-edge-bottom-shape-soft:after,.sc-divider-shape-soft:after{-webkit-mask-image:url(assets/masks/edge-soft.svg);mask-image:url(assets/masks/edge-soft.svg)}
  .sc-edge-top-shape-rolling:before,.sc-edge-bottom-shape-rolling:after,.sc-divider-shape-rolling:after{-webkit-mask-image:url(assets/masks/edge-rolling.svg);mask-image:url(assets/masks/edge-rolling.svg)}
}
.ontario-hero{min-height:100vh;min-height:100svh}.ontario-hero-content{padding-bottom:clamp(6rem,12vh,9rem)}

.sc-shape-soft{border-radius:1.75rem 2.2rem 1.6rem 2rem/2rem 1.6rem 2.2rem 1.7rem!important}
.sc-shape-blob{border-radius:2.8rem 1.8rem 2.5rem 2rem/2rem 2.6rem 1.8rem 2.4rem!important}
.btn:not(.btn-close),.sc-button{display:inline-flex;align-items:center;justify-content:center;font-family:"SKAUT Bold","TheMix",sans-serif;text-transform:uppercase;font-weight:700;border-radius:.65rem .9rem .7rem .85rem;padding:.62em 1.15em;transition:transform .16s ease,box-shadow .16s ease,background-color .16s ease}
.btn:not(.btn-close):hover,.sc-button:hover{transform:translateY(-1px);box-shadow:0 .35rem .8rem rgba(10,34,78,.16)}
.btn i[data-sc-button-icon],.sc-button i[data-sc-button-icon]{flex:0 0 auto;line-height:1}.btn:has(i[data-sc-button-icon]),.sc-button:has(i[data-sc-button-icon]){gap:.55em;min-height:44px}.btn.sc-button-icon-right i[data-sc-button-icon],.sc-button.sc-button-icon-right i[data-sc-button-icon],i[data-sc-button-icon].sc-button-icon-right{order:2}.btn.sc-button-icon-only,.sc-button.sc-button-icon-only,[data-sc-button-icon-only="true"]{min-width:44px;min-height:44px;padding:.65rem}
.sc-mask-button-rounded-asymmetric,.sc-mask-button-soft-capsule,.sc-mask-button-oval-wave{-webkit-mask-position:center;-webkit-mask-repeat:no-repeat;-webkit-mask-size:100% 100%;mask-position:center;mask-repeat:no-repeat;mask-size:100% 100%;border:0!important;border-radius:0!important;padding:.82em 1.7em}.sc-mask-button-rounded-asymmetric{-webkit-mask-image:url(assets/masks/button-rounded-asymmetric.svg);mask-image:url(assets/masks/button-rounded-asymmetric.svg)}.sc-mask-button-soft-capsule{-webkit-mask-image:url(assets/masks/button-soft-capsule.svg);mask-image:url(assets/masks/button-soft-capsule.svg)}.sc-mask-button-oval-wave{-webkit-mask-image:url(assets/masks/button-oval-wave.svg);mask-image:url(assets/masks/button-oval-wave.svg)}
.ontario-post-card .card-text{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:4;min-height:5.6em}

.ontario-detail .web-post{max-width:100%}.ontario-detail .web-post-cover{display:block;width:100%;max-width:100%;height:auto;max-height:min(60vh,42rem);margin:1.5rem auto 2rem;object-fit:contain;background:var(--ontario-cream)}.ontario-detail .web-post-body,.ontario-detail .web-post-body img{max-width:100%}.ontario-detail .web-post-body img{height:auto}
.ontario-detail .ontario-reading{max-width:1040px}.ontario-detail .ontario-section{padding:4rem 0 4.5rem}.ontario-detail .ontario-reading>h1{max-width:16ch;margin-bottom:1.75rem;color:#252b31;line-height:1.02}
.ontario-detail .sc-event-detail{--sc-accent:var(--ontario-blue);--sc-event-facts-bg:#eef3f6;grid-template-columns:minmax(0,1fr) minmax(280px,340px);gap:1.25rem 3rem;align-items:start}.ontario-detail .sc-event-facts{grid-column:2;grid-row:1/span 2;display:grid;gap:1.15rem;padding:1.35rem 1.5rem;border-inline-start:.38rem solid var(--ontario-blue);background:var(--sc-event-facts-bg)}.ontario-detail .sc-event-facts:empty{display:none}.ontario-detail .sc-event-fact{grid-template-columns:1.4rem minmax(0,1fr);gap:.75rem}.ontario-detail .sc-event-fact>i{font-size:1rem}.ontario-detail .sc-event-date-points{display:grid;gap:1rem}.ontario-detail .sc-event-date-point{display:grid;gap:.18rem}.ontario-detail .sc-event-fact-label{font-size:.76rem}.ontario-detail .sc-event-fact time,.ontario-detail .sc-event-fact div>span:last-child{font-size:1.02rem;line-height:1.38}.ontario-detail .web-detail-meta{grid-column:1;grid-row:1;align-self:end;margin:.15rem 0 0;padding-bottom:1rem;border-bottom:1px solid #d9e0e6}.ontario-detail .sc-event-description{grid-column:1;grid-row:2;max-width:68ch;font-size:1.06rem;line-height:1.72}.ontario-detail .sc-event-description img{max-width:100%;height:auto}

/* Compact, information-first calendar treatment for the Ontario page. */
.ontario-calendar>.container{max-width:1180px}.ontario-calendar.ontario-section{padding:3.75rem 0 4.5rem}.ontario-calendar .ontario-section-lead{max-width:44rem;margin:.4rem 0 2rem}.ontario-calendar .sc-calendar{--sc-calendar-accent:var(--ontario-blue);--sc-calendar-line:#cfd9df;--sc-calendar-surface:#fff;margin-top:1.25rem}.ontario-calendar .sc-calendar-view-switch{margin-bottom:.75rem}.ontario-calendar .sc-calendar-count{color:#68717a;font-size:.88rem}.ontario-calendar .sc-calendar-toolbar{min-height:4.5rem;margin-bottom:.75rem;padding:.65rem .85rem;background:#f7f9fa}.ontario-calendar .sc-calendar-title{color:var(--ontario-blue-dark);font-size:1.8rem;line-height:1.1}.ontario-calendar .sc-calendar-today{font-size:.9rem}.ontario-calendar .sc-calendar-nav{min-width:2.75rem;min-height:2.75rem;border-color:#91a2ad;color:var(--ontario-blue-dark)}.ontario-calendar .sc-calendar-head{background:var(--ontario-blue)}.ontario-calendar .sc-calendar-heading{padding:.65rem .35rem;font-size:.92rem}.ontario-calendar .sc-calendar-week{min-height:6.25rem}.ontario-calendar .sc-calendar-day{height:6.25rem;padding:.38rem .42rem}.ontario-calendar .sc-calendar-day:nth-child(6),.ontario-calendar .sc-calendar-day:nth-child(7){background:#fbfcfd}.ontario-calendar .sc-calendar-day--outside{background:#f3f5f5!important}.ontario-calendar .sc-calendar-day--today{background:#eef6fa!important;box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--ontario-blue) 38%,transparent)}.ontario-calendar .sc-calendar-day-number{width:1.75rem;height:1.75rem;margin:0 0 .2rem;padding-top:.18rem;text-align:center;font-size:.9rem}.ontario-calendar .sc-calendar-day-number[aria-current=date]{border-radius:50%;background:var(--ontario-blue);color:#fff}.ontario-calendar .sc-calendar-event-bar{top:calc(1.85rem + (var(--sc-calendar-lane) - 1) * 1.45rem);height:1.28rem;line-height:.94rem;font-size:.82rem}.ontario-calendar .sc-calendar-agenda{gap:.85rem}.ontario-calendar .sc-calendar-agenda-title{color:var(--ontario-blue-dark)}.ontario-calendar .sc-calendar-agenda-event{background:#f3f6f8}.ontario-calendar .sc-calendar-day-modal{z-index:10000!important}

/* Keep dropdown links readable even when an older broad inner-page navbar
   rule is present later in an installed theme artifact. */
.ontario-desktop-menu .sc-menu-dropdown .sc-menu-link{color:#252b31!important}.ontario-desktop-menu .sc-menu-dropdown .sc-menu-link:hover,.ontario-desktop-menu .sc-menu-dropdown .sc-menu-link:focus-visible{color:var(--ontario-blue-dark)!important;background:#eef4fb}
@media(max-width:899px){.ontario-detail .sc-event-detail{grid-template-columns:1fr;gap:1.4rem}.ontario-detail .sc-event-facts,.ontario-detail .web-detail-meta,.ontario-detail .sc-event-description{grid-column:1;grid-row:auto}.ontario-detail .sc-event-facts{order:1}.ontario-detail .web-detail-meta{order:2}.ontario-detail .sc-event-description{order:3}}
/* Three event lanes need 6.03rem including their vertical offset.  Keep a
   small safety gap on narrow screens so the last lane cannot overlap the
   following calendar week. */
@media(max-width:991.98px){.ontario-calendar>.container{max-width:none;padding-inline:1.5rem}.ontario-calendar .sc-calendar-week,.ontario-calendar .sc-calendar-day{min-height:6.25rem;height:6.25rem}}
/* The month grid stays seven columns wide, but every column is allowed to
   shrink.  The !important guards the bundled theme against older published
   builder CSS which used a fixed 42rem mobile grid and forced page scrolling. */
@media(max-width:700px){.ontario-calendar .sc-calendar-table{width:100%!important;max-width:100%!important;overflow:visible!important}.ontario-calendar .sc-calendar-head,.ontario-calendar .sc-calendar-week{grid-template-columns:repeat(7,minmax(0,1fr))!important;width:100%!important;min-width:0!important}.ontario-calendar .sc-calendar-heading,.ontario-calendar .sc-calendar-day{min-width:0!important}.ontario-calendar .sc-calendar-heading{overflow:hidden;padding:.5rem .08rem;font-size:.72rem;white-space:nowrap}.ontario-calendar .sc-calendar-day{padding:.2rem}.ontario-calendar .sc-calendar-day-number{width:auto;height:auto;padding:0;font-size:.78rem}.ontario-calendar .sc-calendar-event-bar{box-sizing:border-box;inset-inline-start:calc((100% / 7) * var(--sc-calendar-start) + .08rem);width:calc((100% / 7) * var(--sc-calendar-span) - .16rem);padding:.12rem .18rem;font-size:.68rem}.ontario-calendar .sc-calendar-overflow{min-width:0;width:100%;padding-inline:.08rem;font-size:.65rem}}
@media(max-width:575.98px){.ontario-detail .ontario-section{padding:2.75rem 0 3.5rem}.ontario-detail>.ontario-reading,.ontario-detail .container.ontario-reading{box-sizing:border-box;width:100%;padding-inline:1.25rem!important}.ontario-detail .ontario-reading>h1{font-size:clamp(2.35rem,12vw,2.75rem);overflow-wrap:anywhere}.ontario-detail .sc-event-facts{padding:1.05rem 1.1rem}.ontario-calendar.ontario-section{padding:3rem 0 3.75rem}.ontario-calendar>.container{padding-inline:1rem}.ontario-calendar .sc-calendar-view-switch{flex-wrap:wrap;row-gap:.45rem}.ontario-calendar .sc-calendar-count{flex-basis:100%;margin-inline-start:0}}

.ontario-contact-page{background:#fff}.ontario-contact-hero{position:relative;min-height:410px;display:grid;place-items:center;overflow:hidden;background:var(--ontario-blue-dark) url(assets/main_header.jpg) center 38%/cover no-repeat;color:#fff}.ontario-contact-hero .ontario-photo-mask{background:var(--ontario-blue-dark);opacity:.78;mix-blend-mode:multiply}.ontario-contact-hero-content{position:relative;z-index:2;padding:5rem 1rem;text-align:center}.ontario-contact-hero h1{margin-bottom:1rem}.ontario-contact-hero h2{margin:0}.ontario-leaders{padding-bottom:8rem;background:#fff}.ontario-leader-grid{max-width:680px;margin:3.5rem auto 0}.ontario-competencies{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:.45rem;margin:.25rem auto 0}.ontario-badge-magenta{background:#b00075}.ontario-council{background:var(--ontario-blue-pale)}.ontario-person{height:100%}.ontario-person-photo{width:clamp(150px,15vw,210px);height:clamp(150px,15vw,210px);border-radius:48% 52% 46% 54%/52% 47% 53% 48%!important}.ontario-person-role{margin-top:1rem;color:#59616a}.ontario-person h3{margin:.25rem 0 .45rem}.ontario-person-contact{margin:.2rem 0}.ontario-person-contact a{font-weight:700;text-decoration:none}

.ontario-socials{text-align:center}.ontario-social-page-title{margin-bottom:7rem}.ontario-social-row{display:flex;justify-content:center;gap:.85rem;margin:1.5rem 0 8rem}.ontario-social-link{display:inline-grid;width:3.75rem;height:3.75rem;place-items:center;border-radius:50%;background:var(--ontario-social-color,var(--ontario-blue));color:#fff;font-size:1.85rem;text-decoration:none;transition:transform .18s ease}.ontario-social-instagram{--ontario-social-color:#cf347e}.ontario-social-youtube{--ontario-social-color:#e52329}.ontario-social-github{--ontario-social-color:#111}.ontario-social-link:hover,.ontario-social-link:focus-visible{color:#fff;transform:translateY(-3px) rotate(-2deg)}.ontario-related-title{margin-bottom:2.5rem}.ontario-related-links{max-width:800px;margin-inline:auto}.ontario-related-link{display:grid;justify-items:center;gap:1rem;color:var(--ontario-blue-dark);text-decoration:none}.ontario-related-logo,.ontario-related-link>.ontario-icon{width:112px;height:112px;object-fit:contain}.ontario-related-link>.ontario-icon{display:grid;place-items:center;border-radius:50%;background:var(--ontario-blue-pale);font-size:3.25rem}

.ontario-btn-organic{border-radius:1rem 1.45rem .95rem 1.3rem/1.25rem .95rem 1.35rem 1rem!important}.ontario-btn-organic:focus-visible{outline:3px solid var(--ontario-yellow);outline-offset:3px}.ontario-card-author{display:inline-flex!important;align-items:center;gap:.45rem}.ontario-author-avatar,.web-detail-author-avatar{display:block;width:28px;height:28px;flex:0 0 28px;border-radius:50%;object-fit:cover}.ontario-author-avatar:not([src]){display:none}.ontario-author-avatar[src]+.ontario-author-fallback{display:none}.ontario-author-fallback,.web-detail-author-fallback{display:inline-grid;width:28px;height:28px;flex:0 0 28px;place-items:center;border-radius:50%;background:var(--ontario-blue-pale);color:var(--ontario-blue-dark)}.ontario-author-fallback .ontario-icon{width:auto}.web-detail-meta{display:flex;flex-wrap:wrap;align-items:center;gap:.65rem 1rem;margin:0 0 1.5rem;color:#68717a}.web-detail-author{display:inline-flex;align-items:center;gap:.5rem}.web-detail-author-avatar:not([src]){display:none}.web-detail-author-avatar[src]+.web-detail-author-fallback{display:none}.ontario-footer .sc-menu-list{align-items:start}.ontario-footer .sc-menu-column{align-self:start}.ontario-copyright a{color:inherit;text-decoration:underline;text-underline-offset:.18em}.ontario-copyright a:hover,.ontario-copyright a:focus-visible{color:#fff}

/* Shared editor-facing overlay contract. Background declarations remain on the
   host; only its dedicated mask layer is coloured and faded. */
[data-sc-overlay="true"]{--sc-overlay-color:var(--sc-hero-tint,var(--ontario-blue-dark));--sc-overlay-opacity:var(--sc-hero-tint-opacity,.64)}
.ontario-contact-hero[data-sc-overlay="true"]{--sc-overlay-opacity:var(--sc-hero-tint-opacity,.78)}.ontario-media-link[data-sc-overlay="true"]{--sc-overlay-color:var(--sc-hero-tint,#081a3b);--sc-overlay-opacity:var(--sc-hero-tint-opacity,.62)}
:is(.ontario-hero,.ontario-compact-hero,.ontario-contact-hero)[data-sc-overlay="true"]>.ontario-photo-mask{display:block;background:var(--sc-overlay-color);opacity:var(--sc-overlay-opacity)}
.ontario-media-link[data-sc-overlay="true"] .ontario-media-link-mask{display:block;background:var(--sc-overlay-color);opacity:var(--sc-overlay-opacity)}
.ontario-photo-frame[data-sc-overlay="true"]:after{content:"";position:absolute;inset:0;z-index:1;background:var(--sc-overlay-color);opacity:var(--sc-overlay-opacity);pointer-events:none}.ontario-photo-frame[data-sc-overlay="true"] img{position:relative;z-index:0;mix-blend-mode:normal}
:is(.ontario-hero,.ontario-compact-hero,.ontario-contact-hero)[data-sc-overlay-enabled="false"]>.ontario-photo-mask,.ontario-media-link[data-sc-overlay-enabled="false"] .ontario-media-link-mask{display:none}.ontario-photo-frame[data-sc-overlay-enabled="false"]:after{opacity:0}

/* A removed template logo is replaced by bound, selectable text rather than a
   pseudo-element, so the site title remains semantic and editable. */
[data-sc-template-logo-fallback]{display:none}
img[data-sc-template-logo-hidden="true"]{display:none!important}
img[data-sc-template-logo-hidden="true"]+[data-sc-template-logo-fallback]{display:inline-flex}
.ontario-wordmark-fallback{align-items:center;min-height:44px;color:inherit;font-size:1.25rem;line-height:1;text-transform:uppercase}.ontario-wordmark-fallback-dark{display:none!important}.ontario-hero-logo-fallback{margin:0 auto 1.25rem}.ontario-footer-logo-fallback{color:#fff;font-size:1.7rem}

@media(max-width:991.98px){.ontario-page-top{padding-top:0}.ontario-navbar{margin-bottom:0}.ontario-menu-shell>summary,body:has(.ontario-page-top) .ontario-menu-shell>summary{color:#fff}body:not(:has(.ontario-page-top)) .ontario-navbar{position:fixed;inset:0 0 auto;margin-bottom:0}.ontario-menu-shell[open]>summary,body:has(.ontario-page-top) .ontario-menu-shell[open]>summary{color:var(--ontario-blue-dark)!important}body:has(.ontario-page-top) .ontario-menu-shell[open] .sc-menu-link{color:#111!important}body:has(.ontario-page-top) .ontario-menu-shell[open] .sc-menu-link:hover,body:has(.ontario-page-top) .ontario-menu-shell[open] .sc-menu-link:focus-visible,body:has(.ontario-page-top) .ontario-menu-shell[open] .sc-menu-details[open]>summary{color:var(--ontario-blue-dark)!important}.ontario-contact-hero{min-height:360px}.ontario-social-row{margin-bottom:5rem}}
@media(max-width:575.98px){.sc-edge-lg,.sc-edge-size-lg{--sc-edge-height:3.5rem}.ontario-contact-hero{min-height:320px}.ontario-contact-hero-content{padding:4rem 1rem}.ontario-leaders{padding-bottom:6rem}.ontario-social-page-title{margin-bottom:4rem}.ontario-social-link{width:3.25rem;height:3.25rem;font-size:1.55rem}}
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
    legacy_fixes = """
@media(max-width:700px){.ontario-calendar .sc-calendar-day-number[aria-current=date]{display:inline-grid;width:1.5rem;height:1.5rem;place-items:center;padding:0;border-radius:50%}}
"""
    return bootstrap + "\n" + fontawesome + "\n" + _ONTARIO_CSS + legacy_fixes


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
    # A bundled version can be reseeded while developing or upgrading the
    # application. Keep its physical package in lockstep with the manifest;
    # otherwise an asset removed from the bundle is exported as an undeclared
    # ZIP member and the otherwise valid theme cannot be reinstalled.
    for target in sorted(target_root.rglob("*"), reverse=True):
        if target.is_file():
            relative = (Path("assets") / target.relative_to(target_root)).as_posix()
            if relative not in expected:
                target.unlink()
        elif target.is_dir() and not any(target.iterdir()):
            target.rmdir()


def seed_ontario_theme(db: Session) -> WebThemeVersion:
    """Install the bundled scout theme and activate it on a fresh site."""
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
            author="ScoutComp",
            description=ONTARIO_THEME_DESCRIPTION,
            license="Apache-2.0",
        )
        db.add(theme)
        db.flush()
    else:
        theme.name = ONTARIO_THEME_NAME
        theme.author = "ScoutComp"
        theme.description = ONTARIO_THEME_DESCRIPTION

    base_css = ontario_css()
    declarative_source = json.dumps(
        {
            "templates": ONTARIO_THEME_TEMPLATES,
            "sections": ONTARIO_THEME_SECTIONS,
            "components": ONTARIO_THEME_COMPONENTS,
            "editor": _ONTARIO_EDITOR,
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    package_hash = hashlib.sha256(
        (f"{ONTARIO_THEME_ID}:{ONTARIO_THEME_VERSION}\n{base_css}").encode()
        + declarative_source
        + b"".join(path.read_bytes() for path in sorted(_ASSET_ROOT.rglob("*")) if path.is_file())
    ).hexdigest()
    version = db.query(WebThemeVersion).filter_by(
        theme_id=theme.id,
        version=ONTARIO_THEME_VERSION,
    ).one_or_none()
    source_changed = version is not None and version.package_hash != package_hash
    manifest = {
        "schema_version": 1,
        "id": ONTARIO_THEME_ID,
        "name": ONTARIO_THEME_NAME,
        "version": ONTARIO_THEME_VERSION,
        "author": "ScoutComp",
        "description": ONTARIO_THEME_DESCRIPTION,
        "license": "Apache-2.0",
        "config": {
            "site_logo": {
                "type": "media",
                "label": "Logo oddílu",
                "help": "Nahradí logo na místech, která šablona označuje jako logo oddílu.",
                "default": "",
                "storage": "site_setting",
            },
            "primary_color": {
                "type": "color", "label": "Hlavní barva", "default": "#255c9e",
            },
            "primary_dark_color": {
                "type": "color", "label": "Tmavá hlavní barva", "default": "#0a224e",
            },
            "primary_pale_color": {
                "type": "color", "label": "Světlá doplňková barva", "default": "#bdd4df",
            },
            "accent_color": {
                "type": "color", "label": "Akcentní barva", "default": "#f9b200",
            },
            "warm_surface_color": {
                "type": "color", "label": "Teplé pozadí", "default": "#f6ebd8",
            },
            "text_color": {
                "type": "color", "label": "Barva textu", "default": "#252b31",
            },
            "footer_color": {
                "type": "color", "label": "Barva patičky", "default": "#212529",
            },
            "footer_link_color": {
                "type": "color", "label": "Odkazy v patičce", "default": "#a9bed2",
            },
            "nav_scrolled": {
                "type": "color", "label": "Barva navigace po posunutí", "default": "#0a224e",
            },
            "bootstrap_primary": {
                "type": "color", "label": "Bootstrap: primary", "default": "#0d6efd",
            },
            "bootstrap_secondary": {
                "type": "color", "label": "Bootstrap: secondary", "default": "#6c757d",
            },
            "bootstrap_success": {
                "type": "color", "label": "Bootstrap: success", "default": "#198754",
            },
            "bootstrap_danger": {
                "type": "color", "label": "Bootstrap: danger", "default": "#dc3545",
            },
            "bootstrap_warning": {
                "type": "color", "label": "Bootstrap: warning", "default": "#ffc107",
            },
            "bootstrap_info": {
                "type": "color", "label": "Bootstrap: info", "default": "#0dcaf0",
            },
            "bootstrap_light": {
                "type": "color", "label": "Bootstrap: light", "default": "#f8f9fa",
            },
            "bootstrap_dark": {
                "type": "color", "label": "Bootstrap: dark", "default": "#212529",
            },
        },
        "editor": deepcopy(_ONTARIO_EDITOR),
    }
    tokens = {
        "colors": {
            "primary": "#255c9e", "primary-dark": "#0a224e",
            "accent": "#f9b200", "cream": "#f6ebd8", "footer": "#0a224e",
        },
        "typography": {"font-family": '"TheMix",Arial,sans-serif'},
        "primary_color": "#255c9e",
        "primary_dark_color": "#0a224e",
        "primary_pale_color": "#bdd4df",
        "accent_color": "#f9b200",
        "warm_surface_color": "#f6ebd8",
        "text_color": "#252b31",
        "footer_color": "#212529",
        "footer_link_color": "#a9bed2",
        "nav_scrolled": "#0a224e",
        "bootstrap_primary": "#0d6efd",
        "bootstrap_secondary": "#6c757d",
        "bootstrap_success": "#198754",
        "bootstrap_danger": "#dc3545",
        "bootstrap_warning": "#ffc107",
        "bootstrap_info": "#0dcaf0",
        "bootstrap_light": "#f8f9fa",
        "bootstrap_dark": "#212529",
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

    stored_manifest = deepcopy(manifest)
    stored_manifest["editor"] = _namespace_asset_references(_ONTARIO_EDITOR, version.id)
    version.manifest = stored_manifest

    _copy_assets(version, db)
    names = {
        "main": "Hlavní rozvržení",
        "home": "Úvodní stránka",
        "page": "Běžná stránka",
        "news": "Aktuality",
        "archive": "Archiv příspěvků",
        "team": "Družina",
        "article": "Detail článku",
        "meeting": "Detail události",
        "meetings": "Seznam událostí",
        "calendar": "Kalendář",
        "contact": "Kontakt",
        "contact-hero": "Kontaktní hero",
        "gallery": "Galerie",
        "support": "Jak nás podpořit",
        "text-page": "Základní stránka s textem",
        "downloads": "Ke stažení",
        "links": "Odkazy",
        "hero": "Hero",
        "about": "O oddílu",
        "posts": "Aktuality",
        "header": "Horní navigace",
        "footer": "Patička",
        "compact-hero": "Kompaktní hero",
        "faq": "Časté otázky",
        "team-heading": "Záhlaví družiny",
        "gallery-hub": "Galerijní rozcestník",
        "leaders": "Vedoucí oddílu",
        "council": "Oddílová rada",
        "social-links": "Sociální sítě a odkazy",
        "download-cards": "Materiály ke stažení",
        "post-card": "Karta aktuality",
        "meeting-card": "Karta události",
        "scout-logo": "Skautské logo",
        "button": "Skautské tlačítko",
        "font-awesome-icon": "Font Awesome ikona",
        "alert": "Bootstrap upozornění",
        "badge": "Bootstrap štítek",
        "breadcrumb": "Bootstrap drobečková navigace",
        "accordion": "Rozbalovací panel",
        "progress": "Bootstrap průběh",
        "media-link-card": "Fotografická odkazová karta",
        "person-card": "Karta vedoucího",
        "download-card": "Karta dokumentu",
        "social-icon": "Ikona sociální sítě",
        "photo-mask": "Fotografie s barevnou maskou",
        "page-intro": "Úvod stránky",
        "text-card": "Textová karta",
        "call-to-action": "Výzva k akci",
        "quote": "Citace",
        "contact-card": "Kontaktní údaj",
        "statistic": "Číselný údaj",
    }
    descriptions = {
        "page-intro": "Nadpis a úvodní text pro začátek obsahové části stránky.",
        "text-card": "Jednoduchá karta pro krátký samostatný text.",
        "call-to-action": "Výrazná výzva s popisem a tlačítkem.",
        "quote": "Citace nebo krátké svědectví se jménem autora.",
        "contact-card": "Kontaktní informace s přímým odkazem.",
        "statistic": "Výrazná hodnota doplněná krátkým vysvětlením.",
    }

    for key, project in ONTARIO_THEME_TEMPLATES.items():
        qualified = _qualified_key(ONTARIO_THEME_ID, ONTARIO_THEME_VERSION, "templates", key)
        data = _namespace_asset_references(project, version.id)
        template_kind = "layout" if key in {"main", "home", "page", "text-page"} else key
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
            component_props = ONTARIO_COMPONENT_PROPS.get(key, {}) if kind == "components" else {}
            prop_schema = deepcopy(component_props.get("schema", []))
            default_props = deepcopy(component_props.get("defaults", {}))
            row = db.query(model).filter_by(qualified_key=qualified).one_or_none()
            if row is None:
                row = model(
                    qualified_key=qualified,
                    name=names[key],
                    description=descriptions.get(key, ONTARIO_THEME_DESCRIPTION),
                    project_data=data,
                    css="",
                    prop_schema=prop_schema,
                    default_props=default_props,
                    variants=[],
                    published_project_data=data,
                    published_css="",
                    published_prop_schema=deepcopy(prop_schema),
                    published_default_props=deepcopy(default_props),
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
                    row.description = descriptions.get(key, ONTARIO_THEME_DESCRIPTION)
                if pristine or not row.project_data:
                    row.project_data = data
                if pristine or not row.published_project_data:
                    row.published_project_data = data
                    row.published_version = max(row.published_version or 0, 1)
                if pristine:
                    row.prop_schema = prop_schema
                    row.default_props = default_props
                    row.published_prop_schema = deepcopy(prop_schema)
                    row.published_default_props = deepcopy(default_props)
                row.theme_version_id = version.id
                row.is_locked = False
    db.flush()
    style = db.get(WebSiteStyle, 1)
    theme_upgraded = False
    if style is None:
        style = WebSiteStyle(id=1)
        db.add(style)
    if style.active_theme_version_id is None:
        style.active_theme_version_id = version.id
        seed_ontario_menus(db)
    elif style.active_theme_version_id != version.id:
        active_version = db.get(WebThemeVersion, style.active_theme_version_id)
        if active_version is not None and active_version.theme_id == theme.id:
            # Move only sites already using this bundled theme. Page revisions
            # keep their immutable old template snapshots, while the active
            # design tokens/CSS and future templates move to the new version.
            style.active_theme_version_id = version.id
            theme_upgraded = True
    if (source_changed or theme_upgraded) and style.active_theme_version_id == version.id:
        # Published pages are immutable artifacts.  Refresh them when the
        # bundled theme source changes so style/template upgrades and newly
        # required calendar variants become visible atomically after restart.
        from .pages import rebuild_published_page_artifacts

        rebuild_published_page_artifacts(db)
    db.commit()
    db.refresh(version)
    return version
