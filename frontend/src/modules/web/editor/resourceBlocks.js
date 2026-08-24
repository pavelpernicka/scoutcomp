import { insertEditorComponents } from "./editorInsertion";
import { withEditorMediaPlaceholders } from "./grapes/projectData";

export const getResourceComponent = (resource = {}) => {
  const project = resource.project_data || resource.data || {};
  const page = project.pages?.[0] || {};
  return page.frames?.[0]?.component ?? page.component ?? resource.component ?? [];
};

export const filterCatalogResources = (value, activeThemeVersionId) => {
  const items = Array.isArray(value) ? value : value?.items || [];
  if (activeThemeVersionId == null) return [];
  return items.filter((resource) => String(resource.theme_version_id) === String(activeThemeVersionId));
};

const resourceKey = (resource = {}) => String(resource.qualified_key || resource.id || "").split(":").pop();

export const getResourceGroup = (resource, kind, groups = []) => {
  const normalizedKind = kind === "sections" || kind === "section" ? "sections" : "components";
  const key = resourceKey(resource);
  return (Array.isArray(groups) ? groups : [])
    .filter((group) => group?.kind === normalizedKind && Array.isArray(group.resources))
    .find((group) => group.resources.some((candidate) => candidate === key || candidate === resource?.qualified_key));
};

export const groupCatalogResources = (resources, kind, groups = [], fallbackLabel = "Other") => {
  const buckets = new Map();
  (resources || []).forEach((resource) => {
    const group = getResourceGroup(resource, kind, groups) || {
      id: "other", label: fallbackLabel, order: 1000,
    };
    if (!buckets.has(group.id)) buckets.set(group.id, { ...group, items: [] });
    buckets.get(group.id).items.push(resource);
  });
  return [...buckets.values()].sort((left, right) => (
    Number(left.order || 0) - Number(right.order || 0)
    || String(left.label).localeCompare(String(right.label))
  ));
};

export const cloneResourceComponents = (resource) => {
  const root = getResourceComponent(resource);
  const insertable = root?.type === "wrapper" && Array.isArray(root.components)
    ? root.components
    : root;
  return withEditorMediaPlaceholders(JSON.parse(JSON.stringify(insertable)));
};

export const getResourceStyles = (resource = {}) => {
  const project = resource.project_data || resource.data || {};
  const page = project.pages?.[0] || {};
  return page.frames?.[0]?.styles || page.styles || project.styles || [];
};

export const insertResource = (editor, resource) => {
  const added = insertEditorComponents(editor, cloneResourceComponents(resource));
  const styles = getResourceStyles(resource);
  if (styles.length) {
    styles.forEach((rule) => {
      const selector = (rule.selectors || []).map((item) => {
        const name = typeof item === "string" ? item : item.name;
        return `${item?.type === 1 ? "#" : "."}${name}`;
      }).join("");
      if (!selector || !rule.style) return;
      editor.Css.setRule(`${selector}${rule.state ? `:${rule.state}` : ""}`, rule.style, {
        atRuleType: rule.atRuleType || "",
        atRuleParams: rule.mediaText || "",
        addStyles: true,
      });
    });
  } else if (resource.css) {
    editor.Css.addRules(resource.css);
  }
  return added;
};

export const linkedResourceInstance = (resource, kind) => ({
  type: "sc-resource-instance",
  resourceKind: kind === "sections" || kind === "section" ? "section" : "component",
  resourceId: resource.qualified_key || String(resource.id),
  resourceName: resource.name || resource.qualified_key || String(resource.id),
  // Protected preview artifacts are hydrated to blob URLs by the editor.
  // Never let a raw API URL mount in the unauthenticated canvas iframe.
  previewUrl: String(resource.preview_url || "").startsWith("data:image/") ? resource.preview_url : "",
  props: JSON.parse(JSON.stringify(resource.default_props || {})),
});

export const insertLinkedResource = (editor, resource, kind) => (
  insertEditorComponents(editor, linkedResourceInstance(resource, kind))
);

export const hydrateMenuComponents = (editor, menus = []) => {
  if (!editor) return () => {};
  const byLocation = new Map(
    (Array.isArray(menus) ? menus : []).map((menu) => [String(menu.location || ""), menu.items || []]),
  );
  const apply = (component) => {
    if (component?.get?.("type") === "sc-menu") {
      component.set?.("menuItems", byLocation.get(String(component.get("location") || "main")) || [], { avoidStore: true });
    }
    component?.components?.().forEach?.(apply);
  };
  const update = (component) => apply(component);
  apply(editor.getWrapper?.());
  editor.on?.("component:add", update);
  editor.on?.("component:update:location", update);
  return () => {
    editor.off?.("component:add", update);
    editor.off?.("component:update:location", update);
  };
};


/**
 * Detach a linked resource instance in the editor: materialize its DOM and
 * CSS into the current document, then replace the instance node. The node
 * keeps `detachedFrom` provenance metadata but is no longer linked.
 *
 * This is a destructive editor operation; GrapesJS undo restores the link.
 */
export const detachLinkedResource = (component, materialized, definition) => {
  if (!component || !materialized) return [];
  const editor = component.em?.Editor || component.em?.getEditor?.() || null;

  const detached = component.replaceWith(materialized.html || "");

  if (editor && materialized.css) {
    editor.Css.addRules(materialized.css);
  }

  const metadata = {
    resourceKind: component.get("resourceKind") || "",
    resourceId: component.get("resourceId") || "",
    resourceName: component.get("resourceName") || definition?.name || "",
    detachedAt: new Date().toISOString(),
  };
  detached.forEach((node) => {
    if (node && typeof node.set === "function") {
      node.set("detachedFrom", metadata);
    }
  });
  return detached;
};
