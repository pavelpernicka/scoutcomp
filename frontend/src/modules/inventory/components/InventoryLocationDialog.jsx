import React from "react";
import PropTypes from "prop-types";

import Modal from "../../../components/Modal";

export default function InventoryLocationDialog({
  isVisible,
  form,
  parentOptions,
  onChange,
  onClose,
  onSubmit,
  editing,
}) {
  return (
    <Modal
      isVisible={isVisible}
      onClose={onClose}
      title={editing ? "Upravit lokaci" : "Nová lokace"}
      subtitle="Strom lokací je základ pro rychlé filtrování ve skladu."
      icon={<i className="fas fa-sitemap"></i>}
      size="lg"
      footer={(
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Zavřít</button>
          <button type="button" className="btn btn-primary" disabled={!form.name.trim()} onClick={onSubmit}>{editing ? "Uložit lokaci" : "Vytvořit lokaci"}</button>
        </>
      )}
    >
      <div className="row g-3">
        <div className="col-md-8">
          <label className="form-label">Název lokace</label>
          <input className="form-control" value={form.name} onChange={(event) => onChange("name", event.target.value)} />
        </div>
        <div className="col-md-4">
          <label className="form-label">Pořadí</label>
          <input className="form-control" type="number" min="0" value={form.sort_order} onChange={(event) => onChange("sort_order", Number(event.target.value))} />
        </div>
        <div className="col-12">
          <label className="form-label">Popis</label>
          <textarea className="form-control" rows={3} value={form.description || ""} onChange={(event) => onChange("description", event.target.value)} />
        </div>
        <div className="col-12">
          <label className="form-label">Nadřazená lokace</label>
          <select className="form-select" value={form.parent_id ?? ""} onChange={(event) => onChange("parent_id", event.target.value ? Number(event.target.value) : null)}>
            <option value="">Bez nadřazené lokace</option>
            {parentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      </div>
    </Modal>
  );
}

InventoryLocationDialog.propTypes = {
  isVisible: PropTypes.bool.isRequired,
  form: PropTypes.object.isRequired,
  parentOptions: PropTypes.array.isRequired,
  onChange: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  editing: PropTypes.bool,
};
