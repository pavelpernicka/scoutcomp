import { describe, expect, it } from "vitest";

import { createEditorConfig } from "./config";

describe("GrapesJS editor configuration", () => {
  it("does not replace the selector escape function with a boolean", () => {
    const config = createEditorConfig({ container: document.createElement("div") });

    expect(config.selectorManager.componentFirst).toBe(true);
    expect(config.selectorManager.escapeName).toBeUndefined();
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

  it("keeps empty structural elements large enough to accept drops", () => {
    const config = createEditorConfig({
      container: document.createElement("div"),
      translate: (key) => key === "web.editor.placeholder.contentSlot"
        ? "Přetáhněte sem prvek"
        : key,
    });

    expect(config.baseCss).toContain(":where(div, section, article, header, footer, main, nav, aside):empty");
    expect(config.baseCss).toContain("min-height: 72px");
    expect(config.baseCss).toContain(':not([data-sc-type]):not([aria-hidden="true"])');
    expect(config.baseCss).toContain("Přetáhněte sem prvek");
  });
});
