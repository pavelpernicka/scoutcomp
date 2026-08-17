import React from "react";
import PropTypes from "prop-types";
import { useMemo, useState } from "react";

import Card from "../../../components/Card";
import { buildColorStyle, formatInventoryFlagName } from "../helpers";

export default function InventoryFlagsScreen({ flags, onCreate, onEdit, onDelete }) {
  const editableFlags = useMemo(() => flags.filter((flag) => !flag.is_system), [flags]);
  const [selectedFlagId, setSelectedFlagId] = useState(null);
  const selectedFlag = useMemo(
    () => editableFlags.find((flag) => flag.id === selectedFlagId) ?? editableFlags[0] ?? null,
    [editableFlags, selectedFlagId]
  );

  return (
    <div className="row g-4 inventory-settings-grid">
      <div className="col-12 col-xl-8">
        <Card className="border-0 shadow-lg" title="Konfigurace příznaků" icon={<i className="fas fa-palette"></i>}>
          <div className="inventory-section-create mb-3">
            <p className="text-muted mb-0">Příznaky jsou jednoduché barevné štítky.</p>
            <button type="button" className="btn btn-primary w-100" onClick={onCreate}>
              <i className="fas fa-plus me-2"></i>Přidat příznak
            </button>
          </div>
          <div className="inventory-location-tree">
            {editableFlags.map((flag) => (
              <div key={flag.id} className={`inventory-location-row ${selectedFlag?.id === flag.id ? "selected" : ""}`}>
                <button type="button" className="inventory-location-select" onClick={() => setSelectedFlagId(flag.id)}>
                  <i className="fas fa-bookmark" style={{ color: buildColorStyle(flag.color, 0.16).color }}></i>
                  <span>{formatInventoryFlagName(flag)}</span>
                </button>
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
            {editableFlags.length === 0 ? <div className="text-muted">Zatím nejsou nastavené žádné upravitelné příznaky.</div> : null}
          </div>
        </Card>
      </div>
      <div className="col-12 col-xl-4">
        <Card className="border-0 shadow-lg h-100" title="Vybraný příznak" icon={<i className="fas fa-bookmark"></i>}>
          {selectedFlag ? (
            <div>
              <span className="inventory-inline-badge" style={buildColorStyle(selectedFlag.color, 0.16)}>
                {formatInventoryFlagName(selectedFlag)}
              </span>
              <div className="small text-muted mt-3">{selectedFlag.description || "Bez popisu"}</div>
              <div className="small text-muted mt-2">Pořadí {selectedFlag.sort_order}</div>
            </div>
          ) : (
            <div className="text-muted">Vyber příznak ze seznamu vlevo.</div>
          )}
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
