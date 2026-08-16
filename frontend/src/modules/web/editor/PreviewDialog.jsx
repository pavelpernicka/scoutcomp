import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

const DEVICE_WIDTHS = { Desktop: "100%", Tablet: "768px", Mobile: "375px" };

export default function PreviewDialog({ html, loading, error, device, onClose }) {
  const { t } = useTranslation();
  const width = DEVICE_WIDTHS[device] || DEVICE_WIDTHS.Desktop;
  return (
    <div className="web-editor-dialog-backdrop" role="presentation">
      <section className="web-editor-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="preview-title">
        <header>
          <h2 id="preview-title">{t("web.editor.draftPreview")}{device && device !== "Desktop" ? ` · ${device}` : ""}</h2>
          <button type="button" autoFocus onClick={onClose} title={t("web.close")}>
            <i className="fas fa-xmark" />
          </button>
        </header>
        {loading ? (
          <div className="web-editor-preview-status">
            <i className="fas fa-spinner fa-spin" />{t("web.states.rendering")}
          </div>
        ) : error ? (
          <div className="alert alert-danger m-3">{error}</div>
        ) : (
          <div className="web-editor-preview-frame-wrapper" style={{ maxWidth: width, margin: "0 auto" }}>
            <iframe title={t("web.editor.draftPreview")} sandbox="allow-same-origin" srcDoc={html} style={{ width: "100%" }} />
          </div>
        )}
      </section>
    </div>
  );
}
PreviewDialog.propTypes = {
  html: PropTypes.string,
  loading: PropTypes.bool,
  error: PropTypes.string,
  device: PropTypes.string,
  onClose: PropTypes.func.isRequired,
};
