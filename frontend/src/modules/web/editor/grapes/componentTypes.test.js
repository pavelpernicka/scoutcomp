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

  it("registers a first-class hierarchical menu with a location trait", () => {
    const definitions = new Map();
    registerScoutCompTypes({ Components: { addType: (id, definition) => definitions.set(id, definition) } });

    const defaults = definitions.get("sc-menu").model.defaults;
    expect(defaults).toMatchObject({ tagName: "nav", droppable: false, location: "main" });
    expect(defaults.traits[0].name).toBe("location");
  });

  it("registers pagination as a nearest-repeat binding instead of a copied source", () => {
    const definitions = new Map();
    registerScoutCompTypes({ Components: { addType: (id, definition) => definitions.set(id, definition) } });

    const defaults = definitions.get("sc-pagination").model.defaults;
    expect(defaults).toMatchObject({
      bindTo: "nearest",
      source: "",
      pageSize: null,
      mode: "simple",
      params: {},
    });
  });

  it("registers an atomic calendar with configurable renderer props and an editor preview", () => {
    const definitions = new Map();
    registerScoutCompTypes({ Components: { addType: (id, definition) => definitions.set(id, definition) } });

    const definition = definitions.get("sc-calendar");
    expect(definition.model.defaults).toMatchObject({
      tagName: "section",
      droppable: false,
      editable: false,
      kind: "all",
      teamId: "",
      firstDayOfWeek: "monday",
      showDescription: true,
    });
    expect(definition.view.onRender).toBeTypeOf("function");

    const values = { ...definition.model.defaults };
    const view = {
      el: document.createElement("section"),
      model: { get: (key) => values[key] },
    };
    definition.view.renderCalendar.call(view);
    expect(view.el.querySelector("[data-sc-calendar-preview]")).not.toBeNull();
    expect(view.el.textContent).toContain("web.editor.calendar.sampleMeetingDescription");
    values.showDescription = false;
    definition.view.renderCalendar.call(view);
    expect(view.el.textContent).not.toContain("web.editor.calendar.sampleMeetingDescription");
  });
});
