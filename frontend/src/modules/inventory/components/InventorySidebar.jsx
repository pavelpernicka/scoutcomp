import React from "react";
import PropTypes from "prop-types";

export default function InventorySidebar({ screens, activeScreen, onSelectScreen, stats, onCreateItem }) {
  return (
    <aside className="inventory-sidebar">
      <div className="inventory-sidebar-brand">
        <div className="inventory-sidebar-brand-icon">
          <i className="fas fa-warehouse"></i>
        </div>
        <div>
          <div className="inventory-sidebar-eyebrow">Inventory</div>
          <h2 className="inventory-sidebar-title">Sklad</h2>
        </div>
      </div>

      <nav className="inventory-nav">
        {screens.map((screen) => (
          <button
            key={screen.id}
            type="button"
            className={`inventory-nav-item ${activeScreen === screen.id ? "active" : ""}`}
            onClick={() => onSelectScreen(screen.id)}
          >
            <i className={screen.icon}></i>
            <span>{screen.label}</span>
          </button>
        ))}
      </nav>

      <button type="button" className="btn btn-primary w-100 mt-3" onClick={onCreateItem}>
        <i className="fas fa-plus me-2"></i>Nová věc
      </button>

      <div className="inventory-sidebar-stats">
        <div className="inventory-sidebar-stat">
          <span>Věcí</span>
          <strong>{stats.items}</strong>
        </div>
        <div className="inventory-sidebar-stat">
          <span>Lokací</span>
          <strong>{stats.locations}</strong>
        </div>
        <div className="inventory-sidebar-stat">
          <span>Akcí</span>
          <strong>{stats.events}</strong>
        </div>
        <div className="inventory-sidebar-stat">
          <span>Kategorií</span>
          <strong>{stats.categories}</strong>
        </div>
      </div>
    </aside>
  );
}

InventorySidebar.propTypes = {
  screens: PropTypes.array.isRequired,
  activeScreen: PropTypes.string.isRequired,
  onSelectScreen: PropTypes.func.isRequired,
  onCreateItem: PropTypes.func.isRequired,
  stats: PropTypes.shape({
    items: PropTypes.number.isRequired,
    locations: PropTypes.number.isRequired,
    events: PropTypes.number.isRequired,
    categories: PropTypes.number.isRequired,
  }).isRequired,
};
