import PropTypes from "prop-types";

import "./DashboardWidgetIcon.css";

/** Keeps dashboard-card header icons aligned, regardless of icon source. */
export default function DashboardWidgetIcon({ children, flip = false }) {
  return <span className={`dashboard-widget-icon ${flip ? "flip_vert" : ""}`.trim()} aria-hidden="true">{children}</span>;
}

DashboardWidgetIcon.propTypes = {
  children: PropTypes.node.isRequired,
  flip: PropTypes.bool,
};
