import React from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import InventoryTree from "./InventoryTree";

export default function InventoryLocationTree({ locations, selectedPath = "", onSelect, onEdit, onCreateChild, onDelete, allLabel = "" }) {
  const { t } = useTranslation();
  return <InventoryTree nodes={locations} selectedPath={selectedPath} onSelect={onSelect} allLabel={allLabel || t("inventory.allLocations")} editable onEdit={onEdit} onCreateChild={onCreateChild} onDelete={onDelete} />;
}

InventoryLocationTree.propTypes = { locations: PropTypes.array.isRequired, selectedPath: PropTypes.string, onSelect: PropTypes.func.isRequired, onEdit: PropTypes.func.isRequired, onCreateChild: PropTypes.func.isRequired, onDelete: PropTypes.func.isRequired, allLabel: PropTypes.string };
