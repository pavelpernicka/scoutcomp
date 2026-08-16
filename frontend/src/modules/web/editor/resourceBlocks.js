export const getResourceComponent = (resource = {}) => {
  const project = resource.project_data || resource.data || {};
  const page = project.pages?.[0] || {};
  return page.frames?.[0]?.component ?? page.component ?? resource.component ?? [];
};

export const cloneResourceComponents = (resource) => {
  const root = getResourceComponent(resource);
  const insertable = root?.type === "wrapper" && Array.isArray(root.components)
    ? root.components
    : root;
  return JSON.parse(JSON.stringify(insertable));
};

export const getResourceStyles = (resource = {}) => {
  const project = resource.project_data || resource.data || {};
  const page = project.pages?.[0] || {};
  return page.frames?.[0]?.styles || page.styles || project.styles || [];
};

export const insertResource = (editor, resource) => {
  const added = editor.addComponents(cloneResourceComponents(resource));
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
  previewUrl: resource.preview_url || "",
  props: JSON.parse(JSON.stringify(resource.default_props || {})),
});

export const insertLinkedResource = (editor, resource, kind) => (
  editor.addComponents(linkedResourceInstance(resource, kind))
);

export const insertLinkedGlobalPart = (editor, resource) => (
  editor.addComponents(linkedGlobalPart(resource))
);


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

export const linkedTemplatePart = (resource) => ({
  type: "sc-template-part",
  resourceId: resource.qualified_key || String(resource.id),
});

export const linkedGlobalPart = (resource) => ({
  type: "sc-global-part",
  resourceId: resource.qualified_key || String(resource.id),
});
