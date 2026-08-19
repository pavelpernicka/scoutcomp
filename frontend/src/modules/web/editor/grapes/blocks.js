import { BLOCK_CATEGORIES, SC_COMPONENT_TYPES } from "./constants";

const safeId = (value) => String(value || "unknown").replace(/[^a-zA-Z0-9_-]/g, "-");

const BLOCK_ICONS = {
  "sc-container": "fa-window-maximize",
  "sc-box": "fa-square",
  "sc-section": "fa-layer-group",
  "sc-columns": "fa-columns",
  "sc-flex": "fa-arrows-left-right-to-line",
  "sc-grid": "fa-table-cells-large",
  "sc-text": "fa-paragraph",
  "sc-rich-text": "fa-align-left",
  "sc-heading": "fa-heading",
  "sc-link": "fa-link",
  "sc-image": "fa-image",
  "sc-figure": "fa-images",
  "sc-button": "fa-hand-pointer",
  "sc-divider": "fa-minus",
  "sc-spacer": "fa-arrows-up-down",
  "sc-unordered-list": "fa-list-ul",
  "sc-ordered-list": "fa-list-ol",
  "sc-list-item": "fa-list",
  "sc-table": "fa-table",
  "sc-semantic-article": "fa-newspaper",
  "sc-semantic-header": "fa-window-maximize",
  "sc-semantic-footer": "fa-window-minimize",
  "sc-semantic-main": "fa-square-poll-horizontal",
  "sc-semantic-nav": "fa-bars",
  "sc-semantic-aside": "fa-table-columns",
  "sc-bind": "fa-code",
  "sc-repeat": "fa-repeat",
  "sc-pagination": "fa-ellipsis",
  "sc-condition": "fa-code-branch",
  "sc-empty": "fa-box-open",
  "sc-menu": "fa-bars",
  "sc-calendar": "fa-calendar-days",
  "sc-fa-icon": "fa-icons",
  "sc-organic-edge": "fa-water",
  "sc-photo-mask": "fa-fill-drip",
  "bs-alert": "fa-circle-info",
  "bs-badge": "fa-tag",
  "bs-breadcrumb": "fa-angles-right",
  "bs-card": "fa-id-card",
  "bs-button-group": "fa-ellipsis",
  "bs-list-group": "fa-list",
  "bs-accordion": "fa-chevron-down",
  "bs-pagination": "fa-ellipsis-h",
  "bs-table-responsive": "fa-table",
  "bs-ratio": "fa-display",
  "bs-progress": "fa-bars-progress",
  "bs-callout": "fa-bullhorn",
  "layout-single": "fa-square",
  "layout-reading": "fa-align-left",
  "layout-two-equal": "fa-columns",
  "layout-sidebar-right": "fa-table-columns",
  "layout-three": "fa-table-cells-large",
  "layout-media-split": "fa-photo-film",
  "layout-sticky-aside": "fa-thumbtack",
  "layout-photo-cta": "fa-image",
  "layout-collage-2-1": "fa-table-cells-large",
  "layout-media-alternating": "fa-shuffle",
  "layout-contact-split": "fa-address-card",
  "block-section-heading": "fa-heading",
  "block-cta-pair": "fa-hand-pointer",
  "block-icon-text": "fa-icons",
  "block-quote": "fa-quote-left",
  "block-contact-item": "fa-address-card",
  "block-person": "fa-user",
  "block-media-text": "fa-photo-film",
  "block-hero": "fa-panorama",
  "block-social-icon": "fa-hashtag",
  "block-social-links": "fa-share-nodes",
  "block-contact-hero": "fa-address-book",
  "block-organic-photo": "fa-image-portrait",
  "block-portrait-quote": "fa-quote-left",
  "block-colored-cta": "fa-bullhorn",
  "block-contact-row": "fa-address-book",
};

const withBlockIcons = (blocks) => blocks.map((block) => ({
  ...block,
  media: block.media || `<i class="fas ${BLOCK_ICONS[block.id] || "fa-cube"}" aria-hidden="true"></i>`,
}));

const text = (content) => ({ type: "text", tagName: "p", content });
const heading = (content, tagName = "h2") => ({ type: "text", tagName, content });
const sampleCopy = (translate) => [
  heading(translate("web.editor.placeholder.heading")),
  text(translate("web.editor.placeholder.text")),
];
const STRUCTURE_NAMES = Object.freeze({
  container: "Container",
  box: "Box",
  section: "Section",
  columns: "Columns",
  flex: "Flex",
  grid: "Grid",
  article: "Article",
  header: "Header",
  footer: "Footer",
  main: "Main",
  nav: "Navigation",
  aside: "Aside",
});
const bind = (field) => ({
  type: SC_COMPONENT_TYPES.bind,
  binding: { scope: "context", field },
  bindingField: field,
  mode: "text",
});

const cardStyle = {
  overflow: "hidden",
  border: "1px solid #dce1e8",
  borderRadius: "10px",
  background: "#fff",
  boxShadow: "0 3px 14px rgba(15,23,42,.08)",
};

const cardImage = (field, altField) => ({
  type: "image",
  tagName: "img",
  attributes: { alt: "", loading: "lazy" },
  style: { display: "block", width: "100%", height: "180px", objectFit: "cover", backgroundColor: "#eef1f4" },
  scBindings: {
    src: { scope: "context", field },
    alt: { scope: "context", field: altField },
  },
});

const linkedText = (tagName, field, extra = {}) => ({
  type: "default",
  tagName,
  ...extra,
  components: [bind(field)],
});

const linkButton = (field, label) => ({
  type: "link",
  attributes: { href: "#", class: "sc-button" },
  content: label,
  scBindings: { href: { scope: "context", field } },
});

const specialDataCard = (source, translate) => {
  if (source.id === "core.teams") return {
    type: SC_COMPONENT_TYPES.repeat,
    source: source.id,
    params: { limit: 6 },
    components: [{ type: "default", tagName: "article", name: translate("web.editor.data.teamCard"), style: cardStyle,
      components: [
        cardImage("logo_url", "name"),
        { type: "default", tagName: "div", style: { padding: "18px" }, components: [
          linkedText("h3", "name", { style: { margin: "0 0 8px" } }),
          linkedText("p", "description", { style: { margin: "0 0 14px", color: "#536070" } }),
          linkButton("url", translate("web.editor.data.teamOpen")),
        ] },
      ],
    }],
    empty: [{ type: SC_COMPONENT_TYPES.empty }],
  };
  if (source.id === "core.posts") return {
    type: SC_COMPONENT_TYPES.repeat,
    source: source.id,
    params: { limit: 6, page: { $scBinding: { scope: "page", field: "query.page" } } },
    components: [{ type: "default", tagName: "article", name: translate("web.editor.data.postCard"), style: cardStyle,
      components: [
        cardImage("cover_url", "title"),
        { type: "default", tagName: "div", style: { padding: "18px" }, components: [
          linkedText("h3", "title", { style: { margin: "0 0 8px" } }),
          linkedText("p", "excerpt", { style: { margin: "0 0 14px", color: "#536070" } }),
          linkButton("url", translate("web.editor.data.postOpen")),
        ] },
      ],
    }],
    empty: [{ type: SC_COMPONENT_TYPES.empty }],
  };
  if (source.id === "core.events") return {
    type: SC_COMPONENT_TYPES.repeat,
    source: source.id,
    params: { limit: 6, kind: "meeting" },
    components: [{ type: "default", tagName: "article", name: translate("web.editor.data.meetingCard"), style: cardStyle,
      components: [{ type: "default", tagName: "div", style: { padding: "18px" }, components: [
        linkedText("p", "start_at", { style: { margin: "0 0 6px", color: "#657187", fontSize: "14px" }, scBindings: { datetime: { scope: "context", field: "start_at" } } }),
        linkedText("h3", "title", { style: { margin: "0 0 8px" } }),
        linkedText("p", "description", { style: { margin: "0", color: "#536070" } }),
        linkButton("url", translate("web.editor.data.meetingOpen")),
      ] }],
    }],
    empty: [{ type: SC_COMPONENT_TYPES.empty }],
  };
  return null;
};

export function createPrimitiveBlocks(translate = (key) => key) {
  const category = translate(BLOCK_CATEGORIES.primitives);
  const structure = translate(BLOCK_CATEGORIES.structure);
  const layouts = "Layouts";
  const blocks = "Blocks";
  return withBlockIcons([
    {
      id: "sc-container",
      label: STRUCTURE_NAMES.container,
      category: structure,
      content: { type: "default", tagName: "div", name: STRUCTURE_NAMES.container, attributes: { class: "container" }, components: sampleCopy(translate) },
    },
    {
      id: "sc-box",
      label: STRUCTURE_NAMES.box,
      category: structure,
      content: { type: "default", tagName: "div", name: STRUCTURE_NAMES.box, attributes: { class: "p-4 border bg-white" }, components: sampleCopy(translate) },
    },
    {
      id: "sc-section",
      label: STRUCTURE_NAMES.section,
      category: structure,
      content: { type: "default", tagName: "section", name: STRUCTURE_NAMES.section, attributes: { class: "py-5" }, components: [
        { type: "default", tagName: "div", name: STRUCTURE_NAMES.container, attributes: { class: "container" }, components: sampleCopy(translate) },
      ] },
    },
    {
      id: "sc-columns",
      label: STRUCTURE_NAMES.columns,
      category: structure,
      content: {
        type: "default",
        tagName: "div",
        name: STRUCTURE_NAMES.columns,
        attributes: { class: "sc-layout-columns" },
        components: [
          { type: "default", tagName: "div", components: [text(translate("web.editor.placeholder.column"))] },
          { type: "default", tagName: "div", components: [text(translate("web.editor.placeholder.column"))] },
        ],
      },
    },
    {
      id: "sc-flex",
      label: STRUCTURE_NAMES.flex,
      category: structure,
      content: {
        type: "default",
        tagName: "div",
        name: STRUCTURE_NAMES.flex,
        style: { display: "flex", gap: "1rem", "align-items": "stretch" },
        components: [
          { type: "default", tagName: "div", components: [text(translate("web.editor.placeholder.item"))] },
          { type: "default", tagName: "div", components: [text(translate("web.editor.placeholder.item"))] },
        ],
      },
    },
    {
      id: "sc-grid",
      label: STRUCTURE_NAMES.grid,
      category: structure,
      content: {
        type: "default",
        tagName: "div",
        name: STRUCTURE_NAMES.grid,
        style: { display: "grid", "grid-template-columns": "repeat(2, minmax(0, 1fr))", gap: "1rem" },
        components: [
          { type: "default", tagName: "div", components: [text(translate("web.editor.placeholder.item"))] },
          { type: "default", tagName: "div", components: [text(translate("web.editor.placeholder.item"))] },
        ],
      },
    },
    {
      id: "layout-single", label: "Single Column", category: layouts,
      content: { type: "default", tagName: "div", name: "Single Column", attributes: { class: "container py-5" }, components: sampleCopy(translate) },
    },
    {
      id: "layout-reading", label: "Reading Width", category: layouts,
      content: { type: "default", tagName: "article", name: "Reading Width", attributes: { class: "container py-5" }, style: { maxWidth: "46rem" }, components: sampleCopy(translate) },
    },
    {
      id: "layout-two-equal", label: "Two Columns 1/2", category: layouts,
      content: { type: "default", tagName: "div", name: "Two Columns", attributes: { class: "container py-5" }, components: [
        { type: "default", tagName: "div", attributes: { class: "row g-4" }, components: [
          { type: "default", tagName: "div", name: "Column", attributes: { class: "col-md-6" }, components: sampleCopy(translate) },
          { type: "default", tagName: "div", name: "Column", attributes: { class: "col-md-6" }, components: sampleCopy(translate) },
        ] },
      ] },
    },
    {
      id: "layout-sidebar-right", label: "Sidebar Right", category: layouts,
      content: { type: "default", tagName: "div", name: "Sidebar Right", attributes: { class: "container py-5" }, components: [
        { type: "default", tagName: "div", attributes: { class: "row g-5" }, components: [
          { type: "default", tagName: "main", name: "Main content", attributes: { class: "col-lg-8" }, components: sampleCopy(translate) },
          { type: "default", tagName: "aside", name: "Sidebar", attributes: { class: "col-lg-4" }, components: sampleCopy(translate) },
        ] },
      ] },
    },
    {
      id: "layout-three", label: "Three Columns", category: layouts,
      content: { type: "default", tagName: "div", name: "Three Columns", attributes: { class: "container py-5" }, components: [
        { type: "default", tagName: "div", attributes: { class: "row g-4" }, components: [1, 2, 3].map(() => ({
          type: "default", tagName: "div", name: "Column", attributes: { class: "col-md-4" }, components: sampleCopy(translate),
        })) },
      ] },
    },
    {
      id: "layout-media-split", label: "Media Split", category: layouts,
      content: { type: "default", tagName: "section", name: "Media Split", attributes: { class: "container py-5" }, components: [
        { type: "default", tagName: "div", attributes: { class: "row g-5 align-items-center" }, components: [
          { type: "default", tagName: "div", name: "Media", attributes: { class: "col-md-6" }, components: [{ type: "image", attributes: { class: "img-fluid", alt: "" } }] },
          { type: "default", tagName: "div", name: "Content", attributes: { class: "col-md-6" }, components: sampleCopy(translate) },
        ] },
      ] },
    },
    {
      id: "layout-sticky-aside", label: "Content + Sticky Aside", category: layouts,
      content: { type: "default", tagName: "div", name: "Content + Sticky Aside", attributes: { class: "container py-5" }, components: [
        { type: "default", tagName: "div", attributes: { class: "row g-5" }, components: [
          { type: "default", tagName: "main", name: "Main content", attributes: { class: "col-lg-8" }, components: sampleCopy(translate) },
          { type: "default", tagName: "aside", name: "Sticky aside", attributes: { class: "col-lg-4" }, style: { position: "sticky", top: "6rem" }, components: sampleCopy(translate) },
        ] },
      ] },
    },
    {
      id: "layout-photo-cta", label: translate("web.editor.block.photoCta"), category: layouts,
      content: {
        type: "default",
        tagName: "section",
        name: translate("web.editor.block.photoCta"),
        attributes: {
          class: "ontario-contact-hero sc-edge-soft sc-edge-bottom sc-edge-white",
          "data-sc-overlay": "true",
          "aria-label": "Výzva s fotografií",
        },
        components: [
          { type: "default", tagName: "div", attributes: { class: "ontario-photo-mask", "aria-hidden": "true" } },
          { type: "default", tagName: "div", attributes: { class: "container ontario-contact-hero-content" }, components: [
            heading("ZAŽIJTE DOBRODRUŽSTVÍ", "h2"),
            text("Přijďte se podívat na schůzku a poznejte náš oddíl."),
            { type: "link", attributes: { class: "btn btn-warning btn-lg mt-3", href: "#" }, components: [
              { type: "text", tagName: "span", content: "Chci přijít" },
              { type: "default", tagName: "i", attributes: { class: "fa-solid fa-arrow-right sc-button-icon-right", "data-sc-button-icon": "true", "aria-hidden": "true" } },
            ] },
          ] },
        ],
      },
    },
    {
      id: "layout-collage-2-1", label: translate("web.editor.block.collage21"), category: layouts,
      content: { type: "default", tagName: "section", name: translate("web.editor.block.collage21"), attributes: { class: "container py-5", "aria-label": "Fotografická koláž" }, components: [
        { type: "default", tagName: "div", attributes: { class: "row g-3" }, components: [
          { type: "default", tagName: "div", attributes: { class: "col-md-8" }, components: [
            { type: "default", tagName: "figure", attributes: { class: "m-0 h-100" }, components: [{ type: "image", attributes: { class: "img-fluid w-100 h-100 sc-shape-soft", alt: "Skauti při společném programu", loading: "lazy" }, style: { objectFit: "cover", minHeight: "24rem" } }] },
          ] },
          { type: "default", tagName: "div", attributes: { class: "col-md-4 d-grid gap-3" }, components: [
            { type: "default", tagName: "figure", attributes: { class: "m-0" }, components: [{ type: "image", attributes: { class: "img-fluid w-100 sc-shape-rounded", alt: "Detail z oddílové výpravy", loading: "lazy" }, style: { aspectRatio: "4 / 3", objectFit: "cover" } }] },
            { type: "default", tagName: "figure", attributes: { class: "m-0" }, components: [{ type: "image", attributes: { class: "img-fluid w-100 sc-shape-blob", alt: "Skautská hra v přírodě", loading: "lazy" }, style: { aspectRatio: "4 / 3", objectFit: "cover" } }] },
          ] },
        ] },
      ] },
    },
    {
      id: "layout-media-alternating", label: translate("web.editor.block.mediaAlternating"), category: layouts,
      content: { type: "default", tagName: "section", name: translate("web.editor.block.mediaAlternating"), attributes: { class: "container py-5" }, components: [
        { type: "default", tagName: "article", attributes: { class: "row g-5 align-items-center mb-5" }, components: [
          { type: "default", tagName: "div", attributes: { class: "col-md-6" }, components: [{ type: "image", attributes: { class: "img-fluid sc-shape-soft", alt: "Výprava oddílu do přírody", loading: "lazy" } }] },
          { type: "default", tagName: "div", attributes: { class: "col-md-6" }, components: [heading("VÝPRAVY", "h2"), text("Společně objevujeme nová místa a učíme se samostatnosti.")] },
        ] },
        { type: "default", tagName: "article", attributes: { class: "row g-5 align-items-center" }, components: [
          { type: "default", tagName: "div", attributes: { class: "col-md-6 order-md-2" }, components: [{ type: "image", attributes: { class: "img-fluid sc-shape-blob", alt: "Skauti spolupracují při programu", loading: "lazy" } }] },
          { type: "default", tagName: "div", attributes: { class: "col-md-6 order-md-1" }, components: [heading("TÝMOVÁ SPOLUPRÁCE", "h2"), text("Každý dostane prostor přispět a rozvíjet své silné stránky.")] },
        ] },
      ] },
    },
    {
      id: "layout-contact-split", label: translate("web.editor.block.contactSplit"), category: layouts,
      content: { type: "default", tagName: "section", name: translate("web.editor.block.contactSplit"), attributes: { class: "container py-5" }, components: [
        { type: "default", tagName: "div", attributes: { class: "row g-5 align-items-stretch" }, components: [
          { type: "default", tagName: "div", attributes: { class: "col-lg-6" }, components: [
            heading("KDE NÁS NAJDETE", "h2"), text("Ozvěte se nám nebo se zastavte na pravidelné schůzce."),
            { type: "default", tagName: "address", attributes: { class: "d-grid gap-3 mt-4" }, components: [
              { type: "default", tagName: "div", attributes: { class: "d-flex gap-3" }, components: [{ type: "default", tagName: "i", attributes: { class: "fa-solid fa-location-dot", "aria-hidden": "true" } }, text("Klubovna oddílu, Zlín")] },
              { type: "link", attributes: { href: "mailto:oddil@example.cz" }, content: "oddil@example.cz" },
              { type: "link", attributes: { href: "tel:+420123456789" }, content: "+420 123 456 789" },
            ] },
          ] },
          { type: "default", tagName: "figure", attributes: { class: "col-lg-6 m-0" }, components: [{ type: "image", attributes: { class: "img-fluid w-100 h-100 sc-shape-rounded", alt: "Klubovna a místo schůzek oddílu", loading: "lazy" }, style: { objectFit: "cover", minHeight: "20rem" } }] },
        ] },
      ] },
    },
    { id: "sc-text", label: translate("web.editor.block.text"), category, content: text(translate("web.editor.placeholder.text")) },
    { id: "sc-rich-text", label: translate("web.editor.block.richText"), category, content: { type: "default", tagName: "div", name: translate("web.editor.block.richText"), components: [{ type: "text", tagName: "p", content: translate("web.editor.placeholder.richText") }] } },
    {
      id: "sc-heading",
      label: translate("web.editor.block.heading"),
      category,
      content: { type: "text", tagName: "h2", content: translate("web.editor.placeholder.heading") },
    },
    {
      id: "sc-link",
      label: translate("web.editor.block.link"),
      category,
      content: { type: "link", content: translate("web.editor.placeholder.link"), attributes: { href: "#" } },
    },
    {
      id: "sc-image",
      label: translate("web.editor.block.image"),
      category,
      content: { type: "image", attributes: { alt: "" } },
      activate: true,
      select: true,
    },
    {
      id: "sc-figure",
      label: translate("web.editor.block.figure"),
      category,
      content: {
        type: "default",
        tagName: "figure",
        name: translate("web.editor.block.figure"),
        components: [
          { type: "image", attributes: { alt: "" } },
          { type: "text", tagName: "figcaption", content: translate("web.editor.placeholder.caption") },
        ],
      },
    },
    {
      id: "sc-button",
      label: translate("web.editor.block.button"),
      category,
      content: {
        type: "link",
        content: translate("web.editor.placeholder.button"),
        attributes: { href: "#", class: "sc-button btn btn-primary btn-skaut sc-mask-button-soft" },
      },
    },
    { id: "sc-divider", label: translate("web.editor.block.divider"), category, content: { type: "default", tagName: "hr", void: true } },
    {
      id: "sc-spacer",
      label: translate("web.editor.block.spacer"),
      category,
      content: { type: "default", tagName: "div", attributes: { "aria-hidden": "true" }, style: { height: "var(--sc-space-6, 2rem)" } },
    },
    {
      id: "sc-unordered-list",
      label: translate("web.editor.block.unorderedList"),
      category,
      content: { type: "default", tagName: "ul", components: [
        { type: "text", tagName: "li", content: translate("web.editor.placeholder.listItem") },
        { type: "text", tagName: "li", content: translate("web.editor.placeholder.listItem") },
      ] },
    },
    {
      id: "sc-ordered-list",
      label: translate("web.editor.block.orderedList"),
      category,
      content: { type: "default", tagName: "ol", components: [
        { type: "text", tagName: "li", content: translate("web.editor.placeholder.listItem") },
        { type: "text", tagName: "li", content: translate("web.editor.placeholder.listItem") },
      ] },
    },
    { id: "sc-list-item", label: translate("web.editor.block.listItem"), category, content: { type: "text", tagName: "li", content: translate("web.editor.placeholder.listItem") } },
    {
      id: "sc-table",
      label: translate("web.editor.block.table"),
      category,
      content: {
        type: "default",
        tagName: "table",
        name: translate("web.editor.block.table"),
        components: [{ type: "default", tagName: "tbody", components: [
          { type: "default", tagName: "tr", components: [
            { type: "text", tagName: "td", content: translate("web.editor.placeholder.tableCell") },
            { type: "text", tagName: "td", content: translate("web.editor.placeholder.tableCell") },
          ] },
          { type: "default", tagName: "tr", components: [
            { type: "text", tagName: "td", content: translate("web.editor.placeholder.tableCell") },
            { type: "text", tagName: "td", content: translate("web.editor.placeholder.tableCell") },
          ] },
        ] }],
      },
    },
    {
      id: "sc-fa-icon",
      label: translate("web.editor.block.fontAwesomeIcon"),
      category,
      content: {
        type: "default",
        tagName: "i",
        name: translate("web.editor.block.fontAwesomeIcon"),
        attributes: { class: "fa-solid fa-compass", "aria-label": translate("web.editor.placeholder.iconLabel") },
      },
    },
    {
      id: "sc-photo-mask",
      label: translate("web.editor.block.photoMask"),
      category,
      content: {
        type: "default",
        tagName: "figure",
        name: translate("web.editor.block.photoMask"),
        attributes: { class: "ontario-photo-frame", "data-sc-overlay": "true" },
        components: [{
          type: "image",
          attributes: { class: "img-fluid ontario-photo-tint", alt: "" },
        }],
      },
    },
    {
      id: "block-section-heading", label: "Section Heading", category: blocks,
      content: { type: "default", tagName: "header", name: "Section Heading", attributes: { class: "mb-4" }, components: [
        { type: "text", tagName: "p", attributes: { class: "text-uppercase fw-bold mb-2" }, content: "PRO RODIČE" },
        heading(translate("web.editor.placeholder.heading")),
        text(translate("web.editor.placeholder.text")),
      ] },
    },
    {
      id: "block-cta-pair", label: "Button Pair", category: blocks,
      content: { type: "default", tagName: "div", name: "Button Pair", attributes: { class: "d-flex flex-wrap gap-3" }, components: [
        { type: "link", attributes: { class: "btn btn-primary", href: "#" }, content: "Přijít na schůzku" },
        { type: "link", attributes: { class: "btn btn-outline-primary", href: "#" }, content: "Napsat vedoucím" },
      ] },
    },
    {
      id: "block-icon-text", label: "Icon + Text", category: blocks,
      content: { type: "default", tagName: "div", name: "Icon + Text", attributes: { class: "d-flex gap-3 align-items-start" }, components: [
        { type: "default", tagName: "i", attributes: { class: "fa-solid fa-compass fs-3", "aria-hidden": "true" } },
        { type: "default", tagName: "div", components: [heading(translate("web.editor.placeholder.heading"), "h3"), text(translate("web.editor.placeholder.text"))] },
      ] },
    },
    {
      id: "block-quote", label: "Quote", category: blocks,
      content: { type: "default", tagName: "blockquote", name: "Quote", attributes: { class: "border-start border-4 ps-4 py-2" }, components: [
        text("Skauting dává dětem prostor růst, zkoušet nové věci a držet při sobě."),
        { type: "text", tagName: "footer", attributes: { class: "blockquote-footer" }, content: "Vedoucí oddílu" },
      ] },
    },
    {
      id: "block-contact-item", label: "Contact Item", category: blocks,
      content: { type: "default", tagName: "div", name: "Contact Item", attributes: { class: "d-flex gap-3 align-items-center" }, components: [
        { type: "default", tagName: "i", attributes: { class: "fa-solid fa-envelope", "aria-hidden": "true" } },
        { type: "default", tagName: "div", components: [heading("Napište nám", "h3"), { type: "link", attributes: { href: "mailto:ontario@example.cz" }, content: "ontario@example.cz" }] },
      ] },
    },
    {
      id: "block-person", label: "Person", category: blocks,
      content: { type: "default", tagName: "article", name: "Person", attributes: { class: "card h-100" }, components: [
        { type: "image", attributes: { class: "card-img-top", alt: "Portrét vedoucího" } },
        { type: "default", tagName: "div", attributes: { class: "card-body" }, components: [heading("Jméno vedoucího", "h3"), text("Vedoucí družiny · kontakt a krátké představení.")] },
      ] },
    },
    {
      id: "block-media-text", label: "Media + Text", category: blocks,
      content: { type: "default", tagName: "article", name: "Media + Text", attributes: { class: "row g-4 align-items-center" }, components: [
        { type: "default", tagName: "div", attributes: { class: "col-md-5" }, components: [{ type: "image", attributes: { class: "img-fluid", alt: "" } }] },
        { type: "default", tagName: "div", attributes: { class: "col-md-7" }, components: sampleCopy(translate) },
      ] },
    },
    {
      id: "block-hero", label: "Hero – Full Photo", category: blocks,
      content: { type: "default", tagName: "section", name: "Hero", attributes: { class: "ontario-hero sc-overlay sc-edge-soft sc-edge-bottom sc-edge-white", "data-sc-overlay": "true" }, components: [
        { type: "default", tagName: "div", attributes: { class: "ontario-photo-mask", "aria-hidden": "true" } },
        { type: "default", tagName: "div", attributes: { class: "container ontario-hero-content" }, components: [heading("ONTARIO", "h1"), heading("Skautský oddíl ve Zlíně", "h2")] },
      ] },
    },
    {
      id: "block-contact-hero", label: "Contact Hero", category: blocks,
      content: { type: "default", tagName: "header", name: "Contact Hero", attributes: { class: "ontario-contact-hero", "data-sc-overlay": "true" }, components: [
        { type: "default", tagName: "div", attributes: { class: "ontario-photo-mask", "aria-hidden": "true" } },
        { type: "default", tagName: "div", attributes: { class: "container ontario-contact-hero-content" }, components: [heading("KONTAKTUJTE NÁS", "h1"), heading("MÁTE DOTAZY A NEVÍTE, NA KOHO SE OBRÁTIT?", "h2")] },
      ] },
    },
    {
      id: "block-social-icon", label: "Social Icon", category: blocks,
      content: { type: "link", name: "Social Icon", attributes: { class: "ontario-social-link ontario-social-instagram", href: "#", "aria-label": "Instagram" }, components: [
        { type: "default", tagName: "i", attributes: { class: "fa-brands fa-instagram", "aria-hidden": "true" } },
      ] },
    },
    {
      id: "block-social-links", label: "Social Links", category: blocks,
      content: { type: "default", tagName: "section", name: "Social Links", attributes: { class: "ontario-socials ontario-section" }, components: [
        { type: "default", tagName: "div", attributes: { class: "container" }, components: [
          heading("JSME I NA SOCIÁLNÍCH SÍTÍCH", "h2"),
          { type: "default", tagName: "div", attributes: { class: "ontario-social-row" }, components: [
            { type: "link", attributes: { class: "ontario-social-link ontario-social-instagram", href: "#", "aria-label": "Instagram" }, components: [{ type: "default", tagName: "i", attributes: { class: "fa-brands fa-instagram", "aria-hidden": "true" } }] },
            { type: "link", attributes: { class: "ontario-social-link ontario-social-youtube", href: "#", "aria-label": "YouTube" }, components: [{ type: "default", tagName: "i", attributes: { class: "fa-brands fa-youtube", "aria-hidden": "true" } }] },
            { type: "link", attributes: { class: "ontario-social-link ontario-social-github", href: "#", "aria-label": "GitHub" }, components: [{ type: "default", tagName: "i", attributes: { class: "fa-brands fa-github", "aria-hidden": "true" } }] },
          ] },
        ] },
      ] },
    },
    {
      id: "block-organic-photo", label: translate("web.editor.block.organicPhoto"), category: blocks,
      content: { type: "default", tagName: "figure", name: translate("web.editor.block.organicPhoto"), attributes: { class: "ontario-photo-frame sc-shape-soft", "data-sc-overlay": "true" }, components: [
        { type: "image", attributes: { class: "img-fluid w-100", alt: "Skauti při programu v přírodě", loading: "lazy" } },
        { type: "text", tagName: "figcaption", attributes: { class: "visually-hidden" }, content: "Společný oddílový program" },
      ] },
    },
    {
      id: "block-portrait-quote", label: translate("web.editor.block.portraitQuote"), category: blocks,
      content: { type: "default", tagName: "figure", name: translate("web.editor.block.portraitQuote"), attributes: { class: "row g-4 align-items-center m-0" }, components: [
        { type: "default", tagName: "div", attributes: { class: "col-sm-4" }, components: [{ type: "image", attributes: { class: "img-fluid sc-shape-oval", alt: "Portrét vedoucí oddílu", loading: "lazy" } }] },
        { type: "default", tagName: "blockquote", attributes: { class: "col-sm-8 m-0" }, components: [
          { type: "text", tagName: "p", attributes: { class: "fs-4" }, content: "Skauting dává dětem odvahu zkoušet nové věci a být oporou druhým." },
          { type: "text", tagName: "figcaption", attributes: { class: "blockquote-footer mt-3" }, components: [{ type: "text", tagName: "cite", content: "Vedoucí oddílu" }] },
        ] },
      ] },
    },
    {
      id: "block-colored-cta", label: translate("web.editor.block.coloredCta"), category: blocks,
      content: { type: "default", tagName: "aside", name: translate("web.editor.block.coloredCta"), attributes: { class: "bg-primary text-white p-4 p-md-5 sc-shape-rounded", "aria-label": "Výzva k návštěvě oddílu" }, components: [
        heading("PŘIJĎTE SE PODÍVAT", "h2"),
        { type: "text", tagName: "p", attributes: { class: "lead" }, content: "První návštěva je nezávazná. Rádi vám ukážeme, jak schůzka probíhá." },
        { type: "link", attributes: { class: "btn btn-warning mt-2", href: "#" }, components: [
          { type: "text", tagName: "span", content: "Domluvit návštěvu" },
          { type: "default", tagName: "i", attributes: { class: "fa-solid fa-arrow-right sc-button-icon-right", "data-sc-button-icon": "true", "aria-hidden": "true" } },
        ] },
      ] },
    },
    {
      id: "block-contact-row", label: translate("web.editor.block.contactRow"), category: blocks,
      content: { type: "default", tagName: "address", name: translate("web.editor.block.contactRow"), attributes: { class: "row g-3 align-items-stretch", "aria-label": "Kontaktní údaje oddílu" }, components: [
        { type: "default", tagName: "div", attributes: { class: "col-md-4 d-flex gap-3 align-items-center" }, components: [{ type: "default", tagName: "i", attributes: { class: "fa-solid fa-location-dot fs-4", "aria-hidden": "true" } }, text("Klubovna oddílu, Zlín")] },
        { type: "default", tagName: "div", attributes: { class: "col-md-4 d-flex gap-3 align-items-center" }, components: [{ type: "default", tagName: "i", attributes: { class: "fa-solid fa-envelope fs-4", "aria-hidden": "true" } }, { type: "link", attributes: { href: "mailto:oddil@example.cz" }, content: "oddil@example.cz" }] },
        { type: "default", tagName: "div", attributes: { class: "col-md-4 d-flex gap-3 align-items-center" }, components: [{ type: "default", tagName: "i", attributes: { class: "fa-solid fa-phone fs-4", "aria-hidden": "true" } }, { type: "link", attributes: { href: "tel:+420123456789" }, content: "+420 123 456 789" }] },
      ] },
    },
    {
      id: "bs-alert",
      label: translate("web.editor.block.bootstrapAlert"),
      category,
      content: { type: "text", tagName: "div", attributes: { class: "alert alert-info", role: "alert" }, content: translate("web.editor.placeholder.alert") },
    },
    {
      id: "bs-badge",
      label: translate("web.editor.block.bootstrapBadge"),
      category,
      content: { type: "text", tagName: "span", attributes: { class: "badge bg-secondary" }, content: translate("web.editor.placeholder.badge") },
    },
    {
      id: "bs-breadcrumb",
      label: translate("web.editor.block.bootstrapBreadcrumb"),
      category: structure,
      content: { type: "default", tagName: "nav", attributes: { "aria-label": translate("web.editor.block.bootstrapBreadcrumb") }, components: [
        { type: "default", tagName: "ol", attributes: { class: "breadcrumb" }, components: [
          { type: "text", tagName: "li", attributes: { class: "breadcrumb-item" }, content: translate("web.editor.placeholder.home") },
          { type: "text", tagName: "li", attributes: { class: "breadcrumb-item active", "aria-current": "page" }, content: translate("web.editor.placeholder.currentPage") },
        ] },
      ] },
    },
    {
      id: "bs-card",
      label: translate("web.editor.block.bootstrapCard"),
      category,
      content: { type: "default", tagName: "article", attributes: { class: "card" }, components: [
        { type: "image", attributes: { class: "card-img-top", alt: "" } },
        { type: "default", tagName: "div", attributes: { class: "card-body" }, components: [
          { type: "text", tagName: "h3", attributes: { class: "card-title" }, content: translate("web.editor.placeholder.heading") },
          { type: "text", tagName: "p", attributes: { class: "card-text" }, content: translate("web.editor.placeholder.text") },
        ] },
      ] },
    },
    {
      id: "bs-button-group",
      label: translate("web.editor.block.bootstrapButtonGroup"),
      category,
      content: { type: "default", tagName: "div", attributes: { class: "btn-group", role: "group", "aria-label": translate("web.editor.block.bootstrapButtonGroup") }, components: [
        { type: "link", attributes: { class: "btn btn-primary", href: "#" }, content: translate("web.editor.placeholder.button") },
        { type: "link", attributes: { class: "btn btn-outline-primary", href: "#" }, content: translate("web.editor.placeholder.button") },
      ] },
    },
    {
      id: "bs-list-group",
      label: translate("web.editor.block.bootstrapListGroup"),
      category,
      content: { type: "default", tagName: "ul", attributes: { class: "list-group" }, components: [
        { type: "text", tagName: "li", attributes: { class: "list-group-item" }, content: translate("web.editor.placeholder.listItem") },
        { type: "text", tagName: "li", attributes: { class: "list-group-item" }, content: translate("web.editor.placeholder.listItem") },
      ] },
    },
    {
      id: "bs-accordion",
      label: translate("web.editor.block.bootstrapAccordion"),
      category,
      content: { type: "default", tagName: "details", attributes: { class: "ontario-accordion" }, components: [
        { type: "text", tagName: "summary", content: translate("web.editor.placeholder.accordionTitle") },
        text(translate("web.editor.placeholder.text")),
      ] },
    },
    {
      id: "bs-pagination",
      label: translate("web.editor.block.bootstrapPagination"),
      category: structure,
      content: { type: "default", tagName: "nav", attributes: { "aria-label": translate("web.editor.block.bootstrapPagination") }, components: [
        { type: "default", tagName: "ul", attributes: { class: "pagination" }, components: [1, 2, 3].map((page) => ({
          type: "default", tagName: "li", attributes: { class: `page-item${page === 1 ? " active" : ""}` }, components: [
            { type: "link", attributes: { class: "page-link", href: `?page=${page}`, ...(page === 1 ? { "aria-current": "page" } : {}) }, content: String(page) },
          ],
        })) },
      ] },
    },
    {
      id: "bs-table-responsive",
      label: translate("web.editor.block.bootstrapResponsiveTable"),
      category,
      content: { type: "default", tagName: "div", attributes: { class: "table-responsive" }, components: [
        { type: "default", tagName: "table", attributes: { class: "table table-striped" }, components: [
          { type: "default", tagName: "tbody", components: [{ type: "default", tagName: "tr", components: [
            { type: "text", tagName: "th", attributes: { scope: "row" }, content: translate("web.editor.placeholder.tableCell") },
            { type: "text", tagName: "td", content: translate("web.editor.placeholder.tableCell") },
          ] }] },
        ] },
      ] },
    },
    {
      id: "bs-ratio",
      label: translate("web.editor.block.bootstrapRatio"),
      category,
      content: { type: "default", tagName: "div", attributes: { class: "ratio ratio-16x9" }, components: [
        { type: "default", tagName: "div", attributes: { class: "d-flex align-items-center justify-content-center bg-light" }, components: [text(translate("web.editor.placeholder.embed"))] },
      ] },
    },
    {
      id: "bs-progress",
      label: translate("web.editor.block.bootstrapProgress"),
      category,
      content: { type: "default", tagName: "div", attributes: { class: "progress" }, components: [
        { type: "text", tagName: "div", attributes: { class: "progress-bar", role: "progressbar", "aria-label": translate("web.editor.block.bootstrapProgress"), "aria-valuenow": "60", "aria-valuemin": "0", "aria-valuemax": "100" }, style: { width: "60%" }, content: "60 %" },
      ] },
    },
    {
      id: "bs-callout",
      label: translate("web.editor.block.bootstrapCallout"),
      category,
      content: { type: "default", tagName: "aside", attributes: { class: "border-start border-4 border-primary p-4 bg-light" }, components: [
        { type: "text", tagName: "h3", content: translate("web.editor.placeholder.heading") },
        text(translate("web.editor.placeholder.text")),
      ] },
    },
    ...["article", "header", "footer", "main", "nav", "aside"].map((tagName) => ({
      id: `sc-semantic-${tagName}`,
      label: STRUCTURE_NAMES[tagName],
      category: structure,
      content: {
        type: "default",
        tagName,
        name: STRUCTURE_NAMES[tagName],
        components: tagName === "nav" ? [
          { type: "link", attributes: { href: "#" }, content: "O nás" },
          { type: "link", attributes: { href: "#" }, content: "Kontakt" },
        ] : sampleCopy(translate),
      },
    })),
    {
      id: "sc-bind",
      label: translate("web.editor.component.bind"),
      category: translate(BLOCK_CATEGORIES.data),
      content: bind("title"),
    },
    {
      id: "sc-repeat",
      label: translate("web.editor.component.repeat"),
      category: translate(BLOCK_CATEGORIES.data),
      content: {
        type: SC_COMPONENT_TYPES.repeat,
        source: "",
        params: {},
        components: [text(translate("web.editor.placeholder.repeat"))],
        empty: [{ type: SC_COMPONENT_TYPES.empty }],
      },
    },
    {
      id: "sc-pagination",
      label: translate("web.editor.component.pagination"),
      category: translate(BLOCK_CATEGORIES.data),
      content: {
        type: SC_COMPONENT_TYPES.pagination,
        bindTo: "nearest",
        pageSize: null,
        mode: "simple",
      },
    },
    {
      id: "sc-condition",
      label: translate("web.editor.component.condition"),
      category: translate(BLOCK_CATEGORIES.data),
      content: { type: SC_COMPONENT_TYPES.condition, components: [text(translate("web.editor.placeholder.condition"))] },
    },
    {
      id: "sc-empty",
      label: translate("web.editor.component.emptyState"),
      category: translate(BLOCK_CATEGORIES.data),
      content: { type: SC_COMPONENT_TYPES.empty },
    },
    {
      id: "sc-menu",
      label: translate("web.editor.component.menu"),
      category: translate(BLOCK_CATEGORIES.data),
      content: { type: SC_COMPONENT_TYPES.menu, location: "main" },
    },
    {
      id: "sc-calendar",
      label: translate("web.editor.component.calendar"),
      category: translate(BLOCK_CATEGORIES.data),
      content: {
        type: SC_COMPONENT_TYPES.calendar,
        kind: "all",
        teamId: "",
        firstDayOfWeek: "monday",
        showDescription: true,
      },
    },
  ]);
}

const getFields = (source) => {
  if (Array.isArray(source?.fields)) return source.fields;
  if (source?.fields && typeof source.fields === "object") {
    return Object.entries(source.fields).map(([id, definition]) => ({
      id,
      ...(definition && typeof definition === "object" ? definition : {}),
    }));
  }
  return [];
};

const fieldId = (field) => field?.id || field?.name || field?.key;

export function createDataSourceBlocks(dataSources = [], translate = (key) => key) {
  return dataSources
    .filter((source) => source && source.id)
    .map((source) => {
      const special = specialDataCard(source, translate);
      const fields = getFields(source);
      const titleField = fields.find((field) => ["title", "name", "filename"].includes(fieldId(field))) || fields[0];
      const descriptionField = fields.find((field) => fieldId(field) === "description");
      const children = [
        {
          type: "default",
          tagName: "article",
          components: [
            ...(titleField ? [{ type: "text", tagName: "h3", components: [bind(fieldId(titleField))] }] : []),
            ...(descriptionField ? [{ type: "text", tagName: "p", components: [bind(fieldId(descriptionField))] }] : []),
          ],
        },
      ];
      const content = source.id === "core.posts" && special ? {
        type: "default",
        tagName: "div",
        attributes: { class: "sc-post-feed" },
        components: [special, {
          type: SC_COMPONENT_TYPES.pagination,
          bindTo: "nearest",
          pageSize: 6,
          mode: "simple",
        }],
      } : special || (source.collection === false
        ? { type: "default", tagName: "div", components: children[0].components }
        : {
            type: SC_COMPONENT_TYPES.repeat,
            source: source.id,
            params: {},
            components: children,
            empty: [{ type: SC_COMPONENT_TYPES.empty }],
          });

      return {
        id: `sc-data-${safeId(source.id)}`,
        label: source.label || source.name || source.translation_key || source.id,
        category: translate(BLOCK_CATEGORIES.data),
        media: '<i class="fas fa-database" aria-hidden="true"></i>',
        // GrapesJS preserves block attributes on its native draggable cards.
        // Data sources are otherwise hard to distinguish before insertion.
        attributes: { title: source.description || source.label || source.name || source.id },
        content,
      };
    });
}

const cloneSerializable = (value) => JSON.parse(JSON.stringify(value));

const upsertBlock = (manager, definition) => {
  const existing = manager.get(definition.id);
  const clean = cloneSerializable(definition);
  if (existing) {
    existing.set(clean);
    return existing;
  }
  return manager.add(clean.id, clean);
};

export function registerBuilderBlocks(editor, { dataSources = [], blocks = [], translate } = {}) {
  const definitions = [
    ...createPrimitiveBlocks(translate),
    ...createDataSourceBlocks(dataSources, translate),
    ...blocks,
  ];
  return definitions
    .filter((definition) => definition?.id && definition?.content)
    .map((definition) => upsertBlock(editor.BlockManager, definition));
}
