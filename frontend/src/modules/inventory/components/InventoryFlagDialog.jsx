import React from "react";
import PropTypes from "prop-types";

import Modal from "../../../components/Modal";
import { THEME_COLOR_OPTIONS } from "../helpers";

export default function InventoryFlagDialog({
  isVisible,
  form,
  onChange,
  onClose,
  onSubmit,
  editing,
}) {
  return (
    <Modal
      isVisible={isVisible}
      onClose={onClose}
      title={editing ? "Upravit příznak" : "Nový příznak"}
      subtitle="Příznaky jsou jednoduché štítky s barvou pro rychlou orientaci."
      icon={<i className="fas fa-palette"></i>}
      size="md"
      footer={(
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Zavřít</button>
          <button type="button" className="btn btn-primary" onClick={onSubmit}>{editing ? "Uložit příznak" : "Vytvořit příznak"}</button>
        </>
      )}
    >
      <div className="row g-3">
        <div className="col-md-8">
          <label className="form-label">Název příznaku</label>
          <input className="form-control" value={form.name} onChange={(event) => onChange("name", event.target.value)} />
        </div>
        <div className="col-md-4">
          <label className="form-label">Barva</label>
          <select className="form-select" value={form.color} onChange={(event) => onChange("color", event.target.value)}>
            {THEME_COLOR_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="col-12">
          <label className="form-label">Popis</label>
          <textarea className="form-control" rows={3} value={form.description || ""} onChange={(event) => onChange("description", event.target.value)} />
        </div>
        <div className="col-12">
          <label className="form-label">Pořadí</label>
          <input className="form-control" type="number" min="0" value={form.sort_order} onChange={(event) => onChange("sort_order", Number(event.target.value))} />
        </div>
      </div>
    </Modal>
  );
}

InventoryFlagDialog.propTypes = {
  isVisible: PropTypes.bool.isRequired,
  form: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  editing: PropTypes.bool,
};
