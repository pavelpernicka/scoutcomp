import { createPortal } from "react-dom";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import MediaLibrary from "./MediaLibrary";
import "./MediaPickerModal.css";

/**
 * Modal wrapper around the full MediaLibrary in select mode. Used by web
 * settings (favicon/OG image) and any place needing to pick an uploaded file.
 */
export default function MediaPickerModal({ onSelect, onClose, title }) {
  const { t } = useTranslation();
  return createPortal(
    <div className="web-editor-media-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
      <div className="web-media-picker-modal">
        <header className="web-media-picker-header">
          <h2>{title || t("web.nav.media")}</h2>
          <button type="button" className="btn-close" aria-label={t("web.close")} onClick={onClose} />
        </header>
        <div className="web-media-picker-body">
          <MediaLibrary selectMode onSelectItem={onSelect} embedded />
        </div>
      </div>
    </div>,
    document.body
  );
}

MediaPickerModal.propTypes = {
  onSelect: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string,
};
