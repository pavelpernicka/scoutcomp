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
  "sc-condition": "fa-code-branch",
  "sc-empty": "fa-box-open",
  "sc-menu": "fa-bars",
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
};

const withBlockIcons = (blocks) => blocks.map((block) => ({
  ...block,
  media: block.media || `<i class="fas ${BLOCK_ICONS[block.id] || "fa-cube"}" aria-hidden="true"></i>`,
}));

const text = (content) => ({ type: "text", tagName: "p", content });
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
  return withBlockIcons([
    {
      id: "sc-container",
      label: translate("web.editor.block.container"),
      category: structure,
      content: { type: "default", tagName: "div", name: translate("web.editor.block.container") },
    },
    {
      id: "sc-box",
      label: translate("web.editor.block.box"),
      category: structure,
      content: { type: "default", tagName: "div", name: translate("web.editor.block.box") },
    },
    {
      id: "sc-section",
      label: translate("web.editor.block.section"),
      category: structure,
      content: { type: "default", tagName: "section", name: translate("web.editor.block.section") },
    },
    {
      id: "sc-columns",
      label: translate("web.editor.block.columns"),
      category: structure,
      content: {
        type: "default",
        tagName: "div",
        attributes: { class: "sc-layout-columns" },
        components: [
          { type: "default", tagName: "div", components: [text(translate("web.editor.placeholder.column"))] },
          { type: "default", tagName: "div", components: [text(translate("web.editor.placeholder.column"))] },
        ],
      },
    },
    {
      id: "sc-flex",
      label: translate("web.editor.block.flex"),
      category: structure,
      content: {
        type: "default",
        tagName: "div",
        name: translate("web.editor.block.flex"),
        style: { display: "flex", gap: "1rem", "align-items": "stretch" },
        components: [
          { type: "default", tagName: "div", components: [text(translate("web.editor.placeholder.item"))] },
          { type: "default", tagName: "div", components: [text(translate("web.editor.placeholder.item"))] },
        ],
      },
    },
    {
      id: "sc-grid",
      label: translate("web.editor.block.grid"),
      category: structure,
      content: {
        type: "default",
        tagName: "div",
        name: translate("web.editor.block.grid"),
        style: { display: "grid", "grid-template-columns": "repeat(2, minmax(0, 1fr))", gap: "1rem" },
        components: [
          { type: "default", tagName: "div", components: [text(translate("web.editor.placeholder.item"))] },
          { type: "default", tagName: "div", components: [text(translate("web.editor.placeholder.item"))] },
        ],
      },
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
        attributes: { href: "#", class: "sc-button" },
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
      id: "sc-organic-edge",
      label: translate("web.editor.block.organicEdge"),
      category: structure,
      content: {
        type: "default",
        tagName: "div",
        name: translate("web.editor.block.organicEdge"),
        attributes: { class: "ontario-edge ontario-edge--white", "aria-hidden": "true" },
        components: ["one", "two", "three"].map((suffix) => ({
          type: "default",
          tagName: "span",
          attributes: { class: `ontario-edge-blob ontario-edge-blob--${suffix}`, "aria-hidden": "true" },
        })),
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
        attributes: { class: "ontario-photo-frame" },
        components: [{
          type: "image",
          attributes: { class: "img-fluid ontario-photo-tint", alt: "" },
        }],
      },
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
      label: translate(`web.editor.block.${tagName}`),
      category: structure,
      content: { type: "default", tagName, name: translate(`web.editor.block.${tagName}`) },
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
          source: source.id,
          limit: 6,
          params: { limit: 6, page: { $scBinding: { scope: "page", field: "query.page" } } },
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
