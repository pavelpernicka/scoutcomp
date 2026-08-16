import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import EditorNavigator from "./EditorNavigator";

const component = (values = {}, children = []) => {
  const node = {
    cid: values.cid || Math.random().toString(36),
    get: (key) => values[key],
    getAttributes: () => values.attributes || {},
    getClasses: () => [],
    getId: () => values.cid,
    getName: () => values.name || "",
    components: () => ({ models: children }),
    parent: () => node.parentNode || null,
    set: vi.fn(),
    unset: vi.fn(),
  };
  children.forEach((child) => { child.parentNode = node; });
  return node;
};

const editorFor = (root) => ({
  getWrapper: () => root,
  on: vi.fn(),
  off: vi.fn(),
  runCommand: vi.fn(),
  select: vi.fn(),
});

describe("EditorNavigator", () => {
  it("highlights the content slot and deletes its selected page-owned child", () => {
    const child = component({ cid: "child", type: "text", tagName: "p", content: "Text" });
    const slot = component({ cid: "slot", type: "sc-slot", name: "content", attributes: { "data-sc-template-owner": "42" }, removable: false }, [child]);
    const root = component({ cid: "root", type: "wrapper", removable: false }, [slot]);
    const editor = editorFor(root);
    const { container } = render(<EditorNavigator editor={editor} selected={child} onSelect={vi.fn()} />);

    expect(screen.getByText(/slot:content/)).toBeInTheDocument();
    const navigator = container.querySelector(".web-editor-navigator");
    fireEvent.keyDown(navigator, { key: "Delete" });

    expect(editor.runCommand).toHaveBeenCalledWith("core:component-delete", { component: child });
    expect(container.querySelector(".web-editor-navigator-row.is-content-slot")).not.toBeNull();
  });

  it("never offers deletion for the content slot itself", () => {
    const slot = component({ cid: "slot", type: "sc-slot", name: "content", removable: false });
    const root = component({ cid: "root", type: "wrapper", removable: false }, [slot]);
    const editor = editorFor(root);
    const { container } = render(<EditorNavigator editor={editor} selected={slot} onSelect={vi.fn()} />);

    expect(container.querySelector(".web-editor-navigator-delete")).toBeNull();
    fireEvent.keyDown(container.querySelector(".web-editor-navigator"), { key: "Delete" });
    expect(editor.runCommand).not.toHaveBeenCalled();
  });
});
