import { DEFAULT_DEVICES, DEFAULT_STYLE_SECTORS } from "./constants";
import { registerBuilderBlocks } from "./blocks";
import { registerScoutCompTypes } from "./componentTypes";
import { grapesI18nConfig } from "./i18n";

const cssContent = (value) => JSON.stringify(String(value || ""));

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
:where(div, section, article, header, footer, main, nav, aside):empty:not([data-sc-type]):not([aria-hidden="true"]) {
  box-sizing: border-box !important;
  position: relative !important;
  min-height: 72px !important;
  outline: 1px dashed rgba(104, 109, 204, .72) !important;
  outline-offset: -1px !important;
  background-color: rgba(104, 109, 204, .05) !important;
}
:where(div, section, article, header, footer, main, nav, aside):empty:not([data-sc-type]):not([aria-hidden="true"])::after {
  content: ${cssContent(translate("web.editor.placeholder.contentSlot"))};
  position: absolute;
  inset: 8px;
  display: grid;
  place-items: center;
  color: #5b61b5;
  font: 600 12px/1.4 system-ui, sans-serif;
  text-align: center;
  pointer-events: none;
}
`;

/** Create the stable GrapesJS 0.21.9 configuration used by the React hook. */
export function createEditorConfig({
  container,
  devices,
  styleSectors,
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
  });
  // Build inline canvas CSS from the same source the public renderer uses.
  // GrapesJS places `baseCss` into a <style> element inside the iframe body,
  // making tokens, theme styles, and site-wide CSS active for every component.
  const sourceCss = canvasStyles
    .filter((item) => item && !item.href)  // href items are external <link>s
    .map((item) => item.css || "")
    .filter(Boolean)
    .join("\n");
  const baseCss = [sourceCss, editorCanvasCss(translate)].filter(Boolean).join("\n");

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
    // Inline canvas styles delivered through GrapesJS's own baseCss channel.
    // This is the native mechanism for injecting tokens + theme CSS + global
    // CSS into the editor iframe; no manual DOM surgery needed.
    baseCss,
    // Leave escapeName unset so GrapesJS uses its built-in selector escaping.
    // The option accepts a function; passing a boolean breaks CssComposer.
    selectorManager: { componentFirst: true },
    canvas: {
      // URL-based external stylesheets (if any).
      styles: canvasStyles
        .filter((item) => typeof item === "string" || (item && item.href))
        .map((item) => (typeof item === "string" ? item : item.href)),
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
  return editor;
}
