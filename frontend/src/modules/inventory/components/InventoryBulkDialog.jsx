import React from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

import Modal from "../../../components/Modal";

export default function InventoryBulkDialog({ isVisible, mode, form, locationOptions, categoryOptions, flags, sets, onChange, onClose, onSubmit, selectedCount }) {
  const { t } = useTranslation();
  const titleMap = {
    flag: t("inventory.bulkFlag"),
    location: t("inventory.bulkLocation"),
    category: t("inventory.bulkCategory"),
    loan: t("inventory.bulkLoan"),
    set: t("inventory.addToSet"),
  };

  return (
    <Modal
      isVisible={isVisible}
      onClose={onClose}
      title={titleMap[mode] || t("inventory.bulkChange")}
      subtitle={t("inventory.selectedItems", { count: selectedCount })}
      icon={<i className="fas fa-layer-group"></i>}
      size="lg"
      footer={(
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>{t("common.close")}</button>
          <button type="button" className="btn btn-primary" onClick={onSubmit}>{t("inventory.apply")}</button>
        </>
      )}
    >
      {mode === "flag" && (
        <select className="form-select" value={form.set_flag_id || ""} onChange={(event) => onChange("set_flag_id", event.target.value ? Number(event.target.value) : null)}>
          <option value="">{t("inventory.noFlag")}</option>
          {flags.map((flag) => <option key={flag.id} value={flag.id}>{flag.name}</option>)}
        </select>
      )}
      {mode === "location" && (
        <select className="form-select" value={form.set_default_location || ""} onChange={(event) => onChange("set_default_location", event.target.value)}>
          <option value="">{t("inventory.noDefaultLocation")}</option>
          {locationOptions.map((option) => <option key={option.id ?? option.value} value={option.value}>{option.label}</option>)}
        </select>
      )}
      {mode === "category" && (
        <select className="form-select" value={form.set_category || ""} onChange={(event) => onChange("set_category", event.target.value)}>
          <option value="">{t("inventory.noCategory")}</option>
          {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      )}
      {mode === "loan" && <div className="row g-3"><div className="col-12"><label className="form-label">{t("inventory.borrower")}</label><input className="form-control" value={form.borrower_name || ""} onChange={(event) => onChange("borrower_name", event.target.value)} required /></div><div className="col-12"><label className="form-label">{t("inventory.dueAt")}</label><input className="form-control" type="datetime-local" value={form.due_at || ""} onChange={(event) => onChange("due_at", event.target.value)} /></div><div className="col-12"><label className="form-label">{t("inventory.note")}</label><textarea className="form-control" rows="2" value={form.note || ""} onChange={(event) => onChange("note", event.target.value)} /></div><p className="text-muted small mb-0">{t("inventory.bulkLoanHelp")}</p></div>}
      {mode === "set" && <div><label className="form-label" htmlFor="inventory-bulk-set">{t("inventory.set")}</label><select id="inventory-bulk-set" className="form-select" value={form.set_id || ""} onChange={(event) => onChange("set_id", event.target.value ? Number(event.target.value) : null)}><option value="">{t("inventory.chooseSet")}</option>{sets.map((inventorySet) => <option key={inventorySet.id} value={inventorySet.id}>{inventorySet.name}</option>)}</select><p className="text-muted small mt-2 mb-0">{t("inventory.addToSetHelp")}</p></div>}
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
