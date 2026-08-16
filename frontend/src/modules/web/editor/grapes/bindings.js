import { SAFE_BIND_TARGETS } from "./constants";

const TARGET_LABEL_KEYS = Object.freeze({
  text: "web.editor.data.targetText",
  richText: "web.editor.data.targetRichText",
  href: "web.editor.data.targetHref",
  src: "web.editor.data.targetSrc",
  alt: "web.editor.data.targetAlt",
  datetime: "web.editor.data.targetDatetime",
  title: "web.editor.data.targetTitle",
  "style.color": "web.editor.data.targetStyleColor",
  "style.background-color": "web.editor.data.targetStyleBackgroundColor",
  "style.opacity": "web.editor.data.targetStyleOpacity",
});

const normalizeBinding = (binding) => {
  if (!binding || typeof binding !== "object" || !binding.field) {
    throw new TypeError("A binding with an explicit public field is required");
  }
  const result = {
    scope: binding.scope || "context",
    field: String(binding.field),
  };
  if (binding.source) result.source = String(binding.source);
  if (binding.params && typeof binding.params === "object") result.params = { ...binding.params };
  if (binding.format) result.format = String(binding.format);
  return result;
};

/** Attach a server-rendered binding to a generic GrapesJS component. */
export function setComponentBinding(component, target, binding) {
  if (!SAFE_BIND_TARGETS.includes(target)) throw new TypeError(`Unsupported binding target: ${target}`);
  const current = component.get("scBindings") || {};
  const next = { ...current, [target]: normalizeBinding(binding) };
  component.set("scBindings", next);
  return next;
}

export function removeComponentBinding(component, target) {
  const next = { ...(component.get("scBindings") || {}) };
  delete next[target];
  component.set("scBindings", next);
  return next;
}

export function getComponentBindings(component) {
  return { ...(component?.get?.("scBindings") || {}) };
}

/** Options for a Data inspector; callers cannot introduce arbitrary targets. */
export function createBindingTargetOptions(translate = (key) => key) {
  return SAFE_BIND_TARGETS.map((id) => ({ id, label: translate(TARGET_LABEL_KEYS[id]) }));
}
