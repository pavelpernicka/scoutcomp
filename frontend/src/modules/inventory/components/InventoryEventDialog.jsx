import React from "react";
import PropTypes from "prop-types";

import Modal from "../../../components/Modal";
import { EVENT_STATUS_OPTIONS } from "../helpers";

export default function InventoryEventDialog({ isVisible, form, onChange, onClose, onSubmit }) {
  return (
    <Modal
      isVisible={isVisible}
      onClose={onClose}
      title="Akce nebo tábor"
      subtitle="Správa jedné akce má být rychlá i na mobilu."
      icon={<i className="fas fa-campground"></i>}
      size="lg"
      footer={(
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Zavřít</button>
          <button type="button" className="btn btn-primary" onClick={onSubmit}>Uložit akci</button>
        </>
      )}
    >
      <div className="row g-3">
        <div className="col-12">
          <label className="form-label">Název akce</label>
          <input className="form-control" value={form.name} onChange={(event) => onChange("name", event.target.value)} />
        </div>
        <div className="col-md-6">
          <label className="form-label">Začátek</label>
          <input className="form-control" type="datetime-local" value={form.start_date} onChange={(event) => onChange("start_date", event.target.value)} />
        </div>
        <div className="col-md-6">
          <label className="form-label">Konec</label>
          <input className="form-control" type="datetime-local" value={form.end_date} onChange={(event) => onChange("end_date", event.target.value)} />
        </div>
        <div className="col-md-6">
          <label className="form-label">Stav</label>
          <select className="form-select" value={form.status} onChange={(event) => onChange("status", event.target.value)}>
            {EVENT_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="col-12">
          <label className="form-label">Poznámka</label>
          <textarea className="form-control" rows={4} value={form.note} onChange={(event) => onChange("note", event.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

InventoryEventDialog.propTypes = {
  isVisible: PropTypes.bool.isRequired,
  form: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
};
