import { BLOCK_CATEGORIES, SC_COMPONENT_TYPES } from "./constants";

const safeId = (value) => String(value || "unknown").replace(/[^a-zA-Z0-9_-]/g, "-");

const BLOCK_ICONS = {
  "sc-columns": "fa-columns",
  "sc-flex": "fa-arrows-left-right-to-line",
  "sc-grid": "fa-table-cells-large",
  "sc-text": "fa-paragraph",
  "sc-rich-text": "fa-align-left",
  "sc-heading": "fa-heading",
  "sc-link": "fa-link",
  "sc-image": "fa-image",
  "sc-figure": "fa-images",
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
  const data = translate(BLOCK_CATEGORIES.data);
  const blocks = [
    {
      id: "sc-columns",
      label: STRUCTURE_NAMES.columns,
      category: structure,
      content: {
        type: "default", tagName: "div", name: STRUCTURE_NAMES.columns,
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
        type: "default", tagName: "div", name: STRUCTURE_NAMES.flex,
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
        type: "default", tagName: "div", name: STRUCTURE_NAMES.grid,
        attributes: { class: "sc-layout-responsive-grid" },
        style: { "--sc-layout-columns": "2" },
        components: [
          { type: "default", tagName: "div", components: [text(translate("web.editor.placeholder.item"))] },
          { type: "default", tagName: "div", components: [text(translate("web.editor.placeholder.item"))] },
        ],
      },
    },
    { id: "sc-text", label: translate("web.editor.block.text"), category, content: text(translate("web.editor.placeholder.text")) },
    { id: "sc-rich-text", label: translate("web.editor.block.richText"), category, content: { type: "default", tagName: "div", name: translate("web.editor.block.richText"), components: [text(translate("web.editor.placeholder.richText"))] } },
    { id: "sc-heading", label: translate("web.editor.block.heading"), category, content: heading(translate("web.editor.placeholder.heading")) },
    { id: "sc-link", label: translate("web.editor.block.link"), category, content: { type: "link", content: translate("web.editor.placeholder.link"), attributes: { href: "#" } } },
    { id: "sc-image", label: translate("web.editor.block.image"), category, content: { type: "image", attributes: { alt: "", loading: "lazy" } }, activate: true, select: true },
    {
      id: "sc-figure", label: translate("web.editor.block.figure"), category,
      content: { type: "default", tagName: "figure", name: translate("web.editor.block.figure"), components: [
        { type: "image", attributes: { alt: "", loading: "lazy" } },
        { type: "text", tagName: "figcaption", content: translate("web.editor.placeholder.caption") },
      ] },
    },
    { id: "sc-divider", label: translate("web.editor.block.divider"), category, content: { type: "default", tagName: "hr" } },
    { id: "sc-spacer", label: translate("web.editor.block.spacer"), category, content: { type: "default", tagName: "div", attributes: { "aria-hidden": "true" }, style: { height: "2rem" } } },
    { id: "sc-unordered-list", label: translate("web.editor.block.unorderedList"), category, content: { type: "default", tagName: "ul", components: [{ type: "text", tagName: "li", content: translate("web.editor.placeholder.item") }] } },
    { id: "sc-ordered-list", label: translate("web.editor.block.orderedList"), category, content: { type: "default", tagName: "ol", components: [{ type: "text", tagName: "li", content: translate("web.editor.placeholder.item") }] } },
    { id: "sc-list-item", label: translate("web.editor.block.listItem"), category, content: { type: "text", tagName: "li", content: translate("web.editor.placeholder.item") } },
    {
      id: "sc-table", label: translate("web.editor.block.table"), category,
      content: { type: "default", tagName: "table", components: [
        { type: "default", tagName: "thead", components: [{ type: "default", tagName: "tr", components: [
          { type: "text", tagName: "th", content: translate("web.editor.placeholder.heading") },
          { type: "text", tagName: "th", content: translate("web.editor.placeholder.heading") },
        ] }] },
        { type: "default", tagName: "tbody", components: [{ type: "default", tagName: "tr", components: [
          { type: "text", tagName: "td", content: translate("web.editor.placeholder.text") },
          { type: "text", tagName: "td", content: translate("web.editor.placeholder.text") },
        ] }] },
      ] },
    },
    ...["article", "header", "footer", "main", "nav", "aside"].map((tagName) => ({
      id: `sc-semantic-${tagName}`,
      label: STRUCTURE_NAMES[tagName],
      category: structure,
      content: {
        type: "default", tagName, name: STRUCTURE_NAMES[tagName],
        components: tagName === "nav"
          ? [{ type: "link", attributes: { href: "#" }, content: translate("web.editor.placeholder.link") }]
          : sampleCopy(translate),
      },
    })),
    { id: "sc-bind", label: translate("web.editor.component.bind"), category: data, content: bind("title") },
    {
      id: "sc-repeat", label: translate("web.editor.component.repeat"), category: data,
      content: { type: SC_COMPONENT_TYPES.repeat, source: "", params: {}, components: [text(translate("web.editor.placeholder.repeat"))], empty: [{ type: SC_COMPONENT_TYPES.empty }] },
    },
    { id: "sc-pagination", label: translate("web.editor.component.pagination"), category: data, content: { type: SC_COMPONENT_TYPES.pagination, bindTo: "nearest", pageSize: null, mode: "simple" } },
    { id: "sc-condition", label: translate("web.editor.component.condition"), category: data, content: { type: SC_COMPONENT_TYPES.condition, components: [text(translate("web.editor.placeholder.condition"))] } },
    { id: "sc-empty", label: translate("web.editor.component.emptyState"), category: data, content: { type: SC_COMPONENT_TYPES.empty } },
    { id: "sc-menu", label: translate("web.editor.component.menu"), category: data, content: { type: SC_COMPONENT_TYPES.menu, location: "main" } },
    {
      id: "sc-calendar", label: translate("web.editor.component.calendar"), category: data,
      content: { type: SC_COMPONENT_TYPES.calendar, kind: "all", teamId: "", firstDayOfWeek: "monday", showDescription: true },
    },
  ];
  return withBlockIcons(blocks);
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
