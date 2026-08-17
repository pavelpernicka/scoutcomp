import React from "react";
import PropTypes from "prop-types";
import { useMemo, useState } from "react";

import Card from "../../../components/Card";

export default function InventoryLoansScreen({ loanEntries, onOpenItem, onOpenReturnLoan }) {
  const [search, setSearch] = useState("");

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

  return (
    <Card className="border-0 shadow-sm" title="Výpůjčky" icon={<i className="fas fa-handshake-angle"></i>}>
      <div className="inventory-searchbar-wrap mb-3">
        <i className="fas fa-magnifying-glass"></i>
        <input
          className="inventory-searchbar"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Hledej podle názvu věci nebo QR kódu"
        />
      </div>
      {filteredEntries.length === 0 ? (
        <div className="inventory-loans-empty">Teď není evidovaná žádná otevřená výpůjčka.</div>
      ) : (
      <div className="table-responsive inventory-loans-table-wrap">
        <table className="table inventory-modern-table inventory-loans-table align-middle">
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
            {filteredEntries.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <button type="button" className="btn btn-link p-0 text-decoration-none fw-semibold" onClick={() => onOpenItem(entry.itemId)}>
                      {entry.itemName}
                    </button>
                  </td>
                  <td>{entry.borrower_name}<span className="inventory-loans-quantity-mobile">{entry.quantity} {entry.quantityUnit}</span></td>
                  <td className="text-muted">{entry.qrIdentifier || "—"}</td>
                  <td>{entry.quantity} {entry.quantityUnit}</td>
                  <td className="text-end">
                    <button type="button" className="btn btn-sm btn-outline-success" onClick={() => onOpenReturnLoan(entry, entry.item)}>
                      Vrátit
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      )}
    </Card>
  );
}

InventoryLoansScreen.propTypes = {
  loanEntries: PropTypes.array.isRequired,
  onOpenItem: PropTypes.func.isRequired,
  onOpenReturnLoan: PropTypes.func.isRequired,
};
