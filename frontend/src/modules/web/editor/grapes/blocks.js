import { BLOCK_CATEGORIES, SC_COMPONENT_TYPES } from "./constants";

const safeId = (value) => String(value || "unknown").replace(/[^a-zA-Z0-9_-]/g, "-");

const text = (content) => ({ type: "text", tagName: "p", content });
const bind = (field) => ({
  type: SC_COMPONENT_TYPES.bind,
  binding: { scope: "context", field },
  bindingField: field,
  mode: "text",
});

export function createPrimitiveBlocks(translate = (key) => key) {
  const category = translate(BLOCK_CATEGORIES.primitives);
  const structure = translate(BLOCK_CATEGORIES.structure);
  return [
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
  ];
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
      const fields = getFields(source);
      const titleField = fields.find((field) => fieldId(field) === "title") || fields[0];
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
      const content = source.collection === false
        ? { type: "default", tagName: "div", components: children[0].components }
        : {
            type: SC_COMPONENT_TYPES.repeat,
            source: source.id,
            params: {},
            components: children,
            empty: [{ type: SC_COMPONENT_TYPES.empty }],
          };

      return {
        id: `sc-data-${safeId(source.id)}`,
        label: source.label || source.name || source.translation_key || source.id,
        category: translate(BLOCK_CATEGORIES.data),
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
