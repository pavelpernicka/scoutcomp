import React from "react";
import PropTypes from "prop-types";

export default function InventoryScannerPanel({
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
    <section className="inventory-panel">
      <h2 className="h4 mb-3">QR režimy</h2>
      <div className="row g-3">
        <div className="col-12 col-xl-6">
          <div className="inventory-quick-card">
            <h3 className="h5">Otevřít detail věci</h3>
            <p className="text-muted mb-3">Použij skener nebo vlož QR identifikátor. Po odeslání se detail otevře bez dalšího klikání.</p>
            <div className="d-flex gap-2">
              <input className="form-control form-control-lg" value={scanValue} onChange={(event) => onScanValueChange(event.target.value)} placeholder="INV-..." />
              <button className="btn btn-primary btn-lg" type="button" onClick={onFindItem}>Najít</button>
            </div>
          </div>
        </div>
        <div className="col-12 col-xl-6">
          <div className="inventory-quick-card">
            <h3 className="h5">Zpětná inventura z akce</h3>
            <p className="text-muted mb-3">
              {activeEvent ? `Aktivní akce: ${activeEvent.event.name}` : "Vyber akci níže v panelu Akce a potom skenuj bez potvrzování jednotlivých kusů."}
            </p>
            <div className="d-flex gap-2">
              <input
                className="form-control form-control-lg"
                value={eventScanValue}
                onChange={(event) => onEventScanValueChange(event.target.value)}
                placeholder="INV-..."
                disabled={!activeEvent}
              />
              <button className="btn btn-success btn-lg" type="button" onClick={onScanReturn} disabled={!activeEvent}>Vrátit</button>
            </div>
            {scanFeedback ? <div className="alert alert-info mt-3 mb-0">{scanFeedback}</div> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

InventoryScannerPanel.propTypes = {
  scanValue: PropTypes.string.isRequired,
  onScanValueChange: PropTypes.func.isRequired,
  onFindItem: PropTypes.func.isRequired,
  eventScanValue: PropTypes.string.isRequired,
  onEventScanValueChange: PropTypes.func.isRequired,
  onScanReturn: PropTypes.func.isRequired,
  activeEvent: PropTypes.object,
  scanFeedback: PropTypes.string,
};
