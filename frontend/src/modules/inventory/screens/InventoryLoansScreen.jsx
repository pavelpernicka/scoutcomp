import React from "react";
import PropTypes from "prop-types";
import { useMemo, useState } from "react";

import Card from "../../../components/Card";

export default function InventoryLoansScreen({ loanEntries, onOpenItem, onOpenReturnLoan }) {
  const [search, setSearch] = useState("");
  const [scanValue, setScanValue] = useState("");

  const filteredEntries = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return loanEntries;
    return loanEntries.filter((entry) => (
      [entry.itemName, entry.borrower_name, entry.qrIdentifier]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    ));
  }, [loanEntries, search]);

  const handleScan = () => {
    const normalized = scanValue.trim().toLowerCase();
    if (!normalized) return;
    const match = loanEntries.find((entry) => String(entry.qrIdentifier || "").trim().toLowerCase() === normalized);
    if (match) {
      onOpenReturnLoan(match, match.item);
      setScanValue("");
    }
  };

  return (
    <Card className="border-0 shadow-lg" title="Zpětná inventura výpůjček" icon={<i className="fas fa-handshake-angle"></i>}>
      <div className="inventory-searchbar-wrap mb-3">
        <i className="fas fa-magnifying-glass"></i>
        <input
          className="inventory-searchbar"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Hledej podle názvu věci nebo QR kódu"
        />
      </div>
      <div className="d-flex gap-2 mb-4">
        <input
          className="form-control"
          value={scanValue}
          onChange={(event) => setScanValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleScan();
          }}
          placeholder="Naskenuj QR kód vypůjčené věci"
        />
        <button type="button" className="btn btn-outline-primary" onClick={handleScan}>
          <i className="fas fa-qrcode me-2"></i>Skenovat
        </button>
      </div>

      <div className="table-responsive">
        <table className="table inventory-modern-table align-middle">
          <thead>
            <tr>
              <th>Věc</th>
              <th>Komu</th>
              <th>QR</th>
              <th>Množství</th>
              <th className="text-end">Akce</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-5 text-muted">Teď není evidovaná žádná otevřená výpůjčka.</td>
              </tr>
            ) : (
              filteredEntries.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <button type="button" className="btn btn-link p-0 text-decoration-none fw-semibold" onClick={() => onOpenItem(entry.itemId)}>
                      {entry.itemName}
                    </button>
                  </td>
                  <td>{entry.borrower_name}</td>
                  <td className="text-muted">{entry.qrIdentifier || "—"}</td>
                  <td>{entry.quantity} {entry.quantityUnit}</td>
                  <td className="text-end">
                    <button type="button" className="btn btn-sm btn-outline-success" onClick={() => onOpenReturnLoan(entry, entry.item)}>
                      Vrátit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

InventoryLoansScreen.propTypes = {
  loanEntries: PropTypes.array.isRequired,
  onOpenItem: PropTypes.func.isRequired,
  onOpenReturnLoan: PropTypes.func.isRequired,
};
