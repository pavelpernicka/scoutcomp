import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";

import Modal from "../../../components/Modal";

export default function InventorySetDialog({ isVisible, inventorySet, items, flags, locationOptions, onClose, onSubmit, onRemoveItem }) {
  const [form, setForm] = useState({ name: "", description: "", flag_id: null, default_location: "", current_location: "", status: "available", notes: "" });
  useEffect(() => {
    if (isVisible && inventorySet) setForm({ name: inventorySet.name || "", description: inventorySet.description || "", flag_id: inventorySet.flag_id ?? null, default_location: inventorySet.default_location || "", current_location: inventorySet.current_location || "", status: inventorySet.status || "available", notes: inventorySet.notes || "" });
  }, [inventorySet, isVisible]);
  const members = items.filter((item) => item.set_id === inventorySet?.id);
  return <Modal isVisible={isVisible} onClose={onClose} title={`Nastavení setu „${inventorySet?.name || ""}`} subtitle="Set je jedna věc, která obsahuje více položek" icon={<i className="fas fa-layer-group" />} size="lg" footer={<><button type="button" className="btn btn-outline-secondary" onClick={onClose}>Zrušit</button><button type="button" className="btn btn-primary" onClick={() => onSubmit(form)}>Uložit set</button></>}>
    <div className="row g-3">
      <div className="col-md-6"><label className="form-label" htmlFor="inventory-set-detail-name">Název</label><input id="inventory-set-detail-name" className="form-control" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></div>
      <div className="col-md-6"><label className="form-label">Množství</label><input className="form-control" value="1 set" disabled /></div>
      <div className="col-md-6"><label className="form-label">Příznak</label><select className="form-select" value={form.flag_id || ""} onChange={(event) => setForm((current) => ({ ...current, flag_id: event.target.value ? Number(event.target.value) : null }))}><option value="">Bez příznaku</option>{flags.map((flag) => <option key={flag.id} value={flag.id}>{flag.name}</option>)}</select></div>
      <div className="col-md-6"><label className="form-label">Dostupnost</label><select className="form-select" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}><option value="available">Dostupné</option><option value="missing">Došlo</option><option value="damaged">Poškozené</option><option value="maintenance">Servis</option></select></div>
      <div className="col-md-6"><label className="form-label">Výchozí lokace</label><select className="form-select" value={form.default_location} onChange={(event) => setForm((current) => ({ ...current, default_location: event.target.value, current_location: current.current_location || event.target.value }))}><option value="">Bez lokace</option>{locationOptions.map((location) => <option key={location.value} value={location.value}>{location.label}</option>)}</select></div>
      <div className="col-md-6"><label className="form-label">Aktuální lokace</label><select className="form-select" value={form.current_location} onChange={(event) => setForm((current) => ({ ...current, current_location: event.target.value }))}><option value="">Bez lokace</option>{locationOptions.map((location) => <option key={location.value} value={location.value}>{location.label}</option>)}</select></div>
      <div className="col-12"><label className="form-label" htmlFor="inventory-set-detail-description">Popis</label><textarea id="inventory-set-detail-description" className="form-control" rows="2" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></div>
      <div className="col-12"><label className="form-label" htmlFor="inventory-set-detail-notes">Poznámky</label><textarea id="inventory-set-detail-notes" className="form-control" rows="2" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
      <div className="col-12"><h3 className="h6 mb-2">Prvky setu ({members.length})</h3>{members.length ? <ul className="list-group">{members.map((item) => <li className="list-group-item d-flex justify-content-between align-items-center gap-3" key={item.id}><span className="flex-grow-1">{item.name}<small className="d-block text-muted">{item.quantity} {item.quantity_unit}</small></span><button type="button" className="btn btn-sm btn-outline-danger" onClick={() => onRemoveItem(item)}><i className="fas fa-link-slash me-1" />Odebrat</button></li>)}</ul> : <p className="text-muted mb-0">Set zatím neobsahuje žádné věci. Přidej je výběrem v tabulce.</p>}</div>
    </div>
  </Modal>;
}

InventorySetDialog.propTypes = { isVisible: PropTypes.bool.isRequired, inventorySet: PropTypes.object, items: PropTypes.array.isRequired, flags: PropTypes.array.isRequired, locationOptions: PropTypes.array.isRequired, onClose: PropTypes.func.isRequired, onSubmit: PropTypes.func.isRequired, onRemoveItem: PropTypes.func.isRequired };
