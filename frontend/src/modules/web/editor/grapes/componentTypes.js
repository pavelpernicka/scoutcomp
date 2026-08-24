import { SC_COMPONENT_TYPES } from "./constants";
import { replaceEditorMediaUrls } from "./projectData";

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
  return /^(?:data:image\/|blob:)/i.test(url) ? url : "";
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

  // GrapesJS has no built-in `heading` component type. Theme Project Data
  // uses the explicit type so headings keep a useful name in the layer tree;
  // register it before projects load instead of letting GrapesJS warn and
  // silently fall back to `default`.
  components.addType("heading", {
    isComponent: (element) => /^H[1-6]$/.test(element?.tagName || "") && { type: "heading" },
    extend: "text",
    model: {
      defaults: {
        tagName: "h2",
      },
    },
  });

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

  // ── sc-pagination ──────────────────────────────────────────────────
  components.addType(SC_COMPONENT_TYPES.pagination, {
    isComponent: matchesType("pagination"),
    model: {
      defaults: {
        tagName: "nav",
        name: translate("web.editor.component.pagination"),
        attributes: { "data-sc-type": "pagination" },
        bindTo: "nearest",
        source: "",
        pageSize: null,
        mode: "simple",
        previousLabel: translate("web.editor.pagination.previousDefault"),
        nextLabel: translate("web.editor.pagination.nextDefault"),
        params: {},
        droppable: false,
        editable: false,
        content: `← ${translate("web.editor.pagination.previousDefault")} · 1 · ${translate("web.editor.pagination.nextDefault")} →`,
        style: {
          display: "flex",
          gap: "8px",
          padding: "14px 0",
          color: "#506174",
          fontSize: "14px",
        },
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

  // ── sc-calendar ─────────────────────────────────────────────────────
  // Calendar data is resolved only by the safe public renderer. The editor
  // view is intentionally a realistic, inert sample so authors can judge its
  // density without leaking private events into GrapesJS Project Data.
  components.addType(SC_COMPONENT_TYPES.calendar, {
    isComponent: matchesType("calendar"),
    model: {
      defaults: {
        tagName: "section",
        name: translate("web.editor.component.calendar"),
        attributes: { "data-sc-type": "calendar" },
        droppable: false,
        editable: false,
        kind: "all",
        teamId: "",
        firstDayOfWeek: "monday",
        showDescription: true,
        content: "",
        style: {
          display: "block",
          minHeight: "420px",
          overflow: "hidden",
          border: "1px solid #d9dfdb",
          background: "#fffdfa",
          color: "#314139",
          fontFamily: "system-ui, sans-serif",
        },
        traits: [],
      },
    },
    view: {
      init() {
        this.listenTo(
          this.model,
          "change:kind change:teamId change:firstDayOfWeek change:showDescription",
          this.renderCalendar,
        );
      },
      onRender() {
        this.renderCalendar();
      },
      renderCalendar() {
        const documentRef = this.el?.ownerDocument;
        if (!documentRef) return;
        let preview = this.el.querySelector?.(":scope > [data-sc-calendar-preview]");
        if (!preview) {
          preview = documentRef.createElement("div");
          preview.dataset.scCalendarPreview = "true";
          this.el.appendChild(preview);
        }
        preview.replaceChildren();
        Object.assign(preview.style, {
          display: "grid",
          gridTemplateRows: "auto auto 1fr",
          minHeight: "420px",
          background: "#fffdfa",
          color: "#314139",
          pointerEvents: "none",
        });

        const toolbar = documentRef.createElement("div");
        Object.assign(toolbar.style, {
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "12px",
          padding: "14px 16px",
          borderBottom: "1px solid #d9dfdb",
          background: "#f8f4eb",
        });
        const viewLabel = documentRef.createElement("strong");
        viewLabel.textContent = translate("web.editor.calendar.monthView");
        viewLabel.style.color = "#17603f";
        const navigation = documentRef.createElement("div");
        Object.assign(navigation.style, { display: "flex", alignItems: "center", gap: "7px" });
        const previous = documentRef.createElement("span");
        previous.textContent = "‹";
        const today = documentRef.createElement("span");
        today.textContent = translate("web.editor.calendar.today");
        const next = documentRef.createElement("span");
        next.textContent = "›";
        [previous, today, next].forEach((control) => Object.assign(control.style, {
          display: "grid",
          minWidth: control === today ? "auto" : "28px",
          minHeight: "28px",
          padding: control === today ? "4px 9px" : "1px",
          placeItems: "center",
          border: "1px solid #9aa9a1",
          borderRadius: "4px",
          background: "#fffdfa",
          fontSize: "13px",
          fontWeight: "650",
        }));
        const month = documentRef.createElement("strong");
        month.textContent = translate("web.editor.calendar.previewMonth");
        Object.assign(month.style, { color: "#17603f", fontSize: "18px", whiteSpace: "nowrap" });
        navigation.append(previous, today, next, month);
        const filter = documentRef.createElement("span");
        const kind = this.model.get("kind") || "all";
        const teamId = String(this.model.get("teamId") || "").trim();
        filter.textContent = teamId
          ? `${translate(`web.editor.calendar.kinds.${kind}`)} · ${translate("web.editor.calendar.teamShort")} ${teamId}`
          : translate(`web.editor.calendar.kinds.${kind}`);
        Object.assign(filter.style, { marginLeft: "auto", color: "#63716a", fontSize: "12px" });
        toolbar.append(viewLabel, navigation, filter);

        const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
        if (this.model.get("firstDayOfWeek") === "sunday") weekdays.unshift(weekdays.pop());
        const weekdayRow = documentRef.createElement("div");
        Object.assign(weekdayRow.style, { display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", background: "#17603f", color: "white" });
        weekdays.forEach((day) => {
          const cell = documentRef.createElement("strong");
          cell.textContent = translate(`web.editor.calendar.weekdays.${day}`);
          Object.assign(cell.style, { padding: "7px 4px", borderRight: "1px solid rgba(255,255,255,.35)", fontSize: "11px", textAlign: "center" });
          weekdayRow.appendChild(cell);
        });

        const grid = documentRef.createElement("div");
        grid.className = "sc-calendar-editor-grid";
        grid.dataset.showDescriptions = this.model.get("showDescription") ? "true" : "false";
        Object.assign(grid.style, { display: "grid" });
        const mondayFirst = this.model.get("firstDayOfWeek") !== "sunday";
        const leadingDays = mondayFirst ? [27, 28, 29, 30, 31] : [26, 27, 28, 29, 30, 31];
        const days = [
          ...leadingDays.map((day) => ({ day, muted: true })),
          ...Array.from({ length: 31 }, (_, index) => ({ day: index + 1, muted: false })),
        ];
        const trailingCount = (7 - (days.length % 7)) % 7;
        days.push(...Array.from({ length: trailingCount }, (_, index) => ({ day: index + 1, muted: true })));
        const augustOffset = leadingDays.length;
        const samples = [
          { id: "meeting-early", kind: "meeting", start: augustOffset + 7, end: augustOffset + 7, label: translate("web.editor.calendar.sampleMeeting"), color: "#17704a" },
          { id: "trip", kind: "trip", start: augustOffset + 17, end: augustOffset + 21, label: translate("web.editor.calendar.sampleTrip"), color: "#bc7b12" },
          { id: "meeting", kind: "meeting", start: augustOffset + 20, end: augustOffset + 20, label: translate("web.editor.calendar.sampleMeeting"), color: "#17704a" },
          { id: "other", kind: "other", start: augustOffset + 20, end: augustOffset + 20, label: translate("web.editor.calendar.sampleOther"), color: "#247b91" },
          { id: "extra-1", kind: "meeting", start: augustOffset + 20, end: augustOffset + 20, label: translate("web.editor.calendar.sampleMeeting"), color: "#17704a" },
          { id: "extra-2", kind: "other", start: augustOffset + 20, end: augustOffset + 21, label: translate("web.editor.calendar.sampleOther"), color: "#247b91" },
        ].filter((event) => kind === "all" || event.kind === kind);
        for (let weekStart = 0; weekStart < days.length; weekStart += 7) {
          const week = documentRef.createElement("div");
          week.className = "sc-calendar-editor-week";
          Object.assign(week.style, { position: "relative", display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", minHeight: "110px" });
          const weekEnd = weekStart + 6;
          const segments = samples
            .filter((event) => event.end >= weekStart && event.start <= weekEnd)
            .map((event) => ({ ...event, startCol: Math.max(0, event.start - weekStart), endCol: Math.min(6, event.end - weekStart), continuesBefore: event.start < weekStart, continuesAfter: event.end > weekEnd }))
            .sort((left, right) => left.startCol - right.startCol || (right.endCol - right.startCol) - (left.endCol - left.startCol) || left.id.localeCompare(right.id));
          const laneEnds = [];
          segments.forEach((event) => {
            const availableLane = laneEnds.findIndex((endColumn) => endColumn < event.startCol);
            event.lane = availableLane === -1 ? laneEnds.length : availableLane;
            laneEnds[event.lane] = event.endCol;
          });
          days.slice(weekStart, weekStart + 7).forEach(({ day, muted }, column) => {
            const cell = documentRef.createElement("div");
            cell.className = `sc-calendar-editor-day${muted ? " is-outside" : ""}${!muted && day === 19 ? " is-today" : ""}`;
            Object.assign(cell.style, { position: "relative", minWidth: "0", padding: "5px", overflow: "hidden", borderRight: "1px solid #d9dfdb", borderBottom: "1px solid #d9dfdb", background: muted ? "#f1f3f2" : day === 19 ? "#e4f2e5" : "#fffdfa" });
            const number = documentRef.createElement("span");
            number.textContent = String(day);
            Object.assign(number.style, { color: muted ? "#aab1ad" : day === 19 ? "#167344" : "#52635a", fontSize: "11px", fontWeight: day === 19 ? "750" : "500" });
            cell.appendChild(number);
            const hidden = segments.filter((event) => event.lane >= 3 && column >= event.startCol && column <= event.endCol).length;
            if (hidden) {
              const more = documentRef.createElement("small");
              more.className = "sc-calendar-editor-more";
              more.textContent = `+${hidden} ${translate("web.editor.calendar.more")}`;
              Object.assign(more.style, { position: "absolute", bottom: "4px", display: "block", color: "#63716a", fontSize: "9px" });
              cell.appendChild(more);
            }
            week.appendChild(cell);
          });
          segments.filter((event) => event.lane < 3).forEach((event) => {
            const bar = documentRef.createElement("div");
            bar.className = "sc-calendar-editor-event";
            bar.dataset.multiday = event.start !== event.end ? "true" : "false";
            bar.textContent = `${event.continuesBefore ? "‹ " : ""}${event.label}${event.continuesAfter ? " ›" : ""}`;
            Object.assign(bar.style, {
              position: "absolute",
              left: `${event.startCol * (100 / 7)}%`,
              width: `${(event.endCol - event.startCol + 1) * (100 / 7)}%`,
              top: `${27 + event.lane * 25}px`,
              zIndex: "2",
              height: "23px",
              padding: "3px 6px",
              overflow: "hidden",
              borderRadius: "3px",
              background: event.color,
              color: "#fff",
              fontSize: "10px",
              fontWeight: "700",
              lineHeight: "17px",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            });
            week.appendChild(bar);
          });
          grid.appendChild(week);
        }
        preview.append(toolbar, weekdayRow, grid);
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
        presentation: "",
        menuItems: [],
        content: "",
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
        traits: [
          trait("text", "location", translate("web.editor.data.menuLocation")),
          trait("select", "presentation", translate("web.editor.data.menuPresentation"), {
            options: [
              { id: "", label: translate("web.editor.data.menuPresentationDefault") },
              { id: "bootstrap-navbar", label: translate("web.editor.data.menuPresentationNavbar") },
              { id: "bootstrap-footer-columns", label: translate("web.editor.data.menuPresentationFooter") },
            ],
          }),
        ],
      },
      init() {
        this.listenTo(this, "change:location", this.updateBadge);
        this.updateBadge();
      },
      updateBadge() {
        // The custom view renders the current menu tree. Keep Project Data
        // free of an editor-only placeholder child.
      },
    },
    view: {
      init() {
        this.listenTo(this.model, "change:menuItems change:location change:presentation", this.renderMenu);
      },
      onRender() {
        this.renderMenu();
      },
      renderMenu() {
        const documentRef = this.el.ownerDocument || document;
        this.el.dataset.scMenuLocation = this.model.get("location") || "main";
        this.el.dataset.scMenuPresentation = this.model.get("presentation") || "default";
        let preview = this.el.querySelector(":scope > [data-sc-menu-preview]");
        if (!preview) {
          preview = documentRef.createElement("div");
          preview.dataset.scMenuPreview = "true";
          this.el.appendChild(preview);
        }
        preview.replaceChildren();
        // The preview remains one atomic GrapesJS component, but its native
        // disclosures are interactive so authors can inspect nested menus
        // without detaching or editing generated child markup.
        preview.style.pointerEvents = "auto";
        preview.onclick = (event) => {
          if (event.target.closest("a")) event.preventDefault();
        };
        const presentation = this.model.get("presentation") || "";
        const items = Array.isArray(this.model.get("menuItems")) ? this.model.get("menuItems") : [];
        const renderFooter = (rows) => {
          const grid = documentRef.createElement("div");
          grid.className = "sc-menu-list row";
          rows.forEach((item) => {
            const column = documentRef.createElement("div");
            column.className = "sc-menu-column col";
            const heading = documentRef.createElement("span");
            heading.className = "sc-menu-heading text-white text-decoration-none fw-bold";
            heading.textContent = String(item.label || "");
            column.appendChild(heading);
            const children = Array.isArray(item.children) ? item.children : [];
            if (children.length) column.appendChild(renderItems(children, 1));
            grid.appendChild(column);
          });
          return grid;
        };
        const renderItems = (rows, level = 0) => {
          const list = documentRef.createElement("ul");
          list.className = `sc-menu-${level ? "dropdown" : "list"} ${presentation === "bootstrap-navbar" ? (level ? "dropdown-menu" : "navbar-nav") : ""}`;
          rows.forEach((item) => {
            const children = Array.isArray(item.children) ? item.children : [];
            const li = documentRef.createElement("li");
            li.className = `sc-menu-item nav-item${children.length ? " dropdown has-children" : ""}`;
            if (children.length) {
              const details = documentRef.createElement("details");
              details.className = "sc-menu-details";
              const summary = documentRef.createElement("summary");
              summary.className = `sc-menu-link ${level ? "dropdown-item" : "nav-link"}`;
              summary.append(String(item.label || ""));
              const chevron = documentRef.createElement("i");
              chevron.className = "fa-solid fa-chevron-down sc-menu-chevron";
              chevron.setAttribute("aria-hidden", "true");
              summary.appendChild(chevron);
              details.append(summary, renderItems(children, level + 1));
              li.appendChild(details);
            }
            else {
              const link = documentRef.createElement("a");
              link.className = `sc-menu-link ${level ? "dropdown-item" : "nav-link"}`;
              link.textContent = String(item.label || "");
              link.setAttribute("href", "#");
              li.appendChild(link);
            }
            list.appendChild(li);
          });
          return list;
        };
        if (items.length) {
          preview.appendChild(
            presentation === "bootstrap-footer-columns" ? renderFooter(items) : renderItems(items),
          );
        }
        else {
          const empty = documentRef.createElement("span");
          empty.className = "sc-menu-editor-empty";
          empty.textContent = `☰ menu: ${this.model.get("location") || "main"}`;
          preview.appendChild(empty);
        }
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
        // Editor-only, server-materialized fragment. It is deliberately
        // excluded from publication semantics: the persisted link + props are
        // the canonical data and public rendering resolves them again.
        livePreviewHtml: "",
        livePreviewCss: "",
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
          "change:previewUrl change:livePreviewHtml change:livePreviewCss change:resourceName change:resourceId change:resourceKind change:props",
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
        const liveHtml = replaceEditorMediaUrls(this.model.get("livePreviewHtml"));
        const liveCss = replaceEditorMediaUrls(this.model.get("livePreviewCss"));
        const url = safePreviewUrl(this.model.get("previewUrl"));
        const name = String(this.model.get("resourceName") || this.model.get("resourceId") || "?");
        const values = Object.values(this.model.get("props") || {})
          .filter((value) => typeof value === "string" && value.trim())
          .slice(0, 2);
        if (liveHtml) {
          // The fragment comes exclusively from the authenticated backend
          // materializer, which uses the same safe renderer as publication.
          // Keep it inert: preview receives no pointer events and only acts as
          // the visual face of the atomic linked component.
          const style = documentRef.createElement("style");
          style.textContent = liveCss;
          const content = documentRef.createElement("div");
          content.className = "sc-editor-linked-preview-content";
          content.innerHTML = liveHtml;
          Object.assign(content.style, { minWidth: "100%", minHeight: "100%", pointerEvents: "none" });
          preview.append(style, content);
        } else if (url) {
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
