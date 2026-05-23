import React from "react";
import PropTypes from "prop-types";

function FilterNode({ node, selectedPath, onSelect }) {
  return (
    <li className="inventory-location-node">
      <button
        type="button"
        className={`inventory-location-select inventory-filter-select ${selectedPath === node.path ? "active" : ""}`}
        onClick={() => onSelect(selectedPath === node.path ? "" : node.path)}
      >
        <i className="fas fa-folder-tree" style={node.color ? { color: node.color } : undefined}></i>
        <span>{node.name}</span>
      </button>
      {node.children?.length > 0 && (
        <ul className="inventory-location-children">
          {node.children.map((child) => (
            <FilterNode key={child.id} node={child} selectedPath={selectedPath} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  );
}

FilterNode.propTypes = {
  node: PropTypes.object.isRequired,
  selectedPath: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
};

export default function InventoryFilterTree({ nodes, selectedPath, onSelect, allLabel }) {
  return (
    <div>
      <button type="button" className={`inventory-chip mb-2 ${selectedPath === "" ? "active" : ""}`} onClick={() => onSelect("")}>
        {allLabel}
      </button>
      <ul className="inventory-location-tree">
        {nodes.map((node) => (
          <FilterNode key={node.id} node={node} selectedPath={selectedPath} onSelect={onSelect} />
        ))}
      </ul>
    </div>
  );
}

InventoryFilterTree.propTypes = {
  nodes: PropTypes.array.isRequired,
  selectedPath: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
  allLabel: PropTypes.string.isRequired,
};
