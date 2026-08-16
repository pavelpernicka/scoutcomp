import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../providers/AuthProvider";

const sections = [
  ["templates", ["web.templates.manage", "web.manage"]],
  ["components", ["web.design.manage", "web.manage"]],
  ["sections", ["web.design.manage", "web.manage"]],
  ["styles", ["web.design.manage", "web.manage"]],
];

export default function DesignNav() {
  const { t } = useTranslation();
  const { can } = useAuth();
  return <nav className="web-design-nav" aria-label={t("web.nav.design")}>
    {sections.filter(([, permissions]) => permissions.some(can)).map(([section]) => <NavLink key={section} to={`/admin/web/design/${section}`} className={({ isActive }) => isActive ? "active" : ""}>{t(`web.design.${section}`)}</NavLink>)}
  </nav>;
}
