import React from "react";
import PropTypes from "prop-types";

import { ITEM_STATUS_OPTIONS } from "../helpers";

const sortableColumns = [
  ["name", "Název"],
  ["category", "Kategorie"],
  ["quantity", "Množství"],
  ["current_location", "Aktuální lokace"],
  ["status", "Stav"],
  ["team_name", "Oddíl"],
];

export default function InventoryTable({
  items,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  teamFilter,
  onTeamFilterChange,
  categories,
  teams,
  selectedItemId,
  onSelectItem,
  selectedItemIds,
  onToggleSelect,
  sortBy,
  sortDir,
  onSortChange,
}) {
  return (
    <section className="inventory-panel">
      <div className="d-flex flex-column flex-lg-row gap-3 align-items-stretch align-items-lg-end mb-3">
        <div className="flex-grow-1">
          <label className="form-label fw-semibold">Vyhledávání</label>
          <input
            className="form-control form-control-lg inventory-search"
            placeholder="Hledej podle názvu, kategorie, lokace nebo QR identifikátoru"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        <div>
          <label className="form-label fw-semibold">Stav</label>
          <select className="form-select" value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)}>
            <option value="">Vše</option>
            {ITEM_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label fw-semibold">Kategorie</label>
          <select className="form-select" value={categoryFilter} onChange={(event) => onCategoryFilterChange(event.target.value)}>
            <option value="">Vše</option>
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label fw-semibold">Oddíl</label>
          <select className="form-select" value={teamFilter} onChange={(event) => onTeamFilterChange(event.target.value)}>
            <option value="">Vše</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="table-responsive">
        <table className="table table-hover align-middle inventory-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}></th>
              {sortableColumns.map(([key, label]) => (
                <th key={key}>
                  <button className="btn btn-link p-0 text-decoration-none fw-semibold" type="button" onClick={() => onSortChange(key)}>
                    {label}
                    {sortBy === key && <span className="ms-1">{sortDir === "asc" ? "↑" : "↓"}</span>}
                  </button>
                </th>
              ))}
              <th>Dostupné</th>
              <th>Akce</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-muted py-4">Nic neodpovídá filtru.</td>
              </tr>
            )}
            {items.map((item) => (
              <tr
                key={item.id}
                className={selectedItemId === item.id ? "table-primary" : ""}
                onClick={() => onSelectItem(item.id)}
                style={{ cursor: "pointer" }}
              >
                <td onClick={(event) => event.stopPropagation()}>
                  <input type="checkbox" checked={selectedItemIds.includes(item.id)} onChange={() => onToggleSelect(item.id)} />
                </td>
                <td>
                  <div className="fw-semibold">{item.name}</div>
                  <div className="small text-muted">{item.qr_identifier}</div>
                </td>
                <td>{item.category || "—"}</td>
                <td>{item.quantity}</td>
                <td>{item.current_location || "—"}</td>
                <td><span className={`badge text-bg-${item.status === "available" ? "success" : item.status === "missing" ? "danger" : "warning"}`}>{item.status}</span></td>
                <td>{item.team_name || "—"}</td>
                <td>{item.available_quantity}</td>
                <td>
                  {item.current_event_name ? <span className="badge text-bg-info">{item.current_event_name}</span> : null}
                  {item.open_loan_quantity > 0 ? <span className="badge text-bg-secondary ms-1">Půjčeno {item.open_loan_quantity}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

InventoryTable.propTypes = {
  items: PropTypes.array.isRequired,
  search: PropTypes.string.isRequired,
  onSearchChange: PropTypes.func.isRequired,
  statusFilter: PropTypes.string.isRequired,
  onStatusFilterChange: PropTypes.func.isRequired,
  categoryFilter: PropTypes.string.isRequired,
  onCategoryFilterChange: PropTypes.func.isRequired,
  teamFilter: PropTypes.string.isRequired,
  onTeamFilterChange: PropTypes.func.isRequired,
  categories: PropTypes.array.isRequired,
  teams: PropTypes.array.isRequired,
  selectedItemId: PropTypes.number,
  onSelectItem: PropTypes.func.isRequired,
  selectedItemIds: PropTypes.array.isRequired,
  onToggleSelect: PropTypes.func.isRequired,
  sortBy: PropTypes.string.isRequired,
  sortDir: PropTypes.string.isRequired,
  onSortChange: PropTypes.func.isRequired,
};
