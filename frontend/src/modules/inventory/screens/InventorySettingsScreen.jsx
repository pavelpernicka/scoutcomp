import React from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

const sections = [
  { id: "locations", labelKey: "inventory.locations", icon: "fas fa-sitemap" },
  { id: "categories", labelKey: "inventory.categories", icon: "fas fa-diagram-project" },
  { id: "flags", labelKey: "inventory.flags", icon: "fas fa-flag" },
  { id: "sets", labelKey: "inventory.sets", icon: "fas fa-layer-group" },
  { id: "labels", labelKey: "inventory.labels", icon: "fas fa-tags" },
];

export default function InventorySettingsScreen({ activeSection, onSectionChange, children }) {
  const { t } = useTranslation();
  return (
    <section className="inventory-settings">
      <header className="inventory-settings-header">
        <div><div className="inventory-table-eyebrow">{t("inventory.configuration")}</div><h1>{t("inventory.settings")}</h1><p>{t("inventory.settingsDescription")}</p></div>
      </header>
      <div className="inventory-settings-layout">
        <nav className="inventory-settings-nav" aria-label={t("inventory.settingsSections")} role="tablist">
          {sections.map((section) => (
            <button
              key={section.id}
              id={`inventory-settings-tab-${section.id}`}
              type="button"
              role="tab"
              aria-selected={activeSection === section.id}
              aria-controls="inventory-settings-panel"
              className={activeSection === section.id ? "active" : ""}
              onClick={() => onSectionChange(section.id)}
            >
              <i className={section.icon} aria-hidden="true" />
              <span>{t(section.labelKey)}</span>
            </button>
          ))}
        </nav>
        <div id="inventory-settings-panel" className="inventory-settings-content" role="tabpanel" aria-labelledby={`inventory-settings-tab-${activeSection}`}>{children}</div>
      </div>
    </section>
  );
}

InventorySettingsScreen.propTypes = {
  activeSection: PropTypes.oneOf(sections.map((section) => section.id)).isRequired,
  onSectionChange: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
};
