import React from "react";
import PropTypes from "prop-types";

import { getQrImageUrl, LABEL_FIELD_OPTIONS } from "../helpers";

const optionalFieldIds = LABEL_FIELD_OPTIONS.map((field) => field.value).filter((field) => !["name", "qr_identifier"].includes(field));
export const LABEL_PADDING_MM = 2;

export const defaultLabelConfiguration = { visibleFields: ["category", "current_location"] };

export function getLabelConfiguration(template) {
  try {
    const raw = typeof template?.fields === "string" ? JSON.parse(template.fields) : template?.fields;
    if (Array.isArray(raw)) {
      return { ...defaultLabelConfiguration, visibleFields: raw.map((field) => typeof field === "string" ? field : field.id).filter((field) => optionalFieldIds.includes(field)) };
    }
    if (raw && typeof raw === "object") {
      return {
        visibleFields: Array.isArray(raw.visibleFields) ? raw.visibleFields.filter((field) => optionalFieldIds.includes(field)) : defaultLabelConfiguration.visibleFields,
      };
    }
  } catch {
    // Existing hand-authored layouts are intentionally reduced to the new safe defaults.
  }
  return defaultLabelConfiguration;
}

export function serializeLabelConfiguration(configuration) {
  return JSON.stringify({
    visibleFields: configuration.visibleFields,
  });
}

export function getLabelQrSize(template, width, height) {
  const availableSize = Math.max(1, Math.min(width, height) - (LABEL_PADDING_MM * 2));
  return Math.min(Number(template.qr_size_mm) || 18, availableSize);
}

export function labelMetadata(item, configuration) {
  const values = {
    category: item.category || "Bez kategorie",
    current_location: item.current_location || item.default_location || "Bez lokace",
    default_location: item.default_location || "Bez výchozí lokace",
    status: item.open_loan_quantity > 0 ? `Vypůjčeno (${item.open_loan_quantity} ${item.quantity_unit})` : "Dostupné",
  };
  return configuration.visibleFields.map((field) => ({ id: field, value: values[field] })).filter(({ value }) => Boolean(value));
}

export default function InventoryLabelPreview({ item, template, className = "" }) {
  const configuration = getLabelConfiguration(template);
  const metadata = labelMetadata(item, configuration);
  const width = Number(template.width_mm) || 62;
  const height = Number(template.height_mm) || 29;
  const qrSize = getLabelQrSize(template, width, height);
  return (
    <article className={`inventory-print-label ${className}`} style={{ width: `${width}mm`, height: `${height}mm`, "--inventory-label-padding": `${LABEL_PADDING_MM}mm`, "--inventory-label-qr-size": `${qrSize}mm` }}>
      <img src={getQrImageUrl(item.qr_identifier)} alt={`QR kód ${item.qr_identifier}`} />
      <div className="inventory-print-label-content">
        <strong>{item.name}</strong>
        <code>{item.qr_identifier}</code>
        {metadata.map(({ id, value }) => <small key={id}>{value}</small>)}
      </div>
    </article>
  );
}

InventoryLabelPreview.propTypes = {
  item: PropTypes.object.isRequired,
  template: PropTypes.object.isRequired,
  className: PropTypes.string,
};
