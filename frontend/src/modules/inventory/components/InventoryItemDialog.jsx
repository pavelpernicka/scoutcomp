import React from "react";
import PropTypes from "prop-types";
import { useRef } from "react";

import Modal from "../../../components/Modal";
import { getItemCurrentLocation, getItemFlagBadge } from "../helpers";
import { parseServerDate } from "../../../utils/dateUtils";

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
  onUploadPhoto,
  onReturnLoan,
  onClose,
  onSubmit,
  onSaveSection,
  onOpenReturnEvent,
  onOpenLabelDialog,
}) {
  const fileInputRef = useRef(null);
  const editableFlags = flags.filter((flag) => !flag.is_system);
  const currentLocation = item ? getItemCurrentLocation(item) : { label: form.current_location || form.default_location || "Bez lokace", tone: "neutral" };
  const currentFlag = item ? getItemFlagBadge(item) : null;
  const currentPhoto = item?.photos?.[0]?.image_url || photoForm.image_url || "";
  const soldOutFlag = flags.find((flag) => flag.is_system && flag.name.trim().toLowerCase() === "došlo");
  const loanedQuantity = item?.open_loan_quantity || 0;
  const eventAssignments = item?.event_assignments || [];
  const eventQuantity = item?.active_event_quantity || 0;
  const selectedEventId = Number(form.current_event_id || 0);
  const selectedEventExistingQuantity = selectedEventId
    ? eventAssignments.reduce((total, assignment) => (
      assignment.event_id === selectedEventId
        ? total + Math.max((assignment.planned_quantity || 0) - (assignment.returned_quantity || 0), 0)
        : total
    ), 0)
    : 0;
  const displayEventQuantity = eventQuantity;
  const displayLoanQuantity = loanedQuantity;
  const baseAvailableQuantity = Math.max(0, Number(form.quantity || 0) - loanedQuantity - eventQuantity);
  const maxEventQuantity = Math.max(0, baseAvailableQuantity + selectedEventExistingQuantity);
  const maxLoanQuantity = Math.max(0, baseAvailableQuantity);
  const locationQuantity = baseAvailableQuantity;

  const switchLocationMode = (nextMode) => {
    onChange("current_location_mode", nextMode);
    if (nextMode === "event") {
      onChange("current_event_quantity", Math.max(1, maxEventQuantity || 1));
    }
    if (nextMode === "loan" && loanForm.quantity > Math.max(1, maxLoanQuantity || 1)) {
      onLoanChange("quantity", Math.max(1, maxLoanQuantity || 1));
    }
  };

  const handlePhotoPick = (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const imageUrl = String(reader.result || "");
      onPhotoChange("image_url", imageUrl);
      onUploadPhoto(imageUrl);
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const setQuantity = (nextValue) => {
    const safeValue = Math.max(0, Number(nextValue) || 0);
    onChange("quantity", safeValue);
    const nextBaseAvailableQuantity = Math.max(0, safeValue - loanedQuantity - eventQuantity);
    const nextMaxEventQuantity = Math.max(0, nextBaseAvailableQuantity + selectedEventExistingQuantity);
    const nextMaxLoanQuantity = Math.max(0, nextBaseAvailableQuantity);
    if (form.current_event_quantity > nextMaxEventQuantity) {
      onChange("current_event_quantity", Math.max(1, nextMaxEventQuantity || 1));
    }
    if (loanForm.quantity > nextMaxLoanQuantity) {
      onLoanChange("quantity", Math.max(1, nextMaxLoanQuantity || 1));
    }
    if (safeValue === 0) {
      if (soldOutFlag) onChange("flag_id", soldOutFlag.id);
      onChange("status", "missing");
      return;
    }
    if (soldOutFlag && Number(form.flag_id) === soldOutFlag.id) onChange("flag_id", null);
    onChange("status", "available");
  };

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
      <div className="inventory-item-dialog">
        <div className="inventory-item-hero">
          <button type="button" className="inventory-photo-placeholder" onClick={() => fileInputRef.current?.click()}>
            {currentPhoto ? <img src={currentPhoto} alt={form.name || "Fotka věci"} /> : <i className="fas fa-camera"></i>}
            <span>{currentPhoto ? "Změnit fotku" : "Nahrát fotku"}</span>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="d-none" onChange={handlePhotoPick} />

          <div className="inventory-item-hero-meta">
            {item ? (
              <>
                <div className="inventory-dialog-sidecard-label">QR identifikátor</div>
                <div className="inventory-dialog-sidecard-value mb-2">{item.qr_identifier}</div>
              </>
            ) : null}
            <h3>{form.name || "Nová věc"}</h3>
            <p>{form.description || "Bez popisu"}</p>
            <div className="inventory-chip-group">
              {form.category ? <span className="inventory-inline-badge">{form.category}</span> : null}
              {currentFlag ? <span className="inventory-inline-badge" style={currentFlag.style}>{currentFlag.label}</span> : null}
            </div>
            <div className="mt-3">
              <span className={`inventory-location-pill is-${currentLocation.tone}`}>{currentLocation.label}</span>
            </div>
          </div>
          {item ? (
            <div className="inventory-item-hero-qr">
              <button type="button" className="btn btn-outline-primary" onClick={onOpenLabelDialog}>
                <i className="fas fa-tags me-2"></i>Vygenerovat štítek
              </button>
            </div>
          ) : null}
        </div>

        <div className="inventory-item-sections">
          <section className="inventory-item-section">
            <h3 className="h5 mb-3">Množství a označení</h3>
            <div className="inventory-loan-stat-strip mb-3">
              <span className="inventory-inline-badge">Celkem {form.quantity} {form.quantity_unit}</span>
              <span className="inventory-inline-badge">Dostupné {baseAvailableQuantity} {form.quantity_unit}</span>
              <span className="inventory-inline-badge">Na akci {displayEventQuantity}</span>
              <span className="inventory-inline-badge">Zapůjčeno {displayLoanQuantity}</span>
            </div>
            <div className="inventory-item-quantity-row">
              <div className="inventory-stepper">
                <button type="button" className="btn btn-outline-secondary" onClick={() => setQuantity(form.quantity - 1)}>
                  <i className="fas fa-minus"></i>
                </button>
                <input className="form-control text-center" type="number" min="0" value={form.quantity} onChange={(event) => setQuantity(event.target.value)} />
                <button type="button" className="btn btn-outline-secondary" onClick={() => setQuantity(form.quantity + 1)}>
                  <i className="fas fa-plus"></i>
                </button>
              </div>
              <input className="form-control" value={form.quantity_unit} onChange={(event) => onChange("quantity_unit", event.target.value)} />
            </div>
            {form.quantity === 0 ? <div className="small text-danger mt-2">Množství je nula. Věc bude označena příznakem Došlo a jako nedostupná.</div> : null}
            <div className="row g-3 mt-1">
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
                  {editableFlags.map((flag) => <option key={flag.id} value={flag.id}>{flag.name}</option>)}
                </select>
              </div>
            </div>
            <div className="d-flex justify-content-end mt-3">
              <button type="button" className="btn btn-primary" onClick={() => onSaveSection("quantity")}>
                Uložit množství a označení
              </button>
            </div>
          </section>

          <section className="inventory-item-section">
            <h3 className="h5 mb-3">Umístění</h3>
            <div className="row g-3">
              <div className="col-12">
                <label className="form-label">Defaultní lokace</label>
                <select className="form-select" value={form.default_location} onChange={(event) => onChange("default_location", event.target.value)}>
                  <option value="">Nevybráno</option>
                  {locationTreeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="col-12">
                <label className="form-label">Typ umístění</label>
                <div className="inventory-chip-group inventory-location-tabs" role="tablist" aria-label="Typ umístění">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={form.current_location_mode === "location"}
                    className={`inventory-chip ${form.current_location_mode === "location" ? "active" : ""}`}
                    onClick={() => switchLocationMode("location")}
                  >
                    <i className="fas fa-location-dot me-2"></i>Lokace
                    <span className="badge rounded-pill text-bg-light ms-2">{locationQuantity}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={form.current_location_mode === "event"}
                    className={`inventory-chip ${form.current_location_mode === "event" ? "active" : ""}`}
                    onClick={() => switchLocationMode("event")}
                  >
                    <i className="fas fa-campground me-2"></i>Akce
                    <span className="badge rounded-pill text-bg-light ms-2">{displayEventQuantity}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={form.current_location_mode === "loan"}
                    className={`inventory-chip ${form.current_location_mode === "loan" ? "active" : ""}`}
                    onClick={() => switchLocationMode("loan")}
                  >
                    <i className="fas fa-handshake-angle me-2"></i>Výpůjčka
                    <span className="badge rounded-pill text-bg-light ms-2">{displayLoanQuantity}</span>
                  </button>
                </div>
              </div>

              {form.current_location_mode === "location" ? (
                <div className="col-12">
                  <div className="inventory-item-tabpanel">
                    {item?.event_assignments?.length ? (
                      <div className="inventory-activity-list mb-3">
                        {item.event_assignments.map((assignment) => (
                          <div key={assignment.id} className="inventory-activity-row">
                            <div>
                              <strong>{assignment.event_name || "Akce"}</strong>
                              <div className="small text-muted">{Math.max((assignment.planned_quantity || 0) - (assignment.returned_quantity || 0), 0)} {form.quantity_unit} na akci</div>
                            </div>
                            <button type="button" className="btn btn-sm btn-outline-success" onClick={() => onOpenReturnEvent(assignment)}>
                              Vrátit z akce
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {(item?.loans || []).some((loan) => !loan.returned_at) ? (
                      <div className="inventory-activity-list mb-3">
                        {(item.loans || []).filter((loan) => !loan.returned_at).map((loan) => (
                          <div key={loan.id} className="inventory-activity-row">
                            <div>
                              <strong>{loan.borrower_name}</strong>
                              <div className="small text-muted">{loan.quantity} {form.quantity_unit} zapůjčeno</div>
                            </div>
                            <button type="button" className="btn btn-sm btn-outline-success" onClick={() => onReturnLoan(loan.id)}>
                              Vráceno
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <label className="form-label">Vybraná lokace</label>
                    <select className="form-select" value={form.current_location} onChange={(event) => onChange("current_location", event.target.value)}>
                      <option value="">Stejná jako defaultní</option>
                      {locationTreeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <div className="small text-muted mt-1">
                      V lokaci je {locationQuantity} {form.quantity_unit} (zbytek po odečtení akcí a výpůjček)
                    </div>
                  </div>
                </div>
              ) : null}
              {form.current_location_mode === "event" ? (
                <div className="col-12">
                  <div className="inventory-item-tabpanel">
                    <div className="row g-3">
                      <div className="col-md-8">
                        <label className="form-label">Přiřadit do akce</label>
                        <select
                          className="form-select"
                          value={form.current_event_id || ""}
                          onChange={(event) => {
                            const nextEventId = event.target.value ? Number(event.target.value) : null;
                            const nextExistingQuantity = nextEventId
                              ? eventAssignments.reduce((total, assignment) => (
                                assignment.event_id === nextEventId
                                  ? total + Math.max((assignment.planned_quantity || 0) - (assignment.returned_quantity || 0), 0)
                                  : total
                              ), 0)
                              : 0;
                            const nextMax = Math.max(0, Math.max(0, Number(form.quantity || 0) - loanedQuantity - eventQuantity) + nextExistingQuantity);
                            onChange("current_event_id", nextEventId);
                            onChange("current_event_quantity", Math.max(1, Math.min(Number(form.current_event_quantity || 1), nextMax || 1)));
                          }}
                          disabled={maxEventQuantity <= 0}
                        >
                          <option value="">Vyber akci</option>
                          {eventOptions.map((eventOption) => <option key={eventOption.id} value={eventOption.id}>{eventOption.name}</option>)}
                        </select>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Počet kusů</label>
                        <input
                          className="form-control"
                          type="number"
                          min="1"
                          max={Math.max(1, maxEventQuantity || 1)}
                          value={form.current_event_quantity || 1}
                          disabled={maxEventQuantity <= 0}
                          onChange={(event) => onChange("current_event_quantity", Math.max(1, Math.min(Number(event.target.value) || 1, Math.max(1, maxEventQuantity || 1))))}
                        />
                      </div>
                      <div className="col-12 small text-muted">Na tuto akci lze průběžně dát maximálně {maxEventQuantity} z {form.quantity} {form.quantity_unit} po odečtení ostatních akcí a výpůjček.</div>
                      {item?.event_assignments?.length ? (
                        <div className="col-12">
                          <div className="inventory-activity-list">
                            {item.event_assignments.map((assignment) => (
                              <div key={assignment.id} className="inventory-activity-row">
                                <div>
                                  <strong>{assignment.event_name || "Akce"}</strong>
                                  <div className="small text-muted">{Math.max((assignment.planned_quantity || 0) - (assignment.returned_quantity || 0), 0)} {form.quantity_unit} na akci</div>
                                </div>
                                <button type="button" className="btn btn-sm btn-outline-success" onClick={() => onOpenReturnEvent(assignment)}>
                                  Vrátit z akce
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <div className="col-12 d-flex justify-content-end">
                        <button type="button" className="btn btn-primary" onClick={() => onSaveSection("location")} disabled={maxEventQuantity <= 0}>
                          Uložit umístění
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
              {form.current_location_mode === "loan" ? (
                <div className="col-12">
                  <div className="inventory-item-tabpanel">
                    <div className="row g-3">
                      <div className="col-md-6">
                        <label className="form-label">Komu půjčit</label>
                        <input className="form-control" placeholder="Jméno člověka" value={loanForm.borrower_name} onChange={(event) => onLoanChange("borrower_name", event.target.value)} disabled={maxLoanQuantity <= 0} />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">Počet kusů k výpůjčce</label>
                        <input
                          className="form-control"
                          type="number"
                          min="1"
                          max={Math.max(1, maxLoanQuantity || 1)}
                          value={loanForm.quantity}
                          disabled={maxLoanQuantity <= 0}
                          onChange={(event) => onLoanChange("quantity", Math.max(1, Math.min(Number(event.target.value) || 1, Math.max(1, maxLoanQuantity || 1))))}
                        />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">Vrátit do</label>
                        <input className="form-control" type="datetime-local" value={loanForm.due_at} onChange={(event) => onLoanChange("due_at", event.target.value)} />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">Poznámka k výpůjčce</label>
                        <input className="form-control" placeholder="Volitelná poznámka" value={loanForm.note} onChange={(event) => onLoanChange("note", event.target.value)} />
                      </div>
                      <div className="col-12">
                        <div className="small text-muted">K výpůjčce lze průběžně dát maximálně {maxLoanQuantity} z {form.quantity} {form.quantity_unit} po odečtení ostatních akcí a výpůjček. Po uložení se rovnou založí výpůjčka a položka se bude v přehledu tvářit jako zapůjčená.</div>
                      </div>
                      {(item?.loans || []).some((loan) => !loan.returned_at) ? (
                        <div className="col-12">
                          <div className="inventory-activity-list">
                            {(item?.loans || []).filter((loan) => !loan.returned_at).map((loan) => (
                              <div key={loan.id} className="inventory-activity-row">
                                <div>
                                  <strong>{loan.borrower_name}</strong>
                                  <div className="small text-muted">{loan.quantity} {form.quantity_unit} zapůjčeno</div>
                                </div>
                                <button type="button" className="btn btn-sm btn-outline-success" onClick={() => onReturnLoan(loan.id)}>
                                  Vráceno
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <div className="col-12 d-flex justify-content-end">
                        <button type="button" className="btn btn-primary" onClick={() => onSaveSection("location")} disabled={maxLoanQuantity <= 0}>
                          Uložit umístění
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
              {form.current_location_mode === "location" ? (
                <div className="col-12 d-flex justify-content-end">
                  <button type="button" className="btn btn-primary" onClick={() => onSaveSection("location")}>
                    Uložit umístění
                  </button>
                </div>
              ) : null}
            </div>
          </section>

          <section className="inventory-item-section">
            <h3 className="h5 mb-3">Název a popis</h3>
            <div className="row g-3">
              <div className="col-12">
                <label className="form-label">Název</label>
                <input className="form-control" value={form.name} onChange={(event) => onChange("name", event.target.value)} />
              </div>
              <div className="col-12">
                <label className="form-label">Popis</label>
                <textarea className="form-control" rows={4} value={form.description} onChange={(event) => onChange("description", event.target.value)} />
              </div>
            </div>
            <div className="d-flex justify-content-end mt-3">
              <button type="button" className="btn btn-primary" onClick={() => onSaveSection("identity")}>
                Uložit název a popis
              </button>
            </div>
          </section>

          {item ? (
            <details className="inventory-history-disclosure">
              <summary>Historie změn</summary>
              <div className="inventory-activity-list mt-3">
                {(item.history_entries || []).map((entry) => (
                  <div key={entry.id} className="inventory-activity-row align-items-start">
                    <div>
                      <strong>{entry.action}</strong>
                      <div className="small text-muted">{parseServerDate(entry.created_at).toLocaleString("cs-CZ")}</div>
                    </div>
                    {entry.payload ? <code className="small">{JSON.stringify(entry.payload)}</code> : null}
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </div>
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
  onUploadPhoto: PropTypes.func.isRequired,
  onReturnLoan: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onSaveSection: PropTypes.func.isRequired,
  onOpenReturnEvent: PropTypes.func.isRequired,
  onOpenLabelDialog: PropTypes.func.isRequired,
};
