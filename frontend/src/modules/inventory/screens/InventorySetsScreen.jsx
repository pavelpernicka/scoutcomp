import React, { useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

import Card from "../../../components/Card";
import Modal from "../../../components/Modal";

const emptyForm = { name: "", description: "" };

export default function InventorySetsScreen({ sets, onCreate, onUpdate, onDelete }) {
  const { t } = useTranslation();
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
    <Card className="border-0 shadow-lg" title={t("inventory.equipmentSets")} icon={<i className="fas fa-layer-group" />}>
      <div className="d-flex justify-content-between align-items-center gap-3 mb-3">
        <p className="text-muted mb-0">{t("inventory.setsHelp")}</p>
        <button type="button" className="btn btn-primary flex-shrink-0" onClick={openCreate}><i className="fas fa-plus me-2" />{t("inventory.addSet")}</button>
      </div>
      <div className="inventory-location-tree">
        {sets.map((inventorySet) => <div key={inventorySet.id} className="inventory-location-row">
          <div className="inventory-location-select"><i className="fas fa-layer-group" /><span>{inventorySet.name}</span></div>
          <div className="inventory-location-actions">
            <button type="button" className="btn btn-sm btn-link" onClick={() => openEdit(inventorySet)} title={t("inventory.editSet")}><i className="fas fa-pen" /></button>
            <button type="button" className="btn btn-sm btn-link text-danger" onClick={() => { if (window.confirm(t("inventory.confirmDeleteSet", { name: inventorySet.name }))) onDelete(inventorySet.id); }} title={t("inventory.deleteSet")}><i className="fas fa-trash" /></button>
          </div>
        </div>)}
        {sets.length === 0 ? <p className="text-muted mb-0">{t("inventory.noSets")}</p> : null}
      </div>
    </Card>
    <Modal
      isVisible={dialogVisible}
      onClose={close}
      title={editing ? t("inventory.editSet") : t("inventory.addSet")}
      icon={<i className="fas fa-layer-group" />}
      footer={<><button type="button" className="btn btn-outline-secondary" onClick={close}>{t("common.cancel")}</button><button type="submit" form="inventory-set-form" className="btn btn-primary">{editing ? t("inventory.saveSet") : t("inventory.addSet")}</button></>}
      size="sm"
    >
      <form id="inventory-set-form" className="row g-3" onSubmit={submit}>
        <div className="col-12"><label className="form-label" htmlFor="inventory-set-name">{t("inventory.setName")}</label><input id="inventory-set-name" className="form-control" required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></div>
        <div className="col-12"><label className="form-label" htmlFor="inventory-set-description">{t("inventory.description")}</label><textarea id="inventory-set-description" className="form-control" rows="3" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></div>
      </form>
    </Modal>
  </>;
}

InventorySetsScreen.propTypes = { sets: PropTypes.array.isRequired, onCreate: PropTypes.func.isRequired, onUpdate: PropTypes.func.isRequired, onDelete: PropTypes.func.isRequired };
