import React from "react";
import PropTypes from "prop-types";

import InventoryQrScanner from "../components/InventoryQrScanner";

export default function InventoryScannerScreen({ scanValue, onScanValueChange, onFindItem, scanFeedback }) {
  const submit = () => onFindItem(scanValue);
  return (
    <section className="inventory-scanner-workspace">
      <header className="inventory-scanner-hero">
        <div><div className="inventory-hero-eyebrow">Rychlý provoz</div><h1>QR skener</h1><p>Načti kód kamerou, externí čtečkou nebo jej vlož ručně. Po nalezení se rovnou otevře detail věci.</p></div>
      </header>
      <div className="inventory-scanner-grid">
        <InventoryQrScanner onDetected={onFindItem} />
        <aside className="inventory-scan-manual" aria-labelledby="inventory-manual-title">
          <h2 id="inventory-manual-title">Ruční nebo externí čtečka</h2>
          <p>Kurzor ponech v poli a čtečka kód vyplní automaticky.</p>
          <label className="form-label" htmlFor="inventory-qr-input">QR identifikátor</label>
          <div className="input-group input-group-lg">
            <input id="inventory-qr-input" className="form-control" value={scanValue} onChange={(event) => onScanValueChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submit(); }} placeholder="INV-…" autoComplete="off" />
            <button type="button" className="btn btn-primary" onClick={submit}>Otevřít</button>
          </div>
          {scanFeedback ? <div className="alert alert-light border mt-3 mb-0" role="status">{scanFeedback}</div> : null}
        </aside>
      </div>
    </section>
  );
}

InventoryScannerScreen.propTypes = {
  scanValue: PropTypes.string.isRequired,
  onScanValueChange: PropTypes.func.isRequired,
  onFindItem: PropTypes.func.isRequired,
  scanFeedback: PropTypes.string,
};
