import React from "react";
import PropTypes from "prop-types";

import Modal from "../../../components/Modal";
import { getQrImageUrl } from "../helpers";

export default function InventoryItemDialog({
  isVisible,
  mode,
  item,
  form,
  categories,
  flags,
  locationTreeOptions,
  eventOptions,
  photoForm,
  loanForm,
  onChange,
  onPhotoChange,
  onLoanChange,
  onAddPhoto,
  onReturnLoan,
  onClose,
  onSubmit,
}) {
  return (
    <Modal
      isVisible={isVisible}
      onClose={onClose}
      title={mode === "create" ? "Nová skladová položka" : "Detail a úprava věci"}
      subtitle="Zachovej rychlé ovládání, ale nenech ve formuláři chaos."
      icon={<i className="fas fa-box-open"></i>}
      size="xl"
      footer={(
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Zavřít</button>
          <button type="button" className="btn btn-primary" onClick={onSubmit}>
            {mode === "create" ? "Vytvořit věc" : "Uložit změny"}
          </button>
        </>
      )}
    >
      <div className="row g-4">
        <div className="col-12 col-xl-8">
          <div className="row g-3">
            <div className="col-md-8">
              <label className="form-label">Název</label>
              <input className="form-control" value={form.name} onChange={(event) => onChange("name", event.target.value)} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Množství</label>
              <input className="form-control" type="number" min="0" value={form.quantity} onChange={(event) => onChange("quantity", Number(event.target.value))} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Jednotka</label>
              <input className="form-control" value={form.quantity_unit} onChange={(event) => onChange("quantity_unit", event.target.value)} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Kategorie</label>
              <select className="form-select" value={form.category} onChange={(event) => onChange("category", event.target.value)}>
                <option value="">Bez kategorie</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label">Příznak</label>
              <select className="form-select" value={form.flag_id || ""} onChange={(event) => onChange("flag_id", event.target.value ? Number(event.target.value) : null)}>
                <option value="">Bez příznaku</option>
                {flags.map((flag) => <option key={flag.id} value={flag.id}>{flag.name}</option>)}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label">Defaultní lokace</label>
              <select className="form-select" value={form.default_location} onChange={(event) => onChange("default_location", event.target.value)}>
                <option value="">Nevybráno</option>
                {locationTreeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="col-12">
              <label className="form-label">Aktuální umístění</label>
              <div className="inventory-chip-group">
                <button type="button" className={`inventory-chip ${form.current_location_mode === "location" ? "active" : ""}`} onClick={() => onChange("current_location_mode", "location")}>
                  <i className="fas fa-location-dot me-2"></i>Lokace
                </button>
                <button type="button" className={`inventory-chip ${form.current_location_mode === "event" ? "active" : ""}`} onClick={() => onChange("current_location_mode", "event")}>
                  <i className="fas fa-campground me-2"></i>Akce
                </button>
                <button type="button" className={`inventory-chip ${form.current_location_mode === "loan" ? "active" : ""}`} onClick={() => onChange("current_location_mode", "loan")}>
                  <i className="fas fa-handshake-angle me-2"></i>Výpůjčka
                </button>
              </div>
            </div>
            <div className="col-md-6">
              {form.current_location_mode === "location" ? (
                <>
                  <label className="form-label">Vybraná lokace</label>
                  <select className="form-select" value={form.current_location} onChange={(event) => onChange("current_location", event.target.value)}>
                    <option value="">Stejná jako defaultní</option>
                    {locationTreeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </>
              ) : null}
              {form.current_location_mode === "event" ? (
                <>
                  <label className="form-label">Přiřadit do akce</label>
                  <select className="form-select" value={form.current_event_id || ""} onChange={(event) => onChange("current_event_id", event.target.value ? Number(event.target.value) : null)}>
                    <option value="">Vyber akci</option>
                    {eventOptions.map((eventOption) => <option key={eventOption.id} value={eventOption.id}>{eventOption.name}</option>)}
                  </select>
                </>
              ) : null}
              {form.current_location_mode === "loan" ? (
                <>
                  <label className="form-label">Komu půjčit</label>
                  <input className="form-control" placeholder="Jméno člověka" value={loanForm.borrower_name} onChange={(event) => onLoanChange("borrower_name", event.target.value)} />
                </>
              ) : null}
            </div>
            <div className="col-md-6">
              {form.current_location_mode === "event" ? (
                <>
                  <label className="form-label">Počet kusů na akci</label>
                  <input className="form-control" type="number" min="1" value={form.current_event_quantity || 1} onChange={(event) => onChange("current_event_quantity", Number(event.target.value))} />
                </>
              ) : null}
              {form.current_location_mode === "loan" ? (
                <>
                  <label className="form-label">Počet kusů k výpůjčce</label>
                  <input className="form-control" type="number" min="1" value={loanForm.quantity} onChange={(event) => onLoanChange("quantity", Number(event.target.value))} />
                </>
              ) : null}
            </div>
            {form.current_location_mode === "loan" ? (
              <>
                <div className="col-md-6">
                  <label className="form-label">Vrátit do</label>
                  <input className="form-control" type="datetime-local" value={loanForm.due_at} onChange={(event) => onLoanChange("due_at", event.target.value)} />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Poznámka k výpůjčce</label>
                  <input className="form-control" placeholder="Volitelná poznámka" value={loanForm.note} onChange={(event) => onLoanChange("note", event.target.value)} />
                </div>
              </>
            ) : null}
            <div className="col-12">
              <div className="small text-muted">
                {form.current_location_mode === "location" ? "Věc zůstane fyzicky ve skladu nebo se přesune mezi stromovými lokacemi." : null}
                {form.current_location_mode === "event" ? "Po uložení se věc rovnou přiřadí do vybrané akce." : null}
                {form.current_location_mode === "loan" ? "Po uložení se rovnou založí výpůjčka a položka se bude v přehledu tvářit jako zapůjčená." : null}
              </div>
            </div>
            <div className="col-12">
              <label className="form-label">Popis</label>
              <textarea className="form-control" rows={3} value={form.description} onChange={(event) => onChange("description", event.target.value)} />
            </div>
            <div className="col-12">
              <label className="form-label">Poznámky</label>
              <textarea className="form-control" rows={3} value={form.notes} onChange={(event) => onChange("notes", event.target.value)} />
            </div>
          </div>
        </div>
        <div className="col-12 col-xl-4">
          <div className="inventory-dialog-sidecard">
            <div className="inventory-dialog-sidecard-label">QR identifikátor</div>
            <div className="inventory-dialog-sidecard-value">{item?.qr_identifier || "Vygeneruje se po vytvoření"}</div>
            {item?.qr_identifier ? (
              <img className="inventory-dialog-qr" src={getQrImageUrl(item.qr_identifier)} alt={item.qr_identifier} />
            ) : null}
          </div>
          <div className="inventory-dialog-sidecard mt-3">
            <div className="inventory-dialog-sidecard-label">Rychlá nápověda</div>
            <ul className="small text-muted mb-0 ps-3">
              <li>Příznak je vlastní barevný štítek pro rychlou orientaci.</li>
              <li>Dostupnost se počítá automaticky z výpůjček a akcí.</li>
              <li>Lokace se vybírá ze stromu, ne ručně.</li>
            </ul>
          </div>
        </div>
      </div>
      {item ? (
        <div className="row g-4 mt-1">
          <div className="col-12 col-xl-6">
            <h3 className="h5 mb-3">Fotky</h3>
            <div className="row g-2 mb-3">
              <div className="col-12 col-md-7">
                <input className="form-control" placeholder="URL fotky" value={photoForm.image_url} onChange={(event) => onPhotoChange("image_url", event.target.value)} />
              </div>
              <div className="col-12 col-md-5">
                <input className="form-control" placeholder="Popisek" value={photoForm.caption} onChange={(event) => onPhotoChange("caption", event.target.value)} />
              </div>
              <div className="col-12">
                <button type="button" className="btn btn-outline-primary" onClick={onAddPhoto}>Přidat fotku</button>
              </div>
            </div>
            <div className="inventory-photo-grid">
              {(item.photos || []).map((photo) => (
                <div key={photo.id} className="inventory-photo-card">
                  <img src={photo.image_url} alt={photo.caption || item.name} />
                  <div className="small mt-2">{photo.caption || "Bez popisku"}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="col-12 col-xl-6">
            <h3 className="h5 mb-3">Výpůjčky a vrácení</h3>
            <div className="inventory-activity-list">
              {(item.loans || []).map((loan) => (
                <div key={loan.id} className="inventory-activity-row">
                  <div>
                    <strong>{loan.borrower_name}</strong>
                    <div className="small text-muted">{loan.quantity} ks</div>
                  </div>
                  {loan.returned_at ? (
                    <span className="badge text-bg-success">Vráceno</span>
                  ) : (
                    <button type="button" className="btn btn-sm btn-success" onClick={() => onReturnLoan(loan.id)}>Vráceno</button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="col-12">
            <h3 className="h5 mb-3">Historie změn</h3>
            <div className="inventory-activity-list">
              {(item.history_entries || []).map((entry) => (
                <div key={entry.id} className="inventory-activity-row align-items-start">
                  <div>
                    <strong>{entry.action}</strong>
                    <div className="small text-muted">{new Date(entry.created_at).toLocaleString("cs-CZ")}</div>
                  </div>
                  {entry.payload ? <code className="small">{JSON.stringify(entry.payload)}</code> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

InventoryItemDialog.propTypes = {
  isVisible: PropTypes.bool.isRequired,
  mode: PropTypes.oneOf(["create", "edit"]).isRequired,
  item: PropTypes.object,
  form: PropTypes.object.isRequired,
  categories: PropTypes.array.isRequired,
  flags: PropTypes.array.isRequired,
  locationTreeOptions: PropTypes.array.isRequired,
  eventOptions: PropTypes.array.isRequired,
  photoForm: PropTypes.object.isRequired,
  loanForm: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  onPhotoChange: PropTypes.func.isRequired,
  onLoanChange: PropTypes.func.isRequired,
  onAddPhoto: PropTypes.func.isRequired,
  onReturnLoan: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
};
