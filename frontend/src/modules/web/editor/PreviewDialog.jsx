import { useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

const DEVICE_WIDTHS = { Desktop: "100%", Tablet: "768px", Mobile: "375px" };

export default function PreviewDialog({ html, loading, error, device, onClose }) {
  const { t } = useTranslation();
  const width = DEVICE_WIDTHS[device] || DEVICE_WIDTHS.Desktop;
  const dialogRef = useRef(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [...dialog.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")]
        .filter((element) => !element.disabled && element.getAttribute("aria-hidden") !== "true");
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="web-editor-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="web-editor-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="preview-title">
        <header>
          <h2 id="preview-title">{t("web.editor.draftPreview")}{device && device !== "Desktop" ? ` · ${device}` : ""}</h2>
          <button type="button" autoFocus onClick={onClose} aria-label={t("web.close")}>
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </header>
        {loading ? (
          <div className="web-editor-preview-status" role="status" aria-live="polite">
            <i className="fas fa-spinner fa-spin" />{t("web.states.rendering")}
          </div>
        ) : error ? (
          <div className="alert alert-danger m-3" role="alert">{error}</div>
        ) : (
          <div className="web-editor-preview-stage">
            <div className="web-editor-preview-frame-wrapper" data-device={device || "Desktop"} style={{ maxWidth: width }}>
              <iframe title={t("web.editor.draftPreview")} sandbox="allow-same-origin" srcDoc={html} />
            </div>
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
