import React from "react";
import PropTypes from "prop-types";

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
  return (
    <Modal
      isVisible={isVisible}
      onClose={onClose}
      title="Vrácení výpůjčky"
      subtitle={item ? `${item.name} • ${loan?.borrower_name || ""}` : loan?.borrower_name || "Vybraná výpůjčka"}
      icon={<i className="fas fa-handshake-angle"></i>}
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
          <input className="form-control" type="number" value={loan?.quantity || 0} readOnly />
          {loan?.loans?.length > 1 && (
            <div className="small text-muted mt-1">Kombinace {loan.loans.length} výpůjček</div>
          )}
        </div>
        <div className="col-md-6">
          <label className="form-label">Komu půjčeno</label>
          <input className="form-control" value={loan?.borrower_name || ""} readOnly />
        </div>
        <div className="col-12">
          <label className="form-label">Poznámka</label>
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
