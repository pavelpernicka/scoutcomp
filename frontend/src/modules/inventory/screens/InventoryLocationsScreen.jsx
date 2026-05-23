import React from "react";
import PropTypes from "prop-types";

import Card from "../../../components/Card";
import InventoryLocationTree from "../components/InventoryLocationTree";

export default function InventoryLocationsScreen({ locations, selectedPath, onSelect, onCreateRoot, onCreateChild, onEdit, onDelete }) {
  return (
    <div className="row g-4">
      <div className="col-12 col-xl-8">
        <Card className="border-0 shadow-lg" title="Strom defaultních lokací" icon={<i className="fas fa-sitemap"></i>}>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <p className="text-muted mb-0">Lokace se používají v hlavním filtru i při editaci věci.</p>
            <button type="button" className="btn btn-primary" onClick={() => onCreateRoot()}>
              <i className="fas fa-plus me-2"></i>Kořenová lokace
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
        <Card className="border-0 shadow-lg h-100" title="Vybraná lokace" icon={<i className="fas fa-location-dot"></i>}>
          {selectedPath ? (
            <div>
              <div className="small text-muted mb-2">Aktivní filtr / výběr</div>
              <div className="fw-semibold">{selectedPath}</div>
            </div>
          ) : (
            <div className="text-muted">Vyber lokaci ze stromu vlevo.</div>
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
