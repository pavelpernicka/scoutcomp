import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import EditorInspector, { replaceComponentCss } from "./EditorInspector";

class FakeSelected {
  constructor(values) {
    this.values = values;
    this.listeners = new Map();
    this.cid = "linked-1";
    this.em = values.editor ? { Editor: values.editor } : undefined;
    this.parentNode = values.parent || null;
  }

  get(key) { return this.values[key]; }
  getAttributes() { return this.values.attributes || {}; }
  addAttributes(next) { this.values.attributes = { ...(this.values.attributes || {}), ...next }; }
  removeAttributes(name) { const next = { ...(this.values.attributes || {}) }; delete next[name]; this.values.attributes = next; }
  getClasses() { return []; }
  parent() { return this.parentNode; }
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
  replaceWith(value) { return this.values.replaceWith?.(value) || []; }
}

describe("EditorInspector linked props", () => {
  it("keeps native content and style mounts available before a selection", () => {
    const { container } = render(<EditorInspector
      selected={null}
      dataSources={[]}
      resources={{ components: [], sections: [] }}
      onDuplicate={vi.fn()}
      onDelete={vi.fn()}
    />);

    expect(container.querySelector(".web-editor-trait-manager")).toBeInTheDocument();
    expect(container.querySelector(".web-editor-style-manager")).toBeInTheDocument();
  });

  it("configures a repeat from the declared data-source schema", () => {
    const onContentChange = vi.fn();
    const selected = new FakeSelected({ type: "sc-repeat", source: "", params: {} });
    render(<EditorInspector
      selected={selected}
      dataSources={[{
        id: "core.events",
        label: "Events",
        collection: true,
        fields: { title: { label: "Title" }, url: { label: "URL" } },
        parameters: {
          kind: { type: "string", label: "Kind", choices: ["meeting", "trip"] },
          limit: { type: "integer", label: "Limit", default: 10, minimum: 1, maximum: 50 },
        },
      }]}
      resources={{ components: [], sections: [] }}
      onDuplicate={vi.fn()}
      onDelete={vi.fn()}
      onContentChange={onContentChange}
    />);

    fireEvent.click(screen.getAllByRole("tab")[2]);
    fireEvent.change(screen.getByLabelText(/Zdroj|Source/), { target: { value: "core.events" } });
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "trip" } });
    fireEvent.change(screen.getByLabelText("Limit"), { target: { value: "12" } });

    expect(selected.values.source).toBe("core.events");
    expect(selected.values.params).toEqual({ kind: "trip", limit: 12 });
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(onContentChange).toHaveBeenCalled();
  });

  it("configures a meeting list for an explicit team without page coupling", () => {
    const selected = new FakeSelected({ type: "sc-repeat", source: "core.events", params: {} });
    render(<EditorInspector
      selected={selected}
      dataSources={[{
        id: "core.events", label: "Events", collection: true,
        fields: { title: { label: "Title" } },
        parameters: { team_id: { type: "integer", label: "Team", minimum: 1 } },
      }]}
      resources={{ components: [], sections: [] }}
      onDuplicate={vi.fn()}
      onDelete={vi.fn()}
      onContentChange={vi.fn()}
    />);

    fireEvent.click(screen.getAllByRole("tab")[2]);
    fireEvent.change(screen.getByLabelText("Team"), { target: { value: "7" } });
    expect(selected.values.params).toEqual({ team_id: 7 });
  });

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

  it("offers the shared media picker from an image content panel", () => {
    const onSelectMedia = vi.fn();
    const selected = new FakeSelected({
      type: "image",
      attributes: { src: "blob:preview", alt: "Výprava", "data-sc-media-id": "12" },
    });
    render(<EditorInspector
      selected={selected}
      dataSources={[]}
      resources={{ components: [], sections: [] }}
      onDuplicate={vi.fn()}
      onDelete={vi.fn()}
      onSelectMedia={onSelectMedia}
    />);

    fireEvent.click(screen.getByRole("button", { name: /Vybrat médium|Choose media/ }));
    expect(onSelectMedia).toHaveBeenCalledWith(selected);
    expect(screen.getByLabelText(/Alternativní text|Alternative text/)).toHaveValue("Výprava");
    const source = screen.getByLabelText(/Zdroj obrázku|Image source/);
    fireEvent.change(source, { target: { value: "/custom/hero.jpg" } });
    fireEvent.blur(source);
    expect(selected.values.attributes.src).toBe("/custom/hero.jpg");
    expect(selected.values.attributes["data-sc-media-id"]).toBeUndefined();
  });

  it("keeps linked template shell read-only and routes editing to its definition", () => {
    const onEditTemplate = vi.fn();
    const selected = new FakeSelected({
      type: "default",
      attributes: { "data-sc-template-owner": "42" },
    });
    render(<EditorInspector
      selected={selected}
      dataSources={[]}
      resources={{ components: [], sections: [] }}
      onDuplicate={vi.fn()}
      onDelete={vi.fn()}
      onEditTemplate={onEditTemplate}
    />);

    fireEvent.click(screen.getByRole("button", { name: /Upravit šablonu|Edit template/ }));
    expect(onEditTemplate).toHaveBeenCalledWith(42);
  });

  it("applies raw component code through GrapesJS and reports a persistence change", () => {
    const replacement = {};
    const editor = {
      getHtml: () => "<div>Old</div>",
      getCss: () => ".old{color:red}",
      Parser: {
        parseHtml: vi.fn(() => ({ html: [{ type: "text", content: "New" }] })),
        parseCss: vi.fn(() => []),
      },
      Css: { addRules: vi.fn() },
      select: vi.fn(),
    };
    const replaceWith = vi.fn(() => [replacement]);
    const onContentChange = vi.fn();
    const selected = new FakeSelected({ type: "default", tagName: "div", editor, replaceWith });
    render(<EditorInspector
      selected={selected}
      dataSources={[]}
      resources={{ components: [], sections: [] }}
      onDuplicate={vi.fn()}
      onDelete={vi.fn()}
      onContentChange={onContentChange}
    />);

    fireEvent.click(screen.getAllByRole("tab")[3]);
    const [htmlInput, cssInput] = screen.getAllByRole("textbox");
    fireEvent.change(htmlInput, { target: { value: "<section>Changed</section>" } });
    fireEvent.change(cssInput, { target: { value: ".changed{color:blue}" } });
    fireEvent.click(screen.getByRole("button", { name: /Použít kód|Apply code/ }));

    expect(replaceWith).toHaveBeenCalled();
    expect(editor.Css.addRules).toHaveBeenCalledWith(".changed{color:blue}");
    expect(editor.select).toHaveBeenCalledWith(replacement);
    expect(onContentChange).toHaveBeenCalled();
  });

  it("removes component CSS rules when raw CSS is cleared", () => {
    const oldRule = {
      getSelectorsString: () => ".old",
      get: (key) => ({ state: "", mediaText: "", atRuleType: "" })[key],
    };
    const remove = vi.fn();
    const addRules = vi.fn();
    const editor = {
      Parser: { parseCss: vi.fn(() => [{ selectors: ["old"], style: { color: "red" } }]) },
      Css: { getAll: () => ({ models: [oldRule] }), remove, addRules },
    };

    replaceComponentCss(editor, ".old{color:red}", "");

    expect(remove).toHaveBeenCalledWith([oldRule]);
    expect(addRules).not.toHaveBeenCalled();
  });
});
