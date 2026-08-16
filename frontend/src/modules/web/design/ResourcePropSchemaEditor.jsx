import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

const PROP_TYPES = [
  "text", "textarea", "richtext", "number", "boolean", "select", "multiselect",
  "color", "icon", "media", "link", "page", "menu", "data-source", "data-field",
  "alignment", "spacing", "group", "repeater",
];

const optionsText = (options) => (options || []).map((option) => (
  typeof option === "object" ? `${option.value}|${option.label ?? option.value}` : String(option)
)).join("\n");

const parseOptions = (value) => value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
  const [optionValue, ...label] = line.split("|");
  return { value: optionValue, label: label.join("|").trim() || optionValue };
});

const defaultInputValue = (value) => {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
};

const parseDefault = (type, value) => {
  if (value === "") return undefined;
  if (type === "boolean") return value === "true";
  if (type === "number") return Number(value);
  if (["multiselect", "media", "spacing", "group", "repeater"].includes(type)) {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
};

export default function ResourcePropSchemaEditor({ schema, defaults, onChange, disabled }) {
  const { t } = useTranslation();
  const updateDefinition = (index, patch) => {
    const nextSchema = schema.map((definition, current) => current === index ? { ...definition, ...patch } : definition);
    const previousId = schema[index]?.id;
    const nextId = nextSchema[index]?.id;
    let nextDefaults = { ...defaults };
    if (previousId && previousId !== nextId && Object.hasOwn(nextDefaults, previousId)) {
      nextDefaults[nextId] = nextDefaults[previousId];
      delete nextDefaults[previousId];
    }
    onChange(nextSchema, nextDefaults);
  };
  const updateDefault = (definition, rawValue) => {
    const nextDefaults = { ...defaults };
    const value = parseDefault(definition.type, rawValue);
    if (value === undefined) delete nextDefaults[definition.id];
    else nextDefaults[definition.id] = value;
    onChange(schema, nextDefaults);
  };
  const remove = (index) => {
    const removed = schema[index];
    const nextDefaults = { ...defaults };
    delete nextDefaults[removed.id];
    onChange(schema.filter((_, current) => current !== index), nextDefaults);
  };
  const add = () => {
    const used = new Set(schema.map((definition) => definition.id));
    let counter = schema.length + 1;
    while (used.has(`prop${counter}`)) counter += 1;
    onChange([...schema, { id: `prop${counter}`, type: "text", label: `${t("web.props.field")} ${counter}` }], defaults);
  };
  return <div className="web-prop-schema-editor">
    <div className="web-prop-schema-heading"><div><strong>{t("web.props.schemaTitle")}</strong><small>{t("web.props.schemaHelp")}</small></div><button type="button" className="btn btn-sm btn-outline-primary" disabled={disabled} onClick={add}><i className="fas fa-plus me-1" />{t("web.props.add")}</button></div>
    {schema.length === 0 && <p className="web-prop-schema-empty">{t("web.props.schemaEmpty")}</p>}
    {schema.map((definition, index) => <fieldset key={`${definition.id}-${index}`} className="web-prop-schema-row" disabled={disabled}>
      <div className="web-prop-schema-grid">
        <label><span>{t("web.props.id")}</span><input value={definition.id || ""} onChange={(event) => updateDefinition(index, { id: event.target.value })} /></label>
        <label><span>{t("web.props.label")}</span><input value={definition.label || ""} onChange={(event) => updateDefinition(index, { label: event.target.value })} /></label>
        <label><span>{t("web.props.type")}</span><select value={definition.type || "text"} onChange={(event) => updateDefinition(index, { type: event.target.value })}>{PROP_TYPES.map((type) => <option key={type} value={type}>{t(`web.props.types.${type}`)}</option>)}</select></label>
        <label><span>{t("web.props.default")}</span><input value={defaultInputValue(defaults[definition.id])} onChange={(event) => updateDefault(definition, event.target.value)} /></label>
      </div>
      {(definition.type === "select" || definition.type === "multiselect") && <label><span>{t("web.props.options")}</span><textarea rows="3" value={optionsText(definition.options)} onChange={(event) => updateDefinition(index, { options: parseOptions(event.target.value) })} /></label>}
      <div className="web-prop-schema-actions"><label><input type="checkbox" checked={Boolean(definition.required)} onChange={(event) => updateDefinition(index, { required: event.target.checked })} /> {t("web.props.required")}</label><button type="button" className="btn btn-sm btn-link text-danger" onClick={() => remove(index)}>{t("web.props.remove")}</button></div>
    </fieldset>)}
  </div>;
}

ResourcePropSchemaEditor.propTypes = {
  schema: PropTypes.arrayOf(PropTypes.object).isRequired,
  defaults: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};
