import React from "react";
import PropTypes from "prop-types";
function LocationNode({ node, selectedPath, onSelect, onEdit, onCreateChild, onDelete }) {
  const isSelected = selectedPath === node.path;
  return (
    <li className="inventory-location-node">
      <div className={`inventory-location-row ${isSelected ? "selected" : ""}`}>
        <button type="button" className="inventory-location-select" onClick={() => onSelect(node.path)}>
          <i className="fas fa-folder-tree" style={node.color ? { color: node.color } : undefined}></i>
          <span>{node.name}</span>
        </button>
        <div className="inventory-location-actions">
          <button type="button" className="btn btn-sm btn-link" onClick={() => onCreateChild(node)} title="Přidat podlokaci">
            <i className="fas fa-plus"></i>
          </button>
          <button type="button" className="btn btn-sm btn-link" onClick={() => onEdit(node)} title="Upravit lokaci">
            <i className="fas fa-pen"></i>
          </button>
          <button type="button" className="btn btn-sm btn-link text-danger" onClick={() => onDelete(node)} title="Smazat lokaci">
            <i className="fas fa-trash"></i>
          </button>
        </div>
      </div>
      {node.children?.length > 0 && (
        <ul className="inventory-location-children">
          {node.children.map((child) => (
            <LocationNode
              key={child.id}
              node={child}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onEdit={onEdit}
              onCreateChild={onCreateChild}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

LocationNode.propTypes = {
  node: PropTypes.object.isRequired,
  selectedPath: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onCreateChild: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};

export default function InventoryLocationTree(props) {
  const { locations, selectedPath } = props;
  if (locations.length === 0) {
    return <div className="text-muted">Zatím nejsou nastavené žádné lokace.</div>;
  }
  return (
    <ul className="inventory-location-tree">
      {locations.map((node) => (
        <LocationNode key={node.id} node={node} selectedPath={selectedPath} {...props} />
      ))}
    </ul>
  );
}

InventoryLocationTree.propTypes = {
  locations: PropTypes.array.isRequired,
  selectedPath: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onCreateChild: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};
