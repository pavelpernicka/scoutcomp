import React from "react";
import PropTypes from "prop-types";

import Card from "../../../components/Card";

export default function InventoryLoansScreen({ loanGroups, onOpenItem, onReturnLoan }) {
  return (
    <div className="row g-4">
      <div className="col-12">
        <Card className="border-0 shadow-lg" title="Aktivní výpůjčky" icon={<i className="fas fa-handshake-angle"></i>}>
          <div className="inventory-loan-groups">
            {loanGroups.length === 0 ? (
              <div className="text-muted">Teď není evidovaná žádná otevřená výpůjčka.</div>
            ) : (
              loanGroups.map((group) => (
                <section key={group.borrowerName} className="inventory-loan-group-card">
                  <div className="inventory-loan-group-head">
                    <div>
                      <h3>{group.borrowerName}</h3>
                      <div className="small text-muted">Aktivní výpůjčky: {group.openLoanCount}</div>
                    </div>
                    <div className="inventory-loan-stat-strip">
                      <span className="inventory-inline-badge">{group.openQuantity} jednotek celkem</span>
                      {group.overdueCount > 0 ? <span className="inventory-inline-badge is-warning">{group.overdueCount} po termínu</span> : null}
                    </div>
                  </div>

                  <div className="inventory-loan-row-list">
                    {group.loans.map((loan) => (
                      <div key={loan.id} className="inventory-loan-row">
                        <button type="button" className="inventory-loan-item-link" onClick={() => onOpenItem(loan.itemId)}>
                          <strong>{loan.itemName}</strong>
                          <span>{loan.quantity} {loan.quantityUnit}</span>
                        </button>
                        <div className="small text-muted">
                          půjčeno {new Date(loan.borrowed_at).toLocaleString("cs-CZ")}
                          {loan.due_at ? ` • vrátit ${new Date(loan.due_at).toLocaleString("cs-CZ")}` : ""}
                        </div>
                        <button type="button" className="btn btn-sm btn-success" onClick={() => onReturnLoan(loan.id)}>
                          <i className="fas fa-check me-2"></i>Vráceno
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

InventoryLoansScreen.propTypes = {
  loanGroups: PropTypes.array.isRequired,
  onOpenItem: PropTypes.func.isRequired,
  onReturnLoan: PropTypes.func.isRequired,
};
