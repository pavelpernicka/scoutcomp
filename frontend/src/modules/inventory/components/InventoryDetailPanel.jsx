import React from "react";
import PropTypes from "prop-types";

import { ITEM_STATUS_OPTIONS, getQrImageUrl } from "../helpers";

export default function InventoryDetailPanel({
  selectedItem,
  itemForm,
  onItemFormChange,
  onSaveItem,
  teams,
  photoForm,
  onPhotoFormChange,
  onAddPhoto,
  onDeletePhoto,
  loanForm,
  onLoanFormChange,
  onCreateLoan,
  onReturnLoan,
}) {
  if (!selectedItem) {
    return (
      <section className="inventory-panel">
        <h2 className="h4 mb-2">Detail věci</h2>
        <p className="text-muted mb-0">Vyber věc v tabulce nebo ji načti QR kódem.</p>
      </section>
    );
  }

  return (
    <section className="inventory-panel">
      <div className="d-flex flex-column flex-lg-row justify-content-between gap-3 mb-3">
        <div>
          <h2 className="h4 mb-1">{selectedItem.name}</h2>
          <div className="text-muted">{selectedItem.qr_identifier}</div>
        </div>
        <div className="inventory-qr-preview">
          <img src={getQrImageUrl(selectedItem.qr_identifier)} alt={selectedItem.qr_identifier} />
        </div>
      </div>

      <div className="row g-3">
        <div className="col-12 col-xl-8">
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Název</label>
              <input className="form-control" value={itemForm.name} onChange={(event) => onItemFormChange("name", event.target.value)} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Kategorie</label>
              <input className="form-control" value={itemForm.category} onChange={(event) => onItemFormChange("category", event.target.value)} />
            </div>
            <div className="col-12">
              <label className="form-label">Popis</label>
              <textarea className="form-control" rows={3} value={itemForm.description} onChange={(event) => onItemFormChange("description", event.target.value)} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Množství</label>
              <input className="form-control" type="number" min="0" value={itemForm.quantity} onChange={(event) => onItemFormChange("quantity", Number(event.target.value))} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Defaultní lokace</label>
              <input className="form-control" value={itemForm.default_location} onChange={(event) => onItemFormChange("default_location", event.target.value)} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Aktuální lokace</label>
              <input className="form-control" value={itemForm.current_location} onChange={(event) => onItemFormChange("current_location", event.target.value)} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Stav</label>
              <select className="form-select" value={itemForm.status} onChange={(event) => onItemFormChange("status", event.target.value)}>
                {ITEM_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label">Oddíl</label>
              <select className="form-select" value={itemForm.team_id} onChange={(event) => onItemFormChange("team_id", Number(event.target.value))}>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>
            <div className="col-12">
              <label className="form-label">Poznámky</label>
              <textarea className="form-control" rows={3} value={itemForm.notes} onChange={(event) => onItemFormChange("notes", event.target.value)} />
            </div>
          </div>
          <button className="btn btn-primary btn-lg mt-3" type="button" onClick={onSaveItem}>Uložit změny</button>
        </div>

        <div className="col-12 col-xl-4">
          <div className="inventory-meta-box">
            <div><strong>Dostupné:</strong> {selectedItem.available_quantity}</div>
            <div><strong>Vypůjčeno:</strong> {selectedItem.open_loan_quantity}</div>
            <div><strong>Na akci:</strong> {selectedItem.current_event_name || "Ne"}</div>
          </div>
        </div>
      </div>

      <div className="row g-3 mt-1">
        <div className="col-12 col-xl-6">
          <h3 className="h5">Fotky</h3>
          <div className="d-flex gap-2 mb-3">
            <input className="form-control" placeholder="URL fotky" value={photoForm.image_url} onChange={(event) => onPhotoFormChange("image_url", event.target.value)} />
            <input className="form-control" placeholder="Popisek" value={photoForm.caption} onChange={(event) => onPhotoFormChange("caption", event.target.value)} />
            <button className="btn btn-outline-primary" type="button" onClick={onAddPhoto}>Přidat</button>
          </div>
          <div className="inventory-photo-grid">
            {selectedItem.photos.map((photo) => (
              <div key={photo.id} className="inventory-photo-card">
                <img src={photo.image_url} alt={photo.caption || selectedItem.name} />
                <div className="d-flex justify-content-between align-items-center gap-2 mt-2">
                  <small>{photo.caption || "Bez popisku"}</small>
                  <button className="btn btn-sm btn-outline-danger" type="button" onClick={() => onDeletePhoto(photo.id)}>Smazat</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="col-12 col-xl-6">
          <h3 className="h5">Výpůjčky</h3>
          <div className="row g-2 mb-3">
            <div className="col-md-5">
              <input className="form-control" placeholder="Komu" value={loanForm.borrower_name} onChange={(event) => onLoanFormChange("borrower_name", event.target.value)} />
            </div>
            <div className="col-md-3">
              <input className="form-control" type="number" min="1" value={loanForm.quantity} onChange={(event) => onLoanFormChange("quantity", Number(event.target.value))} />
            </div>
            <div className="col-md-4">
              <input className="form-control" type="datetime-local" value={loanForm.due_at} onChange={(event) => onLoanFormChange("due_at", event.target.value)} />
            </div>
            <div className="col-12">
              <input className="form-control" placeholder="Poznámka" value={loanForm.note} onChange={(event) => onLoanFormChange("note", event.target.value)} />
            </div>
            <div className="col-12">
              <button className="btn btn-outline-primary" type="button" onClick={onCreateLoan}>Zapsat výpůjčku</button>
            </div>
          </div>
          <div className="list-group">
            {selectedItem.loans.map((loan) => (
              <div key={loan.id} className="list-group-item">
                <div className="d-flex justify-content-between gap-2">
                  <div>
                    <div className="fw-semibold">{loan.borrower_name}</div>
                    <div className="small text-muted">
                      {loan.quantity} ks • půjčeno {new Date(loan.borrowed_at).toLocaleString("cs-CZ")}
                      {loan.due_at ? ` • vrátit ${new Date(loan.due_at).toLocaleString("cs-CZ")}` : ""}
                    </div>
                  </div>
                  {!loan.returned_at ? (
                    <button className="btn btn-sm btn-success" type="button" onClick={() => onReturnLoan(loan.id)}>Vráceno</button>
                  ) : (
                    <span className="badge text-bg-success align-self-start">Uzavřeno</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <h3 className="h5">Historie změn</h3>
        <div className="list-group">
          {selectedItem.history_entries.map((entry) => (
            <div key={entry.id} className="list-group-item">
              <div className="fw-semibold">{entry.action}</div>
              <div className="small text-muted">{new Date(entry.created_at).toLocaleString("cs-CZ")}</div>
              {entry.payload ? <pre className="inventory-history-payload mb-0">{JSON.stringify(entry.payload, null, 2)}</pre> : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

InventoryDetailPanel.propTypes = {
  selectedItem: PropTypes.object,
  itemForm: PropTypes.object.isRequired,
  onItemFormChange: PropTypes.func.isRequired,
  onSaveItem: PropTypes.func.isRequired,
  teams: PropTypes.array.isRequired,
  photoForm: PropTypes.object.isRequired,
  onPhotoFormChange: PropTypes.func.isRequired,
  onAddPhoto: PropTypes.func.isRequired,
  onDeletePhoto: PropTypes.func.isRequired,
  loanForm: PropTypes.object.isRequired,
  onLoanFormChange: PropTypes.func.isRequired,
  onCreateLoan: PropTypes.func.isRequired,
  onReturnLoan: PropTypes.func.isRequired,
};
