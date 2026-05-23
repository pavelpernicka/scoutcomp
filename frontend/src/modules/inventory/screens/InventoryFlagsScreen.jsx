import React from "react";
import PropTypes from "prop-types";

import Card from "../../../components/Card";
import { buildColorStyle } from "../helpers";

export default function InventoryFlagsScreen({ flags, onCreate, onEdit, onDelete }) {
  return (
    <div className="row g-4">
      <div className="col-12">
        <Card className="border-0 shadow-lg" title="Konfigurace příznaků" icon={<i className="fas fa-palette"></i>}>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <p className="text-muted mb-0">Příznaky jsou jednorozměrné štítky se jménem, popisem a předdefinovanou barvou.</p>
            <button type="button" className="btn btn-primary" onClick={onCreate}>
              <i className="fas fa-plus me-2"></i>Nový příznak
            </button>
          </div>
          <div className="inventory-config-list">
            {flags.map((flag) => (
              <div key={flag.id} className="inventory-config-row">
                <div className="inventory-config-main">
                  <span className="inventory-inline-badge" style={buildColorStyle(flag.color, 0.16)}>
                    {flag.name}
                  </span>
                  <div className="small text-muted mt-2">{flag.description || "Bez popisu"}</div>
                </div>
                <div className="small text-muted">Pořadí {flag.sort_order}</div>
                <div className="inventory-location-actions">
                  <button type="button" className="btn btn-sm btn-link" onClick={() => onEdit(flag)} title="Upravit příznak">
                    <i className="fas fa-pen"></i>
                  </button>
                  <button type="button" className="btn btn-sm btn-link text-danger" onClick={() => onDelete(flag)} title="Smazat příznak">
                    <i className="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            ))}
            {flags.length === 0 ? <div className="text-muted">Zatím nejsou nastavené žádné příznaky.</div> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

InventoryFlagsScreen.propTypes = {
  flags: PropTypes.array.isRequired,
  onCreate: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};
