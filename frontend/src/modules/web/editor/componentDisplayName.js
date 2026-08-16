const GENERIC_NAMES = new Set(["default", "component", "wrapper"]);

const TAG_KEYS = {
  body: "body",
  main: "main",
  header: "header",
  footer: "footer",
  nav: "nav",
  aside: "aside",
  article: "article",
  section: "section",
  div: "div",
  p: "paragraph",
  span: "span",
  button: "button",
  ul: "unorderedList",
  ol: "orderedList",
  li: "listItem",
  figure: "figure",
  figcaption: "figcaption",
  table: "table",
  thead: "tableHead",
  tbody: "tableBody",
  tr: "tableRow",
  th: "tableHeaderCell",
  td: "tableCell",
  hr: "divider",
};

const TYPE_KEYS = {
  "sc-bind": "bind",
  "sc-repeat": "repeat",
  "sc-condition": "condition",
  "sc-empty": "emptyState",
  "sc-template-part": "templatePart",
  "sc-global-part": "globalPart",
  "sc-resource-instance": "linkedResource",
  "sc-slot": "contentSlot",
};

const textValue = (value) => String(value || "")
  .replace(/<[^>]*>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const truncate = (value, limit = 34) => value.length > limit
  ? `${value.slice(0, limit - 1).trimEnd()}…`
  : value;

const translate = (t, key, fallback) => {
  const value = t?.(key);
  return value && value !== key ? value : fallback;
};

const getValue = (component, key) => component?.get?.(key);

export const getComponentClasses = (component) => {
  const values = component?.getClasses?.() || getValue(component, "classes") || [];
  const normalized = Array.isArray(values) ? values : String(values || "").split(/\s+/);
  return normalized
    .map((item) => typeof item === "string" ? item : item?.getName?.() || item?.name)
    .filter(Boolean);
};

const componentText = (component, depth = 0) => {
  const own = textValue(getValue(component, "content"));
  if (own) return truncate(own);
  if (depth > 2) return "";
  const children = component?.components?.()?.models || [];
  for (const child of children) {
    const childText = componentText(child, depth + 1);
    if (childText) return childText;
  }
  return "";
};

const humanize = (value) => {
  const result = String(value || "")
    .replace(/^sc[-_]/, "")
    .replace(/--/g, " ")
    .replace(/[-_]+/g, " ")
    .trim();
  return result ? result.charAt(0).toUpperCase() + result.slice(1) : "";
};

const quotedLabel = (base, detail) => detail ? `${base} „${detail}“` : base;

export function getComponentDisplayName(component, t) {
  if (!component) return translate(t, "web.editor.componentFallback", "Component");

  const attributes = component.getAttributes?.() || {};
  const customName = textValue(getValue(component, "custom-name"));
  if (customName) return customName;

  const resourceName = textValue(
    getValue(component, "displayName")
    || getValue(component, "resourceName")
    || getValue(component, "scDisplayName")
    || attributes["data-sc-name"],
  );
  if (resourceName) return resourceName;

  const type = String(getValue(component, "type") || "default").toLowerCase();
  if (type === "sc-slot" && getValue(component, "name") === "content") {
    return translate(t, "web.editor.component.contentSlot", "Page content");
  }
  const explicitName = textValue(getValue(component, "name"));
  if (explicitName && !GENERIC_NAMES.has(explicitName.toLowerCase())) return explicitName;

  if (type === "sc-repeat") {
    const base = translate(t, "web.editor.component.repeat", "Repeat");
    return [base, textValue(getValue(component, "source"))].filter(Boolean).join(" · ");
  }
  if (type === "sc-bind") {
    const base = translate(t, "web.editor.component.bind", "Binding");
    const binding = getValue(component, "binding") || {};
    return [base, textValue(getValue(component, "bindingField") || binding.field)].filter(Boolean).join(" · ");
  }
  if (type === "sc-condition") {
    const base = translate(t, "web.editor.component.condition", "Condition");
    const condition = getValue(component, "condition") || {};
    return [base, textValue(getValue(component, "conditionField") || condition.left?.field)].filter(Boolean).join(" · ");
  }
  if (TYPE_KEYS[type]) {
    const base = translate(t, `web.editor.component.${TYPE_KEYS[type]}`, humanize(type));
    const reference = textValue(getValue(component, "resourceId"));
    return [base, reference].filter(Boolean).join(" · ");
  }

  const rawTag = String(getValue(component, "tagName") || (type === "wrapper" ? "body" : "div")).toLowerCase();
  const tag = type === "wrapper" ? "body" : rawTag;
  const content = componentText(component);
  if (/^h[1-6]$/.test(tag)) {
    return quotedLabel(translate(t, "web.editor.navigator.tags.heading", "Heading"), content);
  }
  if (tag === "a") {
    return quotedLabel(translate(t, "web.editor.navigator.tags.link", "Link"), content);
  }
  if (tag === "img") {
    return quotedLabel(
      translate(t, "web.editor.navigator.tags.image", "Image"),
      textValue(attributes.alt || attributes.title),
    );
  }

  const classes = getComponentClasses(component);
  const meaningfulClass = classes.find((name) => !/^(?:sc-)?(?:container|row|col(?:umn)?|wrapper|block|item)$/.test(name));
  if (meaningfulClass) return humanize(meaningfulClass);

  const role = textValue(attributes.role);
  if (role) return humanize(role);

  const tagKey = TAG_KEYS[tag];
  if (tagKey) return translate(t, `web.editor.navigator.tags.${tagKey}`, humanize(tag));
  if (!GENERIC_NAMES.has(type)) return humanize(type);
  return humanize(tag) || translate(t, "web.editor.componentFallback", "Component");
}

export function getComponentTechnicalName(component) {
  if (!component) return "";
  const type = String(getValue(component, "type") || "default").toLowerCase();
  if (type === "sc-slot") return `slot:${textValue(getValue(component, "name")) || "content"}`;
  const tag = type === "wrapper" ? "body" : String(getValue(component, "tagName") || "div").toLowerCase();
  const attributes = component.getAttributes?.() || {};
  const id = textValue(attributes.id);
  const classes = getComponentClasses(component);
  return `${tag}${id ? `#${id}` : ""}${classes.map((name) => `.${name}`).join("")}`;
}

export function getComponentState(component) {
  const type = String(getValue(component, "type") || "");
  if (type === "sc-template-part" || type === "sc-global-part") return "global";
  if (type === "sc-resource-instance" || getValue(component, "resourceId")) return "linked";
  if (getValue(component, "detachedFrom")) return "detached";
  if (["sc-bind", "sc-repeat", "sc-condition", "sc-empty"].includes(type)) return "dynamic";
  return "local";
}
