import React from "react";
import PropTypes from "prop-types";

import Modal from "../../../components/Modal";

export default function InventoryBulkDialog({ isVisible, mode, form, locationOptions, categoryOptions, flags, sets, onChange, onClose, onSubmit, selectedCount }) {
  const titleMap = {
    flag: "Hromadná změna příznaku",
    location: "Hromadná změna defaultní lokace",
    category: "Hromadná změna kategorie",
    loan: "Vypůjčit set / vybrané věci",
    set: "Přidat do setu",
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
          {locationOptions.map((option) => <option key={option.id ?? option.value} value={option.value}>{option.label}</option>)}
        </select>
      )}
      {mode === "category" && (
        <select className="form-select" value={form.set_category || ""} onChange={(event) => onChange("set_category", event.target.value)}>
          <option value="">Bez kategorie</option>
          {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      )}
      {mode === "loan" && <div className="row g-3"><div className="col-12"><label className="form-label">Komu</label><input className="form-control" value={form.borrower_name || ""} onChange={(event) => onChange("borrower_name", event.target.value)} required /></div><div className="col-12"><label className="form-label">Vrátit do</label><input className="form-control" type="datetime-local" value={form.due_at || ""} onChange={(event) => onChange("due_at", event.target.value)} /></div><div className="col-12"><label className="form-label">Poznámka</label><textarea className="form-control" rows="2" value={form.note || ""} onChange={(event) => onChange("note", event.target.value)} /></div><p className="text-muted small mb-0">Vypůjčí se dostupné množství každé vybrané věci. U setu se tím vypůjčí celý obsah.</p></div>}
      {mode === "set" && <div><label className="form-label" htmlFor="inventory-bulk-set">Set</label><select id="inventory-bulk-set" className="form-select" value={form.set_id || ""} onChange={(event) => onChange("set_id", event.target.value ? Number(event.target.value) : null)}><option value="">Vyber set</option>{sets.map((inventorySet) => <option key={inventorySet.id} value={inventorySet.id}>{inventorySet.name}</option>)}</select><p className="text-muted small mt-2 mb-0">Vybrané věci se do setu přidají. Stávající obsah setu zůstane zachovaný.</p></div>}
    </Modal>
  );
}

InventoryBulkDialog.propTypes = {
  isVisible: PropTypes.bool.isRequired,
  mode: PropTypes.string,
  form: PropTypes.object.isRequired,
  locationOptions: PropTypes.array.isRequired,
  categoryOptions: PropTypes.array.isRequired,
  flags: PropTypes.array.isRequired,
  sets: PropTypes.array.isRequired,
  onChange: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  selectedCount: PropTypes.number.isRequired,
};
