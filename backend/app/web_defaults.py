"""Scout "theme pack" for the web module.

A WordPress-style theme: one shared stylesheet (``THEME_CSS``) plus a set of
*page-type templates* (home, about, news, calendar, gallery, contact, ...) that
mix static markup with server-rendered web components (``events_list``,
``media_gallery``, ``meetups`` ...). The theme is used by the public site
server, the in-app preview and the GrapesJS editor, so a page looks identical
everywhere.

Shared by the migration (initial seed), the web router (templates API) and the
public site server without circular imports.
"""
from __future__ import annotations

COMPONENT_TAG = "scoutcomp-web-component"

# --------------------------------------------------------------------------
# Theme stylesheet (design system). Kept in sync with
# frontend/src/modules/web/themeCss.js.
# --------------------------------------------------------------------------

THEME_CSS = """
:root{
  --web-primary:#0a224e;--web-accent:#1e3a6e;--web-primary-2:#2f3a4b;
  --web-cream:#e1d3c1;--web-cream-2:#f6ebd8;
  --web-bg:#ffffff;--web-text:#2f3a4b;--web-muted:#6b7280;
  --web-border:#e9e0d2;--web-radius:1rem
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;font-family:'Open Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:var(--web-text);background:var(--web-bg);line-height:1.65}
h1,h2,h3,h4,h5,h6{font-family:'Poppins','Open Sans',sans-serif;color:var(--web-primary);font-weight:700;line-height:1.2;margin:0 0 .75rem}
p{margin:0 0 1rem}
a{color:var(--web-primary)}
img{max-width:100%;height:auto}
.web-container{max-width:1120px;margin:0 auto;padding:0 1.25rem}

/* navigation */
.web-nav{background:#fff;border-bottom:1px solid var(--web-border);position:sticky;top:0;z-index:50;box-shadow:0 2px 12px rgba(10,34,78,.06)}
.web-nav-inner{max-width:1120px;margin:0 auto;padding:.55rem 1.25rem;display:flex;align-items:center;gap:1.5rem;flex-wrap:wrap}
.web-nav-brand{font-family:'Poppins';font-weight:800;font-size:1.15rem;color:var(--web-primary);text-decoration:none;letter-spacing:.01em;display:inline-flex;align-items:center;gap:.5rem}
.web-nav-brand i{font-size:1.05em;color:var(--web-accent)}
.web-nav-links{display:flex;gap:.35rem;flex-wrap:wrap;margin-left:auto}
.web-nav-link{display:inline-block;padding:.42rem .95rem;border-radius:999px;color:var(--web-primary-2);text-decoration:none;font-weight:600;font-size:.95rem;transition:.15s}
.web-nav-link:hover{background:var(--web-cream-2);color:var(--web-primary)}
.web-nav-link.active{background:var(--web-primary);color:#fff}
.web-main{padding:0 0 2rem}
.web-footer{background:var(--web-primary);color:#e8e0d4;padding:2.25rem 0;margin-top:2rem}
.web-footer .web-container{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}
.web-footer-brand{font-family:'Poppins';font-weight:700;color:#fff;display:inline-flex;align-items:center;gap:.5rem}
.web-footer a{color:var(--web-cream);text-decoration:none}
.web-footer small{opacity:.8}

/* hero */
.web-hero{position:relative;background:linear-gradient(160deg,#0a224e 0%,#1e3a6e 62%,#2f3a4b 100%);color:#fff;text-align:center;padding:4.5rem 1.25rem 6rem;overflow:hidden}
.web-hero.slim{padding:3.25rem 1.25rem 5rem}
.web-hero::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 18% 18%,rgba(225,211,193,.16) 0,transparent 45%),radial-gradient(circle at 82% 28%,rgba(255,255,255,.09) 0,transparent 42%);pointer-events:none}
.web-hero .web-container{position:relative}
.web-hero-badge{display:inline-block;background:rgba(225,211,193,.18);color:var(--web-cream);border:1px solid rgba(225,211,193,.38);border-radius:999px;padding:.28rem 1rem;font-size:.78rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;margin-bottom:1.1rem}
.web-hero-title{font-family:'Poppins';font-weight:800;color:#fff;font-size:3rem;line-height:1.1;margin:0 0 1rem}
.web-hero.slim .web-hero-title{font-size:2.3rem}
.web-hero-sub{font-size:1.18rem;color:rgba(255,255,255,.88);max-width:640px;margin:0 auto 1.75rem}
.web-hero-logo{width:120px;height:120px;border-radius:50%;object-fit:cover;border:4px solid rgba(255,255,255,.28);box-shadow:0 10px 30px rgba(0,0,0,.28);margin-bottom:1.4rem}
.web-hero .web-button{margin:0 .3rem}
.sc-wave{position:absolute;left:0;right:0;bottom:-1px;width:100%;height:72px;display:block}

/* buttons */
.web-button{display:inline-block;background:var(--web-primary);color:#fff!important;text-decoration:none;padding:.68rem 1.6rem;border-radius:999px;font-weight:700;font-size:.95rem;border:none;cursor:pointer;transition:.15s;box-shadow:0 4px 14px rgba(10,34,78,.25)}
.web-button:hover{background:var(--web-accent);transform:translateY(-1px)}
.web-button.light{background:var(--web-cream);color:var(--web-primary)!important}
.web-button.light:hover{background:#d5c2a6}
.web-button.outline{background:transparent;color:#fff!important;border:1.5px solid rgba(255,255,255,.72)}
.web-button.outline:hover{background:rgba(255,255,255,.14)}
.web-button.outline-dark{background:transparent;color:var(--web-primary)!important;border:1.5px solid var(--web-primary)}
.web-button.outline-dark:hover{background:var(--web-cream-2)}

/* sections */
.web-section{padding:3rem 0}
.web-section.alt{background:var(--web-cream-2)}
.web-section-head{text-align:center;max-width:660px;margin:0 auto 2.25rem}
.web-section-kicker{display:inline-block;font-size:.78rem;font-weight:700;letter-spacing:.11em;text-transform:uppercase;color:var(--web-accent);margin-bottom:.5rem}
.web-title{font-family:'Poppins';font-size:2rem;font-weight:800;color:var(--web-primary);margin:0 0 .5rem}
.web-subtitle{color:var(--web-muted);font-size:1.05rem;margin:0}
.web-text{font-size:1.05rem;color:var(--web-text)}
.lead{font-size:1.16rem}

/* two-column */
.web-row{display:grid;grid-template-columns:1fr 1fr;gap:2.75rem;align-items:center}
.web-row.reverse .web-col:first-child{order:2}
.web-col img,.web-image{max-width:100%;height:auto;border-radius:var(--web-radius);box-shadow:0 12px 30px rgba(10,34,78,.14)}
.web-image{width:100%;object-fit:cover}
.web-logo-card{background:var(--web-cream-2);border-radius:var(--web-radius);display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;gap:.9rem;box-shadow:inset 0 0 0 1px rgba(10,34,78,.06)}
.web-logo-card i{font-size:5.2rem;color:var(--web-primary)}
.web-logo-card span{font-family:'Poppins';font-weight:800;font-size:1.3rem;color:var(--web-primary);letter-spacing:.02em}

/* cards */
.web-card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:1.25rem}
.web-card-grid.cols-2{grid-template-columns:repeat(2,1fr)}
.web-card{background:#fff;border:1px solid var(--web-border);border-radius:var(--web-radius);padding:1.5rem;box-shadow:0 4px 16px rgba(10,34,78,.06);transition:.2s;display:flex;flex-direction:column;gap:.5rem}
.web-card:hover{transform:translateY(-4px);box-shadow:0 14px 34px rgba(10,34,78,.14)}
.web-card-icon{width:52px;height:52px;border-radius:16px;background:var(--web-cream-2);color:var(--web-primary);display:flex;align-items:center;justify-content:center;font-size:1.35rem;margin-bottom:.35rem}
.web-card h3,.web-card h4{font-size:1.12rem;margin:0}
.web-card p{font-size:.95rem;color:var(--web-muted);margin:0}
.web-card .web-button{margin-top:.75rem;align-self:flex-start}
.web-feature-card{background:var(--web-cream-2);border:none}
.web-card-feature-title{font-size:1.05rem}

/* contact */
.web-contact-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1.25rem}
.web-contact-card{background:#fff;border:1px solid var(--web-border);border-radius:var(--web-radius);padding:1.5rem;text-align:center;box-shadow:0 4px 16px rgba(10,34,78,.06)}
.web-contact-card .web-card-icon{margin:0 auto .75rem}

/* events & list cards */
.web-event-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1rem}
.web-event-card{display:flex;gap:1rem;align-items:flex-start;background:#fff;border:1px solid var(--web-border);border-radius:var(--web-radius);padding:1rem;box-shadow:0 2px 10px rgba(10,34,78,.05);transition:.2s}
.web-event-card:hover{transform:translateY(-3px);box-shadow:0 10px 26px rgba(10,34,78,.12)}
.web-event-date{flex:0 0 58px;height:58px;border-radius:14px;background:var(--web-primary);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1}
.web-event-day{font-family:'Poppins';font-weight:800;font-size:1.3rem}
.web-event-month{font-size:.7rem;text-transform:uppercase;letter-spacing:.07em;opacity:.92}
.web-event-body{flex:1;min-width:0}
.web-event-body .web-list-meta{margin-top:.15rem}
.web-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.85rem}
.web-list-item{display:flex;gap:1rem;align-items:flex-start;background:#fff;border:1px solid var(--web-border);border-radius:var(--web-radius);padding:1rem 1.1rem;box-shadow:0 2px 10px rgba(10,34,78,.05)}
.web-list-icon{flex:0 0 2.6rem;height:2.6rem;display:flex;align-items:center;justify-content:center;border-radius:12px;background:var(--web-primary);color:#fff;font-size:1.05rem}
.web-list-body{flex:1;min-width:0}
.web-list-title{font-weight:700;font-size:1rem;margin:0 0 .1rem;color:var(--web-primary)}
.web-list-meta{color:var(--web-muted);font-size:.85rem;margin:0}
.web-list-desc{color:var(--web-text);font-size:.92rem;margin:.25rem 0 0}
.web-badge{display:inline-block;background:var(--web-cream);color:var(--web-primary);font-size:.7rem;font-weight:700;padding:.15rem .55rem;border-radius:999px;margin-left:.5rem;vertical-align:middle;letter-spacing:.02em}
.web-empty{color:var(--web-muted);font-style:italic;padding:1.25rem 0;text-align:center;background:var(--web-cream-2);border-radius:var(--web-radius)}

/* media gallery */
.web-media-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:1rem}
.web-media-figure{margin:0;border-radius:var(--web-radius);overflow:hidden;background:var(--web-cream-2);box-shadow:0 4px 16px rgba(10,34,78,.08)}
.web-media-figure img{width:100%;height:190px;object-fit:cover;display:block;transition:.3s}
.web-media-figure:hover img{transform:scale(1.05)}

/* calendar */
.web-calendar{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--web-border);border-radius:var(--web-radius);overflow:hidden}
.web-calendar th{background:var(--web-primary);color:#fff;font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:.7rem}
.web-calendar td{border:1px solid var(--web-border);width:14.28%;height:5.4rem;vertical-align:top;padding:.4rem}
.web-calendar .cal-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:.9rem}
.web-calendar .cal-title{font-family:'Poppins';font-weight:800;font-size:1.2rem;color:var(--web-primary)}
.web-calendar .cal-day{font-size:.85rem;color:var(--web-muted);display:block;margin-bottom:.2rem}
.web-calendar .cal-today{background:var(--web-cream-2);border-color:var(--web-primary)}
.web-calendar .cal-event{display:block;font-size:.72rem;font-weight:600;padding:.12rem .4rem;border-radius:.35rem;margin-top:.15rem;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:var(--web-primary)}
.web-calendar .cal-out{opacity:.35}

/* utilities */
.web-text-center{text-align:center}
.web-divider{border:none;border-top:1px solid var(--web-border);margin:2.5rem 0}
.web-menu{display:flex;flex-direction:column;gap:.5rem;padding:0;list-style:none}
.web-menu-link{display:inline-block;padding:.5rem .9rem;background:#fff;border:1px solid var(--web-border);border-radius:.6rem;color:var(--web-primary);text-decoration:none;font-weight:600}
.web-menu-link:hover{border-color:var(--web-primary)}
.web-menu-link.active{background:var(--web-primary);color:#fff}
.web-quote{border-left:4px solid var(--web-cream);background:var(--web-cream-2);border-radius:0 var(--web-radius) var(--web-radius) 0;padding:1.5rem 2rem;font-style:italic;font-size:1.1rem;margin:0}
.web-spacer{height:3rem}

/* news & posts */
.web-news-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:1.25rem}
.web-news-card{margin:0;border-radius:var(--web-radius);overflow:hidden;background:#fff;box-shadow:0 4px 16px rgba(10,34,78,.08);display:flex;flex-direction:column}
.web-news-cover img{width:100%;height:150px;object-fit:cover;display:block;transition:.3s}
.web-news-cover:hover img{transform:scale(1.05)}
.web-news-body{padding:1.1rem 1.25rem 1.25rem;display:flex;flex-direction:column;gap:.35rem;flex:1}
.web-news-title{margin:0;font-family:'Poppins';font-size:1.05rem}
.web-news-title a{color:var(--web-primary);text-decoration:none}
.web-news-title a:hover{text-decoration:underline}
.web-news-more{color:var(--web-primary);font-weight:700;font-size:.85rem;text-decoration:none;margin-top:auto;padding-top:.5rem}
.web-post{background:#fff;border-radius:var(--web-radius);padding:2rem;box-shadow:0 4px 16px rgba(10,34,78,.08)}
.web-post-title{font-family:'Poppins';font-weight:800;color:var(--web-primary);margin:.25rem 0 1rem}
.web-post-cover{width:100%;max-height:420px;object-fit:cover;border-radius:var(--web-radius);margin-bottom:1.5rem}
.web-post-body{line-height:1.7;color:var(--web-text)}
.web-post-body h1,.web-post-body h2,.web-post-body h3,.web-post-body h4{font-family:'Poppins';color:var(--web-primary);margin:1.5rem 0 .5rem}
.web-post-body h1:first-child,.web-post-body h2:first-child,.web-post-body h3:first-child{margin-top:0}
.web-post-body a{color:var(--web-accent)}
.web-post-body img{max-width:100%;border-radius:var(--web-radius)}
.web-post-body blockquote{border-left:4px solid var(--web-cream);background:var(--web-cream-2);border-radius:0 var(--web-radius) var(--web-radius) 0;padding:1rem 1.25rem;margin:1rem 0;font-style:italic}
.web-post-body pre{background:var(--web-primary);color:#e8e0d4;border-radius:var(--web-radius);padding:1rem;overflow:auto}
.web-post-body code{font-family:monospace;font-size:.9em}
.web-post-body hr{border:none;border-top:1px solid var(--web-border);margin:2rem 0}

/* social & footer contacts */
.web-socials{display:flex;gap:.5rem}
.web-social{display:inline-flex;align-items:center;justify-content:center;width:2.3rem;height:2.3rem;border-radius:999px;background:rgba(255,255,255,.15);color:#fff;font-size:.95rem;text-decoration:none;transition:.2s}
.web-social:hover{background:#fff;color:var(--web-primary)}
.web-footer-row{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;width:100%}
.web-footer-contacts{display:flex;flex-direction:column;gap:.25rem;width:100%;font-size:.88rem;opacity:.9}
.web-footer-contact{display:inline-flex;align-items:center;gap:.5rem}
.web-footer-contact i{width:1rem;text-align:center}

@media (max-width:760px){
  .web-hero-title{font-size:2.1rem}
  .web-hero.slim .web-hero-title{font-size:1.8rem}
  .web-hero{padding:3.5rem 1.25rem 5rem}
  .web-row{grid-template-columns:1fr;gap:1.75rem}
  .web-card-grid.cols-2{grid-template-columns:1fr}
  .web-calendar td{height:3.6rem}
  .web-calendar .cal-event{font-size:0;height:6px;display:block}
  .web-footer .web-container{flex-direction:column;text-align:center}
  .web-section{padding:2.25rem 0}
}
"""
# Design tokens parsed from THEME_CSS :root block (no --web- prefix).
_THEME_TOKENS: dict[str, str] = {
    "accent": "#1e3a6e",
    "bg": "#ffffff",
    "border": "#e9e0d2",
    "cream": "#e1d3c1",
    "cream-2": "#f6ebd8",
    "muted": "#6b7280",
    "primary": "#0a224e",
    "primary-2": "#2f3a4b",
    "radius": "1rem",
    "text": "#2f3a4b",
}







def _wave(fill: str = "#ffffff") -> str:
    """The wavy separator used below the hero (taken from the scout theme)."""
    return (
        '<svg class="sc-wave" viewBox="0 0 500 74.16" preserveAspectRatio="none" '
        'aria-hidden="true"><path fill="' + fill + '" d="M500,200H0V173a281.09,281.09,0,'
        '0,1,89-14c34.3.27,52.92,7,75,11,85.69,15.67,118.55-27.92,205-27,30.2.32,75.43,6.17,'
        '131,35" transform="translate(0 -125.84)"></path></svg>'
    )


def _hero(badge: str, title: str, subtitle: str = "", *, slim: bool = False, buttons: str = "") -> str:
    cls = "web-hero slim" if slim else "web-hero"
    badge_html = f'<span class="web-hero-badge">{badge}</span>' if badge else ""
    sub_html = f'<p class="web-hero-sub">{subtitle}</p>' if subtitle else ""
    return (
        f'<section class="{cls}"><div class="web-container">{badge_html}'
        f'<h1 class="web-hero-title">{title}</h1>{sub_html}{buttons}</div>{_wave()}</section>'
    )


def _section_head(kicker: str, title: str, subtitle: str = "") -> str:
    sub = f'<p class="web-subtitle">{subtitle}</p>' if subtitle else ""
    return f'<div class="web-section-head"><span class="web-section-kicker">{kicker}</span><h2 class="web-title">{title}</h2>{sub}</div>'


# --------------------------------------------------------------------------
# Page-type templates (the "theme pack").
# --------------------------------------------------------------------------

DEFAULT_TEMPLATES: dict[str, dict] = {
    "main": {
        "name": "Hlavní stránka",
        "description": "Úvodní stránka oddílu: velká hlavička, představení, plánované akce a výzva.",
        "html": (
            _hero(
                "Skautský oddíl",
                "Společně zažijeme dobrodružství",
                "Výpravy, schůzky, tábory a parta, která drží pohromadě. Pojďte s námi do přírody!",
                buttons=(
                    '<a class="web-button" href="/kalendar">Plánované akce</a> '
                    '<a class="web-button outline" href="/o-nas">Kdo jsme</a>'
                ),
            )
            + '<section class="web-section"><div class="web-container">'
            + '<div class="web-row">'
            + '<div class="web-col"><div class="web-logo-card"><i class="fa-solid fa-fire"></i><span>Skaut</span></div></div>'
            + '<div class="web-col"><span class="web-section-kicker">Kdo jsme</span>'
            + '<h2 class="web-title">Oddíl, kde rosteš</h2>'
            + '<p class="web-text">Jsme oddíl skautů, kde se kluci a holky učí samostatnosti, spolupráci a lásce k přírodě. Scházíme se na schůzkách, jezdíme na výpravy a o prázdninách na tábor.</p>'
            + '<p class="web-text">Přijď se podívat – rádi tě mezi sebe vezmeme!</p>'
            + '<a class="web-button outline-dark" href="/o-nas">Více o nás</a>'
            + '</div></div></div></section>'
            + '<section class="web-section alt"><div class="web-container">'
            + _section_head("Co se u nás děje", "Plánované akce", "Výpravy, výlety a další dobrodružství, na která se můžeš těšit.")
            + f'<{COMPONENT_TAG} data-component="events_list"></{COMPONENT_TAG}>'
            + '</div></section>'
            + '<section class="web-section"><div class="web-container web-text-center">'
            + '<h2 class="web-title">Neváhej a přidej se k nám</h2>'
            + '<p class="web-subtitle">Stačí napsat a my se ozveme.</p>'
            + '<p style="margin-top:1.25rem"><a class="web-button" href="/kontakt">Napsat nám</a></p>'
            + '</div></section>'
        ),
        "css": "",
    },
    "about": {
        "name": "O oddílu",
        "description": "Představení oddílu: příběh, hodnoty a principy.",
        "html": (
            _hero(
                "O nás",
                "Kdo jsme a co nás baví",
                "Poznejte náš oddíl, naše hodnoty a lidi, kteří ho tvoří.",
                slim=True,
            )
            + '<section class="web-section"><div class="web-container">'
            + '<div class="web-row reverse">'
            + '<div class="web-col"><div class="web-logo-card"><i class="fa-solid fa-compass"></i><span>Naše cesta</span></div></div>'
            + '<div class="web-col"><span class="web-section-kicker">Náš příběh</span>'
            + '<h2 class="web-title">Ze střediska do přírody</h2>'
            + '<p class="web-text">Náš oddíl vznikl proto, aby měli kluci a holky prostor růst. Mnoho vedoucích kdysi začínalo jako členové a dnes se starají o další generaci.</p>'
            + '<p class="web-text">Skauting pro nás není jen kroužek – je to způsob, jak se naučit respektu, odpovědnosti a kamarádství.</p>'
            + '</div></div></div></section>'
            + '<section class="web-section alt"><div class="web-container">'
            + _section_head("Naše hodnoty", "Na čem stavíme", "Tři pilíře, které nás provázejí celý rok.")
            + '<div class="web-card-grid cols-2">'
            + '<div class="web-card web-feature-card"><div class="web-card-icon"><i class="fa-solid fa-hands-holding-circle"></i></div><h3>Přátelství</h3><p>Držíme spolu, pomáháme si a stavíme na vzájemné důvěře.</p></div>'
            + '<div class="web-card web-feature-card"><div class="web-card-icon"><i class="fa-solid fa-tree"></i></div><h3>Příroda</h3><p>Objevujeme lesy, hory i vody a učíme se v nich žít bezpečně a ohleduplně.</p></div>'
            + '<div class="web-card web-feature-card"><div class="web-card-icon"><i class="fa-solid fa-seedling"></i></div><h3>Růst</h3><p>Každý má šanci posunout se dál – po malých krůčcích i velkých výpravách.</p></div>'
            + '<div class="web-card web-feature-card"><div class="web-card-icon"><i class="fa-solid fa-fire"></i></div><h3>Tradice</h3><p>Vážíme si skautské historie a slibů, které platí dodnes.</p></div>'
            + '</div></div></section>'
        ),
        "css": "",
    },
    "news": {
        "name": "Novinky a akce",
        "description": "Seznam nadcházejících akcí a novinek z oddílu.",
        "html": (
            _hero(
                "Novinky",
                "Co se u nás děje",
                "Přehled akcí, výprav a událostí, na které se můžeš těšit.",
                slim=True,
            )
            + '<section class="web-section"><div class="web-container">'
            + _section_head("Plánované akce", "Kalendář dobrodružství")
            + f'<{COMPONENT_TAG} data-component="events_list"></{COMPONENT_TAG}>'
            + '</div></section>'
            + '<section class="web-section"><div class="web-container">'
            + _section_head("Novinky", "Nejnovější z oddílu")
            + f'<{COMPONENT_TAG} data-component="news_list" data-limit="6"></{COMPONENT_TAG}>'
            + '</div></section>'
        ),
        "css": "",
    },
    "group": {
        "name": "Stránka družiny",
        "description": "Schůzky a informace pro konkrétní družinu.",
        "html": (
            _hero(
                "Družina",
                "Naše družina",
                "Pravidelné schůzky, zážitky a plány naší družiny.",
                slim=True,
            )
            + '<section class="web-section"><div class="web-container">'
            + _section_head("Schůzky", "Kdy se scházíme", "Pravidelné schůzky probíhají v klubovně každý týden.")
            + f'<{COMPONENT_TAG} data-component="meetups"></{COMPONENT_TAG}>'
            + '</div></section>'
            + '<section class="web-section alt"><div class="web-container">'
            + _section_head("Co nás čeká", "Akce družiny")
            + f'<{COMPONENT_TAG} data-component="events_list"></{COMPONENT_TAG}>'
            + '</div></section>'
        ),
        "css": "",
    },
    "events": {
        "name": "Kalendář akcí",
        "description": "Měsíční kalendář s přehledem všech akcí a seznamem.",
        "html": (
            _hero(
                "Kalendář",
                "Přehled akcí",
                "Nadcházející schůzky, výpravy a další události na jednom místě.",
                slim=True,
            )
            + '<section class="web-section"><div class="web-container">'
            + f'<{COMPONENT_TAG} data-component="events_calendar"></{COMPONENT_TAG}>'
            + '</div></section>'
            + '<section class="web-section alt"><div class="web-container">'
            + _section_head("Všechny akce", "Seznam plánovaných událostí")
            + f'<{COMPONENT_TAG} data-component="events_list"></{COMPONENT_TAG}>'
            + '</div></section>'
        ),
        "css": "",
    },
    "gallery": {
        "name": "Galerie",
        "description": "Mřížka nahraných fotografií z knihovny médií.",
        "html": (
            _hero(
                "Galerie",
                "Naše fotky",
                "Chvíle z výprav, schůzek a táborů zachycené fotoaparátem.",
                slim=True,
            )
            + '<section class="web-section"><div class="web-container">'
            + _section_head("Galerie", "Fotografie z akcí")
            + f'<{COMPONENT_TAG} data-component="media_gallery"></{COMPONENT_TAG}>'
            + '</div></section>'
        ),
        "css": "",
    },
    "contact": {
        "name": "Kontakt",
        "description": "Kontaktní údaje oddílu a výzva k napsání.",
        "html": (
            _hero(
                "Kontakt",
                "Napište nám",
                "Máte dotaz, nebo se chcete přidat? Ozvěte se nám.",
                slim=True,
            )
            + '<section class="web-section"><div class="web-container">'
            + '<div class="web-contact-grid">'
            + '<div class="web-contact-card"><div class="web-card-icon"><i class="fa-solid fa-envelope"></i></div><h3>E-mail</h3><p>vedouci@oddil.cz</p></div>'
            + '<div class="web-contact-card"><div class="web-card-icon"><i class="fa-solid fa-location-dot"></i></div><h3>Klubovna</h3><p>Naše adresa 123<br>761 00 Zlín</p></div>'
            + '<div class="web-contact-card"><div class="web-card-icon"><i class="fa-solid fa-clock"></i></div><h3>Schůzky</h3><p>Každý pátek<br>17:00 – 18:30</p></div>'
            + '</div>'
            + '<div class="web-text-center" style="margin-top:2.5rem">'
            + '<h2 class="web-title">Přidej se k nám</h2>'
            + '<p class="web-subtitle">Stačí napsat a my se ti ozveme.</p>'
            + '<p style="margin-top:1.25rem"><a class="web-button" href="mailto:vedouci@oddil.cz">Napsat e-mail</a></p>'
            + '</div></div></section>'
        ),
        "css": "",
    },
    "blank": {
        "name": "Vlastní stránka",
        "description": "Čistá stránka pro vlastní obsah – postav si ji podle sebe.",
        "html": (
            _hero(
                "",
                "Nadpis stránky",
                "Sem vložte vlastní text, obrázky a webové prvky.",
                slim=True,
            )
            + '<section class="web-section"><div class="web-container">'
            + '<p class="web-text">Začněte upravovat – přetáhněte bloky z levého panelu, nahrajte obrázky a sestavte si stránku podle svého.</p>'
            + f'<{COMPONENT_TAG} data-component="events_list"></{COMPONENT_TAG}>'
            + '</div></section>'
        ),
        "css": "",
    },
}

# Default pages seeded on first enable so /site/main (menu link) and the public
# site homepage never 404.
DEFAULT_PAGES: list[dict] = [
    {
        "slug": "main",
        "title": "Hlavní stránka",
        "template": "main",
        "published": True,
    },
    {
        "slug": "news",
        "title": "Aktuality",
        "template": "news",
        "published": True,
    },
]
