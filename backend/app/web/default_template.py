"""Default ScoutComp website template built from GrapesJS project data.

The template follows the structural/visual language of a scout-group website
(header, hero, about, news, footer) while using only generic presentation
primitives. It binds public data sources instead of hard-coding module output.
"""

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
                                    {
                                        "type": "default",
                                        "tagName": "div",
                                        "attributes": {"class": "web-nav-links"},
                                        "components": [
                                            {
                                                "type": "sc-repeat",
                                                "source": "web.menu",
                                                "components": [
                                                    {
                                                        "type": "link",
                                                        "tagName": "a",
                                                        "attributes": {"class": "web-nav-link"},
                                                        "scBindings": {
                                                            "href": {"scope": "context", "field": "url"},
                                                            "text": {"scope": "context", "field": "label"},
                                                        },
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
                                                        "source": "web.posts",
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
                                                    {
                                                        "type": "sc-condition",
                                                        "condition": {
                                                            "left": {"scope": "site", "field": "contact_email"},
                                                            "operator": "exists",
                                                        },
                                                        "components": [
                                                            {
                                                                "type": "link",
                                                                "tagName": "a",
                                                                "attributes": {"class": "web-social"},
                                                                "scBindings": {
                                                                    "href": {"scope": "site", "field": "contact_email"},
                                                                },
                                                                "content": "E-mail",
                                                            },
                                                        ],
                                                    },
                                                ],
                                            },
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
DEFAULT_THEME_VERSION = "1.0.0"
DEFAULT_THEME_NAME = "Výchozí web oddílu"
DEFAULT_THEME_DESCRIPTION = (
    "Kompletní výchozí téma inspirované webem ontario.zlin6.cz: "
    "hlavička s menu, hero, představení, novinky a patička."
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
                                    {"type": "default", "tagName": "div", "attributes": {"class": "web-nav-links"}, "components": [{
                                        "type": "sc-repeat",
                                        "source": "web.menu",
                                        "components": [{
                                            "type": "link",
                                            "tagName": "a",
                                            "attributes": {"class": "web-nav-link"},
                                            "scBindings": {"href": {"scope": "context", "field": "url"}, "text": {"scope": "context", "field": "label"}},
                                        }],
                                    }]},
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
                                                "source": "web.posts",
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
                        {"type": "text", "tagName": "p", "components": [
                            {"type": "sc-bind", "binding": {"scope": "site", "field": "contact_email"}, "mode": "text"},
                        ]},
                    ],
                }],
            }],
        }, "styles": []}]}],
    },
}

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
