export const SC_COMPONENT_TYPES = Object.freeze({
  bind: "sc-bind",
  repeat: "sc-repeat",
  condition: "sc-condition",
  empty: "sc-empty",
  templatePart: "sc-template-part",
  globalPart: "sc-global-part",
  resourceInstance: "sc-resource-instance",
});

export const DEFAULT_DEVICES = Object.freeze([
  { id: "desktop", name: "Desktop", width: "" },
  { id: "tablet", name: "Tablet", width: "768px", widthMedia: "991px" },
  { id: "mobile", name: "Mobile", width: "375px", widthMedia: "575px" },
]);

export const DEFAULT_STYLE_SECTORS = Object.freeze([
  {
    id: "layout",
    name: "Layout",
    open: true,
    properties: [
      "display",
      "position",
      "top", "right", "bottom", "left",
      "flex-direction",
      "justify-content",
      "align-items",
      "flex-wrap",
      "gap",
      "width",
      "max-width",
      "min-height",
    ],
  },
  {
    id: "spacing",
    name: "Spacing",
    open: false,
    properties: [
      "margin-top", "margin-right", "margin-bottom", "margin-left",
      "padding-top", "padding-right", "padding-bottom", "padding-left",
    ],
  },
  {
    id: "grid",
    name: "Grid",
    open: false,
    properties: [
      "grid-template-columns",
      "grid-template-rows",
      "grid-column",
      "grid-row",
      "grid-gap",
    ],
  },
  {
    id: "typography",
    name: "Typography",
    open: false,
    properties: [
      "font-family",
      "font-size",
      "font-weight",
      "line-height",
      "letter-spacing",
      "text-align",
      "color",
      "text-decoration",
    ],
  },
  {
    id: "decoration",
    name: "Decoration",
    open: false,
    properties: [
      "background-color",
      "background-image",
      "background-size",
      "background-position",
      "border",
      "border-radius",
      "box-shadow",
      "opacity",
      "overflow",
    ],
  },
]);

export const BLOCK_CATEGORIES = Object.freeze({
  primitives: "web.editor.catalog.primitives",
  data: "web.editor.catalog.data",
  structure: "web.editor.catalog.structure",
});

export const SAFE_BIND_TARGETS = Object.freeze([
  "text",
  "richText",
  "href",
  "src",
  "alt",
  "datetime",
  "title",
  "style.color",
  "style.background-color",
  "style.opacity",
]);
