import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

import Card from "../../../components/Card";
import InventoryLabelPreview, { defaultLabelConfiguration, getLabelConfiguration, serializeLabelConfiguration } from "../components/InventoryLabelPreview";
import { downloadLabelsPdf, printLabelsPdf } from "../components/labelPrinting";
import { LABEL_FIELD_OPTIONS } from "../helpers";

const newTemplate = (name = "New label") => ({
  name,
  width_mm: 62,
  height_mm: 29,
  qr_size_mm: 22,
  fields: serializeLabelConfiguration(defaultLabelConfiguration),
});

export default function InventoryLabelsScreen({ templates, items, selectedItemIds, onCreateTemplate, onUpdateTemplate, onDeleteTemplate }) {
  const { t } = useTranslation();
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id ?? null);
  const [draft, setDraft] = useState(null);
  const [selectedIds, setSelectedIds] = useState(selectedItemIds);
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? null;
  const selectedItems = useMemo(() => items.filter((item) => selectedIds.includes(item.id)), [items, selectedIds]);
  const previewItems = selectedItems.length ? selectedItems : items.slice(0, 1);

  useEffect(() => setSelectedIds(selectedItemIds), [selectedItemIds]);
  useEffect(() => {
    if (!selectedTemplateId && !draft && templates[0]) setSelectedTemplateId(templates[0].id);
  }, [draft, selectedTemplateId, templates]);
  useEffect(() => {
    if (!selectedTemplate) return;
    setDraft({ ...selectedTemplate, fields: serializeLabelConfiguration(getLabelConfiguration(selectedTemplate)) });
  }, [selectedTemplate]);

  const save = async () => {
    if (!draft?.name.trim()) return;
    const payload = { ...draft, width_mm: Number(draft.width_mm), height_mm: Number(draft.height_mm), qr_size_mm: Number(draft.qr_size_mm) };
    const saved = selectedTemplate ? await onUpdateTemplate(selectedTemplate.id, payload) : await onCreateTemplate(payload);
    if (saved?.id) setSelectedTemplateId(saved.id);
  };
  const create = () => {
    setSelectedTemplateId(null);
    setDraft(newTemplate(t("inventory.newLabel")));
  };
  const configuration = getLabelConfiguration(draft || selectedTemplate || newTemplate(t("inventory.newLabel")));
  const updateConfiguration = (next) => setDraft((current) => ({ ...current, fields: serializeLabelConfiguration({ ...configuration, ...next }) }));

  return (
    <div className="inventory-label-settings">
      <Card className="border-0 shadow-lg" title={t("inventory.labels")} icon={<i className="fas fa-tags" />}>
        <p className="text-muted">{t("inventory.labelsHelp")}</p>
        <div className="row g-3 align-items-end">
          <div className="col-md-5"><label className="form-label">{t("inventory.preset")}</label><select className="form-select" value={selectedTemplateId || ""} onChange={(event) => setSelectedTemplateId(event.target.value ? Number(event.target.value) : null)}><option value="">{t("inventory.newPreset")}</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.width_mm} × {template.height_mm} mm</option>)}</select></div>
          <div className="col-md-3"><button type="button" className="btn btn-outline-primary w-100" onClick={create}>{t("inventory.newPreset")}</button></div>
          {selectedTemplate ? <div className="col-md-2"><button type="button" className="btn btn-outline-danger w-100" onClick={() => { if (window.confirm(t("inventory.confirmDeletePreset", { name: selectedTemplate.name }))) { onDeleteTemplate(selectedTemplate.id); setSelectedTemplateId(null); setDraft(null); } }}>{t("common.delete")}</button></div> : null}
        </div>

        {draft ? <div className="row g-3 mt-1">
          <div className="col-md-4"><label className="form-label">{t("inventory.presetName")}</label><input className="form-control" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></div>
          <div className="col-md-2"><label className="form-label">{t("inventory.widthMm")}</label><input className="form-control" type="number" min="20" max="200" step="0.5" value={draft.width_mm} onChange={(event) => setDraft((current) => ({ ...current, width_mm: event.target.value }))} /></div>
          <div className="col-md-2"><label className="form-label">{t("inventory.heightMm")}</label><input className="form-control" type="number" min="15" max="200" step="0.5" value={draft.height_mm} onChange={(event) => setDraft((current) => ({ ...current, height_mm: event.target.value }))} /></div>
          <div className="col-md-2"><label className="form-label">QR (mm)</label><input className="form-control" type="number" min="16" max="80" step="0.5" value={draft.qr_size_mm} onChange={(event) => setDraft((current) => ({ ...current, qr_size_mm: event.target.value }))} /></div>
          <div className="col-12"><label className="form-label">{t("inventory.visibleMetadata")}</label><div className="inventory-field-grid">{LABEL_FIELD_OPTIONS.filter((field) => !["name", "qr_identifier"].includes(field.value)).map((field) => <label key={field.value} className="form-check"><input className="form-check-input" type="checkbox" checked={configuration.visibleFields.includes(field.value)} onChange={() => updateConfiguration({ visibleFields: configuration.visibleFields.includes(field.value) ? configuration.visibleFields.filter((value) => value !== field.value) : [...configuration.visibleFields, field.value] })} /><span className="form-check-label">{field.labelKey ? t(field.labelKey) : field.label}</span></label>)}</div></div>
          <div className="col-12"><button type="button" className="btn btn-primary" onClick={save}>{t("inventory.savePreset")}</button></div>
        </div> : null}
      </Card>

      <Card className="border-0 shadow-lg" title={t("inventory.printAndDownload")} icon={<i className="fas fa-print" />}>
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3"><p className="mb-0 text-muted">{t("inventory.printSelectionHelp", { count: selectedItems.length })}</p><div className="btn-group"><button type="button" className="btn btn-outline-secondary" disabled={!selectedTemplate || !selectedItems.length} onClick={() => downloadLabelsPdf(selectedItems, selectedTemplate)}>{t("inventory.downloadPdf")}</button><button type="button" className="btn btn-primary" disabled={!selectedTemplate || !selectedItems.length} onClick={() => printLabelsPdf(selectedItems, selectedTemplate)}>{t("inventory.printPdf")}</button></div></div>
        {previewItems.length && (selectedTemplate || draft) ? <><div className="inventory-label-preview-grid">{previewItems.slice(0, 6).map((item) => <InventoryLabelPreview key={item.id} item={item} template={selectedTemplate || draft} />)}</div>{selectedItems.length ? null : <p className="text-muted small mt-3 mb-0">{t("inventory.previewUsesFirst")}</p>}</> : <p className="text-muted mb-0">{t("inventory.previewNeedsItem")}</p>}
      </Card>
    </div>
  );
}

InventoryLabelsScreen.propTypes = {
  templates: PropTypes.array.isRequired,
  items: PropTypes.array.isRequired,
  selectedItemIds: PropTypes.array.isRequired,
  onCreateTemplate: PropTypes.func.isRequired,
  onUpdateTemplate: PropTypes.func.isRequired,
  onDeleteTemplate: PropTypes.func.isRequired,
};
