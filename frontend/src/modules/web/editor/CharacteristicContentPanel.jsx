import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

const STRUCTURAL_TAGS = new Set(["div", "section", "article", "header", "footer", "main", "nav", "aside", "figure", "address"]);
const TEXT_TAGS = new Set(["p", "span", "strong", "em", "small", "blockquote", "figcaption", "dt", "dd", "li", "h1", "h2", "h3", "h4", "h5", "h6"]);
const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const MANAGED_LAYOUT_CLASSES = new Set(["d-flex", "flex-column", "sc-layout-responsive-grid"]);
const MANAGED_ALIGNMENT_CLASSES = new Set(["text-start", "text-center", "text-end"]);

const modelClasses = (selected) => (selected?.getClasses?.() || [])
  .map((item) => typeof item === "string" ? item : item?.getName?.() || item?.name)
  .filter(Boolean);

const childrenOf = (selected) => {
  const collection = selected?.components?.();
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection?.models)) return collection.models;
  return collection?.toArray?.() || [];
};

const replaceManagedClasses = (selected, managed, additions = []) => {
  const kept = modelClasses(selected).filter((name) => !managed.has(name));
  selected?.setClass?.([...new Set([...kept, ...additions])]);
};

const setStyleValue = (selected, name, value) => {
  if (value) selected?.addStyle?.({ [name]: value });
  else selected?.removeStyle?.(name);
};

const setAttribute = (selected, name, value) => {
  const clean = String(value || "").trim();
  if (clean) selected?.addAttributes?.({ [name]: clean });
  else selected?.removeAttributes?.(name);
};

function CharacteristicSection({ icon, title, children, open = true }) {
  return <details className="web-editor-quick-section" open={open}>
    <summary><i className={`fas fa-${icon}`} /><span>{title}</span><i className="fas fa-chevron-down" /></summary>
    <div className="web-editor-quick-section-body">{children}</div>
  </details>;
}

CharacteristicSection.propTypes = {
  icon: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
  open: PropTypes.bool,
};

/**
 * A deliberately small, task-oriented layer over GrapesJS attributes/styles.
 * The native Trait and Style managers remain the complete expert interface;
 * this panel exposes the characteristic choices authors need most often.
 */
export default function CharacteristicContentPanel({ selected, onContentChange }) {
  const { t } = useTranslation();
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    selected?.on?.("change:attributes change:classes change:style change:tagName change:content", refresh);
    return () => selected?.off?.("change:attributes change:classes change:style change:tagName change:content", refresh);
  }, [selected]);

  const tag = String(selected?.get?.("tagName") || (selected?.get?.("type") === "link" ? "a" : "div")).toLowerCase();
  const type = String(selected?.get?.("type") || "default");
  const attributes = selected?.getAttributes?.() || {};
  const styles = selected?.getStyle?.() || {};
  const classes = modelClasses(selected);
  const children = childrenOf(selected);
  const isStructure = STRUCTURAL_TAGS.has(tag) && type !== "image";
  const isText = TEXT_TAGS.has(tag) && children.length === 0;
  const isList = tag === "ul" || tag === "ol";
  const isDivider = tag === "hr";
  const isSpacer = tag === "div" && attributes["aria-hidden"] === "true" && Boolean(styles.height);
  const heading = HEADING_TAGS.has(tag);
  const layout = classes.includes("sc-layout-responsive-grid") || styles.display === "grid"
    ? "grid"
    : classes.includes("d-flex") || styles.display === "flex"
      ? (classes.includes("flex-column") || styles["flex-direction"] === "column" ? "column" : "row")
      : "flow";
  const alignment = styles["text-align"] || (classes.includes("text-center") ? "center" : classes.includes("text-end") ? "end" : "start");
  const gridColumns = Number(styles["--sc-layout-columns"] || String(styles["grid-template-columns"] || "").match(/repeat\((\d+)/)?.[1] || 2);
  const verticalAlign = styles["align-items"] || "stretch";
  const horizontalAlign = ({ "space-between": "between", "space-around": "around", "space-evenly": "evenly" })[styles["justify-content"]] || styles["justify-content"] || "start";

  const update = (callback) => {
    callback();
    setRevision((value) => value + 1);
    onContentChange?.();
  };

  const changeLayout = (value) => update(() => {
    replaceManagedClasses(selected, MANAGED_LAYOUT_CLASSES, value === "grid" ? ["sc-layout-responsive-grid"] : []);
    setStyleValue(selected, "display", value === "row" || value === "column" ? "flex" : "");
    setStyleValue(selected, "flex-direction", value === "column" ? "column" : value === "row" ? "row" : "");
    if (value !== "grid") setStyleValue(selected, "--sc-layout-columns", "");
  });

  const spacingOptions = [
    ["", t("web.editor.characteristic.spacingDefault")],
    ["0", "0"],
    ["var(--sc-space-2, .5rem)", t("web.editor.characteristic.spacingSmall")],
    ["var(--sc-space-4, 1rem)", t("web.editor.characteristic.spacingMedium")],
    ["var(--sc-space-6, 2rem)", t("web.editor.characteristic.spacingLarge")],
    ["var(--sc-space-8, 3rem)", t("web.editor.characteristic.spacingXLarge")],
  ];

  const alignItemLabels = {
    stretch: t("web.editor.characteristic.stretch"),
    start: t("web.editor.characteristic.verticalStart"),
    center: t("web.editor.characteristic.verticalCenter"),
    end: t("web.editor.characteristic.verticalEnd"),
    baseline: t("web.editor.characteristic.verticalBaseline"),
  };

  const justifyIcons = {
    start: "align-left",
    center: "align-center",
    end: "align-right",
    between: "arrows-left-right",
    around: "arrows-to-circle",
    evenly: "arrows-to-dot",
  };

  const justifyLabels = {
    start: t("web.editor.characteristic.alignStart"),
    center: t("web.editor.characteristic.alignCenter"),
    end: t("web.editor.characteristic.alignEnd"),
    between: t("web.editor.characteristic.spaceBetween"),
    around: t("web.editor.characteristic.justifyAround"),
    evenly: t("web.editor.characteristic.justifyEvenly"),
  };

  return <div className="web-editor-characteristic" data-revision={revision}>
    {isStructure && <CharacteristicSection icon="table-cells-large" title={t("web.editor.characteristic.structure")}>
      <label><span>{t("web.editor.characteristic.layout")}</span><select value={layout} onChange={(event) => changeLayout(event.target.value)}>
        <option value="flow">{t("web.editor.characteristic.layoutFlow")}</option>
        <option value="row">{t("web.editor.characteristic.layoutRow")}</option>
        <option value="column">{t("web.editor.characteristic.layoutColumn")}</option>
        <option value="grid">{t("web.editor.characteristic.layoutGrid")}</option>
      </select></label>
      {layout === "grid" && <label><span>{t("web.editor.characteristic.columns")}</span><select value={gridColumns} onChange={(event) => update(() => setStyleValue(selected, "--sc-layout-columns", event.target.value))}>{[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}
      {(layout === "row" || layout === "column" || layout === "grid") && <label><span>{t("web.editor.characteristic.gap")}</span><select value={styles.gap || ""} onChange={(event) => update(() => setStyleValue(selected, "gap", event.target.value))}>{spacingOptions.map(([value, label]) => <option key={value || "default"} value={value}>{label}</option>)}</select></label>}
      {layout !== "flow" && <>
        <label><span>{t("web.editor.characteristic.verticalAlignment")}</span><select value={verticalAlign} onChange={(event) => update(() => setStyleValue(selected, "align-items", event.target.value === "stretch" ? "" : event.target.value))}>{Object.entries(alignItemLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>{t("web.editor.characteristic.horizontalAlignment")}</span><div className="web-editor-segmented">{"start,center,end,between,around,evenly".split(",").map((value) => <button key={value} type="button" className={horizontalAlign === value ? "active" : ""} title={justifyLabels[value]} onClick={() => update(() => setStyleValue(selected, "justify-content", ({ between: "space-between", around: "space-around", evenly: "space-evenly" })[value] || (value === "start" ? "" : value)))}><i className={`fas fa-${justifyIcons[value]}`} /></button>)}</div></label>
      </>}
      <div className="web-editor-characteristic-grid">
        <label><span>{t("web.editor.characteristic.padding")}</span><select value={styles.padding || ""} onChange={(event) => update(() => setStyleValue(selected, "padding", event.target.value))}>{spacingOptions.map(([value, label]) => <option key={value || "default"} value={value}>{label}</option>)}</select></label>
        <label><span>{t("web.editor.characteristic.margin")}</span><select value={styles.margin || ""} onChange={(event) => update(() => setStyleValue(selected, "margin", event.target.value))}>{spacingOptions.map(([value, label]) => <option key={value || "default"} value={value}>{label}</option>)}</select></label>
      </div>
      <div className="web-editor-characteristic-grid">
        <label><span>{t("web.editor.characteristic.width")}</span><select value={styles.width || ""} onChange={(event) => update(() => setStyleValue(selected, "width", event.target.value))}>
          <option value="">{t("web.editor.characteristic.widthAutomatic")}</option><option value="100%">100 %</option><option value="50%">50 %</option><option value="75%">75 %</option><option value="42rem">42 rem</option><option value="60rem">60 rem</option><option value="72rem">72 rem</option>
        </select></label>
        <label><span>{t("web.editor.characteristic.maxWidth")}</span><select value={styles["max-width"] || styles.maxWidth || ""} onChange={(event) => update(() => setStyleValue(selected, "max-width", event.target.value))}><option value="">{t("web.editor.characteristic.widthAutomatic")}</option><option value="42rem">42 rem</option><option value="60rem">60 rem</option><option value="72rem">72 rem</option><option value="100%">100 %</option></select></label>
      </div>
    </CharacteristicSection>}

    {isText && <CharacteristicSection icon="font" title={t("web.editor.characteristic.text")}>
      <label><span>{t("web.editor.characteristic.content")}</span><textarea rows="4" value={String(selected?.get?.("content") || "")} onChange={(event) => update(() => selected?.set?.("content", event.target.value))} /></label>
      {heading && <label><span>{t("web.editor.characteristic.headingLevel")}</span><select value={tag} onChange={(event) => update(() => selected?.set?.("tagName", event.target.value))}>{[1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={`h${value}`}>H{value}</option>)}</select></label>}
      <label><span>{t("web.editor.characteristic.alignment")}</span><div className="web-editor-segmented">{[["start", "align-left"], ["center", "align-center"], ["end", "align-right"]].map(([value, icon]) => <button key={value} type="button" className={alignment === value ? "active" : ""} title={t(`web.editor.characteristic.align${value[0].toUpperCase()}${value.slice(1)}`)} onClick={() => update(() => { replaceManagedClasses(selected, MANAGED_ALIGNMENT_CLASSES); setStyleValue(selected, "text-align", value === "start" ? "" : value); })}><i className={`fas fa-${icon}`} /></button>)}</div></label>
      <div className="web-editor-characteristic-grid">
        <label><span>{t("web.editor.characteristic.textSize")}</span><select value={styles["font-size"] || ""} onChange={(event) => update(() => setStyleValue(selected, "font-size", event.target.value))}><option value="">{t("web.editor.characteristic.inherited")}</option><option value=".875rem">S</option><option value="1rem">M</option><option value="1.25rem">L</option><option value="1.75rem">XL</option></select></label>
        <label><span>{t("web.editor.characteristic.weight")}</span><select value={styles["font-weight"] || ""} onChange={(event) => update(() => setStyleValue(selected, "font-weight", event.target.value))}><option value="">{t("web.editor.characteristic.inherited")}</option><option value="400">400</option><option value="600">600</option><option value="700">700</option></select></label>
      </div>
    </CharacteristicSection>}

    {isList && <CharacteristicSection icon="list" title={t("web.editor.characteristic.list")}>
      <label><span>{t("web.editor.characteristic.listType")}</span><select value={tag} onChange={(event) => update(() => selected?.set?.("tagName", event.target.value))}><option value="ul">{t("web.editor.characteristic.unordered")}</option><option value="ol">{t("web.editor.characteristic.ordered")}</option></select></label>
      <label className="web-editor-repeat-checkbox"><input type="checkbox" checked={styles["list-style"] === "none" || classes.includes("list-unstyled")} onChange={(event) => update(() => { replaceManagedClasses(selected, new Set(["list-unstyled"])); setStyleValue(selected, "list-style", event.target.checked ? "none" : ""); })} /><span>{t("web.editor.characteristic.hideMarkers")}</span></label>
      <label className="web-editor-repeat-checkbox"><input type="checkbox" checked={styles.display === "flex" || classes.includes("list-inline")} onChange={(event) => update(() => { replaceManagedClasses(selected, new Set(["list-inline"])); setStyleValue(selected, "display", event.target.checked ? "flex" : ""); setStyleValue(selected, "gap", event.target.checked ? "1rem" : ""); })} /><span>{t("web.editor.characteristic.inlineList")}</span></label>
    </CharacteristicSection>}

    {isDivider && <CharacteristicSection icon="minus" title={t("web.editor.characteristic.divider")}>
      <div className="web-editor-characteristic-grid">
        <label><span>{t("web.editor.characteristic.thickness")}</span><select value={styles["border-top-width"] || ""} onChange={(event) => update(() => setStyleValue(selected, "border-top-width", event.target.value))}><option value="">1 px</option><option value="2px">2 px</option><option value="4px">4 px</option></select></label>
        <label><span>{t("web.editor.characteristic.lineStyle")}</span><select value={styles["border-top-style"] || ""} onChange={(event) => update(() => setStyleValue(selected, "border-top-style", event.target.value))}><option value="">{t("web.editor.characteristic.solid")}</option><option value="dashed">{t("web.editor.characteristic.dashed")}</option><option value="dotted">{t("web.editor.characteristic.dotted")}</option></select></label>
      </div>
    </CharacteristicSection>}

    {isSpacer && <CharacteristicSection icon="arrows-up-down" title={t("web.editor.characteristic.spacer")}>
      <label><span>{t("web.editor.characteristic.height")}</span><select value={styles.height || ""} onChange={(event) => update(() => setStyleValue(selected, "height", event.target.value))}>{spacingOptions.slice(2).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </CharacteristicSection>}

    <CharacteristicSection icon="universal-access" title={t("web.editor.characteristic.accessibility")} open={false}>
      <label><span>{t("web.editor.characteristic.titleAttribute")}</span><input value={attributes.title || ""} onChange={(event) => update(() => setAttribute(selected, "title", event.target.value))} /></label>
      <label><span>{t("web.editor.characteristic.ariaLabel")}</span><input value={attributes["aria-label"] || ""} onChange={(event) => update(() => setAttribute(selected, "aria-label", event.target.value))} /></label>
    </CharacteristicSection>
  </div>;
}

CharacteristicContentPanel.propTypes = {
  selected: PropTypes.object.isRequired,
  onContentChange: PropTypes.func,
};
