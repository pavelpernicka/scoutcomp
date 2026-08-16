"""Central registration of all feature modules.

Both the main API (``app.main``) and the public site server (``app.site_app``)
register the same manifests so they agree on enabled modules, permissions and
web components.
"""
from .registry import ModuleManifest, registry
from ..routers import (
    activity,
    announcements,
    auth,
    completions,
    config,
    leaderboard,
    messages,
    modules,
    notifications,
    stat_categories,
    static_pages,
    tasks,
    teams,
    users,
    web,
    widgets,
)
from ..inventory import router as inventory_router
from ..routers import members
from ..web.data_sources import EVENTS_DATA_SOURCE, MEDIA_DATA_SOURCE, MENU_DATA_SOURCE, POSTS_DATA_SOURCE


def register_all_modules() -> None:
    if registry.get("core"):
        return
    registry.register(ModuleManifest("core", "Jádro", "Účty, družiny, kalendář, docházka a zprávy", "fa-house", "/",
        (("users.read", "Číst uživatele", "Zobrazit uživatele", False, ("team", "any")),
         ("posts.read", "Číst příspěvky", "Číst oddílové příspěvky a novinky", True, ("any",)),
         ("posts.manage", "Správa příspěvků", "Vytvářet a upravovat příspěvky oddílu", False, ("any",)),
         ("posts.publish", "Publikovat příspěvky", "Publikovat příspěvky na web", False, ("any",)),
         ("media.manage", "Správa médií", "Nahrávat a spravovat společná média", False, ("any",)),
         ("users.create", "Vytvářet uživatele", "Založit uživatele", False, ("any",)),
         ("users.edit", "Upravovat uživatele", "Změnit údaje uživatele", False, ("team", "any")),
         ("users.delete", "Mazat uživatele", "Odebrat uživatele", False, ("any",)),
         ("users.credentials.manage", "Správa přihlašování", "Měnit přihlašovací údaje a aktivaci účtů", False, ("any",)),
         ("members.read", "Číst členskou evidenci", "Zobrazit členskou evidenci a profily členů", False, ("team", "any")),
         ("members.edit", "Upravovat členskou evidenci", "Upravovat stav členství a značky", False, ("team", "any")),
         ("members.notes.manage", "Spravovat poznámky členů", "Přidávat a mazat interní poznámky členů", False, ("team", "any")),
         ("members.export", "Export členské evidence", "Exportovat členskou evidenci do CSV", False, ("team", "any")),
         ("avatar.manage", "Správa profilových fotek", "Měnit profilové fotky ostatních uživatelů", False, ("any",)),
         ("teams.manage", "Správa družin", "Spravovat družiny", False, ("any",)),
         ("access.manage", "Správa oprávnění", "Skupiny, granty a scope", False, ("any",)),
         ("modules.manage", "Správa modulů", "Instalovat a nastavovat moduly", False, ("any",)),
         ("messages", "Zprávy", "Posílat a číst soukromé zprávy", True, ("any",)),
         ("messages.override", "Zprávy navzdory blokaci", "Posílat zprávy i uživatelům, kteří je vypnuli", False, ("any",)),
         ("events.read", "Číst kalendář", "Číst schůzky a akce", True, ("any",)),
         ("events.create", "Vytvářet akce", "Vypisovat schůzky a výpravy", False, ("team", "any")),
         ("events.edit", "Upravovat akce", "Upravit akci", False, ("own", "team", "any")),
         ("events.delete", "Mazat akce", "Odstranit akci", False, ("own", "team", "any")),
         ("is_leader", "Vedoucí oddílu", "Vedoucí oddílu – vidí interní akce kalendáře", False, ("any",)),
         ("attendance.manage", "Docházka", "Vést docházku", False, ("team", "any")),
         ("notifications.send", "Posílat oznámení", "Posílat uživatelům soukromá oznámení", False, ("team", "any"))),
        widgets=({"id":"core.welcome", "component":"welcome", "title":"Vítej", "text":"Vítej v oddílovém systému.", "icon":"fa-house-user", "permission":None, "width":"col-12"},
                 {"id":"core.posts", "component":"posts", "title":"Příspěvky", "text":"Poslední novinky oddílu.", "route":"/posts", "icon":"fa-newspaper", "permission":"core.posts.read", "width":"col-12"},
                 {"id":"core.messages", "component":"messages", "title":"Zprávy", "text":"Soukromé zprávy a oznámení.", "icon":"fa-envelope", "permission":"core.messages", "width":"col-xl-6"},
                 {"id":"core.planned_events", "component":"planned_events", "title":"Plánované akce", "text":"Tvoje schůzky, výpravy a přihlášení.", "icon":"fa-calendar-check", "permission":"core.events.read", "width":"col-xl-5"},),
        # Posts and media are Core-owned content. The public CMS consumes
        # these declared sources but does not own their lifecycle.
        web_data_sources=(EVENTS_DATA_SOURCE, POSTS_DATA_SOURCE, MEDIA_DATA_SOURCE),
        menu=({"label":"Kalendář", "route":"/activity", "icon":"fa-calendar", "permission":"core.events.read"}, {"label":"Zprávy", "route":"/messages", "icon":"fa-envelope", "permission":"core.messages"}, {"label":"Příspěvky", "route":"/posts", "icon":"fa-newspaper", "permission":"core.posts.read"}),
        admin_menu=({"section":"Core", "label":"Nastavení", "route":"/admin/core/config", "permission":"core.modules.manage"}, {"section":"Core", "label":"Moduly", "route":"/admin/core/modules", "permission":"core.modules.manage"}, {"section":"Core", "label":"Nástěnka", "route":"/admin/core/widgets", "permission":"core.modules.manage"}, {"section":"Core", "label":"Družiny", "route":"/admin/core/teams", "permission":"core.teams.manage"}, {"section":"Core", "label":"Členská evidence", "route":"/admin/core/users", "permission":"core.members.read"}, {"section":"Core", "label":"Příspěvky", "route":"/admin/core/posts", "permission":"core.posts.manage"}, {"section":"Core", "label":"Média", "route":"/admin/core/media", "permission":"core.media.manage"}, {"section":"Core", "label":"Oprávnění", "route":"/admin/core/access", "permission":"core.access.manage"}, {"section":"Core", "label":"Docházka", "route":"/admin/core/attendance", "permission":"core.attendance.manage"}), routers=(auth.router, users.router, members.router, teams.router, notifications.router, config.router, config.admin_router, messages.router, modules.router, modules.admin_router, widgets.router, widgets.admin_router, activity.router, activity.admin_router)))
    registry.register(ModuleManifest("competitions", "Soutěže", "Úkoly, plnění, výsledky a týmy", "fa-trophy", "/tasks",
        (("participate", "Účast v soutěži", "Plnit soutěžní úkoly", True, ("any",)), ("tasks.manage", "Správa úkolů", "Vytvářet a upravovat úkoly", False, ("any",)), ("approvals.audit", "Audit splnění", "Schvalovat a auditovat plnění", False, ("team", "any")), ("statistics.read", "Statistiky", "Číst soutěžní statistiky", False, ("any",)), ("rules.manage", "Správa pravidel", "Upravovat pravidla a statické stránky", False, ("any",)), ("announcements.manage", "Správa ohlášek", "Spravovat soutěžní ohlášky", False, ("team", "any"))),
        menu=({"label":"Úkoly", "route":"/tasks", "icon":"fa-list-check", "permission":"competitions.participate"}, {"label":"Žebříček", "route":"/leaderboard", "icon":"fa-ranking-star", "permission":"competitions.participate"}, {"label":"Pravidla", "route":"/rules", "icon":"fa-book-open", "permission":"competitions.participate"}),
        admin_menu=({"section":"Soutěže", "label":"Schvalování", "route":"/admin/competition/approvals", "permission":"competitions.approvals.audit"}, {"section":"Soutěže", "label":"Audit splnění", "route":"/admin/competition/audit", "permission":"competitions.approvals.audit"}, {"section":"Soutěže", "label":"Správa úkolů", "route":"/admin/competition/tasks", "permission":"competitions.tasks.manage"}, {"section":"Soutěže", "label":"Statistiky", "route":"/admin/competition/stats", "permission":"competitions.statistics.read"}, {"section":"Soutěže", "label":"Ohlášky", "route":"/admin/competition/announcements", "permission":"competitions.announcements.manage"}),
        widgets=({"id":"competitions.welcome", "component":"welcome", "title":"Vítej", "text":"Vítej v soutěži – přehled tvých bodů.", "icon":"fa-trophy", "permission":"competitions.participate", "width":"col-12", "stats": True}, {"id":"competitions.tasks", "component":"link", "title":"Soutěžní úkoly", "text":"Aktivní úkoly a vlastní postup v soutěži.", "route":"/tasks", "icon":"fa-list-check", "permission":"competitions.participate", "width":"col-md-6 col-xl-3"}, {"id":"competitions.leaderboard", "component":"link", "title":"Žebříček", "text":"Porovnání výsledků družin a účastníků.", "route":"/leaderboard", "icon":"fa-ranking-star", "permission":"competitions.participate", "width":"col-md-6 col-xl-3"}, {"id":"competitions.activity", "component":"activity", "title":"Aktivita družiny", "text":"Nejnovější splněné úkoly tvé družiny.", "icon":"fa-chart-line", "permission":"competitions.participate", "width":"col-xl-4"}, {"id":"competitions.progress", "component":"progress", "title":"Jak se ti daří", "text":"Tvůj postup a splněné úkoly v soutěži.", "icon":"fa-bolt", "permission":"competitions.participate", "width":"col-xl-4"}, {"id":"competitions.announcements", "component":"announcements", "title":"Ohlášky", "text":"Soutěžní ohlášky pro tvou družinu.", "icon":"fa-bullhorn", "permission":"competitions.participate", "width":"col-12"}), routers=(tasks.router, completions.router, leaderboard.router, announcements.router, stat_categories.router, static_pages.router), dependencies=("core",)))
    registry.register(ModuleManifest("inventory", "Sklad", "Evidence a výdej oddílového vybavení", "fa-boxes-stacked", "/inventory",
        (("read", "Prohlížet sklad", "Číst evidenci skladu", False, ("team", "any")),
         ("manage", "Správa skladu", "Měnit skladovou evidenci", False, ("team", "any")),
         ("items.read", "Čtení položek", "Prohlížet skladové položky", False, ("team", "any")),
         ("items.manage", "Správa položek", "Vytvářet, upravovat a mazat položky", False, ("team", "any")),
         ("loans.manage", "Výpůjčky", "Půjčovat a přijímat vybavení", False, ("team", "any")),
         ("locations.manage", "Správa lokací", "Spravovat lokace", False, ("team", "any")),
         ("categories.manage", "Správa kategorií", "Spravovat kategorie", False, ("team", "any")),
         ("flags.manage", "Správa flagů", "Spravovat flagy", False, ("team", "any")),
         ("templates.manage", "Správa štítků", "Spravovat šablony a generovat štítky", False, ("team", "any"))),
         menu=({"label":"Věci", "route":"/inventory/items", "icon":"fa-box-open", "permission":"inventory.read"}, {"label":"Vypůjčky", "route":"/inventory/loans", "icon":"fa-handshake-angle", "permission":"inventory.read"}, {"label":"Skener", "route":"/inventory/scanner", "icon":"fa-qrcode", "permission":"inventory.read"}, {"label":"Nastavení skladu", "route":"/inventory/settings", "icon":"fa-sliders", "permission":"inventory.manage"}), routers=(inventory_router,), dependencies=("core",)))
    registry.register(ModuleManifest("web", "Webové stránky", "Vizuální CMS a veřejný web", "fa-globe", "/admin/web/pages",
        (("manage", "Správa webu", "Úplná správa CMS", False, ("any",)),
         ("pages.manage", "Správa stránek", "Vytvářet a upravovat stránky", False, ("any",)),
         ("posts.manage", "Správa příspěvků", "Vytvářet a upravovat příspěvky", False, ("any",)),
         ("media.manage", "Správa médií", "Nahrávat a spravovat média", False, ("any",)),
         ("menus.manage", "Správa menu", "Vytvářet a upravovat menu", False, ("any",)),
         ("design.manage", "Správa designu", "Spravovat vizuální obsah a globální styly", False, ("any",)),
         ("templates.manage", "Správa šablon", "Spravovat šablony a části šablon", False, ("any",)),
         ("themes.manage", "Správa motivů", "Instalovat, aktivovat a odebírat motivy", False, ("any",)),
         ("publish", "Publikování webu", "Publikovat stránky a design webu", False, ("any",)),
         ("settings.manage", "Nastavení webu", "Měnit veřejná nastavení webu", False, ("any",))),
        admin_menu=({"section":"Web", "label":"Stránky", "route":"/admin/web/pages", "permission":"web.pages.manage"},),
        web_data_sources=(MENU_DATA_SOURCE,),
        routers=(web.router,), dependencies=("core",)))
