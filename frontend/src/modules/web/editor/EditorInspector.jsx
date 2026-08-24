import { useCallback, useEffect, useId, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { createBindingTargetOptions, getComponentBindings, removeComponentBinding, setComponentBinding } from "./grapes";
import { getComponentDisplayName, getComponentState, getComponentTechnicalName } from "./componentDisplayName";
import { ResourcePropsEditor } from "../props/PropEditorRegistry";
import { getTemplateOwnerId } from "./componentOwnership";
import CharacteristicContentPanel from "./CharacteristicContentPanel";
import ThemeContentControls from "./ThemeContentControls";


const tabs = ["content", "style", "data", "code", "advanced"];

export { getTemplateOwnerId } from "./componentOwnership";

export default function EditorInspector({ selected, dataSources, resources, fontAwesomeIcons = [], themeControls = [], onDuplicate, onDelete, onClone, onDetach, onEditDefinition, onEditTemplate, onContentChange, onSelectMedia }) {
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
      {selected && templateOwnerId && <TemplateOwnedInfo templateId={templateOwnerId} onEdit={onEditTemplate} />}
      {/* GrapesJS resolves appendTo only during initialization. Keep both
          native mounts in the DOM for the entire editor lifetime. In
          particular, selecting a template-owned component must only hide
          them; unmounting would leave StyleManager attached to a stale node. */}
      <div className={!templateOwnerId && tab === "content" ? "" : "d-none"}>
        {linked && <LinkedResourceProps key={selected?.cid} selected={selected} resources={resources} onClone={onClone} onDetach={onDetach} onEditDefinition={onEditDefinition} onContentChange={onContentChange} />}
        <div className={linked ? "d-none" : ""}>
          {selected && <CharacteristicContentPanel selected={selected} onContentChange={onContentChange} />}
          {type === "image" && <ImageContentPanel selected={selected} onSelectMedia={onSelectMedia} onContentChange={onContentChange} />}
          {selected && <>
            <QuickContentPanel selected={selected} fontAwesomeIcons={fontAwesomeIcons} themeControls={themeControls} onSelectMedia={onSelectMedia} onContentChange={onContentChange} />
          </>}
          <div className="web-editor-trait-manager" />
        </div>
      </div>
      <div className={!templateOwnerId && tab === "style" ? "" : "d-none"}>
        {linked && <LinkedStyleInfo selected={selected} resources={resources} />}
        <div className={linked ? "d-none" : ""}><div className="web-editor-style-manager" /></div>
      </div>
      {selected && !templateOwnerId && tab === "data" && (type === "sc-repeat"
        ? <RepeatConfigurator selected={selected} dataSources={dataSources} onContentChange={onContentChange} />
        : type === "sc-pagination"
          ? <PaginationConfigurator selected={selected} dataSources={dataSources} onContentChange={onContentChange} />
          : type === "sc-calendar"
            ? <CalendarConfigurator selected={selected} dataSources={dataSources} onContentChange={onContentChange} />
            : <DataBindings selected={selected} dataSources={dataSources} />)}
      <div className={selected && !templateOwnerId && tab === "code" ? "" : "d-none"}>{selected && !templateOwnerId && <CodePanel key={selected.cid} selected={selected} onApplied={onContentChange} />}</div>
      {selected && !templateOwnerId && tab === "advanced" && <AdvancedInspector selected={selected} />}
    </div>
  </aside>;
}

EditorInspector.propTypes = { selected: PropTypes.object, dataSources: PropTypes.array.isRequired, resources: PropTypes.object.isRequired, fontAwesomeIcons: PropTypes.arrayOf(PropTypes.string), themeControls: PropTypes.arrayOf(PropTypes.object), onDuplicate: PropTypes.func.isRequired, onDelete: PropTypes.func.isRequired, onClone: PropTypes.func, onDetach: PropTypes.func, onEditDefinition: PropTypes.func, onEditTemplate: PropTypes.func, onContentChange: PropTypes.func, onSelectMedia: PropTypes.func };

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
  const imageStyle = selected.getStyle?.() || {};
  const alignment = imageStyle.width === "100%" && !imageStyle["margin-left"] && !imageStyle["margin-right"]
    ? "full"
    : imageStyle["margin-left"] === "auto" && imageStyle["margin-right"] === "auto"
      ? "center"
      : imageStyle["margin-left"] === "auto" ? "right" : "left";
  const width = [25, 50, 75, 100].find((value) => imageStyle.width === `${value}%`) || "original";
  const changeImageLayout = (value) => {
    replaceClasses(selected, (name) => ["mx-auto", "ms-auto", "me-auto", "d-block", "w-25", "w-50", "w-75", "w-100"].includes(name));
    selected.addStyle?.({
      display: "block",
      "margin-left": value === "center" || value === "right" ? "auto" : "0",
      "margin-right": value === "center" ? "auto" : "0",
      ...(value === "full" ? { width: "100%" } : {}),
    });
    refresh((current) => current + 1);
    onContentChange?.();
  };

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
      <label><span>{t("web.editor.quick.alignment")}</span><div className="web-editor-segmented">{[["left", "align-left"], ["center", "align-center"], ["right", "align-right"], ["full", "arrows-left-right-to-line"]].map(([value, icon]) => <button key={value} type="button" className={alignment === value ? "active" : ""} title={value} onClick={() => changeImageLayout(value)}><i className={`fas fa-${icon}`} /></button>)}</div></label>
      <label><span>{t("web.editor.quick.width")}</span><select value={width} onChange={(event) => { const value = event.target.value; replaceClasses(selected, (name) => /^w-(?:25|50|75|100)$/.test(name)); selected.addStyle?.({ width: value === "original" ? "auto" : `${value}%` }); refresh((current) => current + 1); onContentChange?.(); }}><option value="original">Original</option>{[25, 50, 75, 100].map((value) => <option key={value} value={value}>{value} %</option>)}</select></label>
      <label><span>{t("web.editor.quick.fit")}</span><select value={selected.getStyle?.()["object-fit"] || ""} onChange={(event) => { selected.addStyle?.({ "object-fit": event.target.value || "initial" }); refresh((value) => value + 1); onContentChange?.(); }}><option value="">Original</option><option value="cover">Cover</option><option value="contain">Contain</option></select></label>
    </QuickPanel>
  </section>;
}

ImageContentPanel.propTypes = { selected: PropTypes.object.isRequired, onSelectMedia: PropTypes.func, onContentChange: PropTypes.func };

const ICON_CHOICES = [
  "compass", "tent", "campground", "fire", "map", "location-dot", "calendar-days",
  "clock", "users", "person-hiking", "tree", "mountain-sun", "envelope", "phone",
  "download", "link", "circle-info", "triangle-exclamation", "check", "heart", "star",
];
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


export function QuickContentPanel({ selected, fontAwesomeIcons = [], themeControls = [], onSelectMedia, onContentChange }) {
  const tag = String(selected.get?.("tagName") || "").toLowerCase();
  const classes = classNames(selected);
  const icon = tag === "i" && classes.some((name) => name.startsWith("fa-"));
  return <>
    {tag === "a" && <LinkContentPanel selected={selected} onContentChange={onContentChange} />}
    {icon && <IconContentPanel selected={selected} fontAwesomeIcons={fontAwesomeIcons} onContentChange={onContentChange} />}
    {tag === "details" && <DetailsContentPanel selected={selected} onContentChange={onContentChange} />}
    <ThemeContentControls selected={selected} controls={themeControls} onSelectMedia={onSelectMedia} onContentChange={onContentChange} />
  </>;
}
QuickContentPanel.propTypes = { selected: PropTypes.object.isRequired, fontAwesomeIcons: PropTypes.arrayOf(PropTypes.string), themeControls: PropTypes.arrayOf(PropTypes.object), onSelectMedia: PropTypes.func, onContentChange: PropTypes.func };

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

const parameterOptions = (definition) => (Array.isArray(definition?.options)
  ? definition.options
    .filter((option) => option && option.value !== undefined && option.value !== null)
    .map((option) => ({ value: option.value, label: String(option.label ?? option.value) }))
  : []
);

function NamedOptionSelect({ definition, value, emptyLabel, onChange }) {
  const { t } = useTranslation();
  const options = parameterOptions(definition);
  const hasValue = value !== "" && value !== undefined && value !== null;
  const selectedOptionIsMissing = hasValue && !options.some((option) => String(option.value) === String(value));
  return <select value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}>
    {emptyLabel !== null && <option value="">{emptyLabel || "—"}</option>}
    {selectedOptionIsMissing && <option value={String(value)}>{t("web.editor.unknownOption", { id: value })}</option>}
    {options.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
  </select>;
}

NamedOptionSelect.propTypes = {
  definition: PropTypes.object,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  emptyLabel: PropTypes.string,
  onChange: PropTypes.func.isRequired,
};

const coerceParameter = (definition, value) => {
  if (value === "") return undefined;
  if (definition.type === "integer") return Number.parseInt(value, 10);
  if (definition.type === "number") return Number(value);
  if (definition.type === "boolean") return value === true || value === "true";
  return value;
};

export function CalendarConfigurator({ selected, dataSources, onContentChange }) {
  const { t } = useTranslation();
  const [, setRevision] = useState(0);
  const kind = selected.get?.("kind") || "all";
  const teamId = selected.get?.("teamId") ?? "";
  const eventSource = dataSources.find((source) => source?.id === "core.events");
  const teamDefinition = sourceParameters(eventSource).find((definition) => definition.id === "team_id");
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
    <label><span>{t("web.editor.calendar.teamId")}</span><NamedOptionSelect
      definition={teamDefinition}
      value={String(teamId)}
      emptyLabel={t("web.editor.calendar.allTeams")}
      onChange={(value) => update("teamId", value === "" ? "" : Number(value))}
    /><small>{t("web.editor.calendar.teamIdHelp")}</small></label>
    <label><span>{t("web.editor.calendar.firstDayOfWeek")}</span><select value={firstDayOfWeek} onChange={(event) => update("firstDayOfWeek", event.target.value)}>
      <option value="monday">{t("web.editor.calendar.monday")}</option>
      <option value="sunday">{t("web.editor.calendar.sunday")}</option>
    </select></label>
    <label className="web-editor-repeat-checkbox"><input type="checkbox" checked={showDescription} onChange={(event) => update("showDescription", event.target.checked)} /><span>{t("web.editor.calendar.showDescription")}</span></label>
  </div>;
}

CalendarConfigurator.propTypes = { selected: PropTypes.object.isRequired, dataSources: PropTypes.array.isRequired, onContentChange: PropTypes.func };

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
        if (Array.isArray(definition.options)) {
          const emptyLabel = !definition.required && definition.default == null ? "—" : null;
          return <label key={definition.id}><span>{label}</span><NamedOptionSelect
            definition={definition}
            value={value}
            emptyLabel={emptyLabel}
            onChange={(nextValue) => updateParameter(definition, nextValue)}
          />{definition.description && <small>{definition.description}</small>}</label>;
        }
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
