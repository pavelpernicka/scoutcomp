import { useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

import MediaPickerModal from "./MediaPickerModal";

const mediaLabel = (value) => {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return value.filename || value.alt || value.url || String(value.id || "");
};

export default function MediaPickerField({ value, onChange, disabled }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return <div className="web-prop-media-field">
    <button type="button" className="btn btn-sm btn-outline-secondary" disabled={disabled} onClick={() => setOpen(true)}>
      <i className="fas fa-images me-2" />{mediaLabel(value) || t("web.props.chooseMedia")}
    </button>
    {value && <button type="button" className="btn btn-sm btn-link" disabled={disabled} onClick={() => onChange(null)}>{t("web.props.clear")}</button>}
    {open && <MediaPickerModal
      title={t("web.props.chooseMedia")}
      onClose={() => setOpen(false)}
      onSelect={(item) => {
        onChange({ id: item.id, url: item.url, filename: item.filename, alt: item.alt || "" });
        setOpen(false);
      }}
    />}
  </div>;
}

MediaPickerField.propTypes = {
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number, PropTypes.object]),
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};
