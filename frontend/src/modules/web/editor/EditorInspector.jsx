import { useCallback, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { createBindingTargetOptions, getComponentBindings, removeComponentBinding, setComponentBinding } from "./grapes";
import { getComponentDisplayName, getComponentState, getComponentTechnicalName } from "./componentDisplayName";
import { ResourcePropsEditor } from "../props/PropEditorRegistry";
import { getTemplateOwnerId } from "./componentOwnership";


const tabs = ["content", "style", "data", "code", "advanced"];

export { getTemplateOwnerId } from "./componentOwnership";

export default function EditorInspector({ selected, dataSources, resources, onDuplicate, onDelete, onClone, onDetach, onEditDefinition, onEditTemplate, onContentChange }) {
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
        <div className={selected && tab === "content" ? "" : "d-none"}>{linked ? <LinkedResourceProps key={selected?.cid} selected={selected} resources={resources} onClone={onClone} onDetach={onDetach} onEditDefinition={onEditDefinition} onContentChange={onContentChange} /> : <div className="web-editor-trait-manager" />}</div>
        <div className={selected && tab === "style" ? "" : "d-none"}>{linked ? <LinkedStyleInfo selected={selected} resources={resources} /> : <div className="web-editor-style-manager" />}</div>
        {selected && tab === "data" && (type === "sc-repeat"
          ? <RepeatConfigurator selected={selected} dataSources={dataSources} onContentChange={onContentChange} />
          : <DataBindings selected={selected} dataSources={dataSources} />)}
        <div className={selected && tab === "code" ? "" : "d-none"}>{selected && <CodePanel key={selected.cid} selected={selected} onApplied={onContentChange} />}</div>
        {selected && tab === "advanced" && <AdvancedInspector selected={selected} />}
      </>}
    </div>
  </aside>;
}

EditorInspector.propTypes = { selected: PropTypes.object, dataSources: PropTypes.array.isRequired, resources: PropTypes.object.isRequired, onDuplicate: PropTypes.func.isRequired, onDelete: PropTypes.func.isRequired, onClone: PropTypes.func, onDetach: PropTypes.func, onEditDefinition: PropTypes.func, onEditTemplate: PropTypes.func, onContentChange: PropTypes.func };

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
  return <div className="web-editor-linked-props">
    <div className="web-editor-resource-state state-linked"><i className="fas fa-link" /><span><strong>{definition.name}</strong><small>{t(kind === "sections" ? "web.props.linkedSection" : "web.props.linkedComponent")}</small></span></div>
    {showActions && <div className="web-editor-linked-actions">
      <button type="button" className="btn btn-sm btn-outline-secondary" disabled={cloning} onClick={() => { setCloning(true); Promise.resolve(onClone?.(selected, kind, definition)).catch(() => {}).finally(() => setCloning(false)); }}>
        <i className="fas fa-clone me-1" />{t("web.props.cloneVariant")}
      </button>
      <button type="button" className="btn btn-sm btn-outline-light" onClick={() => onEditDefinition?.(selected, kind, definition)}><i className="fas fa-pen me-1" />{t("web.props.editDefinition")}</button>
      <button type="button" className="btn btn-sm btn-outline-danger" disabled={detaching} onClick={async () => {
        setDetaching(true);
        setDetachError("");
        try { await onDetach?.(selected, definition); }
        catch { setDetachError(t("web.props.detachFailed") || "Detach failed"); }
        finally { setDetaching(false); }
      }}>
        <i className={`fas fa-${detaching ? "spinner fa-spin" : "link-slash"} me-1`} />{detaching ? t("web.props.detaching") : t("web.props.detach")}
      </button>
      {detachError && <p className="web-editor-field-error" role="alert">{detachError}</p>}
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

const classNames = (selected) => (selected.getClasses?.() || [])
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
