import React from "react";
import PropTypes from "prop-types";

import Modal from "../../../components/Modal";
import InventoryLabelPreview from "./InventoryLabelPreview";
import { downloadLabelsPdf, printLabelsPdf } from "./labelPrinting";

export default function InventoryLabelGenerateDialog({ isVisible, items, templates, selectedTemplateId, onChangeTemplate, onClose }) {
  const template = templates.find((entry) => entry.id === selectedTemplateId) ?? null;
  const previewItem = items[0] ?? null;
  const subtitle = items.length === 1 ? previewItem.name : `Vybráno věcí: ${items.length}`;
  return <Modal isVisible={isVisible} onClose={onClose} title={items.length === 1 ? "Štítek věci" : "Štítky věcí"} subtitle={subtitle} icon={<i className="fas fa-tags" />} size="lg" footer={<><button type="button" className="btn btn-outline-secondary" onClick={onClose}>Zavřít</button><button type="button" className="btn btn-outline-secondary" disabled={!template || !items.length} onClick={() => downloadLabelsPdf(items, template)}>Stáhnout PDF</button><button type="button" className="btn btn-primary" disabled={!template || !items.length} onClick={() => printLabelsPdf(items, template)}>Tisknout PDF</button></>}><label className="form-label">Předvolba</label><select className="form-select mb-4" value={selectedTemplateId || ""} onChange={(event) => onChangeTemplate(event.target.value ? Number(event.target.value) : null)}><option value="">Vyber předvolbu</option>{templates.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} ({entry.width_mm} × {entry.height_mm} mm)</option>)}</select>{previewItem && template ? <div className="inventory-label-single-preview"><InventoryLabelPreview item={previewItem} template={template} />{items.length > 1 ? <p className="text-muted small mt-3 mb-0">Náhled ukazuje první z {items.length} vybraných věcí.</p> : null}</div> : <p className="text-muted mb-0">Vyber předvolbu pro náhled a tisk.</p>}</Modal>;
}

InventoryLabelGenerateDialog.propTypes = { isVisible: PropTypes.bool.isRequired, items: PropTypes.array.isRequired, templates: PropTypes.array.isRequired, selectedTemplateId: PropTypes.number, onChangeTemplate: PropTypes.func.isRequired, onClose: PropTypes.func.isRequired };
