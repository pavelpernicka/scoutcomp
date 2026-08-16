import { DEFAULT_DEVICES, DEFAULT_STYLE_SECTORS } from "./constants";
import { registerBuilderBlocks } from "./blocks";
import { registerScoutCompTypes } from "./componentTypes";
import { grapesI18nConfig } from "./i18n";

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
  const baseCss = canvasStyles
    .filter((item) => item && !item.href)  // href items are external <link>s
    .map((item) => item.css || "")
    .filter(Boolean)
    .join("\n");

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
    selectorManager: { componentFirst: true, escapeName: true },
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
