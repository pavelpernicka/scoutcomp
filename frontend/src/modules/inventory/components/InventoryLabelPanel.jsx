import React from "react";
import PropTypes from "prop-types";

import { LABEL_FIELD_OPTIONS, getQrImageUrl } from "../helpers";

export default function InventoryLabelPanel({
  templates,
  templateForm,
  onTemplateFormChange,
  onToggleTemplateField,
  onSaveTemplate,
  selectedItemIds,
  labelPreview,
  onPreviewLabels,
  teams,
}) {
  return (
    <section className="inventory-panel">
      <div className="row g-4">
        <div className="col-12 col-xl-4">
          <h2 className="h4 mb-3">Šablony štítků</h2>
          <div className="list-group mb-3">
            {templates.map((template) => (
              <div key={template.id} className="list-group-item">
                <div className="fw-semibold">{template.name}</div>
                <div className="small text-muted">{template.width_mm} × {template.height_mm} mm</div>
              </div>
            ))}
          </div>
          <div className="row g-2">
            <div className="col-12">
              <input className="form-control" placeholder="Název šablony" value={templateForm.name} onChange={(event) => onTemplateFormChange("name", event.target.value)} />
            </div>
            <div className="col-12">
              <select className="form-select" value={templateForm.team_id} onChange={(event) => onTemplateFormChange("team_id", Number(event.target.value))}>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>
            {["width_mm", "height_mm", "qr_x_mm", "qr_y_mm", "qr_size_mm", "title_font_size", "meta_font_size"].map((field) => (
              <div className="col-md-6" key={field}>
                <input className="form-control" type="number" min="0" step="0.5" value={templateForm[field]} onChange={(event) => onTemplateFormChange(field, Number(event.target.value))} placeholder={field} />
              </div>
            ))}
            <div className="col-12">
              <div className="inventory-field-grid">
                {LABEL_FIELD_OPTIONS.map((field) => (
                  <label key={field.value} className="form-check">
                    <input className="form-check-input" type="checkbox" checked={templateForm.fields.includes(field.value)} onChange={() => onToggleTemplateField(field.value)} />
                    <span className="form-check-label">{field.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="col-12 d-flex gap-2">
              <button className="btn btn-primary" type="button" onClick={onSaveTemplate}>Uložit šablonu</button>
              <button className="btn btn-outline-primary" type="button" onClick={onPreviewLabels} disabled={selectedItemIds.length === 0}>Náhled štítků</button>
            </div>
          </div>
        </div>
        <div className="col-12 col-xl-8">
          <h3 className="h5 mb-3">Náhled štítků</h3>
          {labelPreview ? (
            <div className="inventory-label-grid">
              {labelPreview.items.map((item) => (
                <article
                  key={item.id}
                  className="inventory-label-card"
                  style={{ width: `${labelPreview.template.width_mm}mm`, minHeight: `${labelPreview.template.height_mm}mm` }}
                >
                  <img
                    src={getQrImageUrl(item.qr_identifier)}
                    alt={item.qr_identifier}
                    style={{
                      width: `${labelPreview.template.qr_size_mm}mm`,
                      height: `${labelPreview.template.qr_size_mm}mm`,
                      left: `${labelPreview.template.qr_x_mm}mm`,
                      top: `${labelPreview.template.qr_y_mm}mm`,
                    }}
                  />
                  <div className="inventory-label-text">
                    {labelPreview.template.fields.map((field) => (
                      <div key={field} style={{ fontSize: field === "name" ? `${labelPreview.template.title_font_size}px` : `${labelPreview.template.meta_font_size}px` }}>
                        {item[field] || "—"}
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-muted mb-0">Vyber jednu nebo víc věcí v tabulce a vygeneruj náhled.</p>
          )}
        </div>
      </div>
    </section>
  );
}

InventoryLabelPanel.propTypes = {
  templates: PropTypes.array.isRequired,
  templateForm: PropTypes.object.isRequired,
  onTemplateFormChange: PropTypes.func.isRequired,
  onToggleTemplateField: PropTypes.func.isRequired,
  onSaveTemplate: PropTypes.func.isRequired,
  selectedItemIds: PropTypes.array.isRequired,
  labelPreview: PropTypes.object,
  onPreviewLabels: PropTypes.func.isRequired,
  teams: PropTypes.array.isRequired,
};
