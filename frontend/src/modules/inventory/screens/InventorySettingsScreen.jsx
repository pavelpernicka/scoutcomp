import React from "react";
import PropTypes from "prop-types";

const sections = [
  { id: "locations", label: "Lokace", icon: "fas fa-sitemap" },
  { id: "categories", label: "Kategorie", icon: "fas fa-diagram-project" },
  { id: "flags", label: "Příznaky", icon: "fas fa-flag" },
  { id: "sets", label: "Sety", icon: "fas fa-layer-group" },
  { id: "labels", label: "Štítky", icon: "fas fa-tags" },
];

export default function InventorySettingsScreen({ activeSection, onSectionChange, children }) {
  return (
    <section className="inventory-settings">
      <header className="inventory-settings-header">
        <div><div className="inventory-table-eyebrow">Konfigurace</div><h1>Nastavení skladu</h1><p>Správa kategorií, příznaků a šablon štítků.</p></div>
      </header>
      <div className="inventory-settings-layout">
        <nav className="inventory-settings-nav" aria-label="Sekce nastavení skladu" role="tablist">
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
              <span>{section.label}</span>
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
