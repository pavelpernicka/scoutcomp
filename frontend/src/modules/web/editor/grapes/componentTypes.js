import { SC_COMPONENT_TYPES } from "./constants";

const trait = (type, name, label, extra = {}) => ({
  type,
  name,
  label,
  changeProp: true,
  ...extra,
});

const selectOptions = (values) => values.map(([id, label]) => ({ id, label }));

const matchesType = (name) => (element) =>
  element?.getAttribute?.("data-sc-type") === name;

const safePreviewUrl = (value) => {
  const url = String(value || "").trim();
  return /^(?:https?:|data:image\/|blob:|\/)/i.test(url) ? url : "";
};

/**
 * Register ScoutComp's declarative nodes including their editor views.
 * Custom components get a dashed border + inline badge so authors see
 * styled placeholders; publish-time rendering runs in the backend renderer.
 *
 * IMPORTANT: we only use `content` + `style` in defaults — never mutate
 * `components` in init(). GrapesJS 0.21 expects child component models, not
 * plain JSON objects.
 */
export function registerScoutCompTypes(editor, translate = (key) => key) {
  const components = editor.Components;

  // ── sc-slot ──────────────────────────────────────────────────────────
  components.addType(SC_COMPONENT_TYPES.slot, {
    isComponent: matchesType("slot"),
    model: {
      defaults: {
        tagName: "div",
        name: "content",
        attributes: { "data-sc-type": "slot", "data-sc-slot": "content" },
        droppable: ':not([data-sc-type="slot"])',
        draggable: false,
        removable: false,
        copyable: false,
        stylable: false,
        editable: false,
        selectable: true,
        layerable: true,
        toolbar: [],
        traits: [],
      },
      init() {
        this.syncSlotAttributes();
        this.listenTo(this, "change:name", this.syncSlotAttributes);
      },
      syncSlotAttributes() {
        this.addAttributes({
          "data-sc-type": "slot",
          "data-sc-slot": this.get("name") || "content",
        }, { silent: true });
      },
    },
  });

  // ── sc-bind ──────────────────────────────────────────────────────────
  components.addType(SC_COMPONENT_TYPES.bind, {
    isComponent: matchesType("bind"),
    model: {
      defaults: {
        tagName: "span",
        name: translate("web.editor.component.bind"),
        attributes: { "data-sc-type": "bind" },
        droppable: false,
        binding: { scope: "context", field: "title" },
        bindingScope: "context",
        bindingSource: "",
        bindingField: "title",
        bindingFormat: "",
        mode: "text",
        content: "{{ title }}",
        style: {
          display: "inline-block",
          padding: "2px 8px",
          border: "1px dashed #b7baf5",
          borderRadius: "2px",
          color: "#b7baf5",
          fontFamily: "monospace",
          fontSize: "12px",
          background: "rgba(183,186,245,.08)",
        },
        traits: [
          trait("select", "bindingScope", translate("web.editor.data.scope"), {
            options: selectOptions([
              ["props", translate("web.editor.data.scopeProps")],
              ["context", translate("web.editor.data.scopeContext")],
              ["page", translate("web.editor.data.scopePage")],
              ["site", translate("web.editor.data.scopeSite")],
              ["source", translate("web.editor.data.scopeSource")],
            ]),
          }),
          trait("text", "bindingSource", translate("web.editor.data.source")),
          trait("text", "bindingField", translate("web.editor.data.field")),
          trait("text", "bindingFormat", translate("web.editor.data.format")),
          trait("select", "mode", translate("web.editor.data.mode"), {
            options: selectOptions([
              ["text", translate("web.editor.data.targetText")],
              ["richText", translate("web.editor.data.targetRichText")],
            ]),
          }),
        ],
      },
      init() {
        const binding = this.get("binding") || {};
        this.set({
          bindingScope: binding.scope || "context",
          bindingSource: binding.source || "",
          bindingField: binding.field || "",
          bindingFormat: binding.format || "",
        }, { silent: true });
        this.listenTo(this, "change:bindingField change:mode", this.updateLabel);
        this.listenTo(
          this,
          "change:bindingField change:bindingScope change:bindingSource change:bindingFormat",
          this.syncBinding,
        );
        this.updateLabel();
      },
      syncBinding() {
        const scope = this.get("bindingScope") || "context";
        this.set("binding", {
          scope,
          field: this.get("bindingField") || "",
          ...(scope === "source" && this.get("bindingSource") ? { source: this.get("bindingSource") } : {}),
          ...(this.get("bindingFormat") ? { format: this.get("bindingFormat") } : {}),
        });
      },
      updateLabel() {
        const field = this.get("bindingField") || "?";
        const mode = this.get("mode") || "text";
        this.set("content", `{{ ${field} }}` + (mode === "richText" ? " (html)" : ""));
      },
    },
  });

  // ── sc-repeat ───────────────────────────────────────────────────────
  components.addType(SC_COMPONENT_TYPES.repeat, {
    isComponent: matchesType("repeat"),
    model: {
      defaults: {
        tagName: "div",
        name: translate("web.editor.component.repeat"),
        attributes: { "data-sc-type": "repeat" },
        source: "",
        params: {},
        limit: null,
        sort: "",
        content: "⟳ repeat",
        style: {
          padding: "8px",
          border: "2px dashed #79c49a",
          borderRadius: "4px",
          minHeight: "28px",
          color: "#79c49a",
          fontFamily: "monospace",
          fontSize: "12px",
          position: "relative",
        },
        traits: [
          trait("text", "source", translate("web.editor.data.source")),
          trait("number", "limit", translate("web.editor.data.limit"), { min: 1, max: 100 }),
          trait("text", "sort", translate("web.editor.data.sort")),
        ],
      },
      init() {
        const params = this.get("params") || {};
        this.set({ limit: params.limit ?? null, sort: params.sort || "" }, { silent: true });
        this.listenTo(this, "change:source", this.updateBadge);
        this.listenTo(this, "change:limit change:sort", this.syncParams);
        this.updateBadge();
      },
      syncParams() {
        const params = { ...(this.get("params") || {}) };
        const limit = this.get("limit");
        const sort = this.get("sort");
        if (limit === null || limit === "") delete params.limit;
        else params.limit = Number(limit);
        if (sort) params.sort = sort;
        else delete params.sort;
        this.set("params", params);
      },
      updateBadge() {
        const source = this.get("source") || "?";
        this.set("content", `⟳ repeat: ${source}`);
      },
    },
  });

  // ── sc-condition ────────────────────────────────────────────────────
  components.addType(SC_COMPONENT_TYPES.condition, {
    isComponent: matchesType("condition"),
    model: {
      defaults: {
        tagName: "div",
        name: translate("web.editor.component.condition"),
        attributes: { "data-sc-type": "condition" },
        condition: {
          left: { scope: "context", field: "" },
          operator: "exists",
          right: null,
        },
        conditionScope: "context",
        conditionField: "",
        conditionOperator: "exists",
        conditionRight: "",
        content: "◇ if exists",
        style: {
          padding: "8px",
          border: "2px dashed #dfba72",
          borderRadius: "4px",
          minHeight: "28px",
          color: "#dfba72",
          fontFamily: "monospace",
          fontSize: "12px",
          position: "relative",
        },
        traits: [
          trait("text", "conditionField", translate("web.editor.data.field")),
          trait("select", "conditionOperator", translate("web.editor.data.operator"), {
            options: selectOptions([
              ["eq", translate("web.editor.condition.equals")],
              ["neq", translate("web.editor.condition.notEquals")],
              ["in", translate("web.editor.condition.in")],
              ["not_in", translate("web.editor.condition.notIn")],
              ["exists", translate("web.editor.condition.exists")],
              ["empty", translate("web.editor.condition.empty")],
              ["gt", translate("web.editor.condition.greaterThan")],
              ["gte", translate("web.editor.condition.greaterOrEqual")],
              ["lt", translate("web.editor.condition.lessThan")],
              ["lte", translate("web.editor.condition.lessOrEqual")],
            ]),
          }),
          trait("text", "conditionRight", translate("web.editor.data.value")),
        ],
      },
      init() {
        const condition = this.get("condition") || {};
        const left = condition.left || {};
        this.set({
          conditionScope: left.scope || "context",
          conditionField: left.field || "",
          conditionOperator: condition.operator || "exists",
          conditionRight: condition.right ?? "",
        }, { silent: true });
        this.listenTo(this, "change:conditionField change:conditionOperator", this.updateBadge);
        this.listenTo(
          this,
          "change:conditionField change:conditionScope change:conditionOperator change:conditionRight",
          this.syncCondition,
        );
        this.updateBadge();
      },
      syncCondition() {
        this.set("condition", {
          left: {
            scope: this.get("conditionScope") || "context",
            field: this.get("conditionField") || "",
          },
          operator: this.get("conditionOperator") || "exists",
          right: this.get("conditionRight") || null,
        });
      },
      updateBadge() {
        const field = this.get("conditionField") || "?";
        const op = this.get("conditionOperator") || "exists";
        this.set("content", `◇ if ${field} ${op}`);
      },
    },
  });

  // ── sc-empty ────────────────────────────────────────────────────────
  components.addType(SC_COMPONENT_TYPES.empty, {
    isComponent: matchesType("empty"),
    model: {
      defaults: {
        tagName: "div",
        name: translate("web.editor.component.emptyState"),
        attributes: { "data-sc-type": "empty" },
        content: `⚠ ${translate("web.editor.placeholder.emptyState")}`,
        style: {
          padding: "6px",
          border: "1px dashed #f2a3a3",
          borderRadius: "3px",
          minHeight: "20px",
          color: "#f2a3a3",
          fontSize: "11px",
          fontFamily: "system-ui, sans-serif",
        },
      },
    },
  });

  // ── sc-menu ─────────────────────────────────────────────────────────
  // A menu is a first-class data component rather than a hand-built repeat:
  // this preserves its nested tree and gives published sites accessible,
  // keyboard-reachable dropdowns without asking authors to wire `children`
  // repeats manually.
  components.addType(SC_COMPONENT_TYPES.menu, {
    isComponent: matchesType("menu"),
    model: {
      defaults: {
        tagName: "nav",
        name: translate("web.editor.component.menu"),
        attributes: { "data-sc-type": "menu" },
        droppable: false,
        editable: false,
        location: "main",
        content: "☰ menu: main",
        style: {
          padding: "8px",
          border: "2px dashed #79c49a",
          borderRadius: "4px",
          minHeight: "28px",
          color: "#2f7a4d",
          fontFamily: "monospace",
          fontSize: "12px",
          background: "rgba(121,196,154,.08)",
        },
        traits: [trait("text", "location", translate("web.editor.data.menuLocation"))],
      },
      init() {
        this.listenTo(this, "change:location", this.updateBadge);
        this.updateBadge();
      },
      updateBadge() {
        this.set("content", `☰ menu: ${this.get("location") || "main"}`);
      },
    },
  });

  // ── sc-template-part ────────────────────────────────────────────────
  components.addType(SC_COMPONENT_TYPES.templatePart, {
    isComponent: matchesType("template-part"),
    model: {
      defaults: {
        tagName: "div",
        name: translate("web.editor.component.templatePart"),
        attributes: { "data-sc-type": "template-part" },
        droppable: false,
        resourceId: "",
        content: `◈ ${translate("web.editor.placeholder.templatePart")}`,
        style: {
          padding: "8px",
          border: "2px solid #e2b96b",
          borderRadius: "4px",
          minHeight: "28px",
          color: "#e2b96b",
          fontSize: "12px",
          fontFamily: "monospace",
          textAlign: "center",
        },
        traits: [
          trait("text", "resourceId", translate("web.editor.templatePart.key")),
        ],
      },
      init() {
        this.listenTo(this, "change:resourceId", this.updateBadge);
        this.updateBadge();
      },
      updateBadge() {
        const id = this.get("resourceId") || "?";
        this.set("content", `◈ part:${id}`);
      },
    },
  });


  // ── sc-global-part ──────────────────────────────────────────────────
  components.addType(SC_COMPONENT_TYPES.globalPart, {
    isComponent: matchesType("global-part"),
    model: {
      defaults: {
        tagName: "div",
        name: translate("web.editor.component.globalPart"),
        attributes: { "data-sc-type": "global-part" },
        droppable: false,
        resourceId: "",
        content: `◈ ${translate("web.editor.placeholder.globalPart")}`,
        style: {
          padding: "8px",
          border: "2px solid #e2b96b",
          borderRadius: "4px",
          minHeight: "28px",
          color: "#e2b96b",
          fontSize: "12px",
          fontFamily: "monospace",
          textAlign: "center",
        },
        traits: [
          trait("text", "resourceId", translate("web.editor.globalPart.key")),
        ],
      },
      init() {
        this.listenTo(this, "change:resourceId", this.updateBadge);
        this.updateBadge();
      },
      updateBadge() {
        const id = this.get("resourceId") || "?";
        this.set("content", `◈ global:${id}`);
      },
    },
  });
  // ── linked Component / Section instance ────────────────────────────
  components.addType(SC_COMPONENT_TYPES.resourceInstance, {
    isComponent: matchesType("resource-instance"),
    model: {
      defaults: {
        tagName: "div",
        name: translate("web.editor.component.linkedResource"),
        attributes: { "data-sc-type": "resource-instance" },
        droppable: false,
        editable: false,
        resourceKind: "component",
        resourceId: "",
        resourceName: "",
        previewUrl: "",
        props: {},
        content: `◇ ${translate("web.editor.placeholder.linkedResource")}`,
        style: {
          display: "block",
          position: "relative",
          overflow: "hidden",
          padding: "12px",
          border: "2px solid #78a6d8",
          minHeight: "96px",
          color: "#78a6d8",
          fontSize: "12px",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          backgroundColor: "rgba(120,166,216,.08)",
        },
        traits: [],
      },
      init() {
        this._syncingText = false;
        this.listenTo(this, "change:resourceId change:resourceName change:resourceKind", this.updateBadge);
        this.listenTo(this, "change:props", this.updateContentFromProps);
        this.listenTo(this, "change:content", this.updatePropsFromContent);
        this.updateBadge();
        this.updateContentFromProps();
      },
      updateBadge() {
        const name = this.get("resourceName") || this.get("resourceId") || "?";
        const kind = this.get("resourceKind") || "component";
        this._syncingText = true;
        this.set("content", `◇ ${kind}: ${name}`);
        this._syncingText = false;
        this.set("name", name);
      },
      updateContentFromProps() {
        if (this._syncingText) return;
        const props = this.get("props") || {};
        const key = this.findTextPropKey(props);
        if (!key) return;
        const value = props[key];
        const label = String(value ?? "").trim();
        if (!label) return;
        this._syncingText = true;
        this.set("content", label);
        this._syncingText = false;
      },
      updatePropsFromContent() {
        if (this._syncingText) return;
        const props = this.get("props") || {};
        const key = this.findTextPropKey(props);
        if (!key) return;
        const value = String(this.get("content") ?? "").trim();
        this.set("props", { ...props, [key]: value });
      },
      findTextPropKey(props) {
        if (!props || typeof props !== "object") return "";
        const candidates = ["text", "title", "heading", "label", "content", "name"];
        const present = candidates.find((key) => typeof props[key] === "string");
        if (present) return present;
        return Object.keys(props).find((key) => typeof props[key] === "string") || "";
      },
    },
    view: {
      init() {
        this.listenTo(
          this.model,
          "change:previewUrl change:resourceName change:resourceId change:resourceKind change:props",
          this.renderLinkedPreview,
        );
      },
      onRender() {
        this.renderLinkedPreview();
      },
      renderLinkedPreview() {
        const documentRef = this.el?.ownerDocument;
        if (!documentRef) return;
        let preview = this.el.querySelector?.(":scope > .sc-editor-linked-preview");
        if (!preview) {
          preview = documentRef.createElement("div");
          preview.className = "sc-editor-linked-preview";
          Object.assign(preview.style, {
            position: "absolute",
            inset: "3px",
            zIndex: "2",
            display: "grid",
            gridTemplateRows: "minmax(0, 1fr) auto",
            overflow: "hidden",
            borderRadius: "2px",
            background: "#f4f6f8",
            color: "#253040",
            fontFamily: "system-ui, sans-serif",
            pointerEvents: "none",
          });
          this.el.appendChild(preview);
        }
        preview.replaceChildren();
        const url = safePreviewUrl(this.model.get("previewUrl"));
        const name = String(this.model.get("resourceName") || this.model.get("resourceId") || "?");
        const values = Object.values(this.model.get("props") || {})
          .filter((value) => typeof value === "string" && value.trim())
          .slice(0, 2);
        if (url) {
          const image = documentRef.createElement("img");
          image.src = url;
          image.alt = "";
          Object.assign(image.style, { width: "100%", height: "100%", minHeight: "56px", objectFit: "cover" });
          preview.appendChild(image);
        } else {
          const placeholder = documentRef.createElement("div");
          placeholder.textContent = values[0] || name;
          Object.assign(placeholder.style, { display: "grid", minHeight: "56px", padding: "10px", placeItems: "center", fontWeight: "600" });
          preview.appendChild(placeholder);
        }
        const caption = documentRef.createElement("div");
        caption.textContent = [name, ...values].filter(Boolean).join(" · ");
        Object.assign(caption.style, {
          overflow: "hidden",
          padding: "5px 7px",
          background: "rgba(24, 34, 48, .9)",
          color: "#fff",
          fontSize: "11px",
          fontWeight: "600",
          textAlign: "left",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        });
        preview.appendChild(caption);
      },
    },
  });
}
