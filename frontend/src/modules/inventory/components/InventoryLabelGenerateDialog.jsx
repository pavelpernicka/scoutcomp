import React from "react";
import PropTypes from "prop-types";

import Modal from "../../../components/Modal";
import { getQrImageUrl } from "../helpers";

export default function InventoryLabelGenerateDialog({ isVisible, item, templates, selectedTemplateId, labelPreview, onChangeTemplate, onClose, onPreview }) {
  const previewItem = labelPreview?.items?.[0] || item;

  return (
    <Modal
      isVisible={isVisible}
      onClose={onClose}
      title="Vygenerovat štítek"
      subtitle={item?.name || "Vybraná věc"}
      icon={<i className="fas fa-tags"></i>}
      size="lg"
      footer={(
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Zavřít</button>
          <button type="button" className="btn btn-primary" onClick={onPreview} disabled={!selectedTemplateId}>
            Vygenerovat štítek
          </button>
        </>
      )}
    >
      <div className="row g-3">
        <div className="col-12">
          <label className="form-label">Šablona</label>
          <select className="form-select" value={selectedTemplateId || ""} onChange={(event) => onChangeTemplate(event.target.value ? Number(event.target.value) : null)}>
            <option value="">Vyber šablonu</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} ({template.width_mm} × {template.height_mm} mm)
              </option>
            ))}
          </select>
        </div>
        <div className="col-12">
          {previewItem ? (
            <article className="inventory-label-preview-card inventory-dialog-sidecard">
              <img src={getQrImageUrl(previewItem.qr_identifier)} alt={previewItem.qr_identifier} />
              <div>
                <strong>{previewItem.name}</strong>
                <div className="small text-muted">{previewItem.category || "Bez kategorie"}</div>
                <div className="small">{previewItem.current_location || previewItem.default_location || "Bez lokace"}</div>
                <code>{previewItem.qr_identifier}</code>
              </div>
            </article>
          ) : (
            <div className="text-muted">Vyber šablonu pro vytvoření štítku.</div>
          )}
        </div>
      </div>
    </Modal>
  );
}

InventoryLabelGenerateDialog.propTypes = {
  isVisible: PropTypes.bool.isRequired,
  item: PropTypes.object,
  templates: PropTypes.array.isRequired,
  selectedTemplateId: PropTypes.number,
  labelPreview: PropTypes.object,
  onChangeTemplate: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onPreview: PropTypes.func.isRequired,
};
