import React from "react";
import PropTypes from "prop-types";

import Modal from "../../../components/Modal";

export default function InventoryEventReturnDialog({
  isVisible,
  entry,
  item,
  form,
  locationOptions,
  onChange,
  onClose,
  onSubmit,
  onSubmitAndEdit,
}) {
  const remainingQuantity = Math.max((entry?.planned_quantity || 0) - (entry?.returned_quantity || 0), 0);

  return (
    <Modal
      isVisible={isVisible}
      onClose={onClose}
      title="Vrácení z akce"
      subtitle={item ? item.name : "Vybraná věc"}
      icon={<i className="fas fa-rotate-left"></i>}
      size="lg"
      footer={(
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Zavřít</button>
          <button type="button" className="btn btn-outline-primary" onClick={onSubmitAndEdit}>Uložit vrácení a editovat</button>
          <button type="button" className="btn btn-primary" onClick={onSubmit}>Uložit vrácení</button>
        </>
      )}
    >
      <div className="row g-3">
        <div className="col-md-6">
          <label className="form-label">Vrátit kusů</label>
          <input className="form-control" type="number" min="1" max={remainingQuantity || 1} value={form.quantity} onChange={(event) => onChange("quantity", Math.max(1, Math.min(Number(event.target.value) || 1, remainingQuantity || 1)))} />
          <div className="small text-muted mt-1">Zbývá vrátit: {remainingQuantity}</div>
        </div>
        <div className="col-md-6">
          <label className="form-label">Stav</label>
          <select className="form-select" value={form.condition} onChange={(event) => onChange("condition", event.target.value)}>
            <option value="ok">V pořádku</option>
            <option value="damaged">Poškozené</option>
          </select>
        </div>
        <div className="col-12">
          <label className="form-label">Lokace po vrácení</label>
          <select className="form-select" value={form.current_location} onChange={(event) => onChange("current_location", event.target.value)}>
            <option value="">Defaultní lokace</option>
            {locationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="col-12">
          <label className="form-label">Poznámka</label>
          <textarea className="form-control" rows={3} value={form.note} onChange={(event) => onChange("note", event.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

InventoryEventReturnDialog.propTypes = {
  isVisible: PropTypes.bool.isRequired,
  entry: PropTypes.object,
  item: PropTypes.object,
  form: PropTypes.object.isRequired,
  locationOptions: PropTypes.array.isRequired,
  onChange: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onSubmitAndEdit: PropTypes.func.isRequired,
};
