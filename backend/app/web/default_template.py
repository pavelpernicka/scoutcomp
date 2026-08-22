"""Default ScoutComp website template built from GrapesJS project data.

The template follows the structural/visual language of a scout-group website
(header, hero, about, news, footer) while using only generic presentation
primitives. It binds public data sources instead of hard-coding module output.
"""

from copy import deepcopy

DEFAULT_SCOUT_TEMPLATE = {
    "scoutcomp": {"schemaVersion": 2},
    "pages": [{
        "frames": [{
            "component": {
                "type": "wrapper",
                "components": [
                    {
                        "type": "default",
                        "tagName": "nav",
                        "attributes": {
                            "class": "web-nav",
                            "role": "navigation",
                            "aria-label": "Hlavní navigace",
                        },
                        "components": [
                            {
                                "type": "default",
                                "tagName": "div",
                                "attributes": {"class": "web-nav-inner"},
                                "components": [
                                    {
                                        "type": "link",
                                        "tagName": "a",
                                        "attributes": {"class": "web-nav-brand", "href": "/"},
                                        "scBindings": {
                                            "text": {"scope": "site", "field": "site_title"},
                                        },
                                    },
                                    {"type": "sc-menu", "location": "main"},
                                ],
                            },
                        ],
                    },
                    {
                        "type": "default",
                        "tagName": "main",
                        "attributes": {"class": "web-main"},
                        "components": [
                            {
                                "type": "sc-slot",
                                "name": "content",
                                "components": [
                                    {
                                        "type": "default",
                                        "tagName": "section",
                                        "attributes": {"class": "web-hero"},
                                        "components": [
                                            {
                                                "type": "default",
                                                "tagName": "div",
                                                "attributes": {"class": "web-container"},
                                                "components": [
                                                    {
                                                        "type": "heading",
                                                        "tagName": "h1",
                                                        "scBindings": {
                                                            "text": {"scope": "page", "field": "title"},
                                                        },
                                                    },
                                                    {
                                                        "type": "text",
                                                        "tagName": "p",
                                                        "attributes": {"class": "web-lead"},
                                                        "scBindings": {
                                                            "text": {"scope": "site", "field": "site_tagline"},
                                                        },
                                                    },
                                                    {
                                                        "type": "default",
                                                        "tagName": "div",
                                                        "attributes": {"class": "web-hero-actions"},
                                                        "components": [
                                                            {
                                                                "type": "link",
                                                                "tagName": "a",
                                                                "attributes": {
                                                                    "class": "web-button",
                                                                    "href": "#about",
                                                                },
                                                                "content": "Kdo jsme",
                                                            },
                                                        ],
                                                    },
                                                ],
                                            },
                                        ],
                                    },
                                    {
                                        "type": "default",
                                        "tagName": "section",
                                        "attributes": {"class": "web-section", "id": "about"},
                                        "components": [
                                            {
                                                "type": "default",
                                                "tagName": "div",
                                                "attributes": {"class": "web-container"},
                                                "components": [
                                                    {
                                                        "type": "heading",
                                                        "tagName": "h2",
                                                        "content": "Kdo jsme",
                                                    },
                                                    {
                                                        "type": "text",
                                                        "tagName": "p",
                                                        "content": "Jsme skautský oddíl pro kluky a holky. Vítejte na našich stránkách!",
                                                    },
                                                ],
                                            },
                                        ],
                                    },
                                    {
                                        "type": "default",
                                        "tagName": "section",
                                        "attributes": {"class": "web-section alt"},
                                        "components": [
                                            {
                                                "type": "default",
                                                "tagName": "div",
                                                "attributes": {"class": "web-container"},
                                                "components": [
                                                    {
                                                        "type": "heading",
                                                        "tagName": "h2",
                                                        "content": "Novinky",
                                                    },
                                                    {
                                                        "type": "sc-repeat",
                                                        "source": "core.posts",
                                                        "params": {"limit": 3},
                                                        "components": [
                                                            {
                                                                "type": "default",
                                                                "tagName": "article",
                                                                "attributes": {"class": "web-post-card"},
                                                                "components": [
                                                                    {
                                                                        "type": "heading",
                                                                        "tagName": "h3",
                                                                        "scBindings": {
                                                                            "text": {"scope": "context", "field": "title"},
                                                                        },
                                                                    },
                                                                    {
                                                                        "type": "text",
                                                                        "tagName": "p",
                                                                        "scBindings": {
                                                                            "text": {"scope": "context", "field": "excerpt"},
                                                                        },
                                                                    },
                                                                    {
                                                                        "type": "link",
                                                                        "tagName": "a",
                                                                        "attributes": {"class": "web-button outline"},
                                                                        "scBindings": {
                                                                            "href": {"scope": "context", "field": "url"},
                                                                        },
                                                                        "content": "Pokračovat ve čtení",
                                                                    },
                                                                ],
                                                            },
                                                        ],
                                                        "empty": [
                                                            {
                                                                "type": "text",
                                                                "tagName": "p",
                                                                "content": "Zatím žádné novinky.",
                                                            },
                                                        ],
                                                    },
                                                ],
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                    {
                        "type": "default",
                        "tagName": "footer",
                        "attributes": {"class": "web-footer"},
                        "components": [
                            {
                                "type": "default",
                                "tagName": "div",
                                "attributes": {"class": "web-container"},
                                "components": [
                                    {
                                        "type": "default",
                                        "tagName": "div",
                                        "attributes": {"class": "web-footer-row"},
                                        "components": [
                                            {
                                                "type": "default",
                                                "tagName": "span",
                                                "attributes": {"class": "web-footer-brand"},
                                                "components": [
                                                    {
                                                        "type": "default",
                                                        "tagName": "i",
                                                        "attributes": {"class": "fa-solid fa-campground"},
                                                    },
                                                    {
                                                        "type": "text",
                                                        "tagName": "span",
                                                        "scBindings": {
                                                            "text": {"scope": "site", "field": "site_title"},
                                                        },
                                                    },
                                                ],
                                            },
                                            {
                                                "type": "default",
                                                "tagName": "div",
                                                "attributes": {"class": "web-socials"},
                                                "components": [
                                                    {
                                                        "type": "sc-condition",
                                                        "condition": {
                                                            "left": {"scope": "site", "field": "social_facebook"},
                                                            "operator": "exists",
                                                        },
                                                        "components": [
                                                            {
                                                                "type": "link",
                                                                "tagName": "a",
                                                                "attributes": {"class": "web-social"},
                                                                "scBindings": {
                                                                    "href": {"scope": "site", "field": "social_facebook"},
                                                                },
                                                                "content": "Facebook",
                                                            },
                                                        ],
                                                    },
                                                    {
                                                        "type": "sc-condition",
                                                        "condition": {
                                                            "left": {"scope": "site", "field": "social_instagram"},
                                                            "operator": "exists",
                                                        },
                                                        "components": [
                                                            {
                                                                "type": "link",
                                                                "tagName": "a",
                                                                "attributes": {"class": "web-social"},
                                                                "scBindings": {
                                                                    "href": {"scope": "site", "field": "social_instagram"},
                                                                },
                                                                "content": "Instagram",
                                                            },
                                                        ],
                                                    },
                                                ],
                                            },
                                            {"type": "sc-menu", "location": "footer"},
                                        ],
                                    },
                                    {
                                        "type": "text",
                                        "tagName": "small",
                                        "content": "© 2026 — webové stránky oddílu",
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
            "styles": [],
        }],
    }],
}


# ---------------------------------------------------------------------------
# System default theme (a full installable theme, not just a page template).
# ---------------------------------------------------------------------------

DEFAULT_THEME_ID = "scoutcomp-default"
DEFAULT_THEME_VERSION = "2.0.0"
DEFAULT_THEME_NAME = "Výchozí web oddílu"
DEFAULT_THEME_DESCRIPTION = (
    "Bohaté skautské téma inspirované kompozicí webu ontario.zlin6.cz: "
    "hero, družiny, schůzky, aktuality, výzvy a patička."
)

# GrapesJS Project Data for the page-type templates that belong to the theme.
# The `main` template embeds the full site layout (header/content/footer) and
# declares an sc-slot so page content is merged at publish time.
DEFAULT_THEME_TEMPLATES = {
    "main": DEFAULT_SCOUT_TEMPLATE,
    "news": {
        "scoutcomp": {"schemaVersion": 2},
        "pages": [{
            "id": "scoutcomp-news",
            "frames": [{
                "id": "scoutcomp-news-frame",
                "component": {
                    "type": "wrapper",
                    "components": [
                        {
                            "type": "default",
                            "tagName": "nav",
                            "attributes": {"class": "web-nav", "role": "navigation", "aria-label": "Hlavní navigace"},
                            "components": [{
                                "type": "default",
                                "tagName": "div",
                                "attributes": {"class": "web-nav-inner"},
                                "components": [
                                    {"type": "link", "tagName": "a", "attributes": {"class": "web-nav-brand", "href": "/"}, "scBindings": {"text": {"scope": "site", "field": "site_title"}}},
                                    {"type": "sc-menu", "location": "main"},
                                ],
                            }],
                        },
                        {
                            "type": "default",
                            "tagName": "main",
                            "attributes": {"class": "web-main"},
                            "components": [{
                                "type": "sc-slot",
                                "name": "content",
                                "components": [
                                    {
                                        "type": "default",
                                        "tagName": "section",
                                        "attributes": {"class": "web-hero slim"},
                                        "components": [{
                                            "type": "default",
                                            "tagName": "div",
                                            "attributes": {"class": "web-container"},
                                            "components": [
                                                {"type": "heading", "tagName": "h1", "scBindings": {"text": {"scope": "page", "field": "title"}}},
                                                {"type": "text", "tagName": "p", "attributes": {"class": "web-lead"}, "content": "Aktuality z oddílu a okolí."},
                                            ],
                                        }],
                                    },
                                    {
                                        "type": "default",
                                        "tagName": "section",
                                        "attributes": {"class": "web-section"},
                                        "components": [{
                                            "type": "default",
                                            "tagName": "div",
                                            "attributes": {"class": "web-container"},
                                            "components": [{
                                                "type": "sc-repeat",
                                                "source": "core.posts",
                                                "params": {"limit": 12},
                                                "components": [{
                                                    "type": "default",
                                                    "tagName": "article",
                                                    "attributes": {"class": "web-post-card"},
                                                    "components": [
                                                        {"type": "heading", "tagName": "h3", "scBindings": {"text": {"scope": "context", "field": "title"}}},
                                                        {"type": "text", "tagName": "p", "scBindings": {"text": {"scope": "context", "field": "excerpt"}}},
                                                        {"type": "link", "tagName": "a", "attributes": {"class": "web-button outline"}, "scBindings": {"href": {"scope": "context", "field": "url"}}, "content": "Pokračovat ve čtení"},
                                                    ],
                                                }],
                                                "empty": [{"type": "text", "tagName": "p", "content": "Zatím žádné novinky."}],
                                            }],
                                        }],
                                    },
                                ],
                            }],
                        },
                        {
                            "type": "default",
                            "tagName": "footer",
                            "attributes": {"class": "web-footer"},
                            "components": [{
                                "type": "default",
                                "tagName": "div",
                                "attributes": {"class": "web-container"},
                                "components": [
                                    {"type": "default", "tagName": "span", "attributes": {"class": "web-footer-brand"}, "components": [
                                        {"type": "text", "tagName": "span", "scBindings": {"text": {"scope": "site", "field": "site_title"}}},
                                    ]},
                                    {"type": "sc-menu", "location": "footer"},
                                    {"type": "text", "tagName": "small", "content": "© 2026 — webové stránky oddílu"},
                                ],
                            }],
                        },
                    ],
                },
                "styles": [],
            }],
        }],
    },
}


# ---------------------------------------------------------------------------
# Default theme design resources (sections, components, patterns)
# These are GrapesJS project-data blobs that the theme installs alongside
# its page templates. The editor left-panel lists them with auto-generated
# SVG wireframe previews.
# ---------------------------------------------------------------------------

DEFAULT_THEME_SECTIONS = {
    "hero": {
        "scoutcomp": {"schemaVersion": 2},
        "pages": [{"frames": [{"component": {
            "type": "wrapper", "components": [{
                "type": "default", "tagName": "section",
                "attributes": {"class": "web-hero"},
                "components": [{
                    "type": "default", "tagName": "div",
                    "attributes": {"class": "web-container"},
                    "components": [
                        {"type": "heading", "tagName": "h1", "content": "Vítejte na našem webu"},
                        {"type": "text", "tagName": "p", "attributes": {"class": "web-lead"}, "content": "Jsme skautský oddíl pro kluky a holky."},
                        {"type": "default", "tagName": "div", "attributes": {"class": "web-hero-actions"}, "components": [
                            {"type": "link", "tagName": "a", "attributes": {"class": "web-button", "href": "#about"}, "content": "Kdo jsme"},
                            {"type": "link", "tagName": "a", "attributes": {"class": "web-button outline", "href": "#contact"}, "content": "Kontakt"},
                        ]},
                    ],
                }],
            }],
        }, "styles": []}]}],
    },
    "about": {
        "scoutcomp": {"schemaVersion": 2},
        "pages": [{"frames": [{"component": {
            "type": "wrapper", "components": [{
                "type": "default", "tagName": "section",
                "attributes": {"class": "web-section", "id": "about"},
                "components": [{
                    "type": "default", "tagName": "div",
                    "attributes": {"class": "web-container"},
                    "components": [
                        {"type": "heading", "tagName": "h2", "content": "Kdo jsme"},
                        {"type": "text", "tagName": "p", "content": "Seznamte se s naším oddílem – co děláme, proč to děláme a jak se k nám můžete přidat."},
                    ],
                }],
            }],
        }, "styles": []}]}],
    },
    "features": {
        "scoutcomp": {"schemaVersion": 2},
        "pages": [{"frames": [{"component": {
            "type": "wrapper", "components": [{
                "type": "default", "tagName": "section",
                "attributes": {"class": "web-section"},
                "components": [{
                    "type": "default", "tagName": "div",
                    "attributes": {"class": "web-container"},
                    "components": [
                        {"type": "heading", "tagName": "h2", "content": "Co nabízíme"},
                        {"type": "default", "tagName": "div", "attributes": {"class": "sc-layout-columns"}, "components": [
                            {"type": "default", "tagName": "div", "components": [
                                {"type": "heading", "tagName": "h3", "content": "Výpravy"},
                                {"type": "text", "tagName": "p", "content": "Pravidelné výpravy do přírody."},
                            ]},
                            {"type": "default", "tagName": "div", "components": [
                                {"type": "heading", "tagName": "h3", "content": "Schůzky"},
                                {"type": "text", "tagName": "p", "content": "Každotýdenní setkávání."},
                            ]},
                            {"type": "default", "tagName": "div", "components": [
                                {"type": "heading", "tagName": "h3", "content": "Tábory"},
                                {"type": "text", "tagName": "p", "content": "Letní tábor je vrcholem roku."},
                            ]},
                        ]},
                    ],
                }],
            }],
        }, "styles": []}]}],
    },
    "contact": {
        "scoutcomp": {"schemaVersion": 2},
        "pages": [{"frames": [{"component": {
            "type": "wrapper", "components": [{
                "type": "default", "tagName": "section",
                "attributes": {"class": "web-section alt", "id": "contact"},
                "components": [{
                    "type": "default", "tagName": "div",
                    "attributes": {"class": "web-container"},
                    "components": [
                        {"type": "heading", "tagName": "h2", "content": "Kontakt"},
                        {"type": "text", "tagName": "p", "components": [
                            {"type": "sc-bind", "binding": {"scope": "site", "field": "contact_address"}, "mode": "text"},
                        ]},
                    ],
                }],
            }],
        }, "styles": []}]}],
    },
}

# Additional v1.1 building blocks: intentionally data-bound so an editor can
# create the Ontario-like scout homepage without manually wiring sources.
def _scout_section(*components: dict) -> dict:
    return {
        "scoutcomp": {"schemaVersion": 2},
        "pages": [{"frames": [{"component": {
            "type": "wrapper", "components": list(components),
        }, "styles": []}]}],
    }


DEFAULT_THEME_SECTIONS.update({
    "scout-hero": _scout_section({
        "type": "default", "tagName": "section", "attributes": {"class": "web-hero sc-scout-hero"},
        "components": [{"type": "default", "tagName": "div", "attributes": {"class": "web-container"}, "components": [
            {"type": "text", "tagName": "p", "attributes": {"class": "sc-scout-kicker"}, "content": "Skautský oddíl"},
            {"type": "heading", "tagName": "h1", "attributes": {"class": "web-hero-title"}, "content": "Dobrodružství začíná venku"},
            {"type": "text", "tagName": "p", "attributes": {"class": "web-hero-sub"}, "content": "Schůzky, výpravy, kamarádi a společná odpovědnost."},
            {"type": "link", "tagName": "a", "attributes": {"class": "web-button light", "href": "#contact"}, "content": "Přijďte mezi nás"},
        ]}],
    }),
    "team-tiles": _scout_section({
        "type": "default", "tagName": "section", "attributes": {"class": "web-section sc-section-warm"},
        "components": [{"type": "default", "tagName": "div", "attributes": {"class": "web-container"}, "components": [
            {"type": "heading", "tagName": "h2", "attributes": {"class": "web-title"}, "content": "Najdi svoji partu"},
            {"type": "default", "tagName": "div", "attributes": {"class": "sc-scout-grid"}, "components": [{
                "type": "sc-repeat", "source": "core.teams", "params": {"limit": 6},
                "components": [{"type": "link", "tagName": "a", "attributes": {"class": "sc-team-tile"}, "scBindings": {"href": {"scope": "context", "field": "url"}}, "components": [
                    {"type": "image", "tagName": "img", "scBindings": {"src": {"scope": "context", "field": "logo_url"}}},
                    {"type": "heading", "tagName": "h3", "scBindings": {"text": {"scope": "context", "field": "name"}}},
                    {"type": "text", "tagName": "p", "scBindings": {"text": {"scope": "context", "field": "description"}}},
                ]}], "empty": [{"type": "text", "tagName": "p", "content": "Družiny brzy doplníme."}],
            }]},
        ]}],
    }),
    "upcoming-meetings": _scout_section({
        "type": "default", "tagName": "section", "attributes": {"class": "web-section sc-section-night"},
        "components": [{"type": "default", "tagName": "div", "attributes": {"class": "web-container"}, "components": [
            {"type": "heading", "tagName": "h2", "content": "Co nás čeká"},
            {"type": "default", "tagName": "div", "attributes": {"class": "sc-scout-grid"}, "components": [{
                "type": "sc-repeat", "source": "core.events", "params": {"limit": 6},
                "components": [{"type": "link", "tagName": "a", "attributes": {"class": "sc-scout-event"}, "scBindings": {"href": {"scope": "context", "field": "url"}}, "components": [
                    {"type": "heading", "tagName": "h3", "scBindings": {"text": {"scope": "context", "field": "title"}}},
                    {"type": "text", "tagName": "p", "scBindings": {"text": {"scope": "context", "field": "description"}}},
                ]}], "empty": [{"type": "text", "tagName": "p", "content": "Další schůzky právě připravujeme."}],
            }]},
        ]}],
    }),
    "news-stories": _scout_section({
        "type": "default", "tagName": "section", "attributes": {"class": "web-section", "id": "novinky"},
        "components": [{"type": "default", "tagName": "div", "attributes": {"class": "web-container"}, "components": [
            {"type": "heading", "tagName": "h2", "attributes": {"class": "web-title"}, "content": "Aktuality"},
            {"type": "default", "tagName": "div", "attributes": {"class": "sc-scout-grid"}, "components": [{
                "type": "sc-repeat", "source": "core.posts", "params": {"limit": 3},
                "components": [{"type": "default", "tagName": "article", "attributes": {"class": "sc-scout-card"}, "components": [
                    {"type": "image", "tagName": "img", "scBindings": {"src": {"scope": "context", "field": "cover_url"}}},
                    {"type": "heading", "tagName": "h3", "scBindings": {"text": {"scope": "context", "field": "title"}}},
                    {"type": "text", "tagName": "p", "scBindings": {"text": {"scope": "context", "field": "excerpt"}}},
                    {"type": "link", "tagName": "a", "attributes": {"class": "web-button outline-dark"}, "scBindings": {"href": {"scope": "context", "field": "url"}}, "content": "Přečíst článek"},
                ]}], "empty": [{"type": "text", "tagName": "p", "content": "Zatím žádné aktuality."}],
            }]},
        ]}],
    }),
    "join-cta": _scout_section({
        "type": "default", "tagName": "section", "attributes": {"class": "web-section"},
        "components": [{"type": "default", "tagName": "div", "attributes": {"class": "web-container sc-cta-strip"}, "components": [
            {"type": "default", "tagName": "div", "components": [{"type": "heading", "tagName": "h2", "content": "Chceš to zkusit s námi?"}, {"type": "text", "tagName": "p", "content": "Ozvi se, přijď na schůzku a poznej naši partu."}]},
            {"type": "link", "tagName": "a", "attributes": {"class": "web-button", "href": "#contact"}, "content": "Napiš nám"},
        ]}],
    }),
})


# A ready-to-publish homepage composes the richer locked sections. Pages
# created from it retain their own content while the shared shell stays linked.
DEFAULT_SCOUT_HOME_TEMPLATE = deepcopy(DEFAULT_SCOUT_TEMPLATE)
_home_slot = DEFAULT_SCOUT_HOME_TEMPLATE["pages"][0]["frames"][0]["component"]["components"][1]["components"][0]
_home_slot["components"] = [
    {"type": "sc-resource-instance", "resourceKind": "section", "resourceId": "scoutcomp-default@2.0.0:sections:scout-hero"},
    {"type": "sc-resource-instance", "resourceKind": "section", "resourceId": "scoutcomp-default@2.0.0:sections:team-tiles"},
    {"type": "sc-resource-instance", "resourceKind": "section", "resourceId": "scoutcomp-default@2.0.0:sections:upcoming-meetings"},
    {"type": "sc-resource-instance", "resourceKind": "section", "resourceId": "scoutcomp-default@2.0.0:sections:news-stories"},
    {"type": "sc-resource-instance", "resourceKind": "section", "resourceId": "scoutcomp-default@2.0.0:sections:join-cta"},
]
DEFAULT_THEME_TEMPLATES["scout-home"] = DEFAULT_SCOUT_HOME_TEMPLATE


# Layout starters share the linked site shell while presenting an appropriate
# default canvas for common scout content types.
def _scout_layout(kicker: str, title: str, lead: str, *content: dict) -> dict:
    project = deepcopy(DEFAULT_SCOUT_TEMPLATE)
    slot = project["pages"][0]["frames"][0]["component"]["components"][1]["components"][0]
    slot["components"] = [{
        "type": "default", "tagName": "section", "attributes": {"class": "web-hero slim"},
        "components": [{"type": "default", "tagName": "div", "attributes": {"class": "web-container"}, "components": [
            {"type": "text", "tagName": "p", "attributes": {"class": "web-hero-badge"}, "content": kicker},
            {"type": "heading", "tagName": "h1", "attributes": {"class": "web-hero-title"}, "content": title},
            {"type": "text", "tagName": "p", "attributes": {"class": "web-hero-sub"}, "content": lead},
        ]}],
    }, *content]
    return project


DEFAULT_THEME_TEMPLATES.update({
    "scout-story": _scout_layout("O oddílu", "Náš příběh", "Představte, co je pro váš oddíl důležité.", {
        "type": "default", "tagName": "section", "attributes": {"class": "web-section"}, "components": [{"type": "sc-slot", "name": "content", "components": []}],
    }),
    "scout-team": _scout_layout("Družina", "Naše družina", "Schůzky, vedoucí, aktuality a společné výpravy.", {
        "type": "sc-resource-instance", "resourceKind": "section", "resourceId": "scoutcomp-default@2.0.0:sections:upcoming-meetings",
    }),
    "scout-listing": _scout_layout("Aktuality", "Co je nového", "Zprávy z oddílu, pozvánky a důležité informace.", {
        "type": "sc-resource-instance", "resourceKind": "section", "resourceId": "scoutcomp-default@2.0.0:sections:news-stories",
    }),
    "scout-detail": _scout_layout("Příběh", "Detail", "Doplňte vlastní obsah, fotografie a souvislosti.", {
        "type": "default", "tagName": "section", "attributes": {"class": "web-section"}, "components": [{"type": "sc-slot", "name": "content", "components": []}],
    }),
})


DEFAULT_THEME_COMPONENTS = {
    "cta-button": {
        "scoutcomp": {"schemaVersion": 2},
        "pages": [{"frames": [{"component": {
            "type": "wrapper", "components": [{
                "type": "default", "tagName": "div",
                "attributes": {"class": "web-cta"},
                "components": [
                    {"type": "heading", "tagName": "h3", "content": "Chceš se přidat?"},
                    {"type": "link", "tagName": "a", "attributes": {"class": "web-button", "href": "#"}, "content": "Napiš nám"},
                ],
            }],
        }, "styles": []}]}],
    },
    "hero-banner": {
        "scoutcomp": {"schemaVersion": 2},
        "pages": [{"frames": [{"component": {
            "type": "wrapper", "components": [{
                "type": "default", "tagName": "div",
                "attributes": {"class": "web-hero"},
                "components": [
                    {"type": "heading", "tagName": "h1", "content": "Vítejte"},
                    {"type": "text", "tagName": "p", "attributes": {"class": "web-lead"}, "content": "Skautský oddíl."},
                ],
            }],
        }, "styles": []}]}],
    },
    "card": {
        "scoutcomp": {"schemaVersion": 2},
        "pages": [{"frames": [{"component": {
            "type": "wrapper", "components": [{
                "type": "default", "tagName": "article",
                "attributes": {"class": "web-post-card"},
                "components": [
                    {"type": "heading", "tagName": "h3", "content": "Titulek karty"},
                    {"type": "text", "tagName": "p", "content": "Popis nebo úryvek textu."},
                ],
            }],
        }, "styles": []}]}],
    },
}

DEFAULT_THEME_SECTIONS.update({
    "gallery-mosaic": _scout_section({"type": "default", "tagName": "section", "attributes": {"class": "web-section"}, "components": [{"type": "default", "tagName": "div", "attributes": {"class": "web-container"}, "components": [
        {"type": "heading", "tagName": "h2", "attributes": {"class": "web-title"}, "content": "Z našich akcí"},
        {"type": "default", "tagName": "div", "attributes": {"class": "sc-gallery-mosaic"}, "components": [{"type": "sc-repeat", "source": "core.media", "params": {"limit": 5}, "components": [{"type": "image", "tagName": "img", "scBindings": {"src": {"scope": "context", "field": "url"}, "alt": {"scope": "context", "field": "alt"}}}], "empty": [{"type": "text", "tagName": "p", "content": "Fotogalerii brzy doplníme."}]}]},
    ]}]}),
    "timeline": _scout_section({"type": "default", "tagName": "section", "attributes": {"class": "web-section sc-section-warm"}, "components": [{"type": "default", "tagName": "div", "attributes": {"class": "web-container"}, "components": [
        {"type": "heading", "tagName": "h2", "attributes": {"class": "web-title"}, "content": "Rok v oddíle"},
        {"type": "default", "tagName": "div", "attributes": {"class": "sc-timeline"}, "components": [
            {"type": "default", "tagName": "article", "attributes": {"class": "sc-timeline-item"}, "components": [{"type": "text", "tagName": "time", "content": "září"}, {"type": "heading", "tagName": "h3", "content": "Nový skautský rok"}, {"type": "text", "tagName": "p", "content": "Začínáme pravidelnými schůzkami a seznamovací výpravou."}]},
            {"type": "default", "tagName": "article", "attributes": {"class": "sc-timeline-item"}, "components": [{"type": "text", "tagName": "time", "content": "červenec"}, {"type": "heading", "tagName": "h3", "content": "Letní tábor"}, {"type": "text", "tagName": "p", "content": "Vrchol roku plný samostatnosti, her a přátelství."}]},
        ]},
    ]}]}),
    "faq": _scout_section({"type": "default", "tagName": "section", "attributes": {"class": "web-section"}, "components": [{"type": "default", "tagName": "div", "attributes": {"class": "web-container sc-faq"}, "components": [
        {"type": "heading", "tagName": "h2", "attributes": {"class": "web-title"}, "content": "Časté otázky"},
        {"type": "default", "tagName": "article", "attributes": {"class": "sc-faq-item"}, "components": [{"type": "heading", "tagName": "h3", "content": "Kdy se scházíte?"}, {"type": "text", "tagName": "p", "content": "Termín schůzek najdete u konkrétní družiny nebo v kalendáři."}]},
        {"type": "default", "tagName": "article", "attributes": {"class": "sc-faq-item"}, "components": [{"type": "heading", "tagName": "h3", "content": "Co si vzít poprvé?"}, {"type": "text", "tagName": "p", "content": "Stačí pohodlné oblečení, pití a chuť poznat novou partu."}]},
        {"type": "default", "tagName": "article", "attributes": {"class": "sc-faq-item"}, "components": [{"type": "heading", "tagName": "h3", "content": "Kolik to stojí?"}, {"type": "text", "tagName": "p", "content": "Výši příspěvků a možnosti podpory vám rádi vysvětlíme osobně."}]},
    ]}]}),
})


# Broader editor library: small, semantic primitives that compose into pages
# rather than locking authors into a single generic card layout.
def _scout_project(*components: dict) -> dict:
    return {"scoutcomp": {"schemaVersion": 2}, "pages": [{"frames": [{"component": {"type": "wrapper", "components": list(components)}, "styles": []}]}]}


def _block(title: str, text: str, class_name: str = "sc-scout-card") -> dict:
    return {"type": "default", "tagName": "div", "attributes": {"class": class_name}, "components": [
        {"type": "heading", "tagName": "h3", "content": title},
        {"type": "text", "tagName": "p", "content": text},
    ]}


DEFAULT_THEME_COMPONENTS.update({
    "section-heading": _scout_project({"type": "default", "tagName": "div", "attributes": {"class": "web-section-head"}, "components": [
        {"type": "text", "tagName": "p", "attributes": {"class": "web-section-kicker"}, "content": "Nadpis sekce"},
        {"type": "heading", "tagName": "h2", "attributes": {"class": "web-title"}, "content": "Silný nadpis, který dává směr"},
        {"type": "text", "tagName": "p", "attributes": {"class": "web-subtitle"}, "content": "Krátké vysvětlení, proč je tato část důležitá."},
    ]}),
    "notice-info": _scout_project(_block("Důležitá informace", "Sem patří krátké organizační sdělení pro rodiče a členy.", "sc-notice sc-notice-info")),
    "notice-warning": _scout_project(_block("Na co nezapomenout", "Připomeňte si čas, místo srazu nebo vybavení.", "sc-notice sc-notice-warning")),
    "icon-card": _scout_project({"type": "default", "tagName": "article", "attributes": {"class": "sc-scout-card sc-icon-card"}, "components": [
        {"type": "default", "tagName": "i", "attributes": {"class": "fa-solid fa-compass sc-icon"}},
        {"type": "heading", "tagName": "h3", "content": "Výpravy"},
        {"type": "text", "tagName": "p", "content": "Místo pro stručný popis aktivity nebo služby."},
        {"type": "link", "tagName": "a", "attributes": {"class": "web-button outline-dark", "href": "#"}, "content": "Zjistit víc"},
    ]}),
    "quote": _scout_project({"type": "default", "tagName": "blockquote", "attributes": {"class": "sc-scout-quote"}, "components": [
        {"type": "text", "tagName": "p", "content": "Ve skautu nejsme jen spolu – učíme se nést odpovědnost jeden za druhého."},
        {"type": "text", "tagName": "cite", "content": "— vedoucí oddílu"},
    ]}),
    "stat": _scout_project({"type": "default", "tagName": "div", "attributes": {"class": "sc-stat"}, "components": [
        {"type": "text", "tagName": "strong", "content": "25"}, {"type": "text", "tagName": "span", "content": "let společných zážitků"},
    ]}),
    "image-caption": _scout_project({"type": "default", "tagName": "figure", "attributes": {"class": "sc-image-caption"}, "components": [
        {"type": "image", "tagName": "img", "attributes": {"alt": "Fotografie z oddílu"}},
        {"type": "text", "tagName": "figcaption", "content": "Popisek fotografie a příběh za ní."},
    ]}),
    "button-row": _scout_project({"type": "default", "tagName": "div", "attributes": {"class": "sc-button-row"}, "components": [
        {"type": "link", "tagName": "a", "attributes": {"class": "web-button", "href": "#"}, "content": "Hlavní akce"},
        {"type": "link", "tagName": "a", "attributes": {"class": "web-button outline-dark", "href": "#"}, "content": "Vedlejší akce"},
    ]}),
    "link-list": _scout_project({"type": "default", "tagName": "ul", "attributes": {"class": "sc-link-list"}, "components": [
        {"type": "default", "tagName": "li", "components": [{"type": "link", "tagName": "a", "attributes": {"href": "#"}, "content": "Co si vzít na schůzku"}]},
        {"type": "default", "tagName": "li", "components": [{"type": "link", "tagName": "a", "attributes": {"href": "#"}, "content": "Kalendář oddílu"}]},
        {"type": "default", "tagName": "li", "components": [{"type": "link", "tagName": "a", "attributes": {"href": "#"}, "content": "Kontakt na vedoucí"}]},
    ]}),
    "timeline-item": _scout_project({"type": "default", "tagName": "article", "attributes": {"class": "sc-timeline-item"}, "components": [
        {"type": "text", "tagName": "time", "attributes": {"datetime": "2026-07-01"}, "content": "červenec 2026"},
        {"type": "heading", "tagName": "h3", "content": "Letní tábor"}, {"type": "text", "tagName": "p", "content": "Krátký popis milníku, akce nebo důležitého termínu."},
    ]}),
    "data-table": _scout_project({"type": "default", "tagName": "table", "attributes": {"class": "sc-data-table"}, "components": [
        {"type": "default", "tagName": "thead", "components": [{"type": "default", "tagName": "tr", "components": [{"type": "default", "tagName": "th", "content": "Den"}, {"type": "default", "tagName": "th", "content": "Program"}, {"type": "default", "tagName": "th", "content": "Čas"}]}]},
        {"type": "default", "tagName": "tbody", "components": [{"type": "default", "tagName": "tr", "components": [{"type": "default", "tagName": "td", "content": "Pátek"}, {"type": "default", "tagName": "td", "content": "Sraz"}, {"type": "default", "tagName": "td", "content": "16:00"}]}]},
    ]}),
})

DEFAULT_THEME_SECTIONS.update({
    "feature-cards": _scout_section({"type": "default", "tagName": "section", "attributes": {"class": "web-section"}, "components": [{"type": "default", "tagName": "div", "attributes": {"class": "web-container"}, "components": [
        {"type": "heading", "tagName": "h2", "attributes": {"class": "web-title"}, "content": "Co u nás zažijete"},
        {"type": "default", "tagName": "div", "attributes": {"class": "sc-scout-grid"}, "components": [_block("Schůzky", "Každý týden prostor pro hru, dovednosti a kamarády."), _block("Výpravy", "Víkendy v přírodě, kdy se učíme samostatnosti."), _block("Tábor", "Vrchol roku plný příběhů a společných výzev.")]},
    ]}]}),
    "numbers": _scout_section({"type": "default", "tagName": "section", "attributes": {"class": "web-section sc-section-warm"}, "components": [{"type": "default", "tagName": "div", "attributes": {"class": "web-container sc-stats-grid"}, "components": [
        {"type": "default", "tagName": "div", "attributes": {"class": "sc-stat"}, "components": [{"type": "text", "tagName": "strong", "content": "4"}, {"type": "text", "tagName": "span", "content": "družiny"}]},
        {"type": "default", "tagName": "div", "attributes": {"class": "sc-stat"}, "components": [{"type": "text", "tagName": "strong", "content": "52"}, {"type": "text", "tagName": "span", "content": "výprav ročně"}]},
        {"type": "default", "tagName": "div", "attributes": {"class": "sc-stat"}, "components": [{"type": "text", "tagName": "strong", "content": "∞"}, {"type": "text", "tagName": "span", "content": "vzpomínek"}]},
    ]}]}),
    "contact-panel": _scout_section({"type": "default", "tagName": "section", "attributes": {"class": "web-section sc-section-night", "id": "contact"}, "components": [{"type": "default", "tagName": "div", "attributes": {"class": "web-container"}, "components": [
        {"type": "heading", "tagName": "h2", "content": "Ozvěte se nám"},
        {"type": "default", "tagName": "div", "attributes": {"class": "sc-contact-grid"}, "components": [
            {"type": "text", "tagName": "p", "components": [{"type": "sc-bind", "binding": {"scope": "site", "field": "contact_meeting_time"}}]},
        ]},
    ]}]}),
})


DEFAULT_THEME_PATTERNS = {
    "hero-with-about": {
        "scoutcomp": {"schemaVersion": 2},
        "pages": [{"frames": [{"component": {
            "type": "wrapper", "components": [
                {
                    "type": "default", "tagName": "section",
                    "attributes": {"class": "web-hero"},
                    "components": [{
                        "type": "default", "tagName": "div",
                        "attributes": {"class": "web-container"},
                        "components": [
                            {"type": "heading", "tagName": "h1", "content": "Náš oddíl"},
                            {"type": "text", "tagName": "p", "attributes": {"class": "web-lead"}, "content": "Společně objevujeme svět."},
                        ],
                    }],
                },
                {
                    "type": "default", "tagName": "section",
                    "attributes": {"class": "web-section"},
                    "components": [{
                        "type": "default", "tagName": "div",
                        "attributes": {"class": "web-container"},
                        "components": [
                            {"type": "heading", "tagName": "h2", "content": "Kdo jsme"},
                            {"type": "text", "tagName": "p", "content": "Jsme parta, co se ráda setkává."},
                        ],
                    }],
                },
            ],
        }, "styles": []}]}],
    },
}


# ScoutComp 2.0 — a native, safe translation of the local Vvveb Scout theme.
# It retains its recognisable composition (transparent navigation, image hero,
# split showcases, editorial cards, people, CTA and dark footer), but represents
# every item as GrapesJS project data and ScoutComp bindings rather than Vvveb
# directives, executable scripts or ecommerce-only markup.
def _sc2(tag, *, cls="", content=None, components=None, attrs=None, kind="default", bindings=None):
    attributes = dict(attrs or {})
    if cls:
        attributes["class"] = cls
    node = {"type": kind, "tagName": tag, "attributes": attributes}
    if content is not None:
        node["content"] = content
    if components is not None:
        node["components"] = components
    if bindings:
        node["scBindings"] = bindings
    return node


def _sc2_project(*components):
    return _scout_project(*components)


def _sc2_resource(resource_id):
    return {"type": "sc-resource-instance", "resourceKind": "section", "resourceId": f"{DEFAULT_THEME_ID}@{DEFAULT_THEME_VERSION}:sections:{resource_id}"}


def _sc2_button(label="Zjistit více", href="#", variant="primary"):
    return _sc2("a", kind="link", cls=f"sc2-btn sc2-btn-{variant}", content=label, attrs={"href": href})


def _sc2_heading(kicker, title, lead=""):
    items = []
    if kicker:
        items.append(_sc2("p", cls="sc2-kicker", content=kicker))
    items.append(_sc2("h2", kind="heading", cls="sc2-section-title", content=title))
    if lead:
        items.append(_sc2("p", cls="sc2-section-lead", content=lead))
    return _sc2("div", cls="sc2-heading", components=items)


def _sc2_shell(slot_components):
    return _sc2_project(
        _sc2("header", cls="sc2-site-header", components=[
            _sc2("nav", cls="sc2-navbar", attrs={"aria-label": "Hlavní navigace"}, components=[
                _sc2("a", kind="link", cls="sc2-brand", attrs={"href": "/"}, components=[
                    _sc2("img", kind="image", cls="sc2-brand-logo", attrs={"alt": ""}, bindings={"src": {"scope": "site", "field": "site_logo"}}),
                    _sc2("span", bindings={"text": {"scope": "site", "field": "site_title"}}),
                ]),
                _sc2("div", cls="sc2-menu", components=[{"type": "sc-menu", "location": "main"}]),
            ]),
        ]),
        _sc2("main", cls="sc2-main", components=[{"type": "sc-slot", "name": "content", "components": slot_components}]),
        _sc2("footer", cls="sc2-footer", components=[
            _sc2("div", cls="sc2-footer-grid", components=[
                _sc2("div", components=[_sc2("strong", content="Skautský oddíl"), _sc2("p", content="Dobrodružství, přátelství a odpovědnost."),]),
                _sc2("div", components=[_sc2("h2", kind="heading", content="Navigace"), {"type": "sc-menu", "location": "footer"}]),
                _sc2("div", components=[_sc2("h2", kind="heading", content="Informace"), _sc2("p", content="Aktuální kontakty najdete na kontaktní stránce.")]),
            ]),
            _sc2("p", cls="sc2-copyright", components=[_sc2("span", content="© "), _sc2("span", bindings={"text": {"scope": "site", "field": "site_title"}})]),
        ]),
    )


def _sc2_hero(*, compact=False, title="Dobrodružství začíná venku", lead="Schůzky, výpravy, tábory a parta, která drží pohromadě."):
    return _sc2("section", cls="sc2-hero sc2-hero-compact" if compact else "sc2-hero", components=[
        _sc2("div", cls="sc2-hero-media", components=[_sc2("img", kind="image", attrs={"alt": "Fotografie oddílu"})]),
        _sc2("div", cls="sc2-hero-shade"),
        _sc2("div", cls="sc2-hero-content", components=[
            _sc2("p", cls="sc2-kicker sc2-kicker-light", content="SKAUTSKÝ ODDÍL"),
            _sc2("h1", kind="heading", cls="sc2-hero-title", content=title),
            _sc2("p", cls="sc2-hero-lead", content=lead),
            _sc2("div", cls="sc2-actions", components=[_sc2_button("Poznat nás", "#o-nas", "light"), _sc2_button("Kalendář akcí", "/kalendar", "outline")]),
        ]),
        _sc2("div", cls="sc2-wave", attrs={"aria-hidden": "true"}),
    ])


def _sc2_showcase(title="Kdo jsme", text="Jsme parta, která vyráží ven, učí se nové věci a umí držet při sobě.", reverse=False):
    image = _sc2("div", cls="sc2-showcase-art", components=[_sc2("i", cls="fa-solid fa-compass", attrs={"aria-hidden": "true"}), _sc2("span", content="SKAUT")])
    copy = _sc2("div", cls="sc2-showcase-copy", components=[_sc2_heading("O NÁS", title), _sc2("p", content=text), _sc2("p", content="Na schůzkách, výpravách i táboře vytváříme bezpečný prostor pro samostatnost a kamarádství."), _sc2_button("Více o nás", "/o-nas", "dark")])
    return _sc2("section", cls="sc2-section sc2-showcase sc2-showcase-reverse" if reverse else "sc2-section sc2-showcase", components=[_sc2("div", cls="sc2-container sc2-showcase-grid", components=[copy, image] if reverse else [image, copy])])


def _sc2_post_card():
    return _sc2("article", cls="sc2-post-card", components=[
        _sc2("img", kind="image", cls="sc2-card-image", attrs={"alt": ""}, bindings={"src": {"scope": "context", "field": "cover_url"}}),
        _sc2("div", cls="sc2-card-body", components=[
            _sc2("p", cls="sc2-meta", bindings={"text": {"scope": "context", "field": "published_at"}}),
            _sc2("h3", kind="heading", bindings={"text": {"scope": "context", "field": "title"}}),
            _sc2("p", bindings={"text": {"scope": "context", "field": "excerpt"}}),
            _sc2("a", kind="link", cls="sc2-text-link", content="Pokračovat ve čtení →", bindings={"href": {"scope": "context", "field": "url"}}),
        ]),
    ])


def _sc2_team_tile():
    return _sc2("article", cls="sc2-team-card", components=[
        _sc2("img", kind="image", attrs={"alt": ""}, bindings={"src": {"scope": "context", "field": "logo_url"}}),
        _sc2("div", cls="sc2-team-overlay", components=[_sc2("h3", kind="heading", bindings={"text": {"scope": "context", "field": "name"}}), _sc2("p", bindings={"text": {"scope": "context", "field": "description"}})]),
    ])


DEFAULT_THEME_SECTIONS.update({
    "scout-hero-full": _sc2_project(_sc2_hero()),
    "scout-hero-compact": _sc2_project(_sc2_hero(compact=True, title="Nadpis stránky", lead="Krátké uvedení stránky, které uživateli jasně řekne, kde je.")),
    "scout-showcase": _sc2_project(_sc2_showcase()),
    "scout-showcase-reverse": _sc2_project(_sc2_showcase("Proč skaut", "Dáváme dětem zkušenost, že zvládnou věci samy i společně.", reverse=True)),
    "scout-posts-grid": _sc2_project(_sc2("section", cls="sc2-section sc2-section-cream", components=[_sc2("div", cls="sc2-container", components=[_sc2_heading("AKTUALITY", "Co je u nás nového", "Pozvánky, zprávy z akcí a příběhy z oddílu."), _sc2("div", cls="sc2-post-grid", components=[{"type": "sc-repeat", "source": "core.posts", "params": {"limit": 3}, "components": [_sc2_post_card()], "empty": [_sc2("p", content="Zatím žádné aktuality.")]}])])])),
    "scout-posts-list": _sc2_project(_sc2("section", cls="sc2-section", components=[_sc2("div", cls="sc2-container", components=[_sc2_heading("AKTUALITY", "Všechny zprávy"), _sc2("div", cls="sc2-post-list", components=[{"type": "sc-repeat", "source": "core.posts", "params": {"limit": 12}, "components": [_sc2_post_card()], "empty": [_sc2("p", content="Zatím žádné aktuality.")]}])])])),
    "scout-team-grid": _sc2_project(_sc2("section", cls="sc2-section", components=[_sc2("div", cls="sc2-container", components=[_sc2_heading("DRUŽINY", "Najdi svoji partu", "Každá družina má vlastní rytmus, vedoucí i příběhy."), _sc2("div", cls="sc2-team-grid", components=[{"type": "sc-repeat", "source": "core.teams", "params": {"limit": 9}, "components": [_sc2_team_tile()], "empty": [_sc2("p", content="Družiny brzy doplníme.")]}])])])),
    "scout-events": _sc2_project(_sc2("section", cls="sc2-section sc2-section-night", components=[_sc2("div", cls="sc2-container", components=[_sc2_heading("KALENDÁŘ", "Co nás čeká", "Schůzky, výpravy a velké oddílové akce."), _sc2("div", cls="sc2-event-grid", components=[{"type": "sc-repeat", "source": "core.events", "params": {"limit": 6}, "components": [_sc2("a", kind="link", cls="sc2-event", bindings={"href": {"scope": "context", "field": "url"}}, components=[_sc2("h3", kind="heading", bindings={"text": {"scope": "context", "field": "title"}}), _sc2("p", bindings={"text": {"scope": "context", "field": "description"}}), _sc2("span", content="Zobrazit akci →")])], "empty": [_sc2("p", content="Další akce právě připravujeme.")]}])])])),
    "scout-values": _sc2_project(_sc2("section", cls="sc2-section", components=[_sc2("div", cls="sc2-container", components=[_sc2_heading("HODNOTY", "Na čem stavíme"), _sc2("div", cls="sc2-feature-grid", components=[_sc2("article", cls="sc2-feature", components=[_sc2("i", cls="fa-solid fa-people-group"), _sc2("h3", kind="heading", content="Přátelství"), _sc2("p", content="Držíme spolu a umíme se o sebe opřít.")]), _sc2("article", cls="sc2-feature", components=[_sc2("i", cls="fa-solid fa-tree"), _sc2("h3", kind="heading", content="Příroda"), _sc2("p", content="Objevujeme svět venku a pečujeme o něj.")]), _sc2("article", cls="sc2-feature", components=[_sc2("i", cls="fa-solid fa-fire"), _sc2("h3", kind="heading", content="Odvaha"), _sc2("p", content="Zkoušíme nové věci a rosteme vlastní zkušeností.")])])])])),
    "scout-cta": _sc2_project(_sc2("section", cls="sc2-cta", components=[_sc2("div", cls="sc2-container sc2-cta-inner", components=[_sc2("div", components=[_sc2("p", cls="sc2-kicker", content="PRVNÍ KROK"), _sc2("h2", kind="heading", content="Chceš to zkusit s námi?"), _sc2("p", content="Přijď na schůzku, poznej vedoucí a zjisti, jestli je skaut právě pro tebe.")]), _sc2_button("Napiš nám", "/kontakt", "dark")])])),
    "scout-gallery": _sc2_project(_sc2("section", cls="sc2-section", components=[_sc2("div", cls="sc2-container", components=[_sc2_heading("GALERIE", "Z našich akcí"), _sc2("div", cls="sc2-gallery", components=[{"type": "sc-repeat", "source": "core.media", "params": {"limit": 9}, "components": [_sc2("figure", cls="sc2-gallery-item", components=[_sc2("img", kind="image", attrs={"alt": ""}, bindings={"src": {"scope": "context", "field": "url"}, "alt": {"scope": "context", "field": "alt"}})])], "empty": [_sc2("p", content="Fotogalerii brzy doplníme.")]}])])])),
    "scout-contact": _sc2_project(_sc2("section", cls="sc2-section sc2-contact", components=[_sc2("div", cls="sc2-container sc2-contact-grid", components=[_sc2("div", components=[_sc2_heading("KONTAKT", "Ozvěte se nám", "Kontaktní údaje a způsob spojení doplňte podle potřeb svého oddílu.")]), _sc2("aside", cls="sc2-contact-card", components=[_sc2("h3", kind="heading", content="Kdy se potkáváme"), _sc2("p", bindings={"text": {"scope": "site", "field": "contact_meeting_time"}})])])])),
})

DEFAULT_THEME_COMPONENTS.update({
    "scout-button-primary": _sc2_project(_sc2_button("Hlavní akce")),
    "scout-button-secondary": _sc2_project(_sc2_button("Vedlejší akce", "#", "outline")),
    "scout-section-heading": _sc2_project(_sc2_heading("KICKER", "Nadpis sekce", "Krátké vysvětlení, které udrží obsah pohromadě.")),
    "scout-feature-card": _sc2_project(_sc2("article", cls="sc2-feature", components=[_sc2("i", cls="fa-solid fa-compass"), _sc2("h3", kind="heading", content="Název aktivity"), _sc2("p", content="Krátký popis, který lze rovnou upravit v plátně.")])),
    "scout-person": _sc2_project(_sc2("article", cls="sc2-person", components=[_sc2("img", kind="image", attrs={"alt": "Portrét vedoucího"}), _sc2("h3", kind="heading", content="Jméno vedoucího"), _sc2("p", cls="sc2-meta", content="Role v oddíle"), _sc2("p", content="Krátké představení člověka.")])),
    "scout-quote": _sc2_project(_sc2("blockquote", cls="sc2-quote", components=[_sc2("p", content="Skauting je dobrodružství, které dává smysl i dlouho po návratu domů."), _sc2("cite", content="Vedoucí oddílu")])),
    "scout-notice": _sc2_project(_sc2("aside", cls="sc2-notice", components=[_sc2("h3", kind="heading", content="Důležitá informace"), _sc2("p", content="Krátká organizační zpráva pro rodiče a členy.")])),
    "scout-accordion": _sc2_project(_sc2("details", cls="sc2-accordion", components=[_sc2("summary", content="Častá otázka"), _sc2("p", content="Odpověď, kterou může návštěvník rozbalit bez JavaScriptu.")])),
    "scout-table": _sc2_project(_sc2("table", cls="sc2-table", components=[_sc2("thead", components=[_sc2("tr", components=[_sc2("th", content="Den"), _sc2("th", content="Program"), _sc2("th", content="Čas")])]), _sc2("tbody", components=[_sc2("tr", components=[_sc2("td", content="Pátek"), _sc2("td", content="Schůzka"), _sc2("td", content="16:00")])])])),
})

DEFAULT_THEME_TEMPLATES.update({
    "scout-home": _sc2_shell([_sc2_resource("scout-hero-full"), _sc2_resource("scout-showcase"), _sc2_resource("scout-team-grid"), _sc2_resource("scout-events"), _sc2_resource("scout-posts-grid"), _sc2_resource("scout-cta")]),
    "scout-landing": _sc2_shell([_sc2_resource("scout-hero-full"), _sc2_resource("scout-showcase"), _sc2_resource("scout-values"), _sc2_resource("scout-cta")]),
    "scout-story": _sc2_shell([_sc2_hero(compact=True, title="Náš příběh", lead="Představte oddíl, jeho hodnoty a lidi."), _sc2_resource("scout-showcase"), _sc2_resource("scout-values"), {"type": "sc-slot", "name": "content", "components": []}]),
    "scout-team": _sc2_shell([_sc2_hero(compact=True, title="Naše družina", lead="Schůzky, vedoucí, aktuality a společné výpravy."), _sc2_resource("scout-events"), {"type": "sc-slot", "name": "content", "components": []}]),
    "scout-listing": _sc2_shell([_sc2_hero(compact=True, title="Aktuality", lead="Zprávy, pozvánky a důležité informace."), _sc2_resource("scout-posts-list")]),
    "scout-detail": _sc2_shell([_sc2_hero(compact=True, title="Detail obsahu", lead="Příběh, fotografie a souvislosti."), {"type": "sc-slot", "name": "content", "components": []}]),
    "scout-gallery-page": _sc2_shell([_sc2_hero(compact=True, title="Galerie", lead="Chvíle z výprav, schůzek a táborů."), _sc2_resource("scout-gallery")]),
    "scout-contact-page": _sc2_shell([_sc2_hero(compact=True, title="Kontakt", lead="Máte dotaz nebo se chcete přidat?"), _sc2_resource("scout-contact")]),
})
