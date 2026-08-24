import { DEFAULT_DEVICES, DEFAULT_STYLE_SECTORS } from "./constants";
import { registerBuilderBlocks } from "./blocks";
import { registerScoutCompTypes } from "./componentTypes";
import { grapesI18nConfig } from "./i18n";

const cssContent = (value) => JSON.stringify(String(value || ""));

const SYSTEM_FONT_SETS = [
  { id: "system", label: "System UI", value: "system-ui, sans-serif" },
  { id: "serif", label: "Serif", value: "Georgia, serif" },
  { id: "mono", label: "Monospace", value: "ui-monospace, monospace" },
];

export const fontFamilyOptions = (fontSets = []) => {
  const seen = new Set();
  return [...SYSTEM_FONT_SETS, ...(Array.isArray(fontSets) ? fontSets : [])]
    .filter((item) => item && typeof item.value === "string" && typeof item.label === "string")
    .filter((item) => !seen.has(item.value) && seen.add(item.value))
    .map((item) => ({ id: item.value, label: item.label }));
};

const RTE_LABELS = {
  cs: {
    bulletedList: "Odrážkový seznam",
    numberedList: "Číslovaný seznam",
  },
  en: {
    bulletedList: "Bulleted list",
    numberedList: "Numbered list",
  },
};

const listAction = (name, command, icon, title) => ({
  name,
  icon,
  attributes: { title, "aria-label": title },
  result: (rte) => rte.exec(command),
  state: (_rte, doc) => doc.queryCommandState(command) ? 1 : 0,
});

/** Semantic formatting exposed by the native GrapesJS inline text editor. */
export const richTextActions = (language = "cs") => {
  const labels = RTE_LABELS[String(language).toLowerCase().split("-")[0]] || RTE_LABELS.en;
  return [
    "bold",
    "italic",
    "underline",
    listAction("bulletedList", "insertUnorderedList", "&#8226;", labels.bulletedList),
    listAction("numberedList", "insertOrderedList", "1.", labels.numberedList),
    "strikethrough",
    "link",
    "wrap",
  ];
};

export const inlineCanvasCss = (canvasStyles = []) => (Array.isArray(canvasStyles) ? canvasStyles : [])
  .filter((item) => item && typeof item === "object" && !item.href && typeof item.css === "string")
  .map((item) => item.css)
  .filter(Boolean)
  .join("\n");

export const editorCanvasCss = (translate = (key) => key) => `
[data-sc-type="slot"][data-sc-slot="content"] {
  box-sizing: border-box !important;
  position: relative !important;
  min-height: 112px !important;
  outline: 2px dashed #d7a157 !important;
  outline-offset: -2px !important;
  background-color: rgba(215, 161, 87, .08) !important;
}
[data-sc-type="slot"][data-sc-slot="content"]::before {
  content: ${cssContent(translate("web.editor.component.contentSlot"))};
  position: absolute;
  z-index: 2;
  top: 6px;
  left: 8px;
  padding: 2px 6px;
  border-radius: 2px;
  background: #8a5a19;
  color: #fff8e8;
  font: 700 11px/1.4 system-ui, sans-serif;
  pointer-events: none;
}
[data-sc-type="slot"][data-sc-slot="content"]:empty::after {
  content: ${cssContent(translate("web.editor.placeholder.contentSlot"))};
  position: absolute;
  inset: 32px 12px 10px;
  display: grid;
  place-items: center;
  color: #8a5a19;
  font: 600 13px/1.4 system-ui, sans-serif;
  text-align: center;
  pointer-events: none;
}
.sc-layout-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}
.sc-layout-responsive-grid {
  display: grid;
  grid-template-columns: repeat(var(--sc-layout-columns, 2), minmax(0, 1fr));
  gap: 1rem;
}
.sc-layout-flex { display: flex; }
.sc-layout-flex-column { display: flex; flex-direction: column; }
.sc-list-inline { display: flex; flex-wrap: wrap; gap: 1rem; padding-left: 0; list-style: none; }
.sc-shape-soft { border-radius: 1.75rem 2.2rem 1.6rem 2rem / 2rem 1.6rem 2.2rem 1.7rem !important; }
.sc-shape-blob { border-radius: 2.8rem 1.8rem 2.5rem 2rem / 2rem 2.6rem 1.8rem 2.4rem !important; }
.sc-shape-oval { border-radius: 50% !important; }
.sc-shape-rounded { border-radius: 1rem !important; }
/* Transparent Bootstrap headers need a deliberate canvas-only backdrop when
   their hero sibling is not part of the resource being edited. */
.navbar:has([data-sc-menu-preview]) {
  background-color: #24384b !important;
}
@media (max-width: 575px) {
  .sc-layout-columns,
  .sc-layout-responsive-grid { grid-template-columns: 1fr; }
}
`;

/** Create the stable GrapesJS 0.21.9 configuration used by the React hook. */
export function createEditorConfig({
  container,
  devices,
  styleSectors,
  fontSets = [],
  canvasStyles = [],
  language = "cs",
  translate = (key) => key,
} = {}) {
  const clonedDevices = JSON.parse(JSON.stringify(devices || DEFAULT_DEVICES));
  const clonedSectors = JSON.parse(JSON.stringify(styleSectors || DEFAULT_STYLE_SECTORS));
  const sectorNames = {
    layout: translate("web.editor.inspector.layout"),
    spacing: translate("web.editor.inspector.spacing"),
    grid: translate("web.editor.inspector.grid"),
    typography: translate("web.editor.inspector.typography"),
    decoration: translate("web.editor.inspector.decoration"),
  };
  clonedSectors.forEach((sector) => {
    if (sectorNames[sector.id]) sector.name = sectorNames[sector.id];
    if (sector.id === "typography") {
      sector.properties = sector.properties.map((property) => property === "font-family" ? {
        property: "font-family",
        type: "select",
        options: fontFamilyOptions(fontSets),
      } : property);
    }
  });
  return {
    container,
    fromElement: false,
    height: "100%",
    width: "auto",
    storageManager: false,
    panels: { defaults: [] },
    blockManager: { appendTo: ".web-editor-block-manager" },
    layerManager: { appendTo: ".web-editor-native-layer-manager" },
    traitManager: { appendTo: ".web-editor-trait-manager" },
    deviceManager: { devices: clonedDevices },
    styleManager: {
      appendTo: ".web-editor-style-manager",
      sectors: clonedSectors,
      // Show values inherited from parent/breakpoint as muted, and let the
      // author clear an individual override with a single click.
      showOff: true,
      clearProperties: true,
    },
    // Spectrum color picker attaches to body by default; from within our
    // fixed grid editor it renders off-screen. Anchor it to the inspector
    // panel that contains the Style Manager fields.
    colorPicker: {
      appendTo: ".web-editor-inspector",
    },
    // Canvas-only helpers stay in GrapesJS's base layer. Public theme/global/
    // template CSS is owned by one stable prepended frame-head node in the
    // hook, so it is neither duplicated nor placed after page-owned rules.
    baseCss: editorCanvasCss(translate),
    // GrapesJS otherwise appends its own `body { margin: 0 }` and universal
    // box-sizing reset after the theme. The published renderer has no such
    // editor-only layer, so it can change spacing and text layout in canvas.
    protectedCss: "",
    // Leave escapeName unset so GrapesJS uses its built-in selector escaping.
    // The option accepts a function; passing a boolean breaks CssComposer.
    selectorManager: { componentFirst: true },
    canvas: {
      // URL-based external stylesheets (if any).
      styles: canvasStyles
        .filter((item) => typeof item === "string" || (item && item.href))
        .map((item) => (typeof item === "string" ? item : item.href)),
    },
    richTextEditor: {
      actions: richTextActions(language),
    },
    // GrapesJS v0.21.9 ships English i18n defaults; overlay Czech when the
    // user is browsing in that language so buttons/labels/tooltips are
    // consistent with the surrounding React UI.
    i18n: grapesI18nConfig(language),
  };
}

/** Register all model definitions before any project JSON is loaded. */
export function configureEditor(editor, options = {}) {
  registerScoutCompTypes(editor, options.translate);
  registerBuilderBlocks(editor, options);
  // Keep disclosures collapsed by default so mobile menus and accordions do
  // not cover the canvas. Selecting a details element (or one of its children
  // through the layer tree) opens only its nearest disclosure in the canvas.
  // This is view state only; Project Data and the public `open` attribute are
  // untouched.
  const authoredDisclosures = new WeakSet();
  const disclosureDocuments = new WeakSet();
  const disclosurePointerState = new WeakMap();
  const componentElement = (component) => component?.getView?.()?.el || component?.view?.el;
  const revealSelectedDisclosure = (component) => {
    const element = componentElement(component);
    const disclosure = element?.matches?.("details") ? element : element?.closest?.("details");
    const doc = editor.Canvas?.getDocument?.();
    doc?.querySelectorAll?.("details[data-sc-editor-disclosure]").forEach((item) => {
      if (item !== disclosure && (!disclosure || !item.contains(disclosure)) && !authoredDisclosures.has(item)) item.open = false;
    });
    // A summary click owns its native toggle. Opening it here first would make
    // the browser's default action immediately close it again.
    if (disclosure && element?.tagName?.toLowerCase() !== "summary") {
      disclosure.setAttribute("data-sc-editor-disclosure", "selected");
      disclosure.open = true;
    }
  };
  const registerDisclosure = (component) => {
    if (String(component?.get?.("tagName") || "").toLowerCase() !== "details") return;
    const element = componentElement(component);
    if (!element) return;
    const attributes = component.getAttributes?.() || {};
    if (Object.prototype.hasOwnProperty.call(attributes, "open")) authoredDisclosures.add(element);
    else authoredDisclosures.delete(element);
    element.setAttribute?.("data-sc-editor-disclosure", "ready");
  };
  editor.on?.("component:mount", registerDisclosure);
  editor.on?.("component:update:attributes", registerDisclosure);
  editor.on?.("component:selected", revealSelectedDisclosure);
  const bindDisclosureClicks = () => {
    const doc = editor.Canvas?.getDocument?.();
    if (!doc || disclosureDocuments.has(doc)) return;
    disclosureDocuments.add(doc);
    doc.addEventListener("pointerdown", (event) => {
      const summary = event.target?.closest?.("summary");
      const details = summary?.parentElement;
      if (details?.matches?.("details")) disclosurePointerState.set(details, details.open);
    }, true);
    doc.addEventListener("click", (event) => {
      const summary = event.target?.closest?.("summary");
      const details = summary?.parentElement;
      if (!details?.matches?.("details")) return;
      // Selection may open a disclosure between pointerdown and click. Own the
      // canvas interaction explicitly so one click always means one toggle.
      event.preventDefault();
      const initial = disclosurePointerState.has(details)
        ? disclosurePointerState.get(details)
        : details.open;
      disclosurePointerState.delete(details);
      details.open = !initial;
    });
  };
  editor.on?.("load", bindDisclosureClicks);
  editor.on?.("canvas:frame:load", bindDisclosureClicks);
  return editor;
}
