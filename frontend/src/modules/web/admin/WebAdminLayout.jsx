import PropTypes from "prop-types";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../../providers/AuthProvider";
import "../styles/admin.css";

const entries = [
  ["pages", "/admin/web/pages", "fa-file-lines", ["web.pages.manage", "web.manage"]],
  ["menus", "/admin/web/menus", "fa-bars", ["web.menus.manage", "web.manage"]],
  ["media", "/admin/web/media", "fa-images", ["web.media.manage", "web.manage"]],
  ["design", "/admin/web/design", "fa-swatchbook", ["web.design.manage", "web.templates.manage", "web.manage"]],
  ["themes", "/admin/web/themes", "fa-palette", ["web.themes.manage", "web.manage"]],
  ["settings", "/admin/web/settings", "fa-gear", ["web.settings.manage", "web.manage"]],
];

export default function WebAdminLayout({ children }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const visible = entries.filter(([, , , permissions]) => permissions.some(can));
  const designPath = can("web.templates.manage") || can("web.manage")
    ? "/admin/web/design/templates"
    : "/admin/web/design/components";

  return (
    <div className="web-admin">
      <header className="web-admin-heading">
        <div>
          <p className="web-admin-eyebrow">{t("web.cms")}</p>
          <h1>{t("web.adminTitle")}</h1>
        </div>
        <span className="web-admin-site-state">
          <i className="fas fa-circle" aria-hidden="true" /> {t("web.publicSiteSeparate")}
        </span>
      </header>
      <nav className="web-admin-nav" aria-label={t("web.adminNavigation")}>
        {visible.map(([key, path, icon]) => (
          <NavLink key={key} to={key === "design" ? designPath : path} className={({ isActive }) => isActive ? "active" : ""}>
            <i className={`fas ${icon}`} aria-hidden="true" />
            <span>{t(`web.nav.${key}`)}</span>
          </NavLink>
        ))}
      </nav>
      <div className="web-admin-content">{children}</div>
    </div>
  );
}

WebAdminLayout.propTypes = { children: PropTypes.node.isRequired };
