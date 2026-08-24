import React from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

export default function InventorySidebar({ screens, activeScreen, onSelectScreen, stats, onCreateItem, isDrawer = false, onClose }) {
  const { t } = useTranslation();
  return (
    <aside className={`inventory-sidebar ${isDrawer ? "is-drawer" : ""}`}>
      {isDrawer ? (
        <div className="inventory-drawer-head">
          <strong>{t("inventory.navigation")}</strong>
          <button type="button" className="btn btn-sm btn-outline-secondary inventory-drawer-close" onClick={onClose} aria-label={t("navigation.closeNavigation")}>
            <i className="fas fa-xmark"></i>
          </button>
        </div>
      ) : null}
      <div className="inventory-sidebar-brand">
        <div className="inventory-sidebar-brand-icon">
          <i className="fas fa-warehouse"></i>
        </div>
        <div>
          <h2 className="inventory-sidebar-title">{t("inventory.unitInventory")}</h2>
        </div>
      </div>

      <nav className="inventory-nav">
        {screens.map((screen) => (
          <button
            key={screen.id}
            type="button"
            className={`inventory-nav-item ${activeScreen === screen.id ? "active" : ""}`}
            onClick={() => {
              onSelectScreen(screen.id);
              onClose?.();
            }}
          >
            <i className={screen.icon}></i>
            <span>{screen.labelKey ? t(screen.labelKey) : screen.label}</span>
          </button>
        ))}
      </nav>

      <button type="button" className="btn btn-primary w-100 mt-3" onClick={() => { onCreateItem(); onClose?.(); }}>
        <i className="fas fa-plus me-2"></i>{t("inventory.newItem")}
      </button>

      <div className="inventory-sidebar-stats">
        <div className="inventory-sidebar-stat">
          <span>{t("inventory.itemCount")}</span>
          <strong>{stats.items}</strong>
        </div>
        <div className="inventory-sidebar-stat">
          <span>{t("inventory.locationCount")}</span>
          <strong>{stats.locations}</strong>
        </div>
        <div className="inventory-sidebar-stat">
          <span>{t("inventory.eventCount")}</span>
          <strong>{stats.events}</strong>
        </div>
        <div className="inventory-sidebar-stat">
          <span>{t("inventory.categoryCount")}</span>
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
  isDrawer: PropTypes.bool,
  onClose: PropTypes.func,
  stats: PropTypes.shape({
    items: PropTypes.number.isRequired,
    locations: PropTypes.number.isRequired,
    events: PropTypes.number.isRequired,
    categories: PropTypes.number.isRequired,
  }).isRequired,
};
