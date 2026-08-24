import React from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

import Modal from "../../../components/Modal";

export default function InventoryLoanReturnDialog({
  isVisible,
  loan,
  item,
  form,
  onChange,
  onClose,
  onSubmit,
  onSubmitAndEdit,
}) {
  const { t } = useTranslation();
  return (
    <Modal
      isVisible={isVisible}
      onClose={onClose}
      title={t("inventory.returnLoan")}
      subtitle={item ? `${item.name} • ${loan?.borrower_name || ""}` : loan?.borrower_name || t("inventory.selectedLoan")}
      icon={<i className="fas fa-handshake-angle"></i>}
      size="lg"
      footer={(
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>{t("common.close")}</button>
          <button type="button" className="btn btn-outline-primary" onClick={onSubmitAndEdit}>{t("inventory.saveReturnAndEdit")}</button>
          <button type="button" className="btn btn-primary" onClick={onSubmit}>{t("inventory.saveReturn")}</button>
        </>
      )}
    >
      <div className="row g-3">
        <div className="col-md-6">
          <label className="form-label">{t("inventory.returnQuantity")}</label>
          <input className="form-control" type="number" value={loan?.quantity || 0} readOnly />
          {loan?.loans?.length > 1 && (
            <div className="small text-muted mt-1">{t("inventory.combinedLoans", { count: loan.loans.length })}</div>
          )}
        </div>
        <div className="col-md-6">
          <label className="form-label">{t("inventory.borrowedBy")}</label>
          <input className="form-control" value={loan?.borrower_name || ""} readOnly />
        </div>
        <div className="col-12">
          <label className="form-label">{t("inventory.note")}</label>
          <textarea className="form-control" rows={3} value={form.note} onChange={(event) => onChange("note", event.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

InventoryLoanReturnDialog.propTypes = {
  isVisible: PropTypes.bool.isRequired,
  loan: PropTypes.object,
  item: PropTypes.object,
  form: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onSubmitAndEdit: PropTypes.func.isRequired,
};
