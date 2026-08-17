import PropTypes from "prop-types";

import "./AdminPanel.css";

/**
 * Shared administration surface. It deliberately owns only the repeated
 * structure (heading, actions, body and optional footer), not domain layout.
 */
export default function AdminPanel({ title, action, children, footer, className = "", bodyClassName = "" }) {
  return (
    <section className={`card admin-panel ${className}`.trim()}>
      {(title || action) && (
        <header className="admin-panel__header">
          {title && <h2 className="admin-panel__title">{title}</h2>}
          {action && <div className="admin-panel__action">{action}</div>}
        </header>
      )}
      <div className={`admin-panel__body ${bodyClassName}`.trim()}>{children}</div>
      {footer && <footer className="admin-panel__footer">{footer}</footer>}
    </section>
  );
}

AdminPanel.propTypes = {
  title: PropTypes.node,
  action: PropTypes.node,
  children: PropTypes.node,
  footer: PropTypes.node,
  className: PropTypes.string,
  bodyClassName: PropTypes.string,
};
