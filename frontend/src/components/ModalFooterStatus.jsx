import PropTypes from "prop-types";

const ICONS = {
  danger: "fa-circle-exclamation",
  info: "fa-circle-info",
  success: "fa-circle-check",
  warning: "fa-triangle-exclamation",
};

export default function ModalFooterStatus({ children, type = "danger" }) {
  if (!children) return null;

  return (
    <div
      className={`app-modal-footer-status is-${type}`}
      role={type === "danger" ? "alert" : "status"}
      aria-live={type === "danger" ? "assertive" : "polite"}
    >
      <i className={`fas ${ICONS[type]}`} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

ModalFooterStatus.propTypes = {
  children: PropTypes.node,
  type: PropTypes.oneOf(["danger", "info", "success", "warning"]),
};
