import React from "react";
import PropTypes from "prop-types";
import InventoryTree from "./InventoryTree";

export default function InventoryFilterTree({ nodes, selectedPath, onSelect, allLabel }) {
  return <InventoryTree nodes={nodes} selectedPath={selectedPath} onSelect={onSelect} allLabel={allLabel} />;
}

InventoryFilterTree.propTypes = { nodes: PropTypes.array.isRequired, selectedPath: PropTypes.string.isRequired, onSelect: PropTypes.func.isRequired, allLabel: PropTypes.string.isRequired };
