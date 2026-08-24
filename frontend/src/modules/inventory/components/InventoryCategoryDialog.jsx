import React from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

import Modal from "../../../components/Modal";

export default function InventoryCategoryDialog({
  isVisible,
  form,
  parentOptions,
  onChange,
  onClose,
  onSubmit,
  editing,
}) {
  const { t } = useTranslation();
  return (
    <Modal
      isVisible={isVisible}
      onClose={onClose}
      title={editing ? t("inventory.editCategory") : t("inventory.newCategory")}
      subtitle={t("inventory.categoryDialogHelp")}
      icon={<i className="fas fa-diagram-project"></i>}
      size="lg"
      footer={(
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>{t("common.close")}</button>
          <button type="button" className="btn btn-primary" disabled={!form.name.trim()} onClick={onSubmit}>{editing ? t("inventory.saveCategory") : t("inventory.createCategory")}</button>
        </>
      )}
    >
      <div className="row g-3">
        <div className="col-md-8">
          <label className="form-label">{t("inventory.categoryName")}</label>
          <input className="form-control" value={form.name} onChange={(event) => onChange("name", event.target.value)} />
        </div>
        <div className="col-md-2">
          <label className="form-label">{t("inventory.color")}</label>
          <input className="form-control form-control-color" type="color" value={form.color} onChange={(event) => onChange("color", event.target.value)} />
        </div>
        <div className="col-md-2">
          <label className="form-label">{t("inventory.order")}</label>
          <input className="form-control" type="number" min="0" value={form.sort_order} onChange={(event) => onChange("sort_order", Number(event.target.value))} />
        </div>
        <div className="col-12">
          <label className="form-label">{t("inventory.description")}</label>
          <textarea className="form-control" rows={3} value={form.description || ""} onChange={(event) => onChange("description", event.target.value)} />
        </div>
        <div className="col-12">
          <label className="form-label">{t("inventory.parentCategory")}</label>
          <select className="form-select" value={form.parent_id ?? ""} onChange={(event) => onChange("parent_id", event.target.value ? Number(event.target.value) : null)}>
            <option value="">{t("inventory.noParentCategory")}</option>
            {parentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      </div>
    </Modal>
  );
}

InventoryCategoryDialog.propTypes = {
  isVisible: PropTypes.bool.isRequired,
  form: PropTypes.object.isRequired,
  parentOptions: PropTypes.array.isRequired,
  onChange: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  editing: PropTypes.bool,
};
