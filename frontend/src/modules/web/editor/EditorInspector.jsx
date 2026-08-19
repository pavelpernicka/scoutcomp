import { useCallback, useEffect, useId, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { createBindingTargetOptions, getComponentBindings, removeComponentBinding, setComponentBinding } from "./grapes";
import { getComponentDisplayName, getComponentState, getComponentTechnicalName } from "./componentDisplayName";
import { ResourcePropsEditor } from "../props/PropEditorRegistry";
import { getTemplateOwnerId } from "./componentOwnership";


const tabs = ["content", "style", "data", "code", "advanced"];

export { getTemplateOwnerId } from "./componentOwnership";

export default function EditorInspector({ selected, dataSources, resources, fontAwesomeIcons = [], onDuplicate, onDelete, onClone, onDetach, onEditDefinition, onEditTemplate, onContentChange, onSelectMedia }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("content");
  const type = selected?.get?.("type") || selected?.get?.("tagName") || "component";
  const linked = selected?.get?.("type") === "sc-resource-instance";
  const templateOwnerId = selected ? getTemplateOwnerId(selected) : null;
  return <aside id="web-editor-inspector" className="web-editor-inspector" aria-label={t("web.editor.inspectorLabel")}>
    <div className="web-editor-selection-heading"><span><i className="fas fa-cube" /><strong>{selected ? getComponentDisplayName(selected, t) : t("web.editor.componentFallback")}</strong><small>{selected ? getComponentTechnicalName(selected) : type}</small></span>{selected && !templateOwnerId && <div><button type="button" title={t("web.duplicate")} onClick={onDuplicate}><i className="fas fa-copy" /></button><button type="button" title={t("web.delete")} onClick={onDelete}><i className="fas fa-trash" /></button></div>}</div>
    <div className="web-editor-inspector-tabs" role="tablist">{tabs.map((key) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{t(`web.editor.inspectorTabs.${key}`)}</button>)}</div>
    {!selected && <div className="web-editor-inspector-empty"><i className="fas fa-arrow-pointer" /><p>{t("web.editor.noSelection")}</p></div>}
    <div className={`web-editor-inspector-body ${selected ? "" : "web-editor-mounts-only"}`}>
      {selected && templateOwnerId ? <TemplateOwnedInfo templateId={templateOwnerId} onEdit={onEditTemplate} /> : <>
        {/* GrapesJS resolves appendTo only during initialization.  Keep both
            native mounts in the DOM before the first selection; otherwise
            React creates empty cards later but Traits/StyleManager stay
            detached and every ordinary component appears uneditable. */}
        <div className={tab === "content" ? "" : "d-none"}>
          {linked && <LinkedResourceProps key={selected?.cid} selected={selected} resources={resources} onClone={onClone} onDetach={onDetach} onEditDefinition={onEditDefinition} onContentChange={onContentChange} />}
          <div className={linked ? "d-none" : ""}>
            {type === "image" && <ImageContentPanel selected={selected} onSelectMedia={onSelectMedia} onContentChange={onContentChange} />}
            {selected && type !== "image" && <>
              <TemplateLogosPanel selected={selected} onSelectMedia={onSelectMedia} onContentChange={onContentChange} />
              <QuickContentPanel selected={selected} fontAwesomeIcons={fontAwesomeIcons} onSelectMedia={onSelectMedia} onContentChange={onContentChange} />
            </>}
            <div className="web-editor-trait-manager" />
          </div>
        </div>
        <div className={tab === "style" ? "" : "d-none"}>
          {linked && <LinkedStyleInfo selected={selected} resources={resources} />}
          <div className={linked ? "d-none" : ""}><div className="web-editor-style-manager" /></div>
        </div>
        {selected && tab === "data" && (type === "sc-repeat"
          ? <RepeatConfigurator selected={selected} dataSources={dataSources} onContentChange={onContentChange} />
          : type === "sc-pagination"
            ? <PaginationConfigurator selected={selected} dataSources={dataSources} onContentChange={onContentChange} />
            : type === "sc-calendar"
              ? <CalendarConfigurator selected={selected} onContentChange={onContentChange} />
              : <DataBindings selected={selected} dataSources={dataSources} />)}
        <div className={selected && tab === "code" ? "" : "d-none"}>{selected && <CodePanel key={selected.cid} selected={selected} onApplied={onContentChange} />}</div>
        {selected && tab === "advanced" && <AdvancedInspector selected={selected} />}
      </>}
    </div>
  </aside>;
}

EditorInspector.propTypes = { selected: PropTypes.object, dataSources: PropTypes.array.isRequired, resources: PropTypes.object.isRequired, fontAwesomeIcons: PropTypes.arrayOf(PropTypes.string), onDuplicate: PropTypes.func.isRequired, onDelete: PropTypes.func.isRequired, onClone: PropTypes.func, onDetach: PropTypes.func, onEditDefinition: PropTypes.func, onEditTemplate: PropTypes.func, onContentChange: PropTypes.func, onSelectMedia: PropTypes.func };

/**
 * Images are the one native element every author expects to edit without
 * knowing about GrapesJS traits. Keep the picker in the familiar Content tab;
 * the durable media reference remains data-sc-media-id and the canvas-only
 * blob URL is still owned by WebEditorPage.
 */
export function ImageContentPanel({ selected, onSelectMedia, onContentChange }) {
  const { t } = useTranslation();
  const [, refresh] = useState(0);
  const attributes = selected?.getAttributes?.() || {};
  const [alt, setAlt] = useState(() => attributes.alt || "");
  const [src, setSrc] = useState(() => attributes.src || selected?.get?.("src") || "");
  const [loading, setLoading] = useState(() => attributes.loading || "lazy");
  const [decorative, setDecorative] = useState(() => attributes["aria-hidden"] === "true");

  useEffect(() => {
    const update = () => {
      const next = selected?.getAttributes?.() || {};
      setAlt(next.alt || "");
      setSrc(next.src || selected?.get?.("src") || "");
      setLoading(next.loading || "lazy");
      setDecorative(next["aria-hidden"] === "true");
    };
    update();
    selected?.on?.("change:attributes", update);
    return () => selected?.off?.("change:attributes", update);
  }, [selected]);

  const setAttribute = (name, value) => {
    const clean = value.trim();
    if (clean) selected?.addAttributes?.({ [name]: clean });
    else selected?.removeAttributes?.(name);
    onContentChange?.();
  };
  const removeMedia = () => {
    selected?.removeAttributes?.("data-sc-media-id");
    selected?.removeAttributes?.("src");
    selected?.set?.("src", "");
    setSrc("");
    onContentChange?.();
  };
  const setSource = (value) => {
    const clean = value.trim();
    selected?.removeAttributes?.("data-sc-media-id");
    if (clean) selected?.addAttributes?.({ src: clean });
    else selected?.removeAttributes?.("src");
    selected?.set?.("src", clean);
    onContentChange?.();
  };
  const classes = classNames(selected);
  const alignment = classes.includes("mx-auto") ? "center" : classes.includes("ms-auto") ? "right" : classes.includes("w-100") ? "full" : "left";
  const width = [25, 50, 75, 100].find((value) => classes.includes(`w-${value}`)) || "original";
  const shape = managedShape(classes);
  const changeClasses = (remove, add) => { replaceClasses(selected, remove, add); refresh((value) => value + 1); onContentChange?.(); };

  return <section className="web-editor-image-content" aria-label={t("web.editor.imageContent.title") }>
    <div className="web-editor-image-content-head"><span><i className="fas fa-image" />{t("web.editor.imageContent.title")}</span><small>{attributes["data-sc-media-id"] ? t("web.editor.imageContent.fromLibrary") : t("web.editor.imageContent.noMedia")}</small></div>
    <div className="web-editor-image-actions">
      <button type="button" className="btn btn-sm btn-primary" onClick={() => onSelectMedia?.(selected)}><i className="fas fa-images me-1" />{t("web.editor.imageContent.choose")}</button>
      {attributes["data-sc-media-id"] && <button type="button" className="btn btn-sm btn-outline-light" onClick={removeMedia}>{t("web.editor.imageContent.remove")}</button>}
    </div>
    <label><span>{t("web.editor.imageContent.src")}</span><input value={src} placeholder="/media/…" onChange={(event) => setSrc(event.target.value)} onBlur={(event) => setSource(event.target.value)} /></label>
    <label className="web-editor-repeat-checkbox"><input type="checkbox" checked={decorative} onChange={(event) => { const checked = event.target.checked; setDecorative(checked); if (checked) { selected.addAttributes?.({ "aria-hidden": "true", alt: "" }); setAlt(""); } else selected.removeAttributes?.("aria-hidden"); onContentChange?.(); }} /><span>{t("web.editor.quick.decorative")}</span></label>
    {!decorative && <label><span>{t("web.editor.imageContent.alt")}</span><input value={alt} onChange={(event) => setAlt(event.target.value)} onBlur={(event) => setAttribute("alt", event.target.value)} /></label>}
    <label><span>{t("web.editor.quick.loading")}</span><select value={loading} onChange={(event) => { setLoading(event.target.value); selected.addAttributes?.({ loading: event.target.value }); onContentChange?.(); }}><option value="lazy">Lazy</option><option value="eager">Eager</option></select></label>
    <QuickPanel icon="arrows-left-right" title={t("web.editor.quick.layout")}>
      <label><span>{t("web.editor.quick.alignment")}</span><div className="web-editor-segmented">{[["left", "align-left"], ["center", "align-center"], ["right", "align-right"], ["full", "arrows-left-right-to-line"]].map(([value, icon]) => <button key={value} type="button" className={alignment === value ? "active" : ""} title={value} onClick={() => changeClasses((name) => ["mx-auto", "ms-auto", "me-auto", "d-block"].includes(name), value === "center" ? ["d-block", "mx-auto"] : value === "right" ? ["d-block", "ms-auto"] : value === "full" ? ["d-block", "w-100"] : ["d-block", "me-auto"])}><i className={`fas fa-${icon}`} /></button>)}</div></label>
      <label><span>{t("web.editor.quick.width")}</span><select value={width} onChange={(event) => changeClasses((name) => /^w-(?:25|50|75|100)$/.test(name), event.target.value === "original" ? [] : [`w-${event.target.value}`])}><option value="original">Original</option>{[25, 50, 75, 100].map((value) => <option key={value} value={value}>{value} %</option>)}</select></label>
      <label><span>{t("web.editor.quick.fit")}</span><select value={selected.getStyle?.()["object-fit"] || ""} onChange={(event) => { selected.addStyle?.({ "object-fit": event.target.value || "initial" }); refresh((value) => value + 1); onContentChange?.(); }}><option value="">Original</option><option value="cover">Cover</option><option value="contain">Contain</option></select></label>
      <label><span>{t("web.editor.quick.organicShape")}</span><select value={shape} onChange={(event) => changeClasses((name) => name.startsWith("sc-shape-"), event.target.value === "none" ? [] : [`sc-shape-${event.target.value}`])}>{ORGANIC_SHAPES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
    </QuickPanel>
  </section>;
}

ImageContentPanel.propTypes = { selected: PropTypes.object.isRequired, onSelectMedia: PropTypes.func, onContentChange: PropTypes.func };

const ICON_CHOICES = [
  "compass", "tent", "campground", "fire", "map", "location-dot", "calendar-days",
  "clock", "users", "person-hiking", "tree", "mountain-sun", "envelope", "phone",
  "download", "link", "circle-info", "triangle-exclamation", "check", "heart", "star",
];
const EDGE_VARIANTS = ["soft", "rolling", "diagonal", "peaks"];
const EDGE_PLACEMENTS = ["bottom", "top"];
const EDGE_COLORS = ["white", "cream", "pale", "blue"];
const BOOTSTRAP_VARIANTS = ["primary", "secondary", "success", "danger", "warning", "info", "light", "dark"];
const BUTTON_MASKS = ["none", "soft", "flow", "pebble", "natural", "rounded-asymmetric", "soft-capsule", "oval-wave"];
const ORGANIC_SHAPES = ["none", "soft", "blob", "oval", "rounded"];
const ICON_SIZES = ["default", "xs", "sm", "lg", "xl", "2xl"];

const normalizedIconOptions = (icons = []) => [...new Set([...icons, ...ICON_CHOICES]
  .map((name) => String(name).replace(/^fa-/, "").trim())
  .filter((name) => name && !["solid", "regular", "brands", "fw", "spin", "xs", "sm", "lg", "xl", "2xl"].includes(name)))]
  .sort();

/** Searchable Font Awesome chooser shared by buttons and standalone icons. */
export function IconPicker({ label, value, style = "solid", icons = [], allowNone = false, onChange }) {
  const { t } = useTranslation();
  const inputId = useId();
  const listboxId = `${inputId}-results`;
  const options = useMemo(() => normalizedIconOptions(icons), [icons]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return options
      .filter((name) => !needle || name.toLocaleLowerCase().includes(needle))
      .sort((left, right) => {
        if (!needle) return left.localeCompare(right);
        const leftScore = left === needle ? 0 : left.startsWith(needle) ? 1 : left.split("-").some((part) => part.startsWith(needle)) ? 2 : 3;
        const rightScore = right === needle ? 0 : right.startsWith(needle) ? 1 : right.split("-").some((part) => part.startsWith(needle)) ? 2 : 3;
        return leftScore - rightScore || left.localeCompare(right);
      })
      .slice(0, 120);
  }, [options, query]);
  const current = value && value !== "none" ? value : null;
  const select = (name) => {
    onChange(name);
    setQuery(name === "none" ? "" : name);
    setOpen(false);
  };
  const onKeyDown = (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (!filtered.length) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => (index + direction + filtered.length) % filtered.length);
    } else if (event.key === "Enter" && open && filtered[activeIndex]) {
      event.preventDefault();
      select(filtered[activeIndex]);
    } else if ((event.key === "Home" || event.key === "End") && open && filtered.length) {
      event.preventDefault();
      setActiveIndex(event.key === "Home" ? 0 : filtered.length - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  };
  useEffect(() => setActiveIndex(0), [query]);
  return <div className="web-editor-icon-picker" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <div className="web-editor-icon-current" aria-live="polite">
      <span className="web-editor-icon-preview" aria-hidden="true">{current ? <i className={`fa-${style} fa-${current} fa-xl`} /> : <i className="fas fa-ban" />}</span>
      <code>{current ? `fa-${current}` : t("web.editor.quick.noIcon")}</code>
      {allowNone && current && <button type="button" className="web-editor-icon-clear" onClick={() => select("none")}>{t("web.editor.quick.noIcon")}</button>}
    </div>
    <label htmlFor={inputId}><span>{label}</span></label>
    <input
      id={inputId}
      type="search"
      role="combobox"
      value={query}
      autoComplete="off"
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls={listboxId}
      aria-activedescendant={open && filtered[activeIndex] ? `${listboxId}-${activeIndex}` : undefined}
      placeholder="compass, user, tent…"
      onFocus={() => setOpen(true)}
      onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
      onKeyDown={onKeyDown}
    />
    {open && <div id={listboxId} className="web-editor-icon-grid" role="listbox" aria-label={label}>
      {filtered.map((name, index) => <button
        id={`${listboxId}-${index}`}
        key={name}
        type="button"
        role="option"
        aria-selected={name === current}
        className={`${name === current ? "active " : ""}${index === activeIndex ? "is-highlighted" : ""}`.trim()}
        title={`fa-${name}`}
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={() => setActiveIndex(index)}
        onClick={() => select(name)}
      ><i className={`fa-${style} fa-${name}`} aria-hidden="true" /><span>{name}</span></button>)}
      {!filtered.length && <p className="web-editor-icon-empty">{t("web.editor.quick.noIconResults")}</p>}
    </div>}
  </div>;
}
IconPicker.propTypes = { label: PropTypes.string.isRequired, value: PropTypes.string, style: PropTypes.string, icons: PropTypes.arrayOf(PropTypes.string), allowNone: PropTypes.bool, onChange: PropTypes.func.isRequired };

function QuickPanel({ icon, title, children, open = true }) {
  return <details className="web-editor-quick-section" open={open}>
    <summary><i className={`fas fa-${icon}`} /><span>{title}</span><i className="fas fa-chevron-down" /></summary>
    <div className="web-editor-quick-section-body">{children}</div>
  </details>;
}
QuickPanel.propTypes = { icon: PropTypes.string.isRequired, title: PropTypes.string.isRequired, children: PropTypes.node.isRequired, open: PropTypes.bool };

const childModels = (component) => component?.components?.()?.models || component?.components?.()?.toArray?.() || [];
const TEMPLATE_LOGO_ROLES = new Set(["navigation-light", "navigation-dark", "hero-mark", "footer"]);

export const findTemplateLogos = (component) => {
  const logos = [];
  const visit = (candidate) => {
    const role = candidate?.getAttributes?.()?.["data-sc-template-logo"];
    if (TEMPLATE_LOGO_ROLES.has(role)) logos.push({ component: candidate, role });
    childModels(candidate).forEach(visit);
  };
  visit(component);
  return logos;
};

export function TemplateLogosPanel({ selected, onSelectMedia, onContentChange }) {
  const { t } = useTranslation();
  const [, refresh] = useState(0);
  const logos = findTemplateLogos(selected);
  if (!logos.length) return null;
  return <QuickPanel icon="images" title={t("web.editor.templateLogos.title")}>
    <p className="small mb-2">{t("web.editor.templateLogos.help")}</p>
    <ul className="list-unstyled d-grid gap-2 mb-0">
      {logos.map(({ component, role }) => {
        const label = t(`web.editor.templateLogos.roles.${role}`);
        const hidden = component.getAttributes?.()["data-sc-template-logo-hidden"] === "true";
        return <li key={`${component.cid || role}-${role}`} className="d-flex align-items-center justify-content-between gap-2">
          <span>{label}</span>
          <span className="d-flex gap-1">
            {!hidden && <button type="button" className="btn btn-sm btn-outline-light" onClick={() => onSelectMedia?.(component)} aria-label={t("web.editor.templateLogos.changeLabel", { name: label })}>
              <i className="fas fa-images me-1" aria-hidden="true" />{t("web.editor.templateLogos.change")}
            </button>}
            <button type="button" className="btn btn-sm btn-outline-light" onClick={() => {
              if (hidden) component.removeAttributes?.("data-sc-template-logo-hidden");
              else component.addAttributes?.({ "data-sc-template-logo-hidden": "true" });
              refresh((value) => value + 1);
              onContentChange?.();
            }} aria-label={t(hidden ? "web.editor.templateLogos.useLabel" : "web.editor.templateLogos.removeLabel", { name: label })}>
              {t(hidden ? "web.editor.templateLogos.use" : "web.editor.templateLogos.remove")}
            </button>
          </span>
        </li>;
      })}
    </ul>
  </QuickPanel>;
}
TemplateLogosPanel.propTypes = { selected: PropTypes.object.isRequired, onSelectMedia: PropTypes.func, onContentChange: PropTypes.func };

const componentContent = (component) => String(component?.get?.("content") || "");
const directTextChild = (component) => childModels(component).find((child) => {
  const type = child.get?.("type");
  const tag = String(child.get?.("tagName") || "").toLowerCase();
  return type === "text" || (tag === "span" && !childModels(child).length && componentContent(child));
});
const visibleLabel = (component) => componentContent(component) || componentContent(directTextChild(component)) || component?.view?.el?.textContent?.trim?.() || "";
const setVisibleLabel = (component, value) => {
  const child = directTextChild(component);
  if (child) child.set?.("content", value);
  else if (childModels(component).length) { component.set?.("content", ""); component.append?.({ type: "text", tagName: "span", attributes: { class: "sc-editable-label" }, content: value }); }
  else component.set?.("content", value);
};

const managedShape = (classes) => ORGANIC_SHAPES.find((shape) => shape !== "none" && classes.includes(`sc-shape-${shape}`)) || "none";

const replaceClasses = (selected, remove, add = []) => {
  const next = classNames(selected).filter((name) => !remove(name));
  selected.setClass?.([...new Set([...next, ...add.filter(Boolean)])]);
};

const setBooleanAttribute = (selected, name, enabled) => {
  if (enabled) selected.addAttributes?.({ [name]: name === "open" ? "" : "true" });
  else selected.removeAttributes?.(name);
};

function IconContentPanel({ selected, fontAwesomeIcons = [], onContentChange }) {
  const { t } = useTranslation();
  const [, refresh] = useState(0);
  const classes = classNames(selected);
  const style = classes.includes("fa-brands") ? "brands" : classes.includes("fa-regular") ? "regular" : "solid";
  const available = normalizedIconOptions(fontAwesomeIcons);
  const utility = new Set(["fa-solid", "fa-regular", "fa-brands", "fa-fw", "fa-spin", ...ICON_SIZES.filter((value) => value !== "default").map((value) => `fa-${value}`)]);
  const icon = classes.find((name) => name.startsWith("fa-") && !utility.has(name) && available.includes(name.slice(3)))?.slice(3) || "compass";
  const size = ICON_SIZES.find((value) => value !== "default" && classes.includes(`fa-${value}`)) || "default";
  const attributes = selected.getAttributes?.() || {};
  const decorative = attributes["aria-hidden"] === "true";
  const updateIcon = (nextStyle, nextIcon) => {
    replaceClasses(
      selected,
      (name) => ["fa-solid", "fa-regular", "fa-brands", `fa-${icon}`].includes(name),
      [`fa-${nextStyle}`, `fa-${nextIcon}`],
    );
    refresh((value) => value + 1);
    onContentChange?.();
  };
  return <QuickPanel icon="icons" title={t("web.editor.quick.icon")}>
    <IconPicker label={t("web.editor.quick.searchIcon")} value={icon} style={style} icons={available} onChange={(name) => updateIcon(style, name)} />
    <label><span>{t("web.editor.quick.iconStyle")}</span><select value={style} onChange={(event) => updateIcon(event.target.value, icon)}><option value="solid">Solid</option><option value="regular">Regular</option><option value="brands">Brands</option></select></label>
    <label><span>{t("web.editor.quick.iconSize")}</span><select value={size} onChange={(event) => { replaceClasses(selected, (name) => ICON_SIZES.slice(1).some((value) => name === `fa-${value}`), event.target.value === "default" ? [] : [`fa-${event.target.value}`]); refresh((value) => value + 1); onContentChange?.(); }}>{ICON_SIZES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
    <label className="web-editor-repeat-checkbox"><input type="checkbox" checked={decorative} onChange={(event) => {
      setBooleanAttribute(selected, "aria-hidden", event.target.checked);
      if (event.target.checked) selected.removeAttributes?.("aria-label");
      refresh((value) => value + 1); onContentChange?.();
    }} /><span>{t("web.editor.quick.decorative")}</span></label>
    {!decorative && <label><span>{t("web.editor.quick.accessibleLabel")}</span><input value={attributes["aria-label"] || ""} onChange={(event) => { selected.addAttributes?.({ "aria-label": event.target.value }); refresh((value) => value + 1); onContentChange?.(); }} /></label>}
  </QuickPanel>;
}
IconContentPanel.propTypes = { selected: PropTypes.object.isRequired, fontAwesomeIcons: PropTypes.arrayOf(PropTypes.string), onContentChange: PropTypes.func };

function LinkContentPanel({ selected, showLabel = true, onContentChange }) {
  const { t } = useTranslation();
  const [, refresh] = useState(0);
  const attributes = selected.getAttributes?.() || {};
  const textEditable = showLabel && (!childModels(selected).length || Boolean(directTextChild(selected)));
  const update = (name, value) => { if (value) selected.addAttributes?.({ [name]: value }); else selected.removeAttributes?.(name); refresh((current) => current + 1); onContentChange?.(); };
  return <QuickPanel icon="link" title={t("web.editor.quick.link")}>
    {textEditable && <label><span>{t("web.editor.quick.label")}</span><input defaultValue={visibleLabel(selected)} onBlur={(event) => { setVisibleLabel(selected, event.target.value); onContentChange?.(); }} /></label>}
    <label><span>URL</span><input value={attributes.href || ""} onChange={(event) => update("href", event.target.value)} placeholder="https://, /stranka, mailto:" /></label>
    <label><span>{t("web.editor.quick.tooltip")}</span><input value={attributes.title || ""} onChange={(event) => update("title", event.target.value)} /></label>
    <label className="web-editor-repeat-checkbox"><input type="checkbox" checked={attributes.target === "_blank"} onChange={(event) => {
      if (event.target.checked) selected.addAttributes?.({ target: "_blank", rel: "noopener noreferrer" });
      else { selected.removeAttributes?.("target"); selected.removeAttributes?.("rel"); }
      refresh((current) => current + 1); onContentChange?.();
    }} /><span>{t("web.editor.quick.newWindow")}</span></label>
  </QuickPanel>;
}
LinkContentPanel.propTypes = { selected: PropTypes.object.isRequired, showLabel: PropTypes.bool, onContentChange: PropTypes.func };

const SOCIAL_NETWORKS = {
  instagram: { style: "brands", icon: "instagram" },
  facebook: { style: "brands", icon: "facebook-f" },
  youtube: { style: "brands", icon: "youtube" },
  tiktok: { style: "brands", icon: "tiktok" },
  x: { style: "brands", icon: "x-twitter" },
  linkedin: { style: "brands", icon: "linkedin-in" },
  github: { style: "brands", icon: "github" },
  whatsapp: { style: "brands", icon: "whatsapp" },
  email: { style: "solid", icon: "envelope" },
  web: { style: "solid", icon: "globe" },
};

function SocialLinkPanel({ selected, onContentChange }) {
  const { t } = useTranslation();
  const [, refresh] = useState(0);
  const classes = classNames(selected);
  const attributes = selected.getAttributes?.() || {};
  const networkClass = classes.find((name) => name.startsWith("ontario-social-") && name !== "ontario-social-link");
  const network = SOCIAL_NETWORKS[networkClass?.slice("ontario-social-".length)] ? networkClass.slice("ontario-social-".length) : "instagram";
  const icon = findDescendant(selected, (component) => String(component.get?.("tagName") || "").toLowerCase() === "i");
  const changed = () => { refresh((value) => value + 1); onContentChange?.(); };
  const updateNetwork = (value) => {
    replaceClasses(selected, (name) => name.startsWith("ontario-social-") && name !== "ontario-social-link", [`ontario-social-${value}`]);
    let iconComponent = icon;
    if (!iconComponent) {
      selected.append?.({ type: "default", tagName: "i", attributes: { "aria-hidden": "true" } });
      iconComponent = findDescendant(selected, (component) => String(component.get?.("tagName") || "").toLowerCase() === "i");
    }
    if (iconComponent) {
      const definition = SOCIAL_NETWORKS[value];
      replaceClasses(iconComponent, (name) => name.startsWith("fa-"), [`fa-${definition.style}`, `fa-${definition.icon}`]);
      iconComponent.addAttributes?.({ "aria-hidden": "true" });
    }
    selected.addAttributes?.({ "aria-label": t(`web.editor.social.networks.${value}`) });
    changed();
  };
  const updateAttribute = (name, value) => {
    if (value) selected.addAttributes?.({ [name]: value });
    else selected.removeAttributes?.(name);
    changed();
  };
  return <QuickPanel icon="share-nodes" title={t("web.editor.social.title")}>
    <label><span>{t("web.editor.social.network")}</span><select value={network} onChange={(event) => updateNetwork(event.target.value)}>{Object.keys(SOCIAL_NETWORKS).map((value) => <option key={value} value={value}>{t(`web.editor.social.networks.${value}`)}</option>)}</select></label>
    <label><span>{t("web.editor.social.url")}</span><input value={attributes.href || ""} onChange={(event) => updateAttribute("href", event.target.value)} placeholder={network === "email" ? "mailto:" : "https://"} /></label>
    <label><span>{t("web.editor.quick.accessibleLabel")}</span><input value={attributes["aria-label"] || ""} onChange={(event) => updateAttribute("aria-label", event.target.value)} /></label>
  </QuickPanel>;
}
SocialLinkPanel.propTypes = { selected: PropTypes.object.isRequired, onContentChange: PropTypes.func };

const buttonIconChild = (component) => childModels(component).find((child) => Object.prototype.hasOwnProperty.call(child.getAttributes?.() || {}, "data-sc-button-icon"));
const buttonLabelChild = (component) => childModels(component).find((child) => classNames(child).includes("sc-button-label"));
const buttonLabel = (component) => {
  const label = buttonLabelChild(component);
  return label ? componentContent(label) : visibleLabel(component);
};

const normalizeButtonContent = (selected) => {
  let icon = buttonIconChild(selected);
  let label = buttonLabelChild(selected);
  if (icon && label) return { icon, label };
  const content = buttonLabel(selected);
  const collection = selected.components?.();
  if (collection?.reset) collection.reset([]);
  else childModels(selected).forEach((child) => child.remove?.());
  selected.set?.("content", "");
  selected.append?.({
    type: "default",
    tagName: "i",
    attributes: { class: "sc-button-icon d-none", "data-sc-button-icon": "", "aria-hidden": "true" },
  });
  selected.append?.({
    type: "text",
    tagName: "span",
    attributes: { class: "sc-button-label" },
    content,
  });
  icon = buttonIconChild(selected);
  label = buttonLabelChild(selected);
  return { icon, label };
};

function ButtonContentPanel({ selected, fontAwesomeIcons = [], onContentChange }) {
  const { t } = useTranslation();
  const [, refresh] = useState(0);
  const classes = classNames(selected);
  const attributes = selected.getAttributes?.() || {};
  const iconChild = buttonIconChild(selected);
  const iconClasses = classNames(iconChild);
  const icon = iconChild?.getAttributes?.()["data-sc-button-icon"]
    || iconClasses.find((name) => name.startsWith("fa-") && !["fa-solid", "fa-regular", "fa-brands"].includes(name))?.slice(3)
    || "none";
  const iconStyle = iconClasses.includes("fa-brands") ? "brands" : iconClasses.includes("fa-regular") ? "regular" : "solid";
  const availableIcons = normalizedIconOptions(fontAwesomeIcons);
  const label = buttonLabel(selected);
  const hasLabel = Boolean(label.trim());
  const variantClass = classes.find((name) => BOOTSTRAP_VARIANTS.some((variant) => name === `btn-${variant}` || name === `btn-outline-${variant}`)) || "btn-primary";
  const outline = variantClass.startsWith("btn-outline-");
  const variant = variantClass.replace(/^btn-(?:outline-)?/, "");
  const size = classes.includes("btn-sm") ? "sm" : classes.includes("btn-lg") ? "lg" : "md";
  const maskClass = classes.find((name) => name.startsWith("sc-mask-button-"));
  const storedMask = maskClass?.slice("sc-mask-button-".length);
  const mask = storedMask === "rugged" ? "natural" : BUTTON_MASKS.includes(storedMask) ? storedMask : "none";
  const updateButton = (next = {}) => {
    const nextVariant = next.variant || variant;
    const nextOutline = next.outline ?? outline;
    replaceClasses(selected, (name) => name === "btn" || name === "btn-sm" || name === "btn-lg" || name === "btn-link" || name === "w-100" || BOOTSTRAP_VARIANTS.some((item) => name === `btn-${item}` || name === `btn-outline-${item}`) || name.startsWith("sc-mask-button-"), [
      "btn", `btn-${nextOutline ? "outline-" : ""}${nextVariant}`,
      (next.size || size) === "sm" ? "btn-sm" : (next.size || size) === "lg" ? "btn-lg" : "",
      (next.full ?? classes.includes("w-100")) ? "w-100" : "",
      (next.mask || mask) === "none" ? "" : `sc-mask-button-${next.mask || mask}`,
    ]);
    refresh((current) => current + 1); onContentChange?.();
  };
  const updateIcon = (nextIcon, nextStyle = iconStyle) => {
    const normalized = normalizeButtonContent(selected);
    if (!normalized.icon) return;
    normalized.icon.addAttributes?.({ "data-sc-button-icon": nextIcon, "aria-hidden": "true" });
    replaceClasses(
      normalized.icon,
      () => true,
      nextIcon === "none" ? ["sc-button-icon", "d-none"] : [`fa-${nextStyle}`, `fa-${nextIcon}`, "sc-button-icon"],
    );
    replaceClasses(
      selected,
      (name) => name === "sc-button-icon-only",
      nextIcon !== "none" && !buttonLabel(selected).trim() ? ["sc-button-icon-only"] : [],
    );
    refresh((current) => current + 1);
    onContentChange?.();
  };
  const updateLabel = (value) => {
    const normalizedLabel = buttonLabelChild(selected);
    if (normalizedLabel) normalizedLabel.set?.("content", value);
    else setVisibleLabel(selected, value);
    replaceClasses(
      selected,
      (name) => name === "sc-button-icon-only",
      !value.trim() && icon !== "none" ? ["sc-button-icon-only"] : [],
    );
    refresh((current) => current + 1);
    onContentChange?.();
  };
  const updateAccessibleLabel = (value) => {
    if (value) selected.addAttributes?.({ "aria-label": value });
    else selected.removeAttributes?.("aria-label");
    refresh((current) => current + 1);
    onContentChange?.();
  };
  return <QuickPanel icon="hand-pointer" title={t("web.editor.quick.button")}>
    <label><span>{t("web.editor.quick.label")}</span><input value={label} onChange={(event) => updateLabel(event.target.value)} /></label>
    <IconPicker label={t("web.editor.quick.buttonIcon")} value={icon} style={iconStyle} icons={availableIcons} allowNone onChange={(name) => updateIcon(name, iconStyle)} />
    {icon !== "none" && <label><span>{t("web.editor.quick.iconStyle")}</span><select value={iconStyle} onChange={(event) => updateIcon(icon, event.target.value)}><option value="solid">Solid</option><option value="regular">Regular</option><option value="brands">Brands</option></select></label>}
    {icon !== "none" && <label><span>{t("web.editor.quick.iconPosition")}</span><select value={classes.includes("sc-button-icon-right") ? "right" : "left"} onChange={(event) => {
      replaceClasses(selected, (name) => name === "sc-button-icon-right", event.target.value === "right" ? ["sc-button-icon-right"] : []);
      refresh((current) => current + 1);
      onContentChange?.();
    }}><option value="left">{t("web.editor.quick.iconLeft")}</option><option value="right">{t("web.editor.quick.iconRight")}</option></select></label>}
    {!hasLabel && <>
      <label><span>{t("web.editor.quick.accessibleLabel")}</span><input value={attributes["aria-label"] || ""} onChange={(event) => updateAccessibleLabel(event.target.value)} /></label>
      {!attributes["aria-label"] && <p className="web-editor-field-error" role="alert">{t("web.editor.quick.iconOnlyWarning")}</p>}
    </>}
    <label><span>{t("web.editor.quick.buttonStyle")}</span><div className="web-editor-segmented"><button type="button" className={!outline ? "active" : ""} onClick={() => updateButton({ outline: false })}>Solid</button><button type="button" className={outline ? "active" : ""} onClick={() => updateButton({ outline: true })}>Outline</button></div></label>
    <label><span>{t("web.editor.quick.variant")}</span><select value={variant} onChange={(event) => updateButton({ variant: event.target.value })}>{BOOTSTRAP_VARIANTS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
    <label><span>{t("web.editor.quick.size")}</span><select value={size} onChange={(event) => updateButton({ size: event.target.value })}><option value="sm">Small</option><option value="md">Medium</option><option value="lg">Large</option></select></label>
    <label><span>{t("web.editor.quick.mask")}</span><select value={mask} onChange={(event) => updateButton({ mask: event.target.value })}>{BUTTON_MASKS.map((value) => <option key={value} value={value}>{t(`web.editor.quick.buttonMasks.${value}`)}</option>)}</select></label>
    <label className="web-editor-repeat-checkbox"><input type="checkbox" checked={classes.includes("w-100")} onChange={(event) => updateButton({ full: event.target.checked })} /><span>{t("web.editor.quick.fullWidth")}</span></label>
  </QuickPanel>;
}
ButtonContentPanel.propTypes = { selected: PropTypes.object.isRequired, fontAwesomeIcons: PropTypes.arrayOf(PropTypes.string), onContentChange: PropTypes.func };

function DetailsContentPanel({ selected, onContentChange }) {
  const { t } = useTranslation();
  const [, refresh] = useState(0);
  const open = Object.prototype.hasOwnProperty.call(selected.getAttributes?.() || {}, "open");
  return <QuickPanel icon="chevron-down" title="Accordion / Details">
    <p>{t("web.editor.quick.hiddenPreviewHelp")}</p>
    <label className="web-editor-repeat-checkbox"><input type="checkbox" checked={open} onChange={(event) => { setBooleanAttribute(selected, "open", event.target.checked); refresh((value) => value + 1); onContentChange?.(); }} /><span>{t("web.editor.quick.openByDefault")}</span></label>
  </QuickPanel>;
}
DetailsContentPanel.propTypes = { selected: PropTypes.object.isRequired, onContentChange: PropTypes.func };

const OVERLAY_OWNER_CLASSES = new Set([
  "ontario-hero", "ontario-compact-hero", "ontario-contact-hero",
  "ontario-media-link", "ontario-photo-frame", "sc-overlay",
]);
const OVERLAY_MASK_CLASSES = new Set(["ontario-photo-mask", "ontario-media-link-mask"]);
const OVERLAY_POSITIONS = ["center", "top", "bottom", "left", "right"];

const findDescendant = (component, predicate) => {
  for (const child of childModels(component)) {
    if (predicate(child)) return child;
    const nested = findDescendant(child, predicate);
    if (nested) return nested;
  }
  return null;
};

const hasAnyClass = (component, names) => classNames(component).some((name) => names.has(name));

const isExplicitOverlayOwner = (component) => {
  if (!component) return false;
  const attributes = component.getAttributes?.() || {};
  return Object.prototype.hasOwnProperty.call(attributes, "data-sc-overlay")
    || hasAnyClass(component, OVERLAY_OWNER_CLASSES);
};

const isOverlayOwner = (component) => isExplicitOverlayOwner(component)
  || Boolean(findDescendant(component, (child) => hasAnyClass(child, OVERLAY_MASK_CLASSES)));

export const findBackgroundOverlayOwner = (selected) => {
  if (!selected) return null;
  if (!hasAnyClass(selected, OVERLAY_MASK_CLASSES)) return isOverlayOwner(selected) ? selected : null;
  const fallback = selected.parent?.() || null;
  let owner = fallback;
  while (owner && !isExplicitOverlayOwner(owner)) owner = owner.parent?.();
  return owner || fallback;
};

const overlayImageTarget = (owner) => {
  const classes = classNames(owner);
  const imageLike = (component) => component.get?.("type") === "image" || String(component.get?.("tagName") || "").toLowerCase() === "img";
  if (classes.includes("ontario-media-link")) {
    return findDescendant(owner, (component) => classNames(component).includes("ontario-media-link-image"))
      || findDescendant(owner, imageLike);
  }
  if (classes.includes("ontario-photo-frame")) return findDescendant(owner, imageLike);
  if (findDescendant(owner, (component) => classNames(component).includes("ontario-media-link-mask"))) return findDescendant(owner, imageLike);
  return null;
};

const normalizeColor = (value, fallback = "#0a224e") => {
  const color = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  if (/^#[0-9a-f]{3}$/i.test(color)) return `#${[...color.slice(1)].map((digit) => `${digit}${digit}`).join("")}`;
  return fallback;
};

const positionValue = (value) => {
  const normalized = String(value || "").toLowerCase();
  return ["top", "bottom", "left", "right"].find((position) => normalized.split(/\s+/).includes(position)) || "center";
};

export function BackgroundOverlayPanel({ selected, onSelectMedia, onContentChange }) {
  const { t } = useTranslation();
  const [, refresh] = useState(0);
  const owner = findBackgroundOverlayOwner(selected);
  if (!owner) return null;
  const image = overlayImageTarget(owner);
  const style = owner.getStyle?.() || {};
  const imageStyle = image?.getStyle?.() || {};
  const attributes = owner.getAttributes?.() || {};
  const background = String(style["background-image"] || style.backgroundImage || "");
  const imageAttributes = image?.getAttributes?.() || {};
  const hasImage = image
    ? Boolean(imageAttributes.src || imageAttributes["data-sc-media-id"] || image.get?.("src"))
    : Boolean(background && background !== "none");
  const enabled = attributes["data-sc-overlay-enabled"] !== "false";
  const color = normalizeColor(style["--sc-overlay-color"] || style["--sc-hero-tint"] || "#0a224e");
  const rawOpacity = Number.parseFloat(style["--sc-overlay-opacity"] || style["--sc-hero-tint-opacity"] || ".64");
  const intensity = Math.round(Math.max(0, Math.min(1, Number.isFinite(rawOpacity) ? rawOpacity : .64)) * 100);
  const position = positionValue(image ? imageStyle["object-position"] : style["background-position"] || style.backgroundPosition);
  const changed = () => { refresh((value) => value + 1); onContentChange?.(); };
  const chooseImage = () => onSelectMedia?.(image || { component: owner, mode: "background" });
  const removeImage = () => {
    if (image) {
      image.removeAttributes?.("data-sc-media-id");
      image.removeAttributes?.("src");
      image.set?.("src", "");
    } else owner.addStyle?.({ "background-image": "none" });
    changed();
  };
  const updatePosition = (value) => {
    const cssValue = value === "left" || value === "right" ? `${value} center` : value === "top" || value === "bottom" ? `center ${value}` : "center center";
    (image || owner).addStyle?.({ [image ? "object-position" : "background-position"]: cssValue });
    changed();
  };
  return <QuickPanel icon="images" title={t("web.editor.overlay.title")}>
    <div className="web-editor-image-actions">
      <button type="button" className="btn btn-sm btn-primary" onClick={chooseImage}><i className="fas fa-images me-1" aria-hidden="true" />{t("web.editor.imageContent.choose")}</button>
      {hasImage && <button type="button" className="btn btn-sm btn-outline-light" onClick={removeImage}>{t("web.editor.imageContent.remove")}</button>}
    </div>
    <label><span>{t("web.editor.overlay.position")}</span><select value={position} onChange={(event) => updatePosition(event.target.value)}>{OVERLAY_POSITIONS.map((value) => <option key={value} value={value}>{t(`web.editor.overlay.positions.${value}`)}</option>)}</select></label>
    <label className="web-editor-repeat-checkbox"><input type="checkbox" checked={enabled} onChange={(event) => {
      owner.addAttributes?.({ "data-sc-overlay-enabled": event.target.checked ? "true" : "false" });
      changed();
    }} /><span>{t("web.editor.overlay.enabled")}</span></label>
    <label><span>{t("web.editor.overlay.color")}</span><div className="web-editor-color-row"><input type="color" value={color} onChange={(event) => { owner.addStyle?.({ "--sc-overlay-color": event.target.value }); changed(); }} /><code>{color}</code></div></label>
    <label><span>{t("web.editor.overlay.intensity")} · {intensity} %</span><input type="range" min="0" max="100" step="1" value={intensity} onChange={(event) => { owner.addStyle?.({ "--sc-overlay-opacity": String(Number(event.target.value) / 100) }); changed(); }} /></label>
  </QuickPanel>;
}
BackgroundOverlayPanel.propTypes = { selected: PropTypes.object.isRequired, onSelectMedia: PropTypes.func, onContentChange: PropTypes.func };

function SectionContentPanel({ selected, onContentChange }) {
  const { t } = useTranslation();
  const [, refresh] = useState(0);
  const classes = classNames(selected);
  const edge = EDGE_VARIANTS.find((item) => classes.includes(`sc-edge-${item}`)) || "none";
  const placement = EDGE_PLACEMENTS.find((item) => classes.includes(`sc-edge-${item}`)) || "bottom";
  const color = EDGE_COLORS.find((item) => classes.includes(`sc-edge-${item}`)) || "white";
  const edgeSize = ["subtle", "sm", "md", "lg"].find((item) => classes.includes(`sc-edge-${item}`)) || "md";
  const style = selected.getStyle?.() || {};
  const updateEdge = (nextEdge, nextPlacement = placement, nextColor = color) => {
    replaceClasses(selected, (name) => name.startsWith("sc-edge-"), nextEdge === "none" ? [] : [`sc-edge-${nextEdge}`, `sc-edge-${nextPlacement}`, `sc-edge-${nextColor}`, `sc-edge-${edgeSize}`]);
    refresh((value) => value + 1); onContentChange?.();
  };
  const customEdge = style["--sc-edge-fill"] || "#ffffff";
  const updateStyle = (next) => { selected.addStyle?.(next); refresh((value) => value + 1); onContentChange?.(); };
  return <QuickPanel icon="layer-group" title={t("web.editor.quick.sectionEdge")}>
    <label><span>{t("web.editor.quick.edge")}</span><select value={edge} onChange={(event) => updateEdge(event.target.value)}><option value="none">{t("web.editor.quick.none")}</option>{EDGE_VARIANTS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    {edge !== "none" && <>
      <label><span>{t("web.editor.quick.edgePlacement")}</span><select value={placement} onChange={(event) => updateEdge(edge, event.target.value, color)}>{EDGE_PLACEMENTS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label><span>{t("web.editor.quick.edgeColor")}</span><select value={color} onChange={(event) => { selected.removeStyle?.("--sc-edge-fill"); updateEdge(edge, placement, event.target.value); }}>{EDGE_COLORS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label><span>{t("web.editor.quick.customColor")}</span><div className="web-editor-color-row"><input type="color" value={customEdge} onChange={(event) => updateStyle({ "--sc-edge-fill": event.target.value })} /><code>{customEdge}</code></div></label>
      <label><span>{t("web.editor.quick.edgeSize")}</span><select value={edgeSize} onChange={(event) => { replaceClasses(selected, (name) => ["sc-edge-subtle", "sc-edge-sm", "sc-edge-md", "sc-edge-lg"].includes(name), [`sc-edge-${event.target.value}`]); refresh((value) => value + 1); onContentChange?.(); }}><option value="subtle">Subtle</option><option value="sm">Small</option><option value="md">Medium</option><option value="lg">Large</option></select></label>
    </>}
  </QuickPanel>;
}
SectionContentPanel.propTypes = { selected: PropTypes.object.isRequired, onContentChange: PropTypes.func };

function AlertContentPanel({ selected, onContentChange }) {
  const { t } = useTranslation();
  const [, refresh] = useState(0);
  const classes = classNames(selected);
  const variant = BOOTSTRAP_VARIANTS.find((value) => classes.includes(`alert-${value}`)) || "info";
  return <QuickPanel icon="triangle-exclamation" title="Bootstrap Alert">
    <label><span>{t("web.editor.quick.variant")}</span><select value={variant} onChange={(event) => { replaceClasses(selected, (name) => BOOTSTRAP_VARIANTS.some((value) => name === `alert-${value}`), [`alert-${event.target.value}`]); refresh((value) => value + 1); onContentChange?.(); }}>{BOOTSTRAP_VARIANTS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
  </QuickPanel>;
}
AlertContentPanel.propTypes = { selected: PropTypes.object.isRequired, onContentChange: PropTypes.func };

function BadgeContentPanel({ selected, onContentChange }) {
  const { t } = useTranslation();
  const [, refresh] = useState(0);
  const classes = classNames(selected);
  const variantClass = classes.find((name) => BOOTSTRAP_VARIANTS.some((item) => name === `bg-${item}` || name === `text-bg-${item}`));
  const variant = variantClass?.replace(/^(?:text-)?bg-/, "") || "secondary";
  const update = (remove, add = []) => { replaceClasses(selected, remove, add); refresh((value) => value + 1); onContentChange?.(); };
  return <QuickPanel icon="tag" title="Bootstrap Badge">
    <label><span>{t("web.editor.quick.variant")}</span><select value={variant} onChange={(event) => update((name) => BOOTSTRAP_VARIANTS.some((item) => name === `bg-${item}` || name === `text-bg-${item}`), [`text-bg-${event.target.value}`])}>{BOOTSTRAP_VARIANTS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    <label className="web-editor-repeat-checkbox"><input type="checkbox" checked={classes.includes("rounded-pill")} onChange={(event) => update((name) => name === "rounded-pill", event.target.checked ? ["rounded-pill"] : [])} /><span>{t("web.editor.quick.pill")}</span></label>
  </QuickPanel>;
}
BadgeContentPanel.propTypes = { selected: PropTypes.object.isRequired, onContentChange: PropTypes.func };

function CardContentPanel({ selected, onContentChange }) {
  const { t } = useTranslation();
  const [, refresh] = useState(0);
  const classes = classNames(selected);
  const border = BOOTSTRAP_VARIANTS.find((item) => classes.includes(`border-${item}`)) || "default";
  const surfaceClass = classes.find((name) => BOOTSTRAP_VARIANTS.some((item) => name === `text-bg-${item}`));
  const surface = surfaceClass?.replace("text-bg-", "") || "default";
  const shadow = classes.includes("shadow-lg") ? "lg" : classes.includes("shadow-sm") ? "sm" : classes.includes("shadow") ? "md" : "none";
  const update = (remove, add = []) => { replaceClasses(selected, remove, add); refresh((value) => value + 1); onContentChange?.(); };
  return <QuickPanel icon="id-card" title="Bootstrap Card">
    <label><span>{t("web.editor.quick.surface")}</span><select value={surface} onChange={(event) => update((name) => BOOTSTRAP_VARIANTS.some((item) => name === `text-bg-${item}`), event.target.value === "default" ? [] : [`text-bg-${event.target.value}`])}><option value="default">Default</option>{BOOTSTRAP_VARIANTS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    <label><span>{t("web.editor.quick.border")}</span><select value={border} onChange={(event) => update((name) => BOOTSTRAP_VARIANTS.some((item) => name === `border-${item}`), event.target.value === "default" ? [] : [`border-${event.target.value}`])}><option value="default">Default</option>{BOOTSTRAP_VARIANTS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    <label><span>{t("web.editor.quick.shadow")}</span><select value={shadow} onChange={(event) => update((name) => ["shadow-none", "shadow-sm", "shadow", "shadow-lg"].includes(name), event.target.value === "none" ? ["shadow-none"] : [event.target.value === "md" ? "shadow" : `shadow-${event.target.value}`])}><option value="none">None</option><option value="sm">Small</option><option value="md">Medium</option><option value="lg">Large</option></select></label>
  </QuickPanel>;
}
CardContentPanel.propTypes = { selected: PropTypes.object.isRequired, onContentChange: PropTypes.func };

function ListGroupContentPanel({ selected, onContentChange }) {
  const { t } = useTranslation();
  const [, refresh] = useState(0);
  const classes = classNames(selected);
  const updateToggle = (name, enabled) => { replaceClasses(selected, (item) => item === name, enabled ? [name] : []); refresh((value) => value + 1); onContentChange?.(); };
  return <QuickPanel icon="list" title="Bootstrap List Group">
    <label className="web-editor-repeat-checkbox"><input type="checkbox" checked={classes.includes("list-group-flush")} onChange={(event) => updateToggle("list-group-flush", event.target.checked)} /><span>{t("web.editor.quick.flush")}</span></label>
    <label className="web-editor-repeat-checkbox"><input type="checkbox" checked={classes.includes("list-group-numbered")} onChange={(event) => updateToggle("list-group-numbered", event.target.checked)} /><span>{t("web.editor.quick.numbered")}</span></label>
    <label className="web-editor-repeat-checkbox"><input type="checkbox" checked={classes.includes("list-group-horizontal")} onChange={(event) => updateToggle("list-group-horizontal", event.target.checked)} /><span>{t("web.editor.quick.horizontal")}</span></label>
  </QuickPanel>;
}
ListGroupContentPanel.propTypes = { selected: PropTypes.object.isRequired, onContentChange: PropTypes.func };

function RatioContentPanel({ selected, onContentChange }) {
  const { t } = useTranslation();
  const [, refresh] = useState(0);
  const classes = classNames(selected);
  const ratio = ["1x1", "4x3", "16x9", "21x9"].find((item) => classes.includes(`ratio-${item}`)) || "16x9";
  return <QuickPanel icon="display" title="Bootstrap Ratio">
    <label><span>{t("web.editor.quick.aspectRatio")}</span><select value={ratio} onChange={(event) => { replaceClasses(selected, (name) => /^ratio-(?:1x1|4x3|16x9|21x9)$/.test(name), [`ratio-${event.target.value}`]); refresh((value) => value + 1); onContentChange?.(); }}>{["1x1", "4x3", "16x9", "21x9"].map((item) => <option key={item} value={item}>{item.replace("x", ":")}</option>)}</select></label>
  </QuickPanel>;
}
RatioContentPanel.propTypes = { selected: PropTypes.object.isRequired, onContentChange: PropTypes.func };

function TableContentPanel({ selected, onContentChange }) {
  const { t } = useTranslation();
  const [, refresh] = useState(0);
  const classes = classNames(selected);
  const variant = BOOTSTRAP_VARIANTS.find((item) => classes.includes(`table-${item}`)) || "default";
  const border = classes.includes("table-borderless") ? "none" : classes.includes("table-bordered") ? "bordered" : "default";
  const update = (remove, add = []) => { replaceClasses(selected, remove, add); refresh((value) => value + 1); onContentChange?.(); };
  const toggle = (name, enabled) => update((item) => item === name, enabled ? [name] : []);
  return <QuickPanel icon="table" title="Bootstrap Table">
    <label><span>{t("web.editor.quick.variant")}</span><select value={variant} onChange={(event) => update((name) => BOOTSTRAP_VARIANTS.some((item) => name === `table-${item}`), event.target.value === "default" ? [] : [`table-${event.target.value}`])}><option value="default">Default</option>{BOOTSTRAP_VARIANTS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    <label><span>{t("web.editor.quick.border")}</span><select value={border} onChange={(event) => update((name) => ["table-bordered", "table-borderless"].includes(name), event.target.value === "bordered" ? ["table-bordered"] : event.target.value === "none" ? ["table-borderless"] : [])}><option value="default">Default</option><option value="bordered">Bordered</option><option value="none">Borderless</option></select></label>
    <label className="web-editor-repeat-checkbox"><input type="checkbox" checked={classes.includes("table-striped")} onChange={(event) => toggle("table-striped", event.target.checked)} /><span>{t("web.editor.quick.striped")}</span></label>
    <label className="web-editor-repeat-checkbox"><input type="checkbox" checked={classes.includes("table-hover")} onChange={(event) => toggle("table-hover", event.target.checked)} /><span>{t("web.editor.quick.hoverRows")}</span></label>
    <label className="web-editor-repeat-checkbox"><input type="checkbox" checked={classes.includes("table-sm")} onChange={(event) => toggle("table-sm", event.target.checked)} /><span>{t("web.editor.quick.compact")}</span></label>
  </QuickPanel>;
}
TableContentPanel.propTypes = { selected: PropTypes.object.isRequired, onContentChange: PropTypes.func };

function ProgressContentPanel({ selected, onContentChange }) {
  const { t } = useTranslation();
  const [, refresh] = useState(0);
  const outerClasses = classNames(selected);
  const bar = outerClasses.includes("progress-bar") ? selected : childModels(selected).find((child) => classNames(child).includes("progress-bar"));
  if (!bar) return null;
  const classes = classNames(bar);
  const attributes = bar.getAttributes?.() || {};
  const value = Math.max(0, Math.min(100, Number.parseInt(attributes["aria-valuenow"] || bar.getStyle?.().width || "0", 10) || 0));
  const variant = BOOTSTRAP_VARIANTS.find((item) => classes.includes(`bg-${item}`)) || "primary";
  const size = outerClasses.includes("sc-progress-thin") ? "thin" : outerClasses.includes("sc-progress-large") ? "large" : "standard";
  const update = (nextValue) => { const clean = Math.max(0, Math.min(100, Number(nextValue) || 0)); bar.addAttributes?.({ "aria-valuenow": String(clean), "aria-valuemin": "0", "aria-valuemax": "100" }); bar.addStyle?.({ width: `${clean}%` }); bar.set?.("content", `${clean} %`); refresh((current) => current + 1); onContentChange?.(); };
  return <QuickPanel icon="bars-progress" title="Bootstrap Progress">
    <label><span>{t("web.editor.quick.progressValue")} · {value} %</span><input type="range" min="0" max="100" value={value} onChange={(event) => update(event.target.value)} /></label>
    <label><span>{t("web.editor.quick.variant")}</span><select value={variant} onChange={(event) => { replaceClasses(bar, (name) => BOOTSTRAP_VARIANTS.some((item) => name === `bg-${item}`), [`bg-${event.target.value}`]); refresh((current) => current + 1); onContentChange?.(); }}>{BOOTSTRAP_VARIANTS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    <label><span>{t("web.editor.quick.size")}</span><select value={size} onChange={(event) => { replaceClasses(selected, (name) => ["sc-progress-thin", "sc-progress-large"].includes(name), event.target.value === "thin" ? ["sc-progress-thin"] : event.target.value === "large" ? ["sc-progress-large"] : []); refresh((current) => current + 1); onContentChange?.(); }}><option value="thin">Thin</option><option value="standard">Standard</option><option value="large">Large</option></select></label>
    <label className="web-editor-repeat-checkbox"><input type="checkbox" checked={classes.includes("progress-bar-striped")} onChange={(event) => { replaceClasses(bar, (name) => name === "progress-bar-striped" || name === "progress-bar-animated", event.target.checked ? ["progress-bar-striped"] : []); refresh((current) => current + 1); onContentChange?.(); }} /><span>Striped</span></label>
  </QuickPanel>;
}
ProgressContentPanel.propTypes = { selected: PropTypes.object.isRequired, onContentChange: PropTypes.func };

function ShapeContentPanel({ selected, onContentChange }) {
  const { t } = useTranslation();
  const [, refresh] = useState(0);
  const shape = managedShape(classNames(selected));
  return <QuickPanel icon="shapes" title={t("web.editor.quick.organicShape")} open={false}>
    <label><span>{t("web.editor.quick.mask")}</span><select value={shape} onChange={(event) => { replaceClasses(selected, (name) => name.startsWith("sc-shape-"), event.target.value === "none" ? [] : [`sc-shape-${event.target.value}`]); refresh((value) => value + 1); onContentChange?.(); }}>{ORGANIC_SHAPES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
  </QuickPanel>;
}
ShapeContentPanel.propTypes = { selected: PropTypes.object.isRequired, onContentChange: PropTypes.func };

function AlignmentContentPanel({ selected, onContentChange }) {
  const { t } = useTranslation();
  const [, refresh] = useState(0);
  const classes = classNames(selected);
  const align = classes.includes("text-center") ? "center" : classes.includes("text-end") ? "end" : "start";
  return <QuickPanel icon="align-left" title={t("web.editor.quick.alignment")} open={false}>
    <div className="web-editor-segmented">{[["start", "align-left"], ["center", "align-center"], ["end", "align-right"]].map(([value, icon]) => <button key={value} type="button" className={align === value ? "active" : ""} title={value} onClick={() => { replaceClasses(selected, (name) => ["text-start", "text-center", "text-end"].includes(name), [`text-${value}`]); refresh((current) => current + 1); onContentChange?.(); }}><i className={`fas fa-${icon}`} /></button>)}</div>
  </QuickPanel>;
}
AlignmentContentPanel.propTypes = { selected: PropTypes.object.isRequired, onContentChange: PropTypes.func };

export function QuickContentPanel({ selected, fontAwesomeIcons = [], onSelectMedia, onContentChange }) {
  const tag = String(selected.get?.("tagName") || "").toLowerCase();
  const classes = classNames(selected);
  const icon = tag === "i" && classes.some((name) => name.startsWith("fa-"));
  const button = ["a", "button"].includes(tag) && classes.some((name) => name === "sc-button" || name === "btn" || name.startsWith("btn-"));
  const socialLink = tag === "a" && classes.includes("ontario-social-link");
  const sectionLike = tag === "section" || classes.some((name) => name === "ontario-hero" || name === "ontario-compact-hero" || name.startsWith("sc-edge-"));
  const shapeable = ["article", "div", "figure"].includes(tag) && classes.some((name) => name === "card" || name.includes("box") || name.includes("card"));
  const alignable = ["div", "section", "article", "header", "p", "h1", "h2", "h3", "h4", "h5", "h6", "figure"].includes(tag);
  return <>
    {tag === "a" && <LinkContentPanel selected={selected} showLabel={!button} onContentChange={onContentChange} />}
    {socialLink && <SocialLinkPanel selected={selected} onContentChange={onContentChange} />}
    {icon && <IconContentPanel selected={selected} fontAwesomeIcons={fontAwesomeIcons} onContentChange={onContentChange} />}
    {button && <ButtonContentPanel selected={selected} fontAwesomeIcons={fontAwesomeIcons} onContentChange={onContentChange} />}
    {classes.includes("alert") && <AlertContentPanel selected={selected} onContentChange={onContentChange} />}
    {classes.includes("badge") && <BadgeContentPanel selected={selected} onContentChange={onContentChange} />}
    {classes.includes("card") && <CardContentPanel selected={selected} onContentChange={onContentChange} />}
    {classes.includes("list-group") && <ListGroupContentPanel selected={selected} onContentChange={onContentChange} />}
    {classes.includes("ratio") && <RatioContentPanel selected={selected} onContentChange={onContentChange} />}
    {tag === "table" && classes.includes("table") && <TableContentPanel selected={selected} onContentChange={onContentChange} />}
    {(classes.includes("progress") || classes.includes("progress-bar")) && <ProgressContentPanel selected={selected} onContentChange={onContentChange} />}
    {tag === "details" && <DetailsContentPanel selected={selected} onContentChange={onContentChange} />}
    <BackgroundOverlayPanel selected={selected} onSelectMedia={onSelectMedia} onContentChange={onContentChange} />
    {sectionLike && <SectionContentPanel selected={selected} onContentChange={onContentChange} />}
    {shapeable && <ShapeContentPanel selected={selected} onContentChange={onContentChange} />}
    {alignable && !sectionLike && <AlignmentContentPanel selected={selected} onContentChange={onContentChange} />}
  </>;
}
QuickContentPanel.propTypes = { selected: PropTypes.object.isRequired, fontAwesomeIcons: PropTypes.arrayOf(PropTypes.string), onSelectMedia: PropTypes.func, onContentChange: PropTypes.func };

function TemplateOwnedInfo({ templateId, onEdit }) {
  const { t } = useTranslation();
  return <div className="web-editor-linked-help web-editor-template-owned">
    <i className="fas fa-link" />
    <div><p>{t("web.props.templateOwnedHelp")}</p><small>{t("web.props.templateOwnedDetail")}</small>
      <button type="button" className="btn btn-sm btn-outline-light mt-2" onClick={() => onEdit?.(templateId)}><i className="fas fa-pen me-1" />{t("web.props.editTemplate")}</button>
    </div>
  </div>;
}
TemplateOwnedInfo.propTypes = { templateId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired, onEdit: PropTypes.func };

/* ── Linked resource content panel (props + variant selector) ────── */

const normalizeVariantLabel = (variant) => {
  if (!variant) return "";
  if (typeof variant === "string") return variant;
  return variant.label || variant.id || "";
};

const normalizeVariantId = (variant) => {
  if (!variant) return "";
  if (typeof variant === "string") return variant;
  return variant.id || variant.label || "";
};

export function LinkedResourceProps({ selected, resources, onClone, onDetach, onEditDefinition, onContentChange, disabled = false, showActions = true }) {
  const { t } = useTranslation();
  const kind = selected.get("resourceKind") === "section" ? "sections" : "components";
  const resourceId = String(selected.get("resourceId") || "");
  const definition = (resources[kind] || []).find((item) => String(item.qualified_key || item.id) === resourceId);
  const [values, setValues] = useState(() => ({ ...(selected.get("props") || {}) }));
  const [variant, setVariant] = useState(() => selected.get("variant") || "");
  const [cloning, setCloning] = useState(false);
  const [detaching, setDetaching] = useState(false);
  const [detachError, setDetachError] = useState("");
  useEffect(() => {
    const read = () => {
      setValues({ ...(selected.get("props") || {}) });
      setVariant(selected.get("variant") || "");
    };
    selected.on?.("change:props", read);
    selected.on?.("change:variant", read);
    return () => { selected.off?.("change:props", read); selected.off?.("change:variant", read); };
  }, [selected]);
  if (!definition) return <div className="web-editor-linked-help is-error"><i className="fas fa-link-slash" /><p>{t("web.props.missingDefinition")}</p><small>{resourceId}</small></div>;
  const variants = definition.variants || definition.published_variants || [];
  const schema = definition.prop_schema || definition.published_prop_schema || [];
  const canMaterialize = definition.can_materialize !== false;
  return <div className="web-editor-linked-props">
    <div className="web-editor-resource-state state-linked"><i className="fas fa-link" /><span><strong>{definition.name}</strong><small>{t(kind === "sections" ? "web.props.linkedSection" : "web.props.linkedComponent")}</small></span></div>
    {showActions && <div className="web-editor-linked-actions">
      <button type="button" className="btn btn-sm btn-outline-secondary" disabled={cloning} onClick={() => { setCloning(true); Promise.resolve(onClone?.(selected, kind, definition)).catch(() => {}).finally(() => setCloning(false)); }}>
        <i className="fas fa-clone me-1" />{t("web.props.cloneVariant")}
      </button>
      <button type="button" className="btn btn-sm btn-outline-light" onClick={() => onEditDefinition?.(selected, kind, definition)}><i className="fas fa-pen me-1" />{t("web.props.editDefinition")}</button>
      <button type="button" className="btn btn-sm btn-outline-danger" disabled={detaching || !canMaterialize} title={!canMaterialize ? t("web.props.detachUnavailable") : undefined} onClick={async () => {
        setDetaching(true);
        setDetachError("");
        try { await onDetach?.(selected, definition); }
        catch { setDetachError(t("web.props.detachFailed") || "Detach failed"); }
        finally { setDetaching(false); }
      }}>
        <i className={`fas fa-${detaching ? "spinner fa-spin" : "link-slash"} me-1`} />{detaching ? t("web.props.detaching") : t("web.props.detach")}
      </button>
      {detachError && <p className="web-editor-field-error" role="alert">{detachError}</p>}
      {!canMaterialize && <p className="web-editor-linked-help"><i className="fas fa-circle-info" />{t("web.props.detachUnavailable")}</p>}
    </div>}
    {variants.length > 0 && <div className="web-editor-prop-section">
      <label className="web-prop-field web-prop-select"><span>{t("web.props.variant")}</span>
        <select value={variant} disabled={disabled} onChange={(e) => {
          if (disabled) return;
          const id = e.target.value;
          setVariant(id);
          selected.set("variant", id || null);
          onContentChange?.();
        }}>
          <option value="">{t("web.props.defaultVariant")}</option>
          {variants.map((v) => {
            const vid = normalizeVariantId(v);
            return <option key={vid} value={vid}>{normalizeVariantLabel(v)}</option>;
          })}
        </select>
      </label>
    </div>}
    <ResourcePropsEditor schema={schema} value={values} disabled={disabled} onChange={(next) => { if (disabled) return; setValues(next); selected.set("props", next); onContentChange?.(); }} />
  </div>;
}

LinkedResourceProps.propTypes = { selected: PropTypes.object.isRequired, resources: PropTypes.object.isRequired, onClone: PropTypes.func, onDetach: PropTypes.func, onEditDefinition: PropTypes.func, onContentChange: PropTypes.func, disabled: PropTypes.bool, showActions: PropTypes.bool };

/* ── Linked resource style panel (CSS ownership info) ────────────── */

function LinkedStyleInfo({ selected, resources }) {
  const { t } = useTranslation();
  const kind = selected.get("resourceKind") === "section" ? "sections" : "components";
  const resourceId = String(selected.get("resourceId") || "");
  const definition = (resources[kind] || []).find((item) => String(item.qualified_key || item.id) === resourceId);
  const name = definition?.name || resourceId;
  return <div className="web-editor-linked-help">
    <i className="fas fa-link" />
    <p>{t("web.props.linkedStyleHelp")}</p>
    <div className="web-editor-css-cascade-info">
      <ol>
        <li><strong>{t("web.props.cssCascadeItem", { level: 1, owner: name })}</strong> — {t("web.props.cssCascadeLevel1")}</li>
        <li><strong>{t("web.props.cssCascadeItem", { level: 2, owner: t("web.props.cssCascadeSection") })}</strong> — {t("web.props.cssCascadeLevel2")}</li>
        <li><strong>{t("web.props.cssCascadeItem", { level: 3, owner: t("web.props.cssCascadeLayout") })}</strong> — {t("web.props.cssCascadeLevel3")}</li>
        <li><strong>{t("web.props.cssCascadeItem", { level: 4, owner: t("web.props.cssCascadeTheme") })}</strong> — {t("web.props.cssCascadeLevel4")}</li>
        <li><strong>{t("web.props.cssCascadeItem", { level: 5, owner: t("web.props.cssCascadeGlobal") })}</strong> — {t("web.props.cssCascadeLevel5")}</li>
      </ol>
      <small>{t("web.props.cssCascadeHelp")}</small>
    </div>
  </div>;
}

LinkedStyleInfo.propTypes = { selected: PropTypes.object.isRequired, resources: PropTypes.object.isRequired };

/* ── Data bindings panel ─────────────────────────────────────────── */

const sourceFields = (source) => Array.isArray(source?.fields) ? source.fields : Object.entries(source?.fields || {}).map(([id, definition]) => ({ id, ...(typeof definition === "object" ? definition : {}) }));

const sourceParameters = (source) => Object.entries(source?.parameters || {}).map(([id, definition]) => ({
  id,
  ...(definition && typeof definition === "object" ? definition : {}),
}));

const parameterValue = (params, definition) => (
  Object.prototype.hasOwnProperty.call(params, definition.id) ? params[definition.id] : definition.default ?? ""
);

const coerceParameter = (definition, value) => {
  if (value === "") return undefined;
  if (definition.type === "integer") return Number.parseInt(value, 10);
  if (definition.type === "number") return Number(value);
  if (definition.type === "boolean") return value === true || value === "true";
  return value;
};

export function CalendarConfigurator({ selected, onContentChange }) {
  const { t } = useTranslation();
  const [, setRevision] = useState(0);
  const kind = selected.get?.("kind") || "all";
  const teamId = selected.get?.("teamId") ?? "";
  const firstDayOfWeek = selected.get?.("firstDayOfWeek") || "monday";
  const showDescription = selected.get?.("showDescription") !== false;
  const update = (key, value) => {
    selected.set?.(key, value);
    setRevision((current) => current + 1);
    onContentChange?.();
  };
  return <div className="web-editor-binding-panel web-editor-calendar-configurator">
    <p>{t("web.editor.calendar.help")}</p>
    <label><span>{t("web.editor.calendar.kind")}</span><select value={kind} onChange={(event) => update("kind", event.target.value)}>
      {["all", "meeting", "trip", "other"].map((value) => <option key={value} value={value}>{t(`web.editor.calendar.kinds.${value}`)}</option>)}
    </select></label>
    <label><span>{t("web.editor.calendar.teamId")}</span><input
      type="number"
      min="1"
      inputMode="numeric"
      value={teamId}
      placeholder={t("web.editor.calendar.allTeams")}
      onChange={(event) => update("teamId", event.target.value === "" ? "" : Number(event.target.value))}
    /><small>{t("web.editor.calendar.teamIdHelp")}</small></label>
    <label><span>{t("web.editor.calendar.firstDayOfWeek")}</span><select value={firstDayOfWeek} onChange={(event) => update("firstDayOfWeek", event.target.value)}>
      <option value="monday">{t("web.editor.calendar.monday")}</option>
      <option value="sunday">{t("web.editor.calendar.sunday")}</option>
    </select></label>
    <label className="web-editor-repeat-checkbox"><input type="checkbox" checked={showDescription} onChange={(event) => update("showDescription", event.target.checked)} /><span>{t("web.editor.calendar.showDescription")}</span></label>
  </div>;
}

CalendarConfigurator.propTypes = { selected: PropTypes.object.isRequired, onContentChange: PropTypes.func };

export function RepeatConfigurator({ selected, dataSources, onContentChange }) {
  const { t } = useTranslation();
  const [, setRevision] = useState(0);
  const collections = dataSources.filter((source) => source?.collection !== false);
  const sourceId = selected.get?.("source") || "";
  const source = collections.find((item) => item.id === sourceId);
  const params = selected.get?.("params") || {};
  const updateSource = (nextSource) => {
    selected.set?.("source", nextSource);
    selected.set?.("params", {});
    setRevision((value) => value + 1);
    onContentChange?.();
  };
  const updateParameter = (definition, rawValue) => {
    const value = coerceParameter(definition, rawValue);
    const next = { ...params };
    if (value === undefined || (typeof value === "number" && Number.isNaN(value))) delete next[definition.id];
    else next[definition.id] = value;
    selected.set?.("params", next);
    setRevision((revision) => revision + 1);
    onContentChange?.();
  };
  return <div className="web-editor-binding-panel web-editor-repeat-configurator">
    <p>{t("web.editor.repeatHelp")}</p>
    <label><span>{t("web.editor.data.source")}</span><select value={sourceId} onChange={(event) => updateSource(event.target.value)}>
      <option value="">{t("web.editor.repeatSelectSource")}</option>
      {collections.map((item) => <option key={item.id} value={item.id}>{item.label || item.name || item.id}</option>)}
    </select></label>
    {!source && <div className="web-editor-linked-help"><i className="fas fa-database" /><p>{t("web.editor.repeatEmptySource")}</p></div>}
    {source && <>
      {sourceParameters(source).map((definition) => {
        const value = parameterValue(params, definition);
        const label = definition.label || definition.id;
        if (definition.choices?.length) return <label key={definition.id}><span>{label}</span><select value={String(value ?? "")} onChange={(event) => updateParameter(definition, event.target.value)}>
          {!definition.required && definition.default == null && <option value="">—</option>}
          {definition.choices.map((choice) => <option key={String(choice)} value={String(choice)}>{String(choice)}</option>)}
        </select>{definition.description && <small>{definition.description}</small>}</label>;
        if (definition.type === "boolean") return <label key={definition.id} className="web-editor-repeat-checkbox"><input type="checkbox" checked={Boolean(value)} onChange={(event) => updateParameter(definition, event.target.checked)} /><span>{label}</span></label>;
        return <label key={definition.id}><span>{label}</span><input
          type={definition.type === "integer" || definition.type === "number" ? "number" : definition.type === "datetime" ? "datetime-local" : "text"}
          value={value ?? ""}
          min={definition.minimum ?? undefined}
          max={definition.maximum ?? undefined}
          onChange={(event) => updateParameter(definition, event.target.value)}
        />{definition.description && <small>{definition.description}</small>}</label>;
      })}
      <div className="web-editor-repeat-fields"><strong>{t("web.editor.repeatFields")}</strong><div>{sourceFields(source).map((field) => <code key={field.id || field.name}>{field.label || field.name || field.id}</code>)}</div><small>{t("web.editor.repeatFieldsHelp")}</small></div>
    </>}
  </div>;
}

RepeatConfigurator.propTypes = { selected: PropTypes.object.isRequired, dataSources: PropTypes.array.isRequired, onContentChange: PropTypes.func };

const componentChildren = (component) => {
  const collection = component?.components?.();
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection?.models)) return collection.models;
  if (typeof collection?.toArray === "function") return collection.toArray();
  return [];
};

export function findNearestRepeat(selected) {
  if (!selected) return null;
  let root = selected;
  while (root.parent?.()) root = root.parent();
  const ordered = [];
  const visit = (component) => {
    if (component?.get?.("type") === "sc-repeat" || component === selected) ordered.push(component);
    componentChildren(component).forEach(visit);
  };
  visit(root);
  const paginationIndex = ordered.indexOf(selected);
  if (paginationIndex < 0) return null;
  for (let index = paginationIndex - 1; index >= 0; index -= 1) {
    if (ordered[index]?.get?.("type") === "sc-repeat") return ordered[index];
  }
  return ordered.slice(paginationIndex + 1).find((item) => item?.get?.("type") === "sc-repeat") || null;
}

const paginationBinding = { $scBinding: { scope: "page", field: "query.page" } };
const sameValue = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function PaginationConfigurator({ selected, dataSources, onContentChange }) {
  const { t } = useTranslation();
  const [revision, setRevision] = useState(0);
  const repeat = useMemo(() => findNearestRepeat(selected), [selected]);
  const sourceId = repeat?.get?.("source") || "";
  const source = dataSources.find((item) => item.id === sourceId);
  const supportsPage = Boolean(sourceParameters(source).some((item) => item.id === "page"));
  const repeatParams = repeat?.get?.("params") || {};
  const limitDefinition = sourceParameters(source).find((item) => item.id === "limit");
  const effectiveSize = Number(selected.get?.("pageSize") || selected.get?.("limit") || repeatParams.limit || limitDefinition?.default || 10);
  const mode = selected.get?.("mode") || "simple";
  const previousLabel = selected.get?.("previousLabel") || t("web.editor.pagination.previousDefault");
  const nextLabel = selected.get?.("nextLabel") || t("web.editor.pagination.nextDefault");
  const maximumPageSize = Math.min(Number(limitDefinition?.maximum) || 50, 50);

  const syncPair = useCallback((requestedSize = effectiveSize) => {
    if (!repeat || !sourceId || !supportsPage) return;
    const pageSize = Math.max(1, Math.min(Number(requestedSize) || 1, maximumPageSize));
    const nextRepeatParams = { ...(repeat.get?.("params") || {}), limit: pageSize, page: paginationBinding };
    const nextPaginationParams = { ...nextRepeatParams };
    let changed = false;
    const update = (component, key, value) => {
      if (!sameValue(component.get?.(key), value)) {
        component.set?.(key, value);
        changed = true;
      }
    };
    update(repeat, "params", nextRepeatParams);
    update(selected, "bindTo", "nearest");
    update(selected, "source", sourceId);
    update(selected, "pageSize", pageSize);
    update(selected, "limit", pageSize);
    update(selected, "params", nextPaginationParams);
    if (changed) {
      setRevision((value) => value + 1);
      onContentChange?.();
    }
  }, [effectiveSize, maximumPageSize, onContentChange, repeat, selected, sourceId, supportsPage]);

  useEffect(() => {
    if (!repeat) return undefined;
    const refresh = () => setRevision((value) => value + 1);
    repeat.on?.("change:source change:params", refresh);
    syncPair();
    return () => repeat.off?.("change:source change:params", refresh);
  }, [repeat, syncPair]);

  const updateField = (key, value) => {
    selected.set?.(key, value);
    setRevision((current) => current + 1);
    onContentChange?.();
  };

  return <div className="web-editor-binding-panel web-editor-pagination-configurator" data-revision={revision}>
    <p>{t("web.editor.pagination.help")}</p>
    {!repeat && <div className="web-editor-linked-help"><i className="fas fa-triangle-exclamation" /><p>{t("web.editor.pagination.noRepeat")}</p></div>}
    {repeat && <div className="web-editor-linked-help"><i className="fas fa-link" /><p>{t("web.editor.pagination.linkedTo", { source: source?.label || source?.name || sourceId || t("web.editor.pagination.unconfiguredRepeat") })}</p></div>}
    {repeat && !supportsPage && <div className="web-editor-linked-help"><i className="fas fa-triangle-exclamation" /><p>{t("web.editor.pagination.unsupportedSource")}</p></div>}
    {repeat && supportsPage && <>
      <label><span>{t("web.editor.pagination.pageSize")}</span><input
        type="number"
        min={limitDefinition?.minimum ?? 1}
        max={maximumPageSize}
        value={effectiveSize}
        onChange={(event) => syncPair(event.target.value)}
      /></label>
      <label><span>{t("web.editor.pagination.mode")}</span><select value={mode} onChange={(event) => updateField("mode", event.target.value)}>
        <option value="simple">{t("web.editor.pagination.modeSimple")}</option>
        <option value="numbers">{t("web.editor.pagination.modeNumbers")}</option>
        <option value="compact">{t("web.editor.pagination.modeCompact")}</option>
      </select></label>
      <label><span>{t("web.editor.pagination.previousLabel")}</span><input value={previousLabel} maxLength={60} onChange={(event) => updateField("previousLabel", event.target.value)} /></label>
      <label><span>{t("web.editor.pagination.nextLabel")}</span><input value={nextLabel} maxLength={60} onChange={(event) => updateField("nextLabel", event.target.value)} /></label>
    </>}
  </div>;
}

PaginationConfigurator.propTypes = { selected: PropTypes.object.isRequired, dataSources: PropTypes.array.isRequired, onContentChange: PropTypes.func };

export function DataBindings({ selected, dataSources }) {
  const { t } = useTranslation();
  const [sourceId, setSourceId] = useState("");
  const [field, setField] = useState("");
  const [target, setTarget] = useState("text");
  const [revision, setRevision] = useState(0);
  const contextSource = useMemo(() => { let node = selected?.parent?.(); while (node) { if (node.get?.("type") === "sc-repeat") return node.get("source"); node = node.parent?.(); } return null; }, [selected]);
  useEffect(() => { const nextSource = contextSource || dataSources[0]?.id || ""; setSourceId(nextSource); const source = dataSources.find((item) => item.id === nextSource); setField(sourceFields(source)[0]?.id || sourceFields(source)[0]?.name || ""); }, [contextSource, dataSources, selected]);
  const source = dataSources.find((item) => item.id === sourceId);
  const fields = sourceFields(source);
  const bindings = getComponentBindings(selected);
  const targets = createBindingTargetOptions(t);
  const add = () => { if (!field) return; setComponentBinding(selected, target, { scope: contextSource === sourceId ? "context" : "source", source: contextSource === sourceId ? undefined : sourceId, field }); setRevision((value) => value + 1); };
  return <div className="web-editor-binding-panel" data-revision={revision}>
    <p>{t("web.editor.dataHelp")}</p>
    {Object.entries(bindings).map(([bindingTarget, binding]) => <div className="web-editor-binding" key={bindingTarget}><span><strong>{bindingTarget}</strong><small>{binding.source || t("web.editor.currentRecord")} · {binding.field}</small></span><button type="button" title={t("web.editor.removeBinding")} onClick={() => { removeComponentBinding(selected, bindingTarget); setRevision((value) => value + 1); }}><i className="fas fa-xmark" /></button></div>)}
    <label><span>{t("web.editor.bindingSource")}</span><select value={sourceId} onChange={(event) => { const value = event.target.value; setSourceId(value); const next = dataSources.find((item) => item.id === value); setField(sourceFields(next)[0]?.id || ""); }}>{dataSources.map((item) => <option key={item.id} value={item.id}>{item.id === contextSource ? `${item.label || item.name} (${t("web.editor.currentRecord")})` : item.label || item.name || item.id}</option>)}</select></label>
    <label><span>{t("web.editor.bindingField")}</span><select value={field} onChange={(event) => setField(event.target.value)}>{fields.map((item) => <option key={item.id || item.name} value={item.id || item.name}>{item.label || item.name || item.id}</option>)}</select></label>
    <label><span>{t("web.editor.bindingTarget")}</span><select value={target} onChange={(event) => setTarget(event.target.value)}>{targets.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    <button type="button" className="btn btn-sm btn-outline-light w-100" disabled={!field} onClick={add}>{t("web.editor.addBinding")}</button>
  </div>;
}
DataBindings.propTypes = { selected: PropTypes.object.isRequired, dataSources: PropTypes.array.isRequired };

/* ── Advanced inspector ──────────────────────────────────────────── */

const SAFE_TAGS = [
  "div", "section", "article", "header", "footer", "main", "nav", "aside",
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "span", "strong", "em",
  "a", "button", "ul", "ol", "li", "figure", "figcaption", "table", "thead",
  "tbody", "tr", "th", "td",
];
const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_:.-]{0,99}$/;
const CLASS_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]{0,79}$/;

const classNames = (selected) => (selected?.getClasses?.() || [])
  .map((item) => typeof item === "string" ? item : item?.getName?.() || item?.name)
  .filter(Boolean);

function AdvancedInspector({ selected }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ tagName: "div", id: "", classes: "", title: "", role: "", ariaLabel: "" });
  const [error, setError] = useState("");
  const type = selected.get?.("type") || "default";
  const state = getComponentState(selected);
  const tagEditable = !String(type).startsWith("sc-") && type !== "image" && type !== "wrapper";

  useEffect(() => {
    const read = () => {
      const attributes = selected.getAttributes?.() || {};
      setForm({
        tagName: selected.get?.("tagName") || (type === "link" ? "a" : "div"),
        id: attributes.id || "",
        classes: classNames(selected).join(" "),
        title: attributes.title || "",
        role: attributes.role || "",
        ariaLabel: attributes["aria-label"] || "",
      });
    };
    read();
    selected.on?.("change:attributes change:classes change:tagName", read);
    return () => selected.off?.("change:attributes change:classes change:tagName", read);
  }, [selected, type]);

  const setAttribute = (name, value) => {
    const clean = value.trim();
    if (clean) selected.addAttributes?.({ [name]: clean });
    else selected.removeAttributes?.(name);
  };
  const commitId = (rawValue = form.id) => {
    const value = rawValue.trim();
    if (value && !ID_PATTERN.test(value)) {
      setError(t("web.editor.advanced.invalidId"));
      return;
    }
    setError("");
    setAttribute("id", value);
  };
  const commitClasses = (rawValue = form.classes) => {
    const values = rawValue.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean);
    const invalid = values.find((value) => !CLASS_PATTERN.test(value));
    if (invalid) {
      setError(t("web.editor.advanced.invalidClass", { name: invalid }));
      return;
    }
    setError("");
    selected.setClass?.([...new Set(values)]);
  };

  return <div className="web-editor-advanced">
    <p>{t("web.editor.advancedHelp")}</p>
    {state !== "local" && <div className={`web-editor-resource-state state-${state}`}><i className={`fas ${state === "global" ? "fa-earth-europe" : state === "linked" ? "fa-link" : state === "detached" ? "fa-link-slash" : "fa-database"}`} /><span><strong>{t(`web.editor.navigator.states.${state}`)}</strong><small>{t(`web.editor.advanced.stateHelp.${state}`)}</small></span></div>}
    <section>
      <h3>{t("web.editor.advanced.semantics")}</h3>
      <label><span>{t("web.editor.advanced.tag")}</span><select value={form.tagName} disabled={!tagEditable} onChange={(event) => { const value = event.target.value; setForm((current) => ({ ...current, tagName: value })); selected.set?.("tagName", value); }}>
        {!SAFE_TAGS.includes(form.tagName) && <option value={form.tagName}>{form.tagName}</option>}
        {SAFE_TAGS.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
      </select>{!tagEditable && <small>{t("web.editor.advanced.fixedTag")}</small>}</label>
      <label><span>{t("web.editor.advanced.id")}</span><input className="web-editor-code-input" value={form.id} onChange={(event) => setForm((current) => ({ ...current, id: event.target.value }))} onBlur={(event) => commitId(event.target.value)} /></label>
    </section>
    <section>
      <h3>{t("web.editor.advanced.classes")}</h3>
      <label><span>{t("web.editor.advanced.classList")}</span><input className="web-editor-code-input" value={form.classes} placeholder="hero hero--large" onChange={(event) => setForm((current) => ({ ...current, classes: event.target.value }))} onBlur={(event) => commitClasses(event.target.value)} /><small>{t("web.editor.advanced.classesHelp")}</small></label>
    </section>
    <section>
      <h3>{t("web.editor.advanced.attributes")}</h3>
      <label><span>{t("web.editor.advanced.title")}</span><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} onBlur={() => setAttribute("title", form.title)} /></label>
    </section>
    <section>
      <h3>{t("web.editor.advanced.accessibility")}</h3>
      <label><span>{t("web.editor.advanced.role")}</span><input className="web-editor-code-input" value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))} onBlur={() => setAttribute("role", form.role)} /></label>
      <label><span>{t("web.editor.advanced.ariaLabel")}</span><input value={form.ariaLabel} onChange={(event) => setForm((current) => ({ ...current, ariaLabel: event.target.value }))} onBlur={() => setAttribute("aria-label", form.ariaLabel)} /></label>
    </section>
    {error && <p className="web-editor-field-error" role="alert">{error}</p>}
  </div>;
}
AdvancedInspector.propTypes = { selected: PropTypes.object.isRequired };

/* ── Code panel ──────────────────────────────────────────────────── */

const componentHtml = (editor, component) => {
  try {
    return editor.getHtml({ component }) || "";
  } catch {
    try { return component.toHTML() || ""; } catch { return ""; }
  }
};

const componentCss = (editor, component) => {
  try {
    return editor.getCss({ component }) || "";
  } catch {
    try { return component.getStyleString?.() || ""; } catch { return ""; }
  }
};

const cssDefinitionSelector = (definition = {}) => {
  const selectors = (definition.selectors || []).map((name) => (
    String(name).startsWith("#") ? String(name) : `.${name}`
  )).join("");
  const state = definition.state ? `:${definition.state}` : "";
  const additional = definition.selectorsAdd || "";
  return [selectors ? `${selectors}${state}` : "", additional].filter(Boolean).join(", ");
};

export const replaceComponentCss = (editor, previousCss, nextCss) => {
  const parser = editor?.Parser;
  const composer = editor?.Css;
  if (!composer) return;
  const definitions = parser?.parseCss?.(previousCss || "") || [];
  const rules = composer.getAll?.();
  const currentRules = Array.isArray(rules) ? rules : rules?.models || [];
  const remove = currentRules.filter((rule) => definitions.some((definition) => (
    rule.getSelectorsString?.() === cssDefinitionSelector(definition)
    && (rule.get?.("state") || "") === (definition.state || "")
    && (rule.get?.("mediaText") || "") === (definition.mediaText || "")
    && (rule.get?.("atRuleType") || "") === (definition.atRuleType || "")
  )));
  if (remove.length) composer.remove?.(remove);
  if (nextCss.trim()) composer.addRules?.(nextCss);
};

function CodePanel({ selected, onApplied }) {
  const { t } = useTranslation();
  const [html, setHtml] = useState("");
  const [css, setCss] = useState("");
  const [loadedCss, setLoadedCss] = useState("");
  const [parseError, setParseError] = useState("");
  const [revision, setRevision] = useState(0);

  const editor = selected?.em?.Editor || selected?.editor || null;

  useEffect(() => {
    if (!selected || !editor) return;
    try {
      setHtml(componentHtml(editor, selected));
      const currentCss = componentCss(editor, selected);
      setCss(currentCss);
      setLoadedCss(currentCss);
      setParseError("");
    } catch { /* component may not expose code */ }
  }, [selected, editor, revision]);

  const apply = useCallback(() => {
    if (!selected || !editor) return;
    const cleanHtml = html.trim();
    if (!cleanHtml) return;
    try {
      const parsed = editor.Parser.parseHtml(cleanHtml);
      const componentElement = parsed?.html;
      if (!componentElement) throw new Error(t("web.editor.codeParseError"));
      const replacements = selected.replaceWith(componentElement, { silent: false });
      const replacement = Array.isArray(replacements) ? replacements[0] : replacements;
      if (replacement) editor.select?.(replacement);
    } catch (error) {
      console.warn("CodePanel replaceWith failed", error);
      setParseError(t("web.editor.codeParseError"));
      return;
    }
    setParseError("");
    try {
      replaceComponentCss(editor, loadedCss, css);
    } catch { /* style parse error */ }
    onApplied?.();
    setRevision((v) => v + 1);
  }, [selected, editor, html, css, loadedCss, onApplied, t]);

  return <div className="web-editor-code-panel">
    <p>{t("web.editor.codeHelp")}</p>
    <label><span>{t("web.editor.html")}</span><textarea className="is-html" rows="10" value={html} onChange={(e) => setHtml(e.target.value)} spellCheck={false} aria-invalid={Boolean(parseError)} /></label>
    <label><span>{t("web.editor.css")}</span><textarea rows="7" value={css} onChange={(e) => setCss(e.target.value)} spellCheck={false} /></label>
    {parseError && <p className="web-editor-field-error" role="alert">{parseError}</p>}
    <div className="web-editor-code-actions"><button type="button" className="btn btn-sm btn-primary" onClick={apply} disabled={!html.trim()}>{t("web.editor.applyCode")}</button></div>
  </div>;
}
CodePanel.propTypes = { selected: PropTypes.object.isRequired, onApplied: PropTypes.func };
