import React from "react";
import PropTypes from "prop-types";

import Card from "../../../components/Card";
import { getQrImageUrl } from "../helpers";

export default function InventoryLabelsScreen({ templates, selectedItemIds, labelPreview, onOpenTemplate, onPreview }) {
  return (
    <div className="row g-4">
      <div className="col-12 col-xl-4">
        <Card className="border-0 shadow-lg h-100" title="Šablony štítků" icon={<i className="fas fa-tags"></i>}>
          <button type="button" className="btn btn-primary w-100 mb-3" onClick={onOpenTemplate}>
            <i className="fas fa-plus me-2"></i>Nová šablona
          </button>
          <div className="inventory-activity-list">
            {templates.map((template) => (
              <div key={template.id} className="inventory-activity-row">
                <div>
                  <strong>{template.name}</strong>
                  <div className="small text-muted">{template.width_mm} × {template.height_mm} mm</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="col-12 col-xl-8">
        <Card className="border-0 shadow-lg h-100" title="Náhled štítků" icon={<i className="fas fa-qrcode"></i>}>
          <div className="d-flex flex-wrap gap-2 mb-3">
            <span className="text-muted align-self-center">Vybrané věci: {selectedItemIds.length}</span>
            <button type="button" className="btn btn-outline-primary" onClick={onPreview} disabled={selectedItemIds.length === 0 || templates.length === 0}>
              <i className="fas fa-eye me-2"></i>Vygenerovat náhled
            </button>
          </div>
          {labelPreview ? (
            <div className="inventory-label-grid">
              {labelPreview.items.map((item) => (
                <article key={item.id} className="inventory-label-preview-card">
                  <img src={getQrImageUrl(item.qr_identifier)} alt={item.qr_identifier} />
                  <div>
                    <strong>{item.name}</strong>
                    <div className="small text-muted">{item.category || "Bez kategorie"}</div>
                    <div className="small">{item.current_location || item.default_location || "Bez lokace"}</div>
                    <code>{item.qr_identifier}</code>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="text-muted">Vyber položky na obrazovce Věci a nech si připravit štítky.</div>
          )}
        </Card>
      </div>
    </div>
  );
}

InventoryLabelsScreen.propTypes = {
  templates: PropTypes.array.isRequired,
  selectedItemIds: PropTypes.array.isRequired,
  labelPreview: PropTypes.object,
  onOpenTemplate: PropTypes.func.isRequired,
  onPreview: PropTypes.func.isRequired,
};
