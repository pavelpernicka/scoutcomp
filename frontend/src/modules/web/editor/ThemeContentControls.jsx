import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";


const models = (component) => component?.components?.()?.models
  || component?.components?.()?.toArray?.()
  || [];

const classes = (component) => (component?.getClasses?.() || [])
  .map((item) => typeof item === "string" ? item : item?.getName?.() || item?.get?.("name") || "")
  .filter(Boolean);

const tagName = (component) => String(
  component?.get?.("tagName") || (component?.get?.("type") === "image" ? "img" : ""),
).toLowerCase();

const matches = (component, match = {}) => {
  if (!component) return false;
  const componentClasses = classes(component);
  const tags = Array.isArray(match.tags) ? match.tags.map((item) => String(item).toLowerCase()) : [];
  if (tags.length && !tags.includes(tagName(component))) return false;
  if ((match.all_classes || []).some((item) => !componentClasses.includes(item))) return false;
  if ((match.any_classes || []).length && !(match.any_classes || []).some((item) => componentClasses.includes(item))) return false;
  const attributes = component.getAttributes?.() || {};
  return Object.entries(match.attributes || {}).every(([name, expected]) => (
    Object.prototype.hasOwnProperty.call(attributes, name)
    && (expected == null || String(attributes[name]) === String(expected))
  ));
};

const findDescendant = (component, match) => {
  for (const child of models(component)) {
    if (matches(child, match)) return child;
    const nested = findDescendant(child, match);
    if (nested) return nested;
  }
  return null;
};

const resolveControls = (selected, controls) => {
  const direct = controls
    .filter((control) => matches(selected, control.match))
    .map((control) => ({ control, owner: selected }));
  if (direct.length) return direct;

  // A child may expose one contextual editor declared with scope=closest
  // (for example an image inside a themed photo frame). Stop at the first
  // matching ancestor so selecting deep content never opens settings for the
  // whole parent chain.
  let current = selected?.parent?.() || null;
  while (current) {
    const nearest = controls
      .filter((control) => control.scope === "closest" && matches(current, control.match))
      .map((control) => ({ control, owner: current }));
    if (nearest.length) return nearest;
    current = current.parent?.() || null;
  }
  return [];
};

const resolveTarget = (owner, binding = {}) => {
  const target = binding.target;
  if (!target || target.scope === "self") return owner;
  return findDescendant(owner, target.match || {});
};

const classValue = (component, field) => {
  const componentClasses = classes(component);
  const option = (field.options || []).find((item) => item.class_name && componentClasses.includes(item.class_name));
  return option?.value ?? field.default ?? "";
};

const readValue = (owner, field) => {
  const binding = field.bind || {};
  const target = resolveTarget(owner, binding);
  if (!target) return field.default ?? "";
  if (binding.kind === "style") {
    const value = target.getStyle?.()?.[binding.name];
    if (value == null || value === "") return field.default ?? "";
    const scale = Number(field.scale || 1);
    return field.type === "range" || field.type === "number" ? Number(value) / scale : value;
  }
  if (binding.kind === "attribute") {
    const attributes = target.getAttributes?.() || {};
    if (field.type === "checkbox") {
      if (!Object.prototype.hasOwnProperty.call(attributes, binding.name)) return Boolean(field.default);
      return attributes[binding.name] !== "false";
    }
    return attributes[binding.name] ?? field.default ?? "";
  }
  if (binding.kind === "class_choice") return classValue(target, field);
  if (binding.kind === "class_toggle") return classes(target).includes(binding.class_name);
  return "";
};

const replaceClassChoice = (component, field, value) => {
  const binding = field.bind || {};
  const options = field.options || [];
  const removable = new Set(options.map((item) => item.class_name).filter(Boolean));
  const prefix = binding.remove_prefix || "";
  const nextClasses = classes(component).filter((name) => !removable.has(name) && !(prefix && name.startsWith(prefix)));
  const selected = options.find((item) => String(item.value) === String(value));
  if (selected?.class_name) nextClasses.push(selected.class_name);
  component.setClass?.(nextClasses);
};

const writeValue = (owner, field, value) => {
  const binding = field.bind || {};
  const target = resolveTarget(owner, binding);
  if (!target) return;
  if (binding.kind === "style") {
    const scale = Number(field.scale || 1);
    const scaled = Number((Number(value) * scale).toFixed(8));
    const next = field.type === "range" || field.type === "number" ? String(scaled) : String(value);
    target.addStyle?.({ [binding.name]: next });
  } else if (binding.kind === "attribute") {
    target.addAttributes?.({ [binding.name]: field.type === "checkbox" ? (value ? "true" : "false") : String(value) });
  } else if (binding.kind === "class_choice") {
    replaceClassChoice(target, field, value);
  } else if (binding.kind === "class_toggle") {
    const current = classes(target).filter((name) => name !== binding.class_name);
    target.setClass?.(value ? [...current, binding.class_name] : current);
  }
};

function ThemeField({ owner, field, onSelectMedia, onChange }) {
  const { t } = useTranslation();
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh((value) => value + 1);
    owner?.on?.("change:attributes change:style change:classes", update);
    return () => owner?.off?.("change:attributes change:style change:classes", update);
  }, [owner]);
  const value = readValue(owner, field);
  const binding = field.bind || {};
  const target = resolveTarget(owner, binding);
  const update = (next) => {
    writeValue(owner, field, next);
    refresh((current) => current + 1);
    onChange?.();
  };

  if (field.type === "media") {
    const attributes = target?.getAttributes?.() || {};
    const hasMedia = Boolean(attributes.src || attributes["data-sc-media-id"] || attributes["data-sc-background-media-id"] || target?.getStyle?.()?.["background-image"]);
    const choose = () => onSelectMedia?.(target?.get?.("type") === "image" || tagName(target) === "img"
      ? target
      : { component: target, mode: "background" });
    const remove = () => {
      if (!target) return;
      if (target.get?.("type") === "image" || tagName(target) === "img") {
        target.removeAttributes?.("src");
        target.removeAttributes?.("data-sc-media-id");
        target.set?.("src", "");
      } else {
        target.removeAttributes?.("data-sc-background-media-id");
        target.removeStyle?.("background-image");
      }
      onChange?.();
      refresh((current) => current + 1);
    };
    return <div className="web-editor-theme-media-field">
      <span>{field.label}</span>
      <div className="web-editor-image-actions">
        <button type="button" className="btn btn-sm btn-primary" onClick={choose}><i className="fas fa-images me-1" aria-hidden="true" />{t("web.editor.imageContent.choose")}</button>
        {hasMedia && <button type="button" className="btn btn-sm btn-outline-light" onClick={remove}>{t("web.editor.imageContent.remove")}</button>}
      </div>
      {field.help && <small>{field.help}</small>}
    </div>;
  }
  if (field.type === "checkbox") return <label className="web-editor-repeat-checkbox"><input type="checkbox" checked={Boolean(value)} onChange={(event) => update(event.target.checked)} /><span>{field.label}</span></label>;
  if (field.type === "select") return <label><span>{field.label}</span><select value={String(value)} onChange={(event) => update(event.target.value)}>{(field.options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>{field.help && <small>{field.help}</small>}</label>;
  if (field.type === "range") return <label><span>{field.label} · {Math.round(Number(value) || 0)} %</span><input type="range" min={field.min} max={field.max} step={field.step} value={Number(value) || 0} onChange={(event) => update(event.target.value)} />{field.help && <small>{field.help}</small>}</label>;
  return <label><span>{field.label}</span><input type={field.type === "number" ? "number" : field.type === "color" ? "color" : "text"} min={field.min} max={field.max} step={field.step} value={value} onChange={(event) => update(event.target.value)} />{field.help && <small>{field.help}</small>}</label>;
}

ThemeField.propTypes = { owner: PropTypes.object.isRequired, field: PropTypes.object.isRequired, onSelectMedia: PropTypes.func, onChange: PropTypes.func };

export default function ThemeContentControls({ selected, controls = [], onSelectMedia, onContentChange }) {
  const resolved = resolveControls(selected, controls);
  return resolved.map(({ control, owner }) => <details className="web-editor-quick-section" open key={`${control.id}:${owner.cid || "owner"}`}>
    <summary><i className={`fas fa-${control.icon || "sliders"}`} aria-hidden="true" /><span>{control.label}</span><i className="fas fa-chevron-down" aria-hidden="true" /></summary>
    <div className="web-editor-quick-section-body">{(control.fields || []).map((field) => <ThemeField key={field.id} owner={owner} field={field} onSelectMedia={onSelectMedia} onChange={onContentChange} />)}</div>
  </details>);
}

ThemeContentControls.propTypes = { selected: PropTypes.object.isRequired, controls: PropTypes.arrayOf(PropTypes.object), onSelectMedia: PropTypes.func, onContentChange: PropTypes.func };
