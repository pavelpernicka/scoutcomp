import { describe, expect, it, vi } from "vitest";

import { insertEditorComponents, resolveInsertionTarget } from "./editorInsertion";

const component = (values = {}, children = []) => {
  const node = {
    values,
    children,
    get: (key) => values[key],
    components: () => ({ models: children }),
    append: vi.fn(() => ["added"]),
    parent: () => node.parentNode || null,
  };
  children.forEach((child) => { child.parentNode = node; });
  return node;
};

describe("editor insertion target", () => {
  it("inserts programmatic content into the linked template content slot", () => {
    const slot = component({ type: "sc-slot", name: "content", droppable: true });
    const shell = component({ type: "wrapper" }, [component({ type: "default" }), slot]);
    const editor = { getWrapper: () => shell, getSelected: () => shell, addComponents: vi.fn() };

    expect(resolveInsertionTarget(editor)).toBe(slot);
    expect(insertEditorComponents(editor, { type: "text" })).toEqual(["added"]);
    expect(slot.append).toHaveBeenCalledWith({ type: "text" });
    expect(editor.addComponents).not.toHaveBeenCalled();
  });

  it("uses a selected droppable page-owned container inside the slot", () => {
    const container = component({ type: "default" });
    const slot = component({ type: "sc-slot", name: "content", droppable: true }, [container]);
    const root = component({ type: "wrapper" }, [slot]);
    const editor = { getWrapper: () => root, getSelected: () => container };

    expect(resolveInsertionTarget(editor)).toBe(container);
  });
});
