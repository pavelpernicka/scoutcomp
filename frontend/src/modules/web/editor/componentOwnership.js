export const isContentSlot = (component) => (
  component?.get?.("type") === "sc-slot"
  && component?.get?.("name") === "content"
);

export const findContentSlot = (component) => {
  if (!component) return null;
  if (isContentSlot(component)) return component;
  const children = component.components?.()?.models || [];
  for (const child of children) {
    const found = findContentSlot(child);
    if (found) return found;
  }
  return null;
};

export const isWithinComponent = (component, ancestor) => {
  let node = component;
  while (node) {
    if (node === ancestor) return true;
    node = node.parent?.();
  }
  return false;
};

export const getTemplateOwnerId = (selected) => {
  let node = selected;
  while (node) {
    if (node !== selected && isContentSlot(node)) return null;
    const owner = node.getAttributes?.()?.["data-sc-template-owner"];
    if (owner) return Number(owner) || owner;
    node = node.parent?.();
  }
  return null;
};

export const canDeleteComponent = (component, root) => Boolean(
  component
  && component !== root
  && !isContentSlot(component)
  && component.get?.("removable") !== false
  && !getTemplateOwnerId(component)
);
