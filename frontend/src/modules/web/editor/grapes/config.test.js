import { describe, expect, it, vi } from "vitest";

import { createEditorConfig, inlineCanvasCss } from "./config";

describe("GrapesJS editor configuration", () => {
  it("uses one intentional content-slot placeholder and renders column blocks as a grid", () => {
    const config = createEditorConfig({ container: document.createElement("div") });
    expect(config.baseCss).toContain(".sc-layout-columns");
    expect(config.baseCss).not.toContain(":where(div, section, article");
  });

  it("does not replace the selector escape function with a boolean", () => {
    const config = createEditorConfig({ container: document.createElement("div") });

    expect(config.selectorManager.componentFirst).toBe(true);
    expect(config.selectorManager.escapeName).toBeUndefined();
  });

  it("keeps public typography cascade free of GrapesJS-only resets", () => {
    const config = createEditorConfig({
      container: document.createElement("div"),
      canvasStyles: [{ css: "p { line-height: 1.8; font-weight: 600; }" }],
    });

    expect(config.baseCss).not.toContain("p { line-height: 1.8; font-weight: 600; }");
    expect(config.protectedCss).toBe("");
  });

  it("adds semantic list commands and underline to inline text editing", () => {
    const config = createEditorConfig({ container: document.createElement("div"), language: "cs" });
    const actions = config.richTextEditor.actions;
    const unordered = actions.find((action) => action?.name === "bulletedList");
    const ordered = actions.find((action) => action?.name === "numberedList");
    const rte = { exec: vi.fn() };

    unordered.result(rte);
    ordered.result(rte);

    expect(actions).toContain("underline");
    expect(rte.exec).toHaveBeenNthCalledWith(1, "insertUnorderedList");
    expect(rte.exec).toHaveBeenNthCalledWith(2, "insertOrderedList");
  });

  it("does not treat external stylesheet URLs as inline CSS", () => {
    expect(inlineCanvasCss([
      { css: ":root { --color: red; }" },
      { href: "/theme.css" },
      "/legacy-theme.css",
    ])).toBe(":root { --color: red; }");
  });

  it("adds editor-only styling for an empty page content slot", () => {
    const config = createEditorConfig({
      container: document.createElement("div"),
      translate: (key) => ({
        "web.editor.component.contentSlot": "Obsah stránky",
        "web.editor.placeholder.contentSlot": "Přetáhněte sem prvek",
      })[key] || key,
    });

    expect(config.baseCss).toContain('[data-sc-type="slot"][data-sc-slot="content"]');
    expect(config.baseCss).toContain("min-height: 112px");
    expect(config.baseCss).toContain("Obsah stránky");
    expect(config.baseCss).toContain("Přetáhněte sem prvek");
  });

  it("limits the editor drop hint to the explicit content slot", () => {
    const config = createEditorConfig({
      container: document.createElement("div"),
      translate: (key) => key === "web.editor.placeholder.contentSlot"
        ? "Přetáhněte sem prvek"
        : key,
    });

    expect(config.baseCss).toContain('[data-sc-type="slot"][data-sc-slot="content"]:empty::after');
    expect(config.baseCss).not.toContain(":where(div, section, article");
    expect(config.baseCss).toContain("Přetáhněte sem prvek");
  });
});
