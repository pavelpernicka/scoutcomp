import { findContentSlot, isWithinComponent } from "./componentOwnership";

const canAcceptChildren = (component) => (
  component
  && component.get?.("droppable") !== false
  && component.get?.("type") !== "sc-resource-instance"
);

export const resolveInsertionTarget = (editor) => {
  const root = editor?.getWrapper?.() || null;
  if (!root) return null;
  const slot = findContentSlot(root);
  if (!slot) return root;

  const selected = editor.getSelected?.();
  if (selected && isWithinComponent(selected, slot) && canAcceptChildren(selected)) {
    return selected;
  }
  return slot;
};

export const insertEditorComponents = (editor, content, options) => {
  const target = resolveInsertionTarget(editor);
  if (!target) return options === undefined
    ? editor?.addComponents?.(content) || []
    : editor?.addComponents?.(content, options) || [];
  if (target === editor.getWrapper?.()) return options === undefined
    ? editor.addComponents(content)
    : editor.addComponents(content, options);
  return options === undefined
    ? target.append?.(content) || []
    : target.append?.(content, options) || [];
};
