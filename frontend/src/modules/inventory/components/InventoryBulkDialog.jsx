import React from "react";
import PropTypes from "prop-types";

import Modal from "../../../components/Modal";

export default function InventoryBulkDialog({ isVisible, mode, form, eventOptions, locationOptions, categoryOptions, flags, onChange, onClose, onSubmit, selectedCount }) {
  const titleMap = {
    flag: "Hromadná změna příznaku",
    location: "Hromadná změna defaultní lokace",
    category: "Hromadná změna kategorie",
    event: "Hromadné přiřazení do akce",
  };

  return (
    <Modal
      isVisible={isVisible}
      onClose={onClose}
      title={titleMap[mode] || "Hromadná změna"}
      subtitle={`Vybráno položek: ${selectedCount}`}
      icon={<i className="fas fa-layer-group"></i>}
      size="lg"
      footer={(
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Zavřít</button>
          <button type="button" className="btn btn-primary" onClick={onSubmit}>Použít</button>
        </>
      )}
    >
      {mode === "flag" && (
        <select className="form-select" value={form.set_flag_id || ""} onChange={(event) => onChange("set_flag_id", event.target.value ? Number(event.target.value) : null)}>
          <option value="">Bez příznaku</option>
          {flags.map((flag) => <option key={flag.id} value={flag.id}>{flag.name}</option>)}
        </select>
      )}
      {mode === "location" && (
        <select className="form-select" value={form.set_default_location || ""} onChange={(event) => onChange("set_default_location", event.target.value)}>
          <option value="">Bez defaultní lokace</option>
          {locationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      )}
      {mode === "category" && (
        <select className="form-select" value={form.set_category || ""} onChange={(event) => onChange("set_category", event.target.value)}>
          <option value="">Bez kategorie</option>
          {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      )}
      {mode === "event" && (
        <div className="row g-3">
          <div className="col-md-8">
            <select className="form-select" value={form.assign_event_id || ""} onChange={(event) => onChange("assign_event_id", event.target.value ? Number(event.target.value) : null)}>
              <option value="">Vyber akci</option>
              {eventOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
          </div>
          <div className="col-md-4">
            <input className="form-control" type="number" min="1" value={form.assign_event_quantity || 1} onChange={(event) => onChange("assign_event_quantity", Number(event.target.value))} />
          </div>
        </div>
      )}
    </Modal>
  );
}

InventoryBulkDialog.propTypes = {
  isVisible: PropTypes.bool.isRequired,
  mode: PropTypes.string,
  form: PropTypes.object.isRequired,
  eventOptions: PropTypes.array.isRequired,
  locationOptions: PropTypes.array.isRequired,
  categoryOptions: PropTypes.array.isRequired,
  flags: PropTypes.array.isRequired,
  onChange: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  selectedCount: PropTypes.number.isRequired,
};
