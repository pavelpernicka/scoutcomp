import React from "react";
import PropTypes from "prop-types";

import Modal from "../../../components/Modal";

export default function InventoryEventQuantityDialog({ isVisible, item, eventName, form, maxQuantity, onChange, onClose, onSubmit }) {
  return (
    <Modal
      isVisible={isVisible}
      onClose={onClose}
      title="Upravit množství na akci"
      subtitle={item ? `${item.name} • ${eventName}` : eventName}
      icon={<i className="fas fa-scale-balanced"></i>}
      size="md"
      footer={(
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Zrušit</button>
          <button type="button" className="btn btn-primary" onClick={onSubmit}>Uložit</button>
        </>
      )}
    >
      <div className="row g-3">
        <div className="col-12">
          <label className="form-label">Počet kusů na akci</label>
          <input
            className="form-control"
            type="number"
            min="1"
            max={Math.max(1, maxQuantity || 1)}
            value={form.quantity}
            onChange={(event) => onChange("quantity", Math.max(1, Math.min(Number(event.target.value) || 1, Math.max(1, maxQuantity || 1))))}
          />
          <div className="small text-muted mt-2">Maximum pro tuto akci: {maxQuantity}</div>
        </div>
      </div>
    </Modal>
  );
}

InventoryEventQuantityDialog.propTypes = {
  isVisible: PropTypes.bool.isRequired,
  item: PropTypes.object,
  eventName: PropTypes.string,
  form: PropTypes.object.isRequired,
  maxQuantity: PropTypes.number.isRequired,
  onChange: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
};
