import React, { useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

import Modal from "../../../components/Modal";
import ModalFooterStatus from "../../../components/ModalFooterStatus";
import { getItemCurrentLocation, getItemFlagBadge } from "../helpers";
import { parseServerDate } from "../../../utils/dateUtils";

const normalizeBorrower = (name) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase("cs");

function buildLoanGroups(loans, unknownBorrower) {
  const groups = new Map();
  loans.filter((loan) => !loan.returned_at).forEach((loan) => {
    const key = normalizeBorrower(loan.borrower_name || "") || "unknown";
    const current = groups.get(key) || {
      name: loan.borrower_name?.trim() || unknownBorrower,
      loans: [],
      openQuantity: 0,
      earliestDueAt: null,
    };
    current.loans.push(loan);
    current.openQuantity += loan.quantity;
    if (loan.due_at && (!current.earliestDueAt || loan.due_at < current.earliestDueAt)) {
      current.earliestDueAt = loan.due_at;
    }
    groups.set(key, current);
  });
  return [...groups.values()].sort((left, right) => left.name.localeCompare(right.name, "cs"));
}

async function shrinkImage(file, t) {
  if (!file.type.startsWith("image/")) throw new Error(t("inventory.chooseImageFile"));
  const source = await new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(t("inventory.imageLoadError"))); };
    image.src = url;
  });
  const maxSide = 1600;
  const ratio = Math.min(1, maxSide / Math.max(source.naturalWidth, source.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(source.naturalHeight * ratio));
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export default function InventoryItemDialog({
  isVisible,
  mode,
  item,
  form,
  categories,
  flags,
  sets,
  locationTreeOptions,
  saveError,
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
  onOpenLabelDialog,
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "cs" ? "cs-CZ" : "en-US";
  const fileInputRef = useRef(null);
  const borrowerInputRef = useRef(null);
  const [loanFormVisible, setLoanFormVisible] = useState(false);
  const [photoPreviewVisible, setPhotoPreviewVisible] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const loanGroups = useMemo(() => buildLoanGroups(item?.loans || [], t("inventory.notSpecified")), [item?.loans, t]);
  const returnedLoans = useMemo(
    () => (item?.loans || []).filter((loan) => loan.returned_at).sort((left, right) => new Date(right.returned_at) - new Date(left.returned_at)).slice(0, 5),
    [item?.loans]
  );
  const editableFlags = flags.filter((flag) => !flag.is_system);
  const availableSets = sets;
  const currentLocation = item
    ? getItemCurrentLocation(item)
    : { label: form.current_location || form.default_location || t("inventory.noLocation"), tone: "neutral" };
  const currentFlag = item ? getItemFlagBadge(item) : null;
  const currentFlagLabel = currentFlag?.labelKey ? t(currentFlag.labelKey, currentFlag.labelOptions) : currentFlag?.label;
  const currentLocationLabel = currentLocation.labelKey ? t(currentLocation.labelKey, currentLocation.labelOptions) : currentLocation.label;
  const currentPhoto = photoForm.image_url || item?.photos?.[0]?.image_url || "";
  const availableQuantity = item?.available_quantity ?? form.quantity;
  const openLoanQuantity = item?.open_loan_quantity ?? 0;
  const locationEntries = form.locations?.length ? form.locations : (item?.locations || []).map((location) => ({ location: location.location, quantity: location.quantity }));
  const physicalQuantity = locationEntries.reduce((sum, location) => sum + (Number(location.quantity) || 0), 0);
  const availableLocationOptions = locationEntries.filter((entry) => Number(entry.quantity) > 0);
  const scopedLocationOptions = useMemo(() => {
    const knownLocations = new Set(locationTreeOptions.map((option) => option.value));
    const missingCurrentLocations = locationEntries
      .filter((entry) => entry.location && !knownLocations.has(entry.location))
      .map((entry) => ({ id: `legacy-${entry.location}`, value: entry.location, label: `${entry.location} (mimo strom)` }));
    return [...locationTreeOptions, ...missingCurrentLocations];
  }, [locationEntries, locationTreeOptions]);

  const updateLocationEntry = (index, field, value) => {
    onChange("locations", locationEntries.map((entry, entryIndex) => entryIndex === index ? { ...entry, [field]: value } : entry));
  };

  useEffect(() => setLoanFormVisible(false), [item?.id, isVisible]);
  useEffect(() => {
    if (loanFormVisible) borrowerInputRef.current?.focus();
  }, [loanFormVisible]);

  const handlePhotoPick = async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    try {
      const imageUrl = await shrinkImage(file, t);
      onPhotoChange("image_url", imageUrl);
      onUploadPhoto(imageUrl);
      setPhotoError("");
    } catch (error) {
      setPhotoError(error.message || t("inventory.imagePrepareError"));
    }
    event.target.value = "";
  };

  return (
    <Modal
      isVisible={isVisible}
      onClose={onClose}
      title={mode === "create" ? t("inventory.newInventoryItem") : t("inventory.itemDetail")}
      subtitle={t("inventory.itemDialogHelp")}
      icon={<i className="fas fa-box-open" />}
      size="xl"
      footer={(
        <>
          {saveError || photoError ? (
            <ModalFooterStatus>
              {saveError ? <p>{saveError}</p> : null}
              {photoError ? <p>{photoError}</p> : null}
            </ModalFooterStatus>
          ) : null}
          <div className="app-modal-footer-actions">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>{t("common.close")}</button>
            <button type="button" className="btn btn-primary" onClick={onSubmit}>
              {mode === "create" ? t("inventory.createItem") : t("inventory.saveChanges")}
            </button>
          </div>
        </>
      )}
    >
      <div className="inventory-item-dialog">
        <header className="inventory-item-hero">
          <div className="inventory-photo-controls">
            <button type="button" className="inventory-photo-placeholder" onClick={() => currentPhoto ? setPhotoPreviewVisible(true) : fileInputRef.current?.click()}>
              {currentPhoto ? <img src={currentPhoto} alt={form.name || t("inventory.itemPhoto")} /> : <i className="fas fa-camera" />}
              <span className="inventory-photo-placeholder-label">{currentPhoto ? t("inventory.openPhoto") : t("inventory.uploadPhoto")}</span>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="d-none" onChange={handlePhotoPick} />
            {currentPhoto ? <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => fileInputRef.current?.click()}><i className="fas fa-image me-1" />{t("inventory.changePhoto")}</button> : null}
          </div>
          <div className="inventory-item-hero-meta">
            {item ? <div className="inventory-dialog-sidecard-label">{item.qr_identifier}</div> : null}
            <h3>{form.name || t("inventory.newItem")}</h3>
            <div className="inventory-chip-group">
              {form.category ? <span className="inventory-inline-badge">{form.category}</span> : null}
              {currentFlag ? <span className="inventory-inline-badge" style={currentFlag.style}>{currentFlagLabel}</span> : null}
              <span className={`inventory-location-pill is-${currentLocation.tone}`}>{currentLocationLabel}</span>
            </div>
          </div>
          {item ? (
            <button type="button" className="btn btn-outline-primary ms-auto align-self-start" onClick={onOpenLabelDialog}>
              <i className="fas fa-tags me-2" />{t("inventory.label")}
            </button>
          ) : null}
        </header>

        <div className="inventory-item-sections">
          <section className="inventory-item-section">
            <h3 className="h5 mb-3">{t("inventory.basicInformation")}</h3>
            <div className="row g-3">
              <div className="col-md-8"><label className="form-label">{t("inventory.name")}</label><input className="form-control" value={form.name} onChange={(event) => onChange("name", event.target.value)} required /></div>
              <div className="col-md-4"><label className="form-label">{t("inventory.quantity")}</label><input className="form-control" type="number" min={openLoanQuantity} value={form.quantity} onChange={(event) => { const quantity = Math.max(openLoanQuantity, Number(event.target.value) || 0); onChange("quantity", quantity); if (locationEntries.length === 1) onChange("locations", [{ ...locationEntries[0], quantity: quantity - openLoanQuantity }]); }} /><div className="form-text">{t("inventory.cannotReduceBelowLoaned", { count: openLoanQuantity, unit: form.quantity_unit })}</div></div>
              <div className="col-md-4"><label className="form-label">{t("inventory.unit")}</label><input className="form-control" value={form.quantity_unit} onChange={(event) => onChange("quantity_unit", event.target.value)} /></div>
              <div className="col-md-4"><label className="form-label">{t("inventory.category")}</label><select className="form-select" value={form.category || ""} onChange={(event) => onChange("category", event.target.value)}><option value="">{t("inventory.noCategory")}</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></div>
              <div className="col-md-4"><label className="form-label">{t("inventory.flag")}</label><select className="form-select" value={form.flag_id || ""} onChange={(event) => onChange("flag_id", event.target.value ? Number(event.target.value) : null)}><option value="">{t("inventory.noFlag")}</option>{editableFlags.map((flag) => <option key={flag.id} value={flag.id}>{flag.name}</option>)}</select></div>
              <div className="col-md-4"><label className="form-label">{t("inventory.equipmentSet")}</label><select className="form-select" value={form.set_id || ""} onChange={(event) => onChange("set_id", event.target.value ? Number(event.target.value) : null)}><option value="">{t("inventory.outsideSet")}</option>{availableSets.map((inventorySet) => <option key={inventorySet.id} value={inventorySet.id}>{inventorySet.name}</option>)}</select></div>
              <div className="col-12"><label className="form-label">{t("inventory.description")}</label><textarea className="form-control" rows="3" value={form.description || ""} onChange={(event) => onChange("description", event.target.value)} /></div>
            </div>
          </section>

          <section className="inventory-item-section">
            <div className="d-flex justify-content-between align-items-center gap-3 mb-3"><h3 className="h5 mb-0">{t("inventory.locationAndQuantity")}</h3></div>
            <div className="inventory-quantity-overview mb-3"><div><span>{t("inventory.total")}</span><strong>{form.quantity} {form.quantity_unit}</strong></div><div><span>{t("inventory.inLocations")}</span><strong>{physicalQuantity} {form.quantity_unit}</strong><small>{t("inventory.locationsCount", { count: locationEntries.length || 0 })}</small></div><div><span>{t("inventory.loaned")}</span><strong>{openLoanQuantity} {form.quantity_unit}</strong><small>{loanGroups.length ? t("inventory.activeLoans", { count: loanGroups.length }) : t("inventory.noLoans")}</small></div></div>
            <div className="inventory-location-allocations">{locationEntries.map((entry, index) => <div key={`${entry.location}-${index}`} className="inventory-location-allocation"><select className="form-select" value={entry.location} onChange={(event) => updateLocationEntry(index, "location", event.target.value)}><option value="">{t("inventory.chooseLocation")}</option>{scopedLocationOptions.map((option) => <option key={option.id} value={option.value}>{option.label}</option>)}</select><div className="input-group"><input className="form-control" aria-label={t("inventory.quantityAtLocation", { index: index + 1 })} type="number" min="0" value={entry.quantity} onChange={(event) => updateLocationEntry(index, "quantity", Math.max(0, Number(event.target.value) || 0))} /><span className="input-group-text">{form.quantity_unit}</span></div><button type="button" className="btn btn-outline-danger" aria-label={t("inventory.removeLocation")} disabled={locationEntries.length === 1} onClick={() => onChange("locations", locationEntries.filter((_, entryIndex) => entryIndex !== index))}><i className="fas fa-trash" /></button></div>)}</div>
            <div className="d-flex justify-content-between align-items-center mt-2"><button type="button" className="btn btn-sm btn-outline-primary" onClick={() => onChange("locations", [...locationEntries, { location: "", quantity: 0 }])}><i className="fas fa-plus me-1" />{t("inventory.addLocation")}</button><span className={physicalQuantity === form.quantity - openLoanQuantity ? "small text-success" : "small text-danger"}>{t("inventory.locationSum", { physical: physicalQuantity, expected: form.quantity - openLoanQuantity, unit: form.quantity_unit })}</span></div>
          </section>

          <section className="inventory-item-section">
            <div className="d-flex justify-content-between align-items-center gap-3 mb-3"><h3 className="h5 mb-0">{t("inventory.loans")}</h3>{!loanFormVisible ? <button type="button" className="btn btn-primary" disabled={availableQuantity < 1} onClick={() => setLoanFormVisible(true)}><i className="fas fa-handshake-angle me-2" />{t("inventory.lend")}</button> : null}</div>
            {loanFormVisible ? <div className="inventory-loan-form row g-2 align-items-end mb-3">
              <div className="col-md-4"><label className="form-label" htmlFor="inventory-loan-borrower">{t("inventory.borrower")}</label><input id="inventory-loan-borrower" ref={borrowerInputRef} className="form-control" value={loanForm.borrower_name} onChange={(event) => onLoanChange("borrower_name", event.target.value)} /></div>
              <div className="col-md-2"><label className="form-label">{t("inventory.fromLocationLabel")}</label><select className="form-select" value={loanForm.location || availableLocationOptions[0]?.location || ""} onChange={(event) => onLoanChange("location", event.target.value)}><option value="">{t("inventory.chooseLocation")}</option>{availableLocationOptions.map((entry) => <option key={entry.location} value={entry.location}>{entry.location} ({entry.quantity} {form.quantity_unit})</option>)}</select></div>
              <div className="col-md-2"><label className="form-label">{t("inventory.count")}</label><input className="form-control" type="number" min="1" max={Math.max(1, availableLocationOptions.find((entry) => entry.location === (loanForm.location || availableLocationOptions[0]?.location))?.quantity || 0)} value={loanForm.quantity} onChange={(event) => onLoanChange("quantity", Math.max(1, Number(event.target.value) || 1))} /></div>
              <div className="col-md-2"><label className="form-label">{t("inventory.dueAt")}</label><input className="form-control" type="datetime-local" value={loanForm.due_at} onChange={(event) => onLoanChange("due_at", event.target.value)} /></div>
              <div className="col-md-2"><div className="inventory-loan-form-actions"><button type="button" className="btn btn-primary flex-grow-1" disabled={!loanForm.borrower_name.trim() || !availableLocationOptions.length} onClick={() => onSaveSection("loan")}>{t("inventory.lend")}</button><button type="button" className="btn btn-outline-secondary" onClick={() => setLoanFormVisible(false)} aria-label={t("inventory.cancelLoan")}><i className="fas fa-xmark" /></button></div></div>
              <div className="col-12"><input className="form-control" placeholder={t("inventory.loanNote")} value={loanForm.note} onChange={(event) => onLoanChange("note", event.target.value)} /></div>
            </div> : null}
            <div className="inventory-loan-groups">
              {loanGroups.length === 0 ? <p className="text-muted mb-0">{t("inventory.noLoansYet")}</p> : loanGroups.map((group) => {
                const overdue = group.earliestDueAt && parseServerDate(group.earliestDueAt).getTime() < Date.now();
                return <details key={group.name} className="inventory-loan-group" open={group.openQuantity > 0}>
                  <summary><span className="fw-semibold">{group.name}</span><span className="text-muted">{group.openQuantity} {form.quantity_unit} · {t("inventory.loanRecords", { count: group.loans.length })}</span>{overdue ? <span className="badge text-bg-danger">{t("inventory.overdue")}</span> : null}</summary>
                  <div className="inventory-loan-group-items">{group.loans.map((loan) => <div key={loan.id} className="inventory-activity-row"><div><strong>{loan.quantity} {form.quantity_unit}</strong><div className="small text-muted">{loan.source_location ? `${t("inventory.fromLocation", { location: loan.source_location })} · ` : ""}{t("inventory.borrowedAt", { date: parseServerDate(loan.borrowed_at).toLocaleString(locale) })}{loan.due_at ? ` · ${t("inventory.returnBy", { date: parseServerDate(loan.due_at).toLocaleString(locale) })}` : ""}{loan.note ? ` · ${loan.note}` : ""}</div></div><button type="button" className="btn btn-sm btn-success" onClick={() => onReturnLoan(loan.id)}>{t("inventory.return")}</button></div>)}</div>
                </details>;
              })}
            </div>
            {returnedLoans.length ? <div className="inventory-return-history"><div className="small text-uppercase fw-semibold">{t("inventory.recentReturns")}</div>{returnedLoans.map((loan) => <div key={loan.id}><span>{loan.borrower_name} · {loan.quantity} {form.quantity_unit}</span><small>{t("inventory.returnedAt", { date: parseServerDate(loan.returned_at).toLocaleString(locale) })}</small></div>)}</div> : null}
          </section>
        </div>
      </div>
      <Modal isVisible={photoPreviewVisible} onClose={() => setPhotoPreviewVisible(false)} title={form.name || t("inventory.itemPhoto")} size="xl"><img className="img-fluid w-100" src={currentPhoto} alt={form.name || t("inventory.itemPhoto")} /></Modal>
    </Modal>
  );
}

InventoryItemDialog.propTypes = {
  isVisible: PropTypes.bool.isRequired, mode: PropTypes.string.isRequired, item: PropTypes.object, form: PropTypes.object.isRequired,
  categories: PropTypes.array.isRequired, flags: PropTypes.array.isRequired, sets: PropTypes.array.isRequired, locationTreeOptions: PropTypes.array.isRequired, saveError: PropTypes.string,
  photoForm: PropTypes.object.isRequired, loanForm: PropTypes.object.isRequired, onChange: PropTypes.func.isRequired,
  onPhotoChange: PropTypes.func.isRequired, onLoanChange: PropTypes.func.isRequired, onUploadPhoto: PropTypes.func.isRequired,
  onReturnLoan: PropTypes.func.isRequired, onClose: PropTypes.func.isRequired, onSubmit: PropTypes.func.isRequired,
  onSaveSection: PropTypes.func.isRequired, onOpenLabelDialog: PropTypes.func.isRequired,
};
