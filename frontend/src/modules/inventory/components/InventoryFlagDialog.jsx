import React from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

import Modal from "../../../components/Modal";
const DEFAULT_FLAG_COLOR = "#526174";

function colorPickerValue(color) {
  return /^#[0-9a-f]{6}$/i.test(color || "") ? color : DEFAULT_FLAG_COLOR;
}

export default function InventoryFlagDialog({
  isVisible,
  form,
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
      title={editing ? t("inventory.editFlag") : t("inventory.newFlag")}
      subtitle={t("inventory.flagDialogHelp")}
      icon={<i className="fas fa-palette"></i>}
      size="sm"
      footer={(
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>{t("common.close")}</button>
          <button type="button" className="btn btn-primary" disabled={!form.name.trim()} onClick={onSubmit}>{editing ? t("inventory.saveFlag") : t("inventory.createFlag")}</button>
        </>
      )}
    >
      <div className="row g-3">
        <div className="col-md-8">
          <label className="form-label">{t("inventory.flagName")}</label>
          <input className="form-control" value={form.name} onChange={(event) => onChange("name", event.target.value)} />
        </div>
        <div className="col-md-4">
          <label className="form-label">{t("inventory.color")}</label>
          <input className="form-control form-control-color" type="color" value={colorPickerValue(form.color)} onChange={(event) => onChange("color", event.target.value)} title={t("inventory.chooseFlagColor")} />
        </div>
        <div className="col-12">
          <label className="form-label">{t("inventory.description")}</label>
          <textarea className="form-control" rows={3} value={form.description || ""} onChange={(event) => onChange("description", event.target.value)} />
        </div>
        <div className="col-12">
          <label className="form-label">{t("inventory.order")}</label>
          <input className="form-control" type="number" min="0" value={form.sort_order} onChange={(event) => onChange("sort_order", Number(event.target.value))} />
        </div>
      </div>
    </Modal>
  );
}

InventoryFlagDialog.propTypes = {
  isVisible: PropTypes.bool.isRequired,
  form: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  editing: PropTypes.bool,
};
