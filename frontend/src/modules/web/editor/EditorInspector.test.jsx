import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import EditorInspector, { findNearestRepeat, IconPicker, replaceComponentCss } from "./EditorInspector";

class FakeSelected {
  constructor(values) {
    this.values = values;
    this.listeners = new Map();
    this.cid = "linked-1";
    this.em = values.editor ? { Editor: values.editor } : undefined;
    this.parentNode = values.parent || null;
    this.children = values.children || [];
    this.children.forEach((child) => { child.parentNode = this; });
  }

  get(key) { return this.values[key]; }
  getAttributes() { return this.values.attributes || {}; }
  addAttributes(next) { this.values.attributes = { ...(this.values.attributes || {}), ...next }; }
  removeAttributes(name) { const next = { ...(this.values.attributes || {}) }; delete next[name]; this.values.attributes = next; }
  getStyle() { return this.values.style || {}; }
  addStyle(next) { this.values.style = { ...(this.values.style || {}), ...next }; }
  removeStyle(name) { const next = { ...(this.values.style || {}) }; delete next[name]; this.values.style = next; }
  getClasses() { return String(this.values.attributes?.class || "").split(/\s+/).filter(Boolean); }
  setClass(next) { this.values.attributes = { ...(this.values.attributes || {}), class: next.join(" ") }; }
  parent() { return this.parentNode; }
  components() { return { models: this.children, reset: () => { this.children = []; } }; }
  append(definition) {
    const child = definition instanceof FakeSelected ? definition : new FakeSelected({
      ...definition,
      children: definition.components || [],
    });
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
  }
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
  it("offers a keyboard accessible icon autocomplete with a visual preview", () => {
    const onChange = vi.fn();
    render(<IconPicker label="Ikona tlačítka" value="compass" icons={["tent", "arrow-right"]} allowNone onChange={onChange} />);

    const search = screen.getByRole("combobox", { name: "Ikona tlačítka" });
    expect(screen.getByText("fa-compass")).toBeInTheDocument();
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: "tent" } });
    expect(search).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("tent");
  });

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

  it("configures the public calendar without generic data bindings", () => {
    const onContentChange = vi.fn();
    const selected = new FakeSelected({
      type: "sc-calendar",
      kind: "all",
      teamId: "",
      firstDayOfWeek: "monday",
      showDescription: true,
    });
    render(<EditorInspector
      selected={selected}
      dataSources={[]}
      resources={{ components: [], sections: [] }}
      onDuplicate={vi.fn()}
      onDelete={vi.fn()}
      onContentChange={onContentChange}
    />);

    fireEvent.click(screen.getAllByRole("tab")[2]);
    fireEvent.change(screen.getByLabelText(/Typ akcí|Event kind/), { target: { value: "trip" } });
    fireEvent.change(screen.getByLabelText(/ID družiny|Team ID/), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText(/První den týdne|First day of week/), { target: { value: "sunday" } });
    fireEvent.click(screen.getByLabelText(/Zobrazit stručný popis|Show the event summary/));

    expect(selected.values).toMatchObject({
      kind: "trip",
      teamId: 12,
      firstDayOfWeek: "sunday",
      showDescription: false,
    });
    expect(onContentChange).toHaveBeenCalledTimes(4);
  });

  it("binds pagination to the nearest preceding repeat and configures its behavior", () => {
    const posts = new FakeSelected({ type: "sc-repeat", source: "core.posts", params: { limit: 9 } });
    const events = new FakeSelected({ type: "sc-repeat", source: "core.events", params: { kind: "meeting", limit: 6 } });
    const pagination = new FakeSelected({ type: "sc-pagination", bindTo: "nearest", pageSize: null, mode: "simple" });
    new FakeSelected({ type: "wrapper", children: [posts, new FakeSelected({ type: "div", children: [events] }), pagination] });
    const onContentChange = vi.fn();

    expect(findNearestRepeat(pagination)).toBe(events);
    render(<EditorInspector
      selected={pagination}
      dataSources={[{
        id: "core.events", label: "Events", collection: true,
        fields: { title: { label: "Title" } },
        parameters: {
          limit: { type: "integer", label: "Limit", default: 10, minimum: 1, maximum: 50 },
          page: { type: "integer", label: "Page", minimum: 1 },
        },
      }]}
      resources={{ components: [], sections: [] }}
      onDuplicate={vi.fn()}
      onDelete={vi.fn()}
      onContentChange={onContentChange}
    />);

    fireEvent.click(screen.getAllByRole("tab")[2]);
    expect(screen.getByText(/Events/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Položek na stránku|Items per page/), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText(/Vzhled stránkování|Pagination appearance/), { target: { value: "numbers" } });
    fireEvent.change(screen.getByLabelText(/Text tlačítka dál|Next button text/), { target: { value: "Pokračovat" } });

    expect(events.values.params).toEqual({
      kind: "meeting",
      limit: 12,
      page: { $scBinding: { scope: "page", field: "query.page" } },
    });
    expect(pagination.values).toMatchObject({
      bindTo: "nearest",
      source: "core.events",
      pageSize: 12,
      limit: 12,
      mode: "numbers",
      nextLabel: "Pokračovat",
    });
    expect(pagination.values.params).toEqual(events.values.params);
    expect(onContentChange).toHaveBeenCalled();
  });

  it("shows a useful warning when pagination has no nearby repeat", () => {
    const pagination = new FakeSelected({ type: "sc-pagination", bindTo: "nearest" });
    render(<EditorInspector
      selected={pagination}
      dataSources={[]}
      resources={{ components: [], sections: [] }}
      onDuplicate={vi.fn()}
      onDelete={vi.fn()}
    />);

    fireEvent.click(screen.getAllByRole("tab")[2]);
    expect(screen.getByText(/V blízkosti není žádné Opakování|There is no Repeat nearby/)).toBeInTheDocument();
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
      attributes: { src: "blob:preview", alt: "Výprava", "data-sc-media-id": "12", "data-sc-template-logo": "hero-mark" },
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
    expect(screen.queryByText(/Loga šablony|Template logos/)).not.toBeInTheDocument();
  });

  it("offers targeted media changes for template logos inside the selected source", () => {
    const onSelectMedia = vi.fn();
    const onContentChange = vi.fn();
    const lightLogo = new FakeSelected({ type: "image", attributes: { "data-sc-template-logo": "navigation-light" } });
    const darkLogo = new FakeSelected({ type: "image", attributes: { "data-sc-template-logo": "navigation-dark" } });
    const selected = new FakeSelected({ type: "default", tagName: "nav", children: [lightLogo, darkLogo] });
    render(<EditorInspector
      selected={selected}
      dataSources={[]}
      resources={{ components: [], sections: [] }}
      onDuplicate={vi.fn()}
      onDelete={vi.fn()}
      onSelectMedia={onSelectMedia}
      onContentChange={onContentChange}
    />);

    expect(screen.getByText(/Změna platí pouze|This change applies only/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Změnit logo:.*světlé|Change logo:.*light/i }));
    expect(onSelectMedia).toHaveBeenCalledTimes(1);
    expect(onSelectMedia).toHaveBeenCalledWith(lightLogo);
    fireEvent.click(screen.getByRole("button", { name: /Odebrat logo:.*světlé|Remove logo:.*light/i }));
    expect(lightLogo.values.attributes["data-sc-template-logo-hidden"]).toBe("true");
    expect(screen.getByRole("button", { name: /Použít logo:.*světlé|Use logo:.*light/i })).toBeInTheDocument();
    expect(onContentChange).toHaveBeenCalledTimes(1);
  });

  it("edits a hero background and overlay from a selected mask child", () => {
    const onSelectMedia = vi.fn();
    const onContentChange = vi.fn();
    const mask = new FakeSelected({ type: "default", tagName: "div", attributes: { class: "ontario-photo-mask" } });
    const hero = new FakeSelected({
      type: "default",
      tagName: "header",
      attributes: { class: "ontario-hero" },
      style: { "background-image": "url(hero.jpg)", "--sc-hero-tint": "#123456", "--sc-hero-tint-opacity": ".7" },
      children: [mask],
    });
    render(<EditorInspector
      selected={mask}
      dataSources={[]}
      resources={{ components: [], sections: [] }}
      onDuplicate={vi.fn()}
      onDelete={vi.fn()}
      onSelectMedia={onSelectMedia}
      onContentChange={onContentChange}
    />);

    expect(screen.getByText(/Pozadí a barevná maska|Background and color overlay/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Barva masky|Overlay color/)).toHaveValue("#123456");
    fireEvent.click(screen.getByRole("button", { name: /Vybrat médium|Choose media/ }));
    expect(onSelectMedia).toHaveBeenCalledWith({ component: hero, mode: "background" });
    fireEvent.change(screen.getByLabelText(/Pozice obrázku|Image position/), { target: { value: "top" } });
    fireEvent.change(screen.getByLabelText(/Barva masky|Overlay color/), { target: { value: "#abcdef" } });
    fireEvent.change(screen.getByLabelText(/Intenzita masky|Overlay intensity/), { target: { value: "35" } });
    fireEvent.click(screen.getByLabelText(/Použít barevnou masku|Use color overlay/));

    expect(hero.values.style).toMatchObject({
      "background-position": "center top",
      "--sc-overlay-color": "#abcdef",
      "--sc-overlay-opacity": "0.35",
    });
    expect(hero.values.attributes["data-sc-overlay-enabled"]).toBe("false");
    expect(onContentChange).toHaveBeenCalledTimes(4);
  });

  it("uses the image inside a media overlay card", () => {
    const onSelectMedia = vi.fn();
    const image = new FakeSelected({ type: "image", tagName: "img", attributes: { class: "ontario-media-link-image", src: "card.jpg", "data-sc-media-id": "8" } });
    const mask = new FakeSelected({ type: "default", tagName: "span", attributes: { class: "ontario-media-link-mask" } });
    const card = new FakeSelected({ type: "link", tagName: "a", attributes: { class: "ontario-media-link" }, children: [image, mask] });
    render(<EditorInspector
      selected={card}
      dataSources={[]}
      resources={{ components: [], sections: [] }}
      onDuplicate={vi.fn()}
      onDelete={vi.fn()}
      onSelectMedia={onSelectMedia}
      onContentChange={vi.fn()}
    />);

    fireEvent.click(screen.getByRole("button", { name: /Vybrat médium|Choose media/ }));
    expect(onSelectMedia).toHaveBeenCalledWith(image);
    fireEvent.change(screen.getByLabelText(/Pozice obrázku|Image position/), { target: { value: "right" } });
    expect(image.values.style["object-position"]).toBe("right center");
    fireEvent.click(screen.getByRole("button", { name: /^Odebrat$|^Remove$/ }));
    expect(image.values.attributes.src).toBeUndefined();
    expect(image.values.attributes["data-sc-media-id"]).toBeUndefined();
  });

  it("normalizes button content when adding an icon and supports icon-only labels", () => {
    const onContentChange = vi.fn();
    const selected = new FakeSelected({ type: "default", tagName: "button", content: "Pokračovat", attributes: { class: "btn btn-primary" } });
    render(<EditorInspector
      selected={selected}
      dataSources={[]}
      resources={{ components: [], sections: [] }}
      fontAwesomeIcons={["arrow-right"]}
      onDuplicate={vi.fn()}
      onDelete={vi.fn()}
      onContentChange={onContentChange}
    />);

    const iconSearch = screen.getByLabelText(/Ikona tlačítka|Button icon/);
    fireEvent.focus(iconSearch);
    fireEvent.change(iconSearch, { target: { value: "arrow-right" } });
    fireEvent.click(screen.getByRole("option", { name: "arrow-right" }));
    const icon = selected.children.find((child) => child.values.attributes?.["data-sc-button-icon"] !== undefined);
    const label = selected.children.find((child) => child.getClasses().includes("sc-button-label"));
    expect(icon.getClasses()).toEqual(expect.arrayContaining(["fa-solid", "fa-arrow-right", "sc-button-icon"]));
    expect(icon.values.attributes["aria-hidden"]).toBe("true");
    expect(label.values.content).toBe("Pokračovat");
    fireEvent.change(screen.getByLabelText(/Pozice ikony|Icon position/), { target: { value: "right" } });
    expect(selected.getClasses()).toContain("sc-button-icon-right");
    fireEvent.change(screen.getByLabelText(/^Text$|^Label$/), { target: { value: "" } });
    expect(selected.getClasses()).toContain("sc-button-icon-only");
    expect(screen.getByRole("alert")).toHaveTextContent(/přístupný název|accessible label/i);
    fireEvent.change(screen.getByLabelText(/Přístupný název|Accessible label/), { target: { value: "Pokračovat dál" } });
    expect(selected.values.attributes["aria-label"]).toBe("Pokračovat dál");
  });

  it("changes a social link network, icon and accessible link data", () => {
    const icon = new FakeSelected({ type: "default", tagName: "i", attributes: { class: "fa-brands fa-instagram", "aria-hidden": "true" } });
    const selected = new FakeSelected({ type: "link", tagName: "a", attributes: { class: "ontario-social-link ontario-social-instagram", href: "#", "aria-label": "Instagram" }, children: [icon] });
    render(<EditorInspector
      selected={selected}
      dataSources={[]}
      resources={{ components: [], sections: [] }}
      onDuplicate={vi.fn()}
      onDelete={vi.fn()}
      onContentChange={vi.fn()}
    />);

    fireEvent.change(screen.getByLabelText(/Síť nebo služba|Network or service/), { target: { value: "linkedin" } });
    expect(selected.getClasses()).toEqual(expect.arrayContaining(["ontario-social-link", "ontario-social-linkedin"]));
    expect(icon.getClasses()).toEqual(expect.arrayContaining(["fa-brands", "fa-linkedin-in"]));
    expect(selected.values.attributes["aria-label"]).toBe("LinkedIn");
    fireEvent.change(screen.getByLabelText(/Adresa odkazu|Link address/), { target: { value: "https://linkedin.com/company/scout" } });
    expect(selected.values.attributes.href).toBe("https://linkedin.com/company/scout");
  });

  it("applies each new organic button mask through the general class mapping", () => {
    const onContentChange = vi.fn();
    const selected = new FakeSelected({ type: "default", tagName: "a", content: "Více", attributes: { class: "btn btn-primary sc-mask-button-rugged" } });
    render(<EditorInspector
      selected={selected}
      dataSources={[]}
      resources={{ components: [], sections: [] }}
      onDuplicate={vi.fn()}
      onDelete={vi.fn()}
      onContentChange={onContentChange}
    />);

    const maskSelect = screen.getByLabelText(/Organický tvar|Organic shape/);
    expect(maskSelect).toHaveValue("natural");
    expect(screen.queryByRole("option", { name: /Rugged/i })).not.toBeInTheDocument();
    fireEvent.change(maskSelect, { target: { value: "flow" } });
    expect(selected.getClasses()).toContain("sc-mask-button-flow");
    expect(selected.getClasses()).not.toContain("sc-mask-button-rugged");
    fireEvent.change(maskSelect, { target: { value: "pebble" } });
    expect(selected.getClasses()).toContain("sc-mask-button-pebble");
    expect(onContentChange).toHaveBeenCalledTimes(2);
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
