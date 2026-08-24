import React from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

import InventoryQrScanner from "../components/InventoryQrScanner";

export default function InventoryScannerScreen({ scanValue, onScanValueChange, onFindItem, scanFeedback }) {
  const { t } = useTranslation();
  const submit = () => onFindItem(scanValue);
  return (
    <section className="inventory-scanner-workspace">
      <header className="inventory-scanner-hero">
        <div><div className="inventory-hero-eyebrow">{t("inventory.quickOperation")}</div><h1>{t("inventory.qrScanner")}</h1><p>{t("inventory.scannerDescription")}</p></div>
      </header>
      <div className="inventory-scanner-grid">
        <InventoryQrScanner onDetected={onFindItem} />
        <aside className="inventory-scan-manual" aria-labelledby="inventory-manual-title">
          <h2 id="inventory-manual-title">{t("inventory.manualScanner")}</h2>
          <p>{t("inventory.manualScannerHelp")}</p>
          <label className="form-label" htmlFor="inventory-qr-input">{t("inventory.qrIdentifier")}</label>
          <div className="input-group input-group-lg">
            <input id="inventory-qr-input" className="form-control" value={scanValue} onChange={(event) => onScanValueChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submit(); }} placeholder="INV-…" autoComplete="off" />
            <button type="button" className="btn btn-primary" onClick={submit}>{t("inventory.open")}</button>
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
