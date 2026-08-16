import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import EditorInspector from "./EditorInspector";

class FakeSelected {
  constructor(values) {
    this.values = values;
    this.listeners = new Map();
    this.cid = "linked-1";
  }

  get(key) { return this.values[key]; }
  getAttributes() { return {}; }
  getClasses() { return []; }
  on(event, handler) {
    const handlers = this.listeners.get(event) || new Set();
    handlers.add(handler);
    this.listeners.set(event, handlers);
  }
  off(event, handler) { this.listeners.get(event)?.delete(handler); }
  set(key, value) {
    this.values[key] = value;
    this.listeners.get(`change:${key}`)?.forEach((handler) => handler());
  }
}

describe("EditorInspector linked props", () => {
  it("reflects GrapesJS undo and external prop changes", () => {
    const selected = new FakeSelected({
      type: "sc-resource-instance",
      resourceKind: "component",
      resourceId: "site:card",
      resourceName: "Card",
      props: { title: "Current" },
    });
    render(<EditorInspector
      selected={selected}
      dataSources={[]}
      resources={{ components: [{ qualified_key: "site:card", name: "Card", prop_schema: [{ id: "title", type: "text", label: "Title" }] }], sections: [] }}
      onDuplicate={vi.fn()}
      onDelete={vi.fn()}
    />);

    expect(screen.getByLabelText("Title")).toHaveValue("Current");
    act(() => selected.set("props", { title: "Restored by undo" }));
    expect(screen.getByLabelText("Title")).toHaveValue("Restored by undo");
  });
});
