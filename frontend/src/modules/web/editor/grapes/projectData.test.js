import { describe, expect, it, vi } from "vitest";
import grapesjs from "grapesjs";

import { createDataSourceBlocks } from "./blocks";
import {
  createBindingTargetOptions,
  removeComponentBinding,
  setComponentBinding,
} from "./bindings";
import { registerScoutCompTypes } from "./componentTypes";
import { getEditorSnapshot, loadEditorProject, normalizeProjectData } from "./projectData";

describe("GrapesJS project helpers", () => {
  it("normalizes project data without mutating the API value", () => {
    const value = { project_data: { pages: [{ id: "page", component: [] }] } };

    const result = normalizeProjectData(value);

    expect(result).toEqual({
      pages: [{ id: "page", component: [] }],
      scoutcomp: { schemaVersion: 2 },
    });
    expect(value.project_data.scoutcomp).toBeUndefined();
  });

  it("loads canonical data and clears editor-only history", () => {
    const editor = {
      loadProjectData: vi.fn(),
      UndoManager: { clear: vi.fn() },
      clearDirtyCount: vi.fn(),
    };
    const projectData = { pages: [{ id: "page", component: [] }] };

    const result = loadEditorProject(editor, { projectData });

    expect(result.importedLegacy).toBe(false);
    expect(editor.loadProjectData).toHaveBeenCalledWith({
      pages: [{ id: "page", component: [] }],
      scoutcomp: { schemaVersion: 2 },
    });
    expect(editor.UndoManager.clear).toHaveBeenCalledOnce();
    expect(editor.clearDirtyCount).toHaveBeenCalledOnce();
  });

  it("preserves the renderer contract in snapshots", () => {
    const component = {
      type: "sc-condition",
      condition: {
        left: { scope: "context", field: "kind" },
        operator: "eq",
        right: "trip",
      },
      components: [
        {
          type: "sc-bind",
          binding: { scope: "context", field: "title" },
          mode: "text",
        },
      ],
    };
    const editor = {
      getProjectData: () => ({ pages: [{ component }] }),
      getHtml: () => "<div></div>",
      getCss: () => "",
      getDirtyCount: () => 3,
    };

    expect(getEditorSnapshot(editor).projectData).toEqual({
      pages: [{ component }],
      scoutcomp: { schemaVersion: 2 },
    });
  });

  it("does not persist editor-only linked resource preview fragments", () => {
    const editor = {
      getProjectData: () => ({ pages: [{ component: {
        type: "sc-resource-instance",
        resourceId: "site:hero",
        props: { title: "Hero" },
        livePreviewHtml: "<section>editor only</section>",
        livePreviewCss: ".hero { color: red; }",
      } }] }),
      getHtml: () => "",
      getCss: () => "",
      getDirtyCount: () => 0,
    };

    expect(getEditorSnapshot(editor).projectData.pages[0].component).toEqual({
      type: "sc-resource-instance",
      resourceId: "site:hero",
      props: { title: "Hero" },
    });
  });

  it("creates serializable collection starters with bind and empty nodes", () => {
    const [block] = createDataSourceBlocks([
      {
        id: "core.example",
        label: "Events",
        collection: true,
        fields: { title: { type: "string" }, description: { type: "string" } },
      },
    ]);

    expect(block.content).toMatchObject({
      type: "sc-repeat",
      source: "core.example",
      params: {},
    });
    expect(block.content.components[0].components[0].components[0]).toMatchObject({
      type: "sc-bind",
      binding: { scope: "context", field: "title" },
    });
    expect(block.content.empty).toEqual([{ type: "sc-empty" }]);
    expect(() => JSON.stringify(block)).not.toThrow();
  });

  it("updates generic attribute bindings as immutable serializable data", () => {
    let value = { title: { scope: "context", field: "title" } };
    const component = {
      get: () => value,
      set: (_name, next) => { value = next; },
    };

    setComponentBinding(component, "href", {
      scope: "context",
      field: "url",
      format: "url",
    });

    expect(value).toEqual({
      title: { scope: "context", field: "title" },
      href: { scope: "context", field: "url", format: "url" },
    });
    removeComponentBinding(component, "title");
    expect(value).toEqual({ href: { scope: "context", field: "url", format: "url" } });
    setComponentBinding(component, "style.color", { scope: "context", field: "color" });
    expect(value["style.color"]).toEqual({ scope: "context", field: "color" });
    expect(() => setComponentBinding(component, "style.position", { field: "position" })).toThrow(
      "Unsupported binding target",
    );
    expect(createBindingTargetOptions((key) => `translated:${key}`)).toContainEqual({
      id: "style.background-color",
      label: "translated:web.editor.data.targetStyleBackgroundColor",
    });
  });

  it("round-trips dynamic nodes through GrapesJS 0.21 project data", () => {
    const editor = grapesjs.init({ headless: true, storageManager: false });
    registerScoutCompTypes(editor);
    const projectData = {
      pages: [{
        id: "page",
        component: {
          type: "wrapper",
          components: [{
            type: "sc-repeat",
            source: "core.events",
            params: { limit: 2 },
            components: [{
              type: "sc-bind",
              binding: { scope: "context", field: "title" },
              mode: "richText",
            }],
            empty: [{ type: "sc-empty", components: [{ type: "text", content: "None" }] }],
          }, {
            type: "default",
            tagName: "article",
            scBindings: {
              "style.color": { scope: "context", field: "color" },
              "style.opacity": { scope: "context", field: "opacity" },
            },
          }],
        },
        styles: [],
      }],
    };

    loadEditorProject(editor, { projectData });
    const repeat = getEditorSnapshot(editor).projectData.pages[0].frames[0].component.components[0];

    expect(repeat).toMatchObject({
      type: "sc-repeat",
      source: "core.events",
      params: { limit: 2 },
      components: [{
        type: "sc-bind",
        binding: { scope: "context", field: "title" },
        mode: "richText",
      }],
      empty: [{ type: "sc-empty" }],
    });
    expect(getEditorSnapshot(editor).projectData.pages[0].frames[0].component.components[1]).toMatchObject({
      tagName: "article",
      scBindings: {
        "style.color": { scope: "context", field: "color" },
        "style.opacity": { scope: "context", field: "opacity" },
      },
    });
    editor.destroy();
  });
});
