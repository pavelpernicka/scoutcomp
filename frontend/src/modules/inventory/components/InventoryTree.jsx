import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";

const parentIdsForPath = (nodes, selectedPath, parents = []) => {
  for (const node of nodes) {
    if (node.path === selectedPath) return parents;
    const nested = parentIdsForPath(node.children || [], selectedPath, [...parents, node.id]);
    if (nested) return nested;
  }
  return null;
};

function TreeNode({ node, depth, expandedIds, onToggle, selectedPath, onSelect, editable, onEdit, onCreateChild, onDelete }) {
  const hasChildren = Boolean(node.children?.length);
  const expanded = expandedIds.includes(node.id);
  return (
    <li className="inventory-tree-node" style={{ "--inventory-tree-depth": depth }}>
      <div className={`inventory-tree-row ${selectedPath === node.path ? "is-selected" : ""}`}>
        {hasChildren ? <button type="button" className="inventory-tree-toggle" onClick={() => onToggle(node.id)} aria-label={expanded ? `Sbalit ${node.name}` : `Rozbalit ${node.name}`} aria-expanded={expanded}><i className={`fas fa-chevron-${expanded ? "down" : "right"}`} /></button> : <span className="inventory-tree-toggle-spacer" />}
        <button type="button" className="inventory-tree-select" onClick={() => onSelect(selectedPath === node.path ? "" : node.path)}>
          <i className={hasChildren ? "fas fa-folder-tree" : "fas fa-folder"} style={node.color ? { color: node.color } : undefined} />
          <span>{node.name}</span>
        </button>
        {editable ? <div className="inventory-tree-actions">
          <button type="button" className="btn btn-sm btn-link" title="Přidat podúroveň" onClick={() => onCreateChild(node)}><i className="fas fa-plus" /></button>
          <button type="button" className="btn btn-sm btn-link" title="Upravit" onClick={() => onEdit(node)}><i className="fas fa-pen" /></button>
          <button type="button" className="btn btn-sm btn-link text-danger" title="Smazat" onClick={() => onDelete(node)}><i className="fas fa-trash" /></button>
        </div> : null}
      </div>
      {hasChildren && expanded ? <ul className="inventory-tree-children">{node.children.map((child) => <TreeNode key={child.id} node={child} depth={depth + 1} expandedIds={expandedIds} onToggle={onToggle} selectedPath={selectedPath} onSelect={onSelect} editable={editable} onEdit={onEdit} onCreateChild={onCreateChild} onDelete={onDelete} />)}</ul> : null}
    </li>
  );
}

TreeNode.propTypes = {
  node: PropTypes.shape({
    id: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired,
    path: PropTypes.string.isRequired,
    color: PropTypes.string,
    children: PropTypes.array,
  }).isRequired,
  depth: PropTypes.number.isRequired,
  expandedIds: PropTypes.array.isRequired,
  onToggle: PropTypes.func.isRequired,
  selectedPath: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
  editable: PropTypes.bool.isRequired,
  onEdit: PropTypes.func,
  onCreateChild: PropTypes.func,
  onDelete: PropTypes.func,
};

export default function InventoryTree({ nodes, selectedPath, onSelect, allLabel, editable = false, onEdit, onCreateChild, onDelete }) {
  const [expandedIds, setExpandedIds] = useState(() => nodes.map((node) => node.id));
  useEffect(() => {
    // Query data commonly arrives after the first render; keep the root level
    // immediately usable without reopening every nested branch.
    setExpandedIds((current) => current.length ? current : nodes.map((node) => node.id));
  }, [nodes]);
  useEffect(() => {
    const ancestors = parentIdsForPath(nodes, selectedPath);
    if (ancestors?.length) setExpandedIds((current) => [...new Set([...current, ...ancestors])]);
  }, [nodes, selectedPath]);
  const toggle = (id) => setExpandedIds((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);

  return <div className="inventory-tree"><button type="button" className={`inventory-tree-row inventory-tree-all ${selectedPath === "" ? "is-selected" : ""}`} onClick={() => onSelect("")}><span className="inventory-tree-toggle-spacer" /><i className="fas fa-layer-group" /><span>{allLabel}</span></button>{nodes.length ? <ul>{nodes.map((node) => <TreeNode key={node.id} node={node} depth={0} expandedIds={expandedIds} onToggle={toggle} selectedPath={selectedPath} onSelect={onSelect} editable={editable} onEdit={onEdit} onCreateChild={onCreateChild} onDelete={onDelete} />)}</ul> : <p className="text-muted mb-0">Zatím není co zobrazit.</p>}</div>;
}

InventoryTree.propTypes = {
  nodes: PropTypes.array.isRequired, selectedPath: PropTypes.string.isRequired, onSelect: PropTypes.func.isRequired, allLabel: PropTypes.string.isRequired,
  editable: PropTypes.bool, onEdit: PropTypes.func, onCreateChild: PropTypes.func, onDelete: PropTypes.func,
};
