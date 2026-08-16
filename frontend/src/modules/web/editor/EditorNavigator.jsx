import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

import { getComponentDisplayName, getComponentState, getComponentTechnicalName } from "./componentDisplayName";
import { canDeleteComponent, isContentSlot } from "./componentOwnership";

const childModels = (component) => component?.components?.()?.models || [];
const componentKey = (component) => component?.cid || component?.getId?.();
const isAtomic = (component) => ["sc-template-part", "sc-global-part", "sc-resource-instance"].includes(component?.get?.("type"));

function NavigatorNode({ component, depth, selected, openIds, editingId, root, disabled, onSelect, onToggle, onEdit, onCommitName, onDelete }) {
  const { t } = useTranslation();
  const id = componentKey(component);
  const children = isAtomic(component) ? [] : childModels(component);
  const open = openIds.has(id);
  const active = selected === component;
  const state = getComponentState(component);
  const label = getComponentDisplayName(component, t);
  const technical = getComponentTechnicalName(component);
  const contentSlot = isContentSlot(component);
  const removable = !disabled && canDeleteComponent(component, root);
  const stateIcons = { global: "fa-earth-europe", linked: "fa-link", detached: "fa-link-slash", dynamic: "fa-database" };

  return <li role="treeitem" aria-selected={active} aria-expanded={children.length ? open : undefined}>
    <div className={`web-editor-navigator-row state-${state}${contentSlot ? " is-content-slot" : ""}${active ? " active" : ""}`} style={{ paddingLeft: `${depth * 12 + 6}px` }}>
      <button type="button" className="web-editor-navigator-toggle" disabled={!children.length} aria-label={open ? t("web.editor.navigator.collapse") : t("web.editor.navigator.expand")} onClick={() => onToggle(id)}>
        {children.length ? <i className={`fas fa-chevron-${open ? "down" : "right"}`} /> : <span />}
      </button>
      {editingId === id ? <input
        autoFocus
        className="web-editor-navigator-name-input"
        defaultValue={component.get?.("custom-name") || ""}
        aria-label={t("web.editor.navigator.customName")}
        onBlur={(event) => onCommitName(component, event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") onCommitName(component, component.get?.("custom-name") || "");
        }}
      /> : <button type="button" className="web-editor-navigator-select" onClick={() => onSelect(component)} onDoubleClick={() => onEdit(id)}>
        <span className="web-editor-navigator-label">{label}</span>
        <small>{contentSlot ? `${technical} · ${t("web.editor.navigator.editableArea")}` : technical}</small>
      </button>}
      {contentSlot
        ? <i className="fas fa-inbox web-editor-navigator-state" title={t("web.editor.navigator.editableArea")} />
        : stateIcons[state]
          ? <i className={`fas ${stateIcons[state]} web-editor-navigator-state`} title={t(`web.editor.navigator.states.${state}`)} />
          : <span />}
      {removable ? <button type="button" className="web-editor-navigator-delete" title={t("web.editor.navigator.delete")} aria-label={t("web.editor.navigator.delete")} onClick={(event) => { event.stopPropagation(); onDelete(component); }}><i className="fas fa-trash" /></button> : <span />}
    </div>
    {children.length > 0 && open && <ul role="group">{children.map((child) => <NavigatorNode key={componentKey(child)} component={child} depth={depth + 1} selected={selected} openIds={openIds} editingId={editingId} root={root} disabled={disabled} onSelect={onSelect} onToggle={onToggle} onEdit={onEdit} onCommitName={onCommitName} onDelete={onDelete} />)}</ul>}
  </li>;
}

NavigatorNode.propTypes = {
  component: PropTypes.object.isRequired,
  depth: PropTypes.number.isRequired,
  selected: PropTypes.object,
  openIds: PropTypes.instanceOf(Set).isRequired,
  editingId: PropTypes.string,
  root: PropTypes.object.isRequired,
  disabled: PropTypes.bool.isRequired,
  onSelect: PropTypes.func.isRequired,
  onToggle: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onCommitName: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};

export default function EditorNavigator({ editor, selected, onSelect, disabled = false }) {
  const { t } = useTranslation();
  const [, setRevision] = useState(0);
  const [openIds, setOpenIds] = useState(() => new Set());
  const [editingId, setEditingId] = useState(null);
  const root = editor?.getWrapper?.() || null;

  useEffect(() => {
    if (!editor) return undefined;
    const refresh = () => setRevision((value) => value + 1);
    const events = ["component:add", "component:remove", "component:update", "component:selected", "component:deselected", "load"];
    events.forEach((event) => editor.on(event, refresh));
    return () => events.forEach((event) => editor.off(event, refresh));
  }, [editor]);

  useEffect(() => {
    if (!selected) return;
    setOpenIds((current) => {
      const next = new Set(current);
      let parent = selected.parent?.();
      while (parent) {
        next.add(componentKey(parent));
        parent = parent.parent?.();
      }
      return next;
    });
  }, [selected]);

  useEffect(() => {
    if (!root) return;
    setOpenIds((current) => current.has(componentKey(root)) ? current : new Set([...current, componentKey(root)]));
  }, [root]);

  const roots = useMemo(() => root ? [root] : [], [root]);
  const toggle = (id) => setOpenIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const commitName = (component, value) => {
    const name = value.trim();
    if (name) component.set?.("custom-name", name);
    else component.unset?.("custom-name");
    setEditingId(null);
  };
  const deleteComponent = (component) => {
    if (disabled) return false;
    if (!canDeleteComponent(component, root)) return false;
    const parent = component.parent?.();
    const siblings = parent?.components?.()?.models || [];
    const index = siblings.indexOf(component);
    const fallback = siblings[index + 1] || siblings[index - 1] || parent;
    editor.runCommand?.("core:component-delete", { component });
    if (fallback && fallback !== root) editor.select?.(fallback);
    return true;
  };
  const onKeyDown = (event) => {
    if (!selected || !["Delete", "Backspace"].includes(event.key)) return;
    const target = event.target;
    if (target?.matches?.("input, textarea, select") || target?.isContentEditable) return;
    if (deleteComponent(selected)) event.preventDefault();
  };

  if (!editor || !root) return <p className="web-editor-panel-empty">{t("web.editor.navigator.loading")}</p>;
  return <div className="web-editor-navigator" tabIndex={0} onKeyDown={onKeyDown}><p className="web-editor-navigator-help">{t("web.editor.navigator.help")}</p><ul role="tree" aria-label={t("web.editor.navigator.label")}>{roots.map((component) => <NavigatorNode key={componentKey(component)} component={component} depth={0} selected={selected} openIds={openIds} editingId={editingId} root={root} disabled={disabled} onSelect={onSelect} onToggle={toggle} onEdit={setEditingId} onCommitName={commitName} onDelete={deleteComponent} />)}</ul></div>;
}

EditorNavigator.propTypes = { editor: PropTypes.object, selected: PropTypes.object, onSelect: PropTypes.func.isRequired, disabled: PropTypes.bool };
