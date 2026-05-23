import React from "react";
import PropTypes from "prop-types";

import Card from "../../../components/Card";
import InventoryLocationTree from "../components/InventoryLocationTree";
import { buildColorStyle, buildPathMetaMap } from "../helpers";

export default function InventoryCategoriesScreen({ categories, selectedPath, onSelect, onCreateRoot, onCreateChild, onEdit, onDelete }) {
  const categoryMap = buildPathMetaMap(categories);
  const selectedCategory = selectedPath ? categoryMap[selectedPath] : null;
  return (
    <div className="row g-4">
      <div className="col-12 col-xl-8">
        <Card className="border-0 shadow-lg" title="Strom kategorií" icon={<i className="fas fa-diagram-project"></i>}>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <p className="text-muted mb-0">Kategorie se používají ve filtrech i při hromadných změnách.</p>
            <button type="button" className="btn btn-primary" onClick={onCreateRoot}>
              <i className="fas fa-plus me-2"></i>Kořenová kategorie
            </button>
          </div>
          <InventoryLocationTree
            locations={categories}
            selectedPath={selectedPath}
            onSelect={onSelect}
            onEdit={onEdit}
            onCreateChild={onCreateChild}
            onDelete={onDelete}
          />
        </Card>
      </div>
      <div className="col-12 col-xl-4">
        <Card className="border-0 shadow-lg h-100" title="Vybraná kategorie" icon={<i className="fas fa-tag"></i>}>
          {selectedCategory ? (
            <div>
              <span className="inventory-inline-badge" style={buildColorStyle(selectedCategory.color, 0.16)}>
                {selectedCategory.name}
              </span>
              <div className="fw-semibold mt-3">{selectedCategory.path}</div>
              {selectedCategory.description ? <div className="small text-muted mt-2">{selectedCategory.description}</div> : null}
            </div>
          ) : (
            <div className="text-muted">Vyber kategorii ze stromu vlevo.</div>
          )}
        </Card>
      </div>
    </div>
  );
}

InventoryCategoriesScreen.propTypes = {
  categories: PropTypes.array.isRequired,
  selectedPath: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
  onCreateRoot: PropTypes.func.isRequired,
  onCreateChild: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};
