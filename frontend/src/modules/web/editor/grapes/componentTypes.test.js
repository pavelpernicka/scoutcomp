import { describe, expect, it, vi } from "vitest";

import { registerScoutCompTypes } from "./componentTypes";

describe("ScoutComp component types", () => {
  it("registers the page content slot as a large safe drop boundary", () => {
    const definitions = new Map();
    const addType = vi.fn((id, definition) => definitions.set(id, definition));
    registerScoutCompTypes({ Components: { addType } }, (key) => key);

    const defaults = definitions.get("sc-slot").model.defaults;
    expect(defaults).toMatchObject({
      name: "content",
      draggable: false,
      removable: false,
      copyable: false,
      stylable: false,
      editable: false,
      selectable: true,
      layerable: true,
    });
    expect(defaults.droppable).toContain(':not([data-sc-type="slot"])');
    expect(defaults.style).toBeUndefined();
  });

  it("keeps linked resources atomic while providing an editor-only preview view", () => {
    const definitions = new Map();
    registerScoutCompTypes({ Components: { addType: (id, definition) => definitions.set(id, definition) } });

    const definition = definitions.get("sc-resource-instance");
    expect(definition.model.defaults).toMatchObject({
      droppable: false,
      editable: false,
    });
    expect(definition.model.defaults.style.minHeight).toBe("96px");
    expect(definition.view.onRender).toBeTypeOf("function");
  });
});
