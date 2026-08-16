import React, { useState } from "react";
import PropTypes from "prop-types";

import Card from "../../../components/Card";
import Modal from "../../../components/Modal";

const emptyForm = { name: "", description: "" };

export default function InventorySetsScreen({ sets, onCreate, onUpdate, onDelete }) {
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setDialogVisible(true); };
  const openEdit = (inventorySet) => {
    setEditing(inventorySet);
    setForm({ name: inventorySet.name, description: inventorySet.description || "" });
    setDialogVisible(true);
  };
  const close = () => { setDialogVisible(false); setEditing(null); };
  const submit = async (event) => {
    event.preventDefault();
    if (editing) await onUpdate(editing.id, form); else await onCreate(form);
    close();
  };

  return <>
    <Card className="border-0 shadow-lg" title="Sety vybavení" icon={<i className="fas fa-layer-group" />}>
      <div className="d-flex justify-content-between align-items-center gap-3 mb-3">
        <p className="text-muted mb-0">Set je globální věc, která seskupuje více položek. Nemá vlastní družinu ani množství.</p>
        <button type="button" className="btn btn-primary flex-shrink-0" onClick={openCreate}><i className="fas fa-plus me-2" />Přidat set</button>
      </div>
      <div className="inventory-location-tree">
        {sets.map((inventorySet) => <div key={inventorySet.id} className="inventory-location-row">
          <div className="inventory-location-select"><i className="fas fa-layer-group" /><span>{inventorySet.name}</span></div>
          <div className="inventory-location-actions">
            <button type="button" className="btn btn-sm btn-link" onClick={() => openEdit(inventorySet)} title="Upravit set"><i className="fas fa-pen" /></button>
            <button type="button" className="btn btn-sm btn-link text-danger" onClick={() => { if (window.confirm(`Smazat set „${inventorySet.name}“? Věci zůstanou ve skladu.`)) onDelete(inventorySet.id); }} title="Smazat set"><i className="fas fa-trash" /></button>
          </div>
        </div>)}
        {sets.length === 0 ? <p className="text-muted mb-0">Zatím nejsou vytvořené žádné sety.</p> : null}
      </div>
    </Card>
    <Modal
      isVisible={dialogVisible}
      onClose={close}
      title={editing ? "Upravit set" : "Přidat set"}
      icon={<i className="fas fa-layer-group" />}
      footer={<><button type="button" className="btn btn-outline-secondary" onClick={close}>Zrušit</button><button type="submit" form="inventory-set-form" className="btn btn-primary">{editing ? "Uložit set" : "Přidat set"}</button></>}
      size="sm"
    >
      <form id="inventory-set-form" className="row g-3" onSubmit={submit}>
        <div className="col-12"><label className="form-label" htmlFor="inventory-set-name">Název setu</label><input id="inventory-set-name" className="form-control" required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></div>
        <div className="col-12"><label className="form-label" htmlFor="inventory-set-description">Popis</label><textarea id="inventory-set-description" className="form-control" rows="3" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></div>
      </form>
    </Modal>
  </>;
}

InventorySetsScreen.propTypes = { sets: PropTypes.array.isRequired, onCreate: PropTypes.func.isRequired, onUpdate: PropTypes.func.isRequired, onDelete: PropTypes.func.isRequired };
