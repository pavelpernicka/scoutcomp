import React from "react";
import PropTypes from "prop-types";

export default function InventoryScannerScreen({
  scanValue,
  onScanValueChange,
  onFindItem,
  eventScanValue,
  onEventScanValueChange,
  onScanReturn,
  activeEvent,
  scanFeedback,
}) {
  return (
    <div className="row g-4">
      <div className="col-12">
        <div className="inventory-scanner-hero">
          <div>
            <div className="inventory-hero-eyebrow">Rychlý provoz</div>
            <h1>QR skener</h1>
            <p>Jedna obrazovka pro otevření detailu i pro rychlou návratovou inventuru z akce.</p>
          </div>
        </div>
      </div>
      <div className="col-12 col-xl-6">
        <div className="inventory-scan-card">
          <div className="inventory-scan-card-icon"><i className="fas fa-box-open"></i></div>
          <h2>Otevřít detail věci</h2>
          <p>Zadej nebo naskenuj QR identifikátor a detail věci se otevře bez dalšího potvrzování.</p>
          <div className="d-flex gap-2">
            <input className="form-control form-control-lg" value={scanValue} onChange={(event) => onScanValueChange(event.target.value)} placeholder="INV-..." />
            <button type="button" className="btn btn-primary btn-lg" onClick={onFindItem}>Otevřít</button>
          </div>
        </div>
      </div>
      <div className="col-12 col-xl-6">
        <div className="inventory-scan-card secondary">
          <div className="inventory-scan-card-icon"><i className="fas fa-rotate-left"></i></div>
          <h2>Zpětná inventura z akce</h2>
          <p>{activeEvent ? `Aktivní akce: ${activeEvent.event.name}` : "Vyber aktivní akci na obrazovce Akce."}</p>
          <div className="d-flex gap-2">
            <input className="form-control form-control-lg" value={eventScanValue} onChange={(event) => onEventScanValueChange(event.target.value)} placeholder="INV-..." disabled={!activeEvent} />
            <button type="button" className="btn btn-success btn-lg" onClick={onScanReturn} disabled={!activeEvent}>Vrátit</button>
          </div>
          {scanFeedback ? <div className="alert alert-light mt-3 mb-0">{scanFeedback}</div> : null}
        </div>
      </div>
    </div>
  );
}

InventoryScannerScreen.propTypes = {
  scanValue: PropTypes.string.isRequired,
  onScanValueChange: PropTypes.func.isRequired,
  onFindItem: PropTypes.func.isRequired,
  eventScanValue: PropTypes.string.isRequired,
  onEventScanValueChange: PropTypes.func.isRequired,
  onScanReturn: PropTypes.func.isRequired,
  activeEvent: PropTypes.object,
  scanFeedback: PropTypes.string,
};
