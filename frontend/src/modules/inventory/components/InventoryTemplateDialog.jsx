import React from "react";
import PropTypes from "prop-types";

import Modal from "../../../components/Modal";
import { LABEL_FIELD_OPTIONS } from "../helpers";

export default function InventoryTemplateDialog({ isVisible, form, onChange, onToggleField, onClose, onSubmit }) {
  return (
    <Modal
      isVisible={isVisible}
      onClose={onClose}
      title="Šablona QR štítku"
      subtitle="Rozvržení musí jít uložit a znovu použít."
      icon={<i className="fas fa-tags"></i>}
      size="lg"
      footer={(
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Zavřít</button>
          <button type="button" className="btn btn-primary" onClick={onSubmit}>Uložit šablonu</button>
        </>
      )}
    >
      <div className="row g-3">
        <div className="col-12">
          <label className="form-label">Název šablony</label>
          <input className="form-control" value={form.name} onChange={(event) => onChange("name", event.target.value)} />
        </div>
        {["width_mm", "height_mm", "qr_x_mm", "qr_y_mm", "qr_size_mm", "title_font_size", "meta_font_size"].map((field) => (
          <div className="col-md-6" key={field}>
            <label className="form-label">{field}</label>
            <input className="form-control" type="number" min="0" step="0.5" value={form[field]} onChange={(event) => onChange(field, Number(event.target.value))} />
          </div>
        ))}
        <div className="col-12">
          <label className="form-label">Zobrazená pole</label>
          <div className="inventory-field-grid">
            {LABEL_FIELD_OPTIONS.map((field) => (
              <label key={field.value} className="form-check">
                <input className="form-check-input" type="checkbox" checked={form.fields.includes(field.value)} onChange={() => onToggleField(field.value)} />
                <span className="form-check-label">{field.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

InventoryTemplateDialog.propTypes = {
  isVisible: PropTypes.bool.isRequired,
  form: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  onToggleField: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
};
