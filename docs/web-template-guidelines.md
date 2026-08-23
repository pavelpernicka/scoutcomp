# Pokyny pro tvorbu webových šablon (ScoutComp CMS)

Tyto pokyny popisují, jak vytvářet šablony, části šablon, sekce, vzory a komponenty pro webový modul ScoutComp.

## 1. Principy

- **Data nejsou prezentace.** Moduly poskytují veřejné datové zdroje, nikoliv hotové vizuální komponenty. Vizuální vzhled vytváří šablona pomocí obecných prvků (text, nadpis, odkaz, kontejner, mřížka, podmínka, opakovač).
- **GrapesJS Project Data je zdroj pravdy.** Editor ukládá serializovatelný projekt (JSON). Vygenerované HTML/CSS je odvozené a nesmí být zdrojem pravdy.
- **Veřejné vykreslování nesmí spouštět kód.** Žádný Python, JavaScript ani šablony s libovolnými výrazy. Povolené jsou pouze deklarativní bindingy, opakovače, podmínky, prázdné stavy a odkazy na části šablony.
- **Publikovaná verze je neměnná.** Koncept, revize a publikovaná verze jsou oddělené. Publikování je atomické.
- **Struktura je hierarchická.** Primární prvek, opakovaně použitelná komponenta, sekce, vzor, část šablony a kompletní šablona mají rozdílnou sémantiku.

## 2. Struktura balíčku (téma)

Při distribuci tématu jako `.zip`:

```
theme.zip
  manifest.json        # metadata, schema version, resources
  theme.json           # design tokeny, výchozí styly
  templates/page.json
  templates/home.json
  parts/header.json
  components/event-card.json
  sections/hero.json
  patterns/intro.json
  styles/theme.css
  assets/logo.svg
  previews/preview.png
```

`manifest.json` musí obsahovat: `schema_version`, `id`, `name`, `version`, `author`, `description` (volitelně `license`, `resources`). Každý zdroj patří do svého jmenného prostoru (`templates/`, `parts/`, atd.) a má stabilní `id`.

### Nastavení a editor vlastněné tématem

Téma samo určuje, která nastavení a které specializované ovládací prvky editor zobrazí. Aplikace poskytuje jen obecné, bezpečné vykreslení deklarovaného schématu:

- `config` definuje nastavení tématu (`text`, `number`, `color`, `select`, `checkbox` a `media`). Běžné hodnoty se ukládají jako design tokeny. Povolené sdílené nastavení, například `site_logo`, může použít `storage: "site_setting"`.
- `editor.component_controls` mapuje jednoduchý matcher tagů/tříd/atributů na pole v panelu Obsah. Pole se vážou na styl, atribut, volbu/toggle třídy nebo médium.
- `editor.blocks` doplňuje katalog prvků tématu. Složitější znovupoužitelné prvky a sekce patří přednostně do `resources.components` a `resources.sections`.
- `editor.font_sets` definuje nabídku písem aktivního tématu.

```json
{
  "config": {
    "primary_color": {"type": "color", "label": "Hlavní barva", "default": "#255c9e"},
    "site_logo": {"type": "media", "label": "Logo", "storage": "site_setting", "default": ""}
  },
  "editor": {
    "component_controls": [{
      "id": "alert-variant",
      "label": "Vzhled upozornění",
      "match": {"all_classes": ["alert"]},
      "fields": [{
        "id": "variant",
        "label": "Varianta",
        "type": "select",
        "options": [
          {"value": "info", "label": "Info", "class_name": "alert-info"},
          {"value": "warning", "label": "Varování", "class_name": "alert-warning"}
        ],
        "bind": {"kind": "class_choice"}
      }]
    }]
  }
}
```

Balíček nemůže dodat JavaScript ani serverový kód. To není omezení vzhledu: interakce editoru vznikají z uvedeného schématu a veřejné chování z podporovaných sémantických prvků. Zůstává tak přenositelné, validovatelné a bezpečné i téma nahrané méně důvěryhodným správcem.

## 3. Deklarativní primitiva

Používejte obecné typy prvků:

- `container`, `text`, `heading`, `link`, `image`, `button`, `columns`/grid, `divider`, `spacer`, sémantické HTML.
- `sc-bind` – navázání pole na obsah nebo atribut (`text`, `href`, `src`, `alt`, `datetime`, `style.*`).
- `sc-repeat` – opakování kolekce datového zdroje.
- `sc-condition` – zobrazení podstromu podle strukturované podmínky (žádné libovolné výrazy).
- `sc-empty` / `empty` v opakovači – obsah pro prázdnou kolekci.
- `sc-template-part` – odkaz na propojenou část šablony.
- `sc-slot` – slot obsahu stránky uvnitř šablony.

Příklad opakovače:

```json
{
  "type": "sc-repeat",
  "source": "web.posts",
  "params": {"limit": 3},
  "components": [
    {
      "type": "heading",
      "tagName": "h3",
      "scBindings": {"text": {"scope": "context", "field": "title"}}
    }
  ],
  "empty": [{"type": "text", "tagName": "p", "content": "Žádné novinky."}]
}
```

## 4. Datové zdroje

Seznam dostupných zdrojů získáte z API `GET /web/data-sources`. Povolené zdroje v základu: `web.posts`, `web.menu`, `web.media`, `core.events`. Používejte výhradně pole deklarovaná ve zdroji; každý zdroj povoluje jen bezpečné veřejné pole.

## 5. Design tokeny a styly

- Tokeny definujte v `theme.json` (`tokens` / `default_tokens`) nebo v globálních stylech.
- Používejte CSS custom properties (`--sc-colors-primary`, `--sc-typography-font-family`, `--sc-spacing-md`, `--sc-radius-card`, `--sc-container-width`).
- Neukládejte jeden obří CSS blob. Oddělte základní styly tématu, globální přepsání tokenů, styly šablony/komponenty a styly stránky.
- Všechny barvy, fonty a rozměry procházejí bezpečnostní validací rendereru.

## 6. Bezpečnost a omezení

- Není povolen libovolný kód, skripty, hooky ani URL s `javascript:`.
- Šablony a styly se validují při instalaci i publikaci.
- Názvy tříd a ID musí odpovídat omezené množině znaků.
- CSS `@import`, `expression()`, `behavior:` a nebezpečné selektory jsou zakázány.
- Archivy témat jsou důvěřivě omezené: maximální velikost, kontrola zip-slip, symlinků, absolutních cest a typů souborů.

## 7. Konvence pojmenování

- `key`/`id` malými písmeny, pomlčkami (`scout-default`, `site-header`).
- Názvy komponent a sekcí: `PascalCase` pro viditelný název, `kebab-case` pro technický klíč.
- Třídy ve veřejném CSS: `web-` prefix pro projektové styly, případně `theme-` pro styly tématu.

## 8. Náhledové obrázky

- U témat umístěte náhled do `previews/preview.png` (nebo `.jpg`).
- U návrhových zdrojů (šablony, komponenty, sekce, vzory, části) nastavte `preview_media_id` odkazující na obrázek v knihovně médií. Náhled se zobrazuje v katalogu a editoru.

## 9. Publikování

- Šablona a část šablony mají vlastní publikační verzi. Stránka odkazuje na konkrétní publikovanou šablonu.
- Změna části šablony se projeví na všech stránkách, které ji používají, až po jejím publikování.
- Publikování stránky je atomické; selhání kompilace nikdy nepoškodí aktuálně publikovaný obsah.

## 10. Vzorové postupy

1. V editoru vytvořte stránku a vyberte šablonu `scout-default`.
2. Pro opakovaně použitelný blok vytvořte komponentu nebo sekci, publikujte ji a vkládejte ji z katalogu.
3. Pro sdílenou hlavičku/patičku vytvořte část šablony a vložte ji přes `sc-template-part`.
4. Dynamický seznam vytvořte vložením `sc-repeat` na datový zdroj, přidejte bindingy a prázdný stav.
5. Po úpravě ověřte náhled v editoru a teprve pak publikujte stránku.
