import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

// Keep the iframe's CSS viewport identical to GrapesJS and scale only its
// visual presentation when the dialog is narrower. Shrinking the iframe
// itself would activate different breakpoints; leaving it unscaled would crop.
const DEVICE_WIDTHS = { Desktop: 1200, Tablet: 768, Mobile: 375 };

export const calculatePreviewFit = (availableWidth, availableHeight, logicalWidth) => {
  const width = Number(availableWidth);
  const height = Number(availableHeight);
  const logical = Number(logicalWidth);
  if (![width, height, logical].every(Number.isFinite) || width <= 0 || height <= 0 || logical <= 0) {
    return { scale: 1, displayWidth: logical || 1, displayHeight: Math.max(1, height || 1), logicalHeight: Math.max(1, height || 1) };
  }
  const scale = Math.min(1, width / logical);
  return {
    scale,
    displayWidth: logical * scale,
    displayHeight: height,
    logicalHeight: height / scale,
  };
};

export default function PreviewDialog({ html, loading, error, device, onClose }) {
  const { t } = useTranslation();
  const logicalWidth = DEVICE_WIDTHS[device] || DEVICE_WIDTHS.Desktop;
  const dialogRef = useRef(null);
  const stageRef = useRef(null);
  const [fit, setFit] = useState(() => calculatePreviewFit(0, 0, logicalWidth));

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const update = () => {
      const style = window.getComputedStyle(stage);
      const horizontalPadding = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
      const verticalPadding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
      const next = calculatePreviewFit(
        stage.clientWidth - (Number.isFinite(horizontalPadding) ? horizontalPadding : 0),
        stage.clientHeight - (Number.isFinite(verticalPadding) ? verticalPadding : 0),
        logicalWidth,
      );
      setFit((current) => (
        current.scale === next.scale
        && current.displayWidth === next.displayWidth
        && current.displayHeight === next.displayHeight
        && current.logicalHeight === next.logicalHeight
          ? current
          : next
      ));
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(stage);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [logicalWidth, loading, error]);

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
          <div ref={stageRef} className="web-editor-preview-stage">
            <div className="web-editor-preview-viewport" style={{ width: `${fit.displayWidth}px`, height: `${fit.displayHeight}px` }}>
              <div
                className="web-editor-preview-frame-wrapper"
                data-device={device || "Desktop"}
                data-scale={fit.scale}
                style={{ width: `${logicalWidth}px`, height: `${fit.logicalHeight}px`, transform: `scale(${fit.scale})` }}
              >
                <iframe title={t("web.editor.draftPreview")} sandbox="allow-same-origin" srcDoc={html} />
              </div>
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
