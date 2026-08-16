import { describe, expect, it } from "vitest";

import { getComponentDisplayName, getComponentTechnicalName } from "./componentDisplayName";

const component = (values = {}, attributes = {}, children = []) => ({
  get: (key) => values[key],
  getAttributes: () => attributes,
  getClasses: () => values.classes || [],
  components: () => ({ models: children }),
});

const t = (key) => ({
  "web.editor.component.bind": "Vazba",
  "web.editor.component.repeat": "Opakování",
  "web.editor.navigator.tags.heading": "Nadpis",
  "web.editor.navigator.tags.link": "Odkaz",
  "web.editor.navigator.tags.image": "Obrázek",
  "web.editor.navigator.tags.header": "Záhlaví",
  "web.editor.component.contentSlot": "Obsah stránky",
}[key] || key);

describe("component display names", () => {
  it("prefers an explicit user layer name", () => {
    expect(getComponentDisplayName(component({ "custom-name": "Úvodní blok", type: "default", tagName: "div" }), t)).toBe("Úvodní blok");
  });

  it("describes dynamic nodes with their source field", () => {
    expect(getComponentDisplayName(component({ type: "sc-repeat", source: "core.events" }), t)).toBe("Opakování · core.events");
    expect(getComponentDisplayName(component({ type: "sc-bind", binding: { field: "title" } }), t)).toBe("Vazba · title");
  });

  it("uses semantic text labels instead of Default", () => {
    expect(getComponentDisplayName(component({ type: "text", tagName: "h1", content: "Vítejte u nás" }), t)).toBe("Nadpis „Vítejte u nás“");
    expect(getComponentDisplayName(component({ type: "default", tagName: "header" }), t)).toBe("Záhlaví");
  });

  it("shows meaningful classes and technical DOM identity", () => {
    const hero = component({ type: "default", tagName: "section", classes: ["hero", "hero--large"] }, { id: "homepage-hero" });
    expect(getComponentDisplayName(hero, t)).toBe("Hero");
    expect(getComponentTechnicalName(hero)).toBe("section#homepage-hero.hero.hero--large");
  });

  it("names the template content slot explicitly", () => {
    const slot = component({ type: "sc-slot", name: "content" });
    expect(getComponentDisplayName(slot, t)).toBe("Obsah stránky");
    expect(getComponentTechnicalName(slot)).toBe("slot:content");
  });
});
