import React from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

import Card from "../../../components/Card";
import InventoryLocationTree from "../components/InventoryLocationTree";

export default function InventoryLocationsScreen({ locations, selectedPath, onSelect, onCreateRoot, onCreateChild, onEdit, onDelete }) {
  const { t } = useTranslation();
  const selectedLocation = selectedPath
    ? locations.flatMap(function flatten(node) { return [node, ...(node.children ? node.children.flatMap(flatten) : [])]; }).find((node) => node.path === selectedPath) ?? null
    : null;
  return (
    <div className="row g-4 inventory-settings-grid">
      <div className="col-12 col-xl-8">
        <Card className="border-0 shadow-lg" title={t("inventory.locationTree")} icon={<i className="fas fa-sitemap"></i>}>
          <div className="inventory-section-create mb-3">
            <p className="text-muted mb-0">{t("inventory.locationTreeHelp")}</p>
            <button type="button" className="btn btn-primary w-100" onClick={() => onCreateRoot()}>
              <i className="fas fa-plus me-2"></i>{t("inventory.addRootLocation")}
            </button>
          </div>
          <InventoryLocationTree
            locations={locations}
            selectedPath={selectedPath}
            onSelect={onSelect}
            onEdit={onEdit}
            onCreateChild={onCreateChild}
            onDelete={onDelete}
          />
        </Card>
      </div>
      <div className="col-12 col-xl-4">
        <Card className="border-0 shadow-lg h-100" title={t("inventory.selectedLocation")} icon={<i className="fas fa-location-dot"></i>}>
          {selectedLocation ? (
            <div>
              <div className="small text-muted mb-2">{t("inventory.activeSelection")}</div>
              <div className="fw-semibold">{selectedLocation.path}</div>
              {selectedLocation.description ? <div className="small text-muted mt-2">{selectedLocation.description}</div> : null}
            </div>
          ) : (
            <div className="text-muted">{t("inventory.chooseLocationLeft")}</div>
          )}
        </Card>
      </div>
    </div>
  );
}

InventoryLocationsScreen.propTypes = {
  locations: PropTypes.array.isRequired,
  selectedPath: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
  onCreateRoot: PropTypes.func.isRequired,
  onCreateChild: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};
