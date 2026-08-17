import { useEffect } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";
import "./Toast.css";

const icons = {
  success: "fa-circle-check",
  danger: "fa-circle-exclamation",
  error: "fa-circle-exclamation",
  warning: "fa-triangle-exclamation",
  info: "fa-circle-info",
};

/** A short-lived application notification. Persistent validation belongs beside its field. */
export default function Toast({ type = "info", children, onDismiss, icon, duration = 5000 }) {
  useEffect(() => {
    if (!onDismiss || !duration) return undefined;
    const timer = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timer);
  }, [duration, onDismiss]);

  return createPortal(
    <div className="app-toast" role={type === "danger" || type === "error" ? "alert" : "status"}>
      <span className="app-toast__icon" aria-hidden="true">
        {icon || <i className={`fas ${icons[type] || icons.info}`} />}
      </span>
      <div className="app-toast__content">{children}</div>
      {onDismiss && <button type="button" className="btn-close" aria-label="Zavřít oznámení" onClick={onDismiss} />}
    </div>,
    document.body
  );
}

Toast.propTypes = {
  type: PropTypes.oneOf(["info", "success", "warning", "danger", "error"]),
  children: PropTypes.node,
  onDismiss: PropTypes.func,
  icon: PropTypes.node,
  duration: PropTypes.number,
};
