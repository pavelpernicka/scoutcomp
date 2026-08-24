import React from "react";
import PropTypes from "prop-types";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import Card from "../../../components/Card";

export default function InventoryLoansScreen({ loanEntries, onOpenItem, onOpenReturnLoan }) {
  const { t } = useTranslation();
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
    <Card className="border-0 shadow-sm" title={t("inventory.loans")} icon={<i className="fas fa-handshake-angle"></i>}>
      <div className="inventory-searchbar-wrap mb-3">
        <i className="fas fa-magnifying-glass"></i>
        <input
          className="inventory-searchbar"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("inventory.loanSearchPlaceholder")}
        />
      </div>
      {filteredEntries.length === 0 ? (
        <div className="inventory-loans-empty">{t("inventory.noOpenLoans")}</div>
      ) : (
      <div className="table-responsive inventory-loans-table-wrap">
        <table className="table inventory-modern-table inventory-loans-table align-middle">
          <thead>
            <tr>
              <th>{t("inventory.item")}</th>
              <th>{t("inventory.borrower")}</th>
              <th>QR</th>
              <th>{t("inventory.quantity")}</th>
              <th className="text-end">{t("inventory.actions")}</th>
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
                      {t("inventory.return")}
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
