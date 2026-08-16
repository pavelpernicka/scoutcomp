import { useState } from "react";
import PropTypes from "prop-types";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import MediaPickerField from "../media/MediaPickerField";
import { cmsApi } from "../api/cms";

const optionValue = (option) => typeof option === "object" ? option.value : option;
const optionLabel = (option) => typeof option === "object" ? option.label ?? option.value : option;
const optionForValue = (definition, value) => (
  (definition.options || []).find((option) => String(optionValue(option)) === String(value))
);

const definitionShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  type: PropTypes.string.isRequired,
  label: PropTypes.string,
  help: PropTypes.string,
  required: PropTypes.bool,
  placeholder: PropTypes.string,
  minimum: PropTypes.number,
  maximum: PropTypes.number,
  step: PropTypes.number,
  options: PropTypes.array,
  fields: PropTypes.array,
});

/* ── Scalars ──────────────────────────────────────────────────────── */

function TextEditor({ value, onChange, definition }) {
  return <input type="text" value={value ?? ""} placeholder={definition.placeholder || ""} onChange={(event) => onChange(event.target.value)} />;
}
TextEditor.propTypes = { value: PropTypes.any, onChange: PropTypes.func.isRequired, definition: definitionShape.isRequired };

function TextareaEditor({ value, onChange, definition }) {
  return <textarea rows={definition.type === "richtext" ? 6 : 3} value={value ?? ""} placeholder={definition.placeholder || ""} onChange={(event) => onChange(event.target.value)} />;
}
TextareaEditor.propTypes = { value: PropTypes.any, onChange: PropTypes.func.isRequired, definition: definitionShape.isRequired };

function NumberEditor({ value, onChange, definition }) {
  return <input type="number" value={value ?? ""} min={definition.minimum} max={definition.maximum} step={definition.step} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} />;
}
NumberEditor.propTypes = { value: PropTypes.any, onChange: PropTypes.func.isRequired, definition: definitionShape.isRequired };

function BooleanEditor({ value, onChange }) {
  return <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />;
}
BooleanEditor.propTypes = { value: PropTypes.any, onChange: PropTypes.func.isRequired };

function SelectEditor({ value, onChange, definition }) {
  return <select value={value ?? ""} onChange={(event) => {
    const option = optionForValue(definition, event.target.value);
    onChange(option ? optionValue(option) : null);
  }}>
    <option value="" />
    {(definition.options || []).map((option) => <option key={String(optionValue(option))} value={optionValue(option)}>{optionLabel(option)}</option>)}
  </select>;
}
SelectEditor.propTypes = { value: PropTypes.any, onChange: PropTypes.func.isRequired, definition: definitionShape.isRequired };

function MultiSelectEditor({ value, onChange, definition }) {
  const selected = Array.isArray(value) ? value.map(String) : [];
  return <select multiple value={selected} onChange={(event) => onChange(Array.from(event.target.selectedOptions, (selectedOption) => {
    const option = optionForValue(definition, selectedOption.value);
    return option ? optionValue(option) : selectedOption.value;
  }))}>
    {(definition.options || []).map((option) => <option key={String(optionValue(option))} value={optionValue(option)}>{optionLabel(option)}</option>)}
  </select>;
}
MultiSelectEditor.propTypes = { value: PropTypes.array, onChange: PropTypes.func.isRequired, definition: definitionShape.isRequired };

function ColorEditor({ value, onChange }) {
  const color = /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#000000";
  return <div className="web-prop-color"><input type="color" value={color} onChange={(event) => onChange(event.target.value)} /><input type="text" value={value ?? ""} onChange={(event) => onChange(event.target.value)} /></div>;
}
ColorEditor.propTypes = { value: PropTypes.string, onChange: PropTypes.func.isRequired };

const ALIGNMENT_OPTIONS = ["start", "center", "end", "left", "right", "justify"];

function AlignmentEditor({ value, onChange }) {
  return <select value={value ?? ""} onChange={(event) => onChange(event.target.value || null)}>
    <option value="" />
    {ALIGNMENT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
  </select>;
}
AlignmentEditor.propTypes = { value: PropTypes.string, onChange: PropTypes.func.isRequired };

/* ── Icon (text with visual hint) ────────────────────────────────── */

function IconEditor({ value, onChange, definition }) {
  return <div className="web-prop-icon-field">
    <input type="text" value={value ?? ""} placeholder={definition.placeholder || "fa-star"} onChange={(event) => onChange(event.target.value)} />
    {value && <i className={`fas ${String(value).replace(/^fa-/, "fa-")}`} aria-hidden="true" />}
  </div>;
}
IconEditor.propTypes = { value: PropTypes.string, onChange: PropTypes.func.isRequired, definition: definitionShape.isRequired };

/* ── Link (internal page vs external URL) ─────────────────────────── */

const linkValue = (value) => {
  if (!value) return { type: "external", url: "" };
  if (typeof value === "string") return { type: "external", url: value };
  return {
    type: value.type || (value.page_id ? "page" : "external"),
    url: value.url || value.href || "",
    page_id: value.page_id || null,
  };
};

function LinkEditor({ value, onChange, definition }) {
  const { t } = useTranslation();
  const [link, setLink] = useState(() => linkValue(value));
  const pagesQuery = useQuery({ queryKey: ["web", "pages"], queryFn: cmsApi.listPages, staleTime: 60_000 });
  const pages = Array.isArray(pagesQuery.data) ? pagesQuery.data : pagesQuery.data?.items || [];
  const commit = (next) => {
    setLink(next);
    if (next.type === "page" && next.page_id != null) {
      onChange({ type: "page", page_id: Number(next.page_id) });
    } else {
      onChange(next.url || null);
    }
  };
  return <div className="web-prop-link-field">
    <select value={link.type} onChange={(e) => commit({ ...link, type: e.target.value })}>
      <option value="external">{t("web.props.linkExternal")}</option>
      <option value="page">{t("web.props.linkPage")}</option>
    </select>
    {link.type === "page"
      ? <select value={link.page_id ?? ""} onChange={(e) => commit({ ...link, page_id: e.target.value ? Number(e.target.value) : null })}>
          <option value="">{t("web.props.linkChoosePage")}</option>
          {pages.map((page) => <option key={page.id} value={page.id}>{page.title || page.path || page.slug}</option>)}
        </select>
      : <input type="text" value={link.url} placeholder={definition.placeholder || "https://"} onChange={(e) => commit({ ...link, url: e.target.value })} />}
  </div>;
}
LinkEditor.propTypes = { value: PropTypes.any, onChange: PropTypes.func.isRequired, definition: definitionShape.isRequired };

/* ── Page picker ──────────────────────────────────────────────────── */

function PageEditor({ value, onChange }) {
  const { t } = useTranslation();
  const pagesQuery = useQuery({ queryKey: ["web", "pages"], queryFn: cmsApi.listPages, staleTime: 60_000 });
  const pages = Array.isArray(pagesQuery.data) ? pagesQuery.data : pagesQuery.data?.items || [];
  const current = typeof value === "object" ? value?.page_id : value;
  return <select value={current ?? ""} onChange={(e) => {
    const pageId = e.target.value ? Number(e.target.value) : null;
    onChange(pageId == null ? null : { page_id: pageId });
  }}>
    <option value="">{t("web.props.pageChoose")}</option>
    {pages.map((page) => <option key={page.id} value={page.id}>{page.title || page.path || page.slug}</option>)}
  </select>;
}
PageEditor.propTypes = { value: PropTypes.any, onChange: PropTypes.func.isRequired };

/* ── Menu picker ──────────────────────────────────────────────────── */

function MenuEditor({ value, onChange }) {
  const { t } = useTranslation();
  const menusQuery = useQuery({ queryKey: ["web", "menus"], queryFn: cmsApi.listMenus, staleTime: 60_000 });
  const menus = Array.isArray(menusQuery.data) ? menusQuery.data : menusQuery.data?.items || [];
  const current = typeof value === "object" ? value?.menu_id : value;
  return <select value={current ?? ""} onChange={(e) => {
    const menuId = e.target.value ? Number(e.target.value) : null;
    onChange(menuId == null ? null : { menu_id: menuId });
  }}>
    <option value="">{t("web.props.menuChoose")}</option>
    {menus.map((menu) => <option key={menu.id} value={menu.id}>{menu.name || menu.location || menu.id}</option>)}
  </select>;
}
MenuEditor.propTypes = { value: PropTypes.any, onChange: PropTypes.func.isRequired };

/* ── Data source / field pickers ──────────────────────────────────── */

function DataSourceEditor({ value, onChange }) {
  const { t } = useTranslation();
  const sourcesQuery = useQuery({ queryKey: ["web", "data-sources"], queryFn: cmsApi.listDataSources, staleTime: 60_000 });
  const sources = Array.isArray(sourcesQuery.data) ? sourcesQuery.data : sourcesQuery.data?.items || [];
  const current = typeof value === "object" ? value?.source : value;
  return <select value={current ?? ""} onChange={(e) => {
    const source = e.target.value || null;
    onChange(source == null ? null : { source });
  }}>
    <option value="">{t("web.props.dataSourceChoose")}</option>
    {sources.map((source) => <option key={source.id} value={source.id}>{source.label || source.name || source.id}</option>)}
  </select>;
}
DataSourceEditor.propTypes = { value: PropTypes.any, onChange: PropTypes.func.isRequired };

function DataFieldEditor({ value, onChange }) {
  const { t } = useTranslation();
  const sourcesQuery = useQuery({ queryKey: ["web", "data-sources"], queryFn: cmsApi.listDataSources, staleTime: 60_000 });
  const sources = Array.isArray(sourcesQuery.data) ? sourcesQuery.data : sourcesQuery.data?.items || [];
  const current = typeof value === "object" ? value?.field : value;
  const fields = [];
  sources.forEach((source) => {
    const sourceFields = Array.isArray(source.fields)
      ? source.fields
      : Object.entries(source.fields || {}).map(([id, def]) => ({ id, ...(typeof def === "object" ? def : {}) }));
    sourceFields.forEach((field) => {
      const id = field.id || field.name || field.key;
      if (id) fields.push({ id, source: source.id, label: field.label || field.name || id });
    });
  });
  return <select value={current ?? ""} onChange={(e) => {
    const raw = e.target.value;
    if (!raw) { onChange(null); return; }
    const [source, field] = raw.split("\u0000");
    onChange({ source, field });
  }}>
    <option value="">{t("web.props.dataFieldChoose")}</option>
    {fields.map((field) => <option key={`${field.source}\u0000${field.id}`} value={`${field.source}\u0000${field.id}`}>{field.label} · {field.source}</option>)}
  </select>;
}
DataFieldEditor.propTypes = { value: PropTypes.any, onChange: PropTypes.func.isRequired };

/* ── Spacing (structured shorthand) ───────────────────────────────── */

const SPACING_FIELDS = ["top", "right", "bottom", "left"];
const spacingValue = (value) => {
  const base = value && typeof value === "object" ? value : { top: value, right: value, bottom: value, left: value };
  return Object.fromEntries(SPACING_FIELDS.map((key) => [key, base[key] ?? ""]));
};

function SpacingEditor({ value, onChange }) {
  const commit = (patch) => onChange({ ...spacingValue(value), ...patch });
  const current = spacingValue(value);
  return <div className="web-prop-spacing-field">
    {SPACING_FIELDS.map((key) => <label key={key} className="web-prop-spacing-input"><span>{key}</span><input value={current[key]} onChange={(e) => commit({ [key]: e.target.value })} /></label>)}
  </div>;
}
SpacingEditor.propTypes = { value: PropTypes.any, onChange: PropTypes.func.isRequired };

/* ── Group (nested typed props) ───────────────────────────────────── */

function GroupEditor({ value, onChange, definition }) {
  return <div className="web-prop-group-field">
    <ResourcePropsEditor schema={definition.fields || []} value={value || {}} onChange={onChange} />
  </div>;
}
GroupEditor.propTypes = { value: PropTypes.object, onChange: PropTypes.func.isRequired, definition: definitionShape.isRequired };

/* ── Repeater (list of typed props) ───────────────────────────────── */

function RepeaterEditor({ value, onChange, definition }) {
  const { t } = useTranslation();
  const items = Array.isArray(value) ? value : [];
  const fields = definition.fields || [];
  const updateItem = (index, next) => onChange(items.map((item, i) => i === index ? next : item));
  const removeItem = (index) => onChange(items.filter((_, i) => i !== index));
  const addItem = () => onChange([...items, {}]);
  return <div className="web-prop-repeater-field">
    {items.map((item, index) => <div className="web-prop-repeater-item" key={index}>
      <div className="web-prop-repeater-item-head"><strong>{index + 1}.</strong><button type="button" onClick={() => removeItem(index)} title={t("web.props.repeaterRemove")}><i className="fas fa-xmark" /></button></div>
      <ResourcePropsEditor schema={fields} value={item} onChange={(next) => updateItem(index, next)} />
    </div>)}
    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={addItem}><i className="fas fa-plus me-1" />{t("web.props.repeaterAdd")}</button>
  </div>;
}
RepeaterEditor.propTypes = { value: PropTypes.array, onChange: PropTypes.func.isRequired, definition: definitionShape.isRequired };

/* ── JSON fallback ────────────────────────────────────────────────── */

function JsonEditor({ value, onChange }) {
  const { t } = useTranslation();
  const [text, setText] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [error, setError] = useState("");
  const update = (next) => {
    setText(next);
    try {
      onChange(JSON.parse(next));
      setError("");
    } catch {
      setError(t("web.props.invalidJson"));
    }
  };
  return <><textarea rows="5" value={text} onChange={(event) => update(event.target.value)} />{error && <small className="text-danger">{error}</small>}</>;
}
JsonEditor.propTypes = { value: PropTypes.any, onChange: PropTypes.func.isRequired };

/* ── Registry ─────────────────────────────────────────────────────── */

export const PropEditorRegistry = new Map([
  ["text", TextEditor],
  ["textarea", TextareaEditor],
  ["richtext", TextareaEditor],
  ["number", NumberEditor],
  ["boolean", BooleanEditor],
  ["select", SelectEditor],
  ["multiselect", MultiSelectEditor],
  ["color", ColorEditor],
  ["alignment", AlignmentEditor],
  ["icon", IconEditor],
  ["media", MediaPickerField],
  ["link", LinkEditor],
  ["page", PageEditor],
  ["menu", MenuEditor],
  ["data-source", DataSourceEditor],
  ["data-field", DataFieldEditor],
  ["spacing", SpacingEditor],
  ["group", GroupEditor],
  ["repeater", RepeaterEditor],
]);

export function ResourcePropsEditor({ schema, value, onChange, disabled = false }) {
  const { t } = useTranslation();
  const values = value && typeof value === "object" ? value : {};
  if (!schema?.length) return <div className="web-editor-inspector-empty"><p>{t("web.props.empty")}</p></div>;
  return <fieldset className="web-resource-props-editor" disabled={disabled}>
    {schema.map((definition) => {
      const Editor = PropEditorRegistry.get(definition.type) || TextEditor;
      const isContainer = definition.type === "group" || definition.type === "repeater";
      const field = <div key={definition.id} className={`web-prop-field web-prop-${definition.type}`}>
        <span className="web-prop-field-label">{definition.label || definition.id}{definition.required ? " *" : ""}</span>
        <Editor definition={definition} value={values[definition.id]} disabled={disabled} onChange={(next) => onChange({ ...values, [definition.id]: next })} />
        {definition.help && <small>{definition.help}</small>}
      </div>;
      if (isContainer) return field;
      return <label key={definition.id} className={`web-prop-field web-prop-${definition.type}`}>
        <span className="web-prop-field-label">{definition.label || definition.id}{definition.required ? " *" : ""}</span>
        <Editor definition={definition} value={values[definition.id]} disabled={disabled} onChange={(next) => onChange({ ...values, [definition.id]: next })} />
        {definition.help && <small>{definition.help}</small>}
      </label>;
    })}
  </fieldset>;
}

ResourcePropsEditor.propTypes = {
  schema: PropTypes.arrayOf(definitionShape).isRequired,
  value: PropTypes.object,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};
