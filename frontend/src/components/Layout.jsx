import React from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import PropTypes from "prop-types";
import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../providers/AuthProvider";
import { useConfig } from "../providers/ConfigProvider";
import LanguageSwitcher from "./LanguageSwitcher";
import Footer from "./Footer";
import UserAvatar from "./UserAvatar";
import defaultAppIcon from "../assets/default-app-icon.svg";
import api from "../services/api";
import { translateServerValue } from "../utils/serverTranslations";

const navLinkClass = ({ isActive }) => `nav-link ${isActive ? "active fw-bold" : ""}`;

export default function Layout({ children }) {
  const { t, i18n } = useTranslation();
  const { profile, logout, isAuthenticated, isAdmin, isGroupAdmin, canManageUsers, canReviewCompletions } = useAuth();
  const { config } = useConfig();
  const [showAdminDropdown, setShowAdminDropdown] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [openModuleDropdown, setOpenModuleDropdown] = useState(null);
  const [modules, setModules] = useState([]);
  const [adminItems, setAdminItems] = useState([]);
  const [openAdminSections, setOpenAdminSections] = useState({});
  const location = useLocation();

  const adminDropdownRef = useRef(null);
  const userDropdownRef = useRef(null);

  const hasAdminAccess = isAdmin || isGroupAdmin || canManageUsers || canReviewCompletions || adminItems.length > 0;
  const groupedAdminItems = useMemo(
    () => adminItems.reduce((groups, item) => {
      const section = item.section_key || item.section;
      return { ...groups, [section]: [...(groups[section] || []), item] };
    }, {}),
    [adminItems]
  );
  const legacyAdminMenu = false;

  const moduleGroups = useMemo(
    () => modules.filter((m) => m.menu?.length).map((m) => ({ code: m.code, name: m.name, nameKey: m.name_key, icon: m.icon, items: m.menu })),
    [modules]
  );

  const activeModule = useMemo(() => {
    const path = location.pathname;
    for (const module of modules.filter((m) => (m.menu?.length || 0) > 1)) {
      const matches = module.menu.some(
        (item) => path === item.route || path.startsWith(item.route.replace(/\/+$/, "") + "/")
      );
      if (matches) return module;
    }
    return null;
  }, [modules, location.pathname]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (adminDropdownRef.current && !adminDropdownRef.current.contains(event.target)) {
        setShowAdminDropdown(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target)) {
        setShowUserDropdown(false);
      }
      if (openModuleDropdown && !event.target.closest("[data-module-dropdown]")) {
        setOpenModuleDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openModuleDropdown]);

  useEffect(() => {
    setOpenModuleDropdown(null);
  }, [location.pathname]);

  useEffect(() => {
    if (!showMobileMenu || !window.matchMedia("(max-width: 991.98px)").matches) return;
    const isRouteActive = (route) => location.pathname === route || location.pathname.startsWith(`${route.replace(/\/+$/, "")}/`);
    const activeModuleGroup = moduleGroups.find((module) => module.items.some((item) => isRouteActive(item.route)));
    setOpenModuleDropdown(activeModuleGroup?.code ?? null);

    const activeAdminSection = Object.entries(groupedAdminItems).find(([, items]) => items.some((item) => isRouteActive(item.route)));
    if (activeAdminSection) {
      setShowAdminDropdown(true);
      setOpenAdminSections({ [activeAdminSection[0]]: true });
    } else {
      setShowAdminDropdown(false);
      setOpenAdminSections({});
    }
  }, [groupedAdminItems, location.pathname, moduleGroups, showMobileMenu]);

  useEffect(() => {
    if (!showMobileMenu) return undefined;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setShowMobileMenu(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [showMobileMenu]);

  useEffect(() => {
    if (!isAuthenticated) { setModules([]); setAdminItems([]); return; }
    api.get("/modules").then(({ data }) => setModules(data)).catch(() => setModules([]));
    api.get("/modules/admin-menu").then(({ data }) => setAdminItems(data)).catch(() => setAdminItems([]));
  }, [isAuthenticated, profile?.user?.id]);

  return (
    <div className="app-shell bg-light min-vh-100 d-flex flex-column">
      <header className="navbar navbar-expand-lg app-navbar">
        <div className="container-fluid">
          {/* Mobile menu toggle deliberately precedes the brand, so it remains
              a stable thumb target at the left edge. */}
          <button
            className="navbar-toggler app-mobile-menu-toggle border-0 text-white d-lg-none"
            type="button"
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            aria-controls="primaryNav"
            aria-expanded={showMobileMenu}
            aria-label={showMobileMenu ? t("navigation.closeNavigation") : t("navigation.openNavigation")}
          >
            <i className={`fas fa-${showMobileMenu ? "xmark" : "bars"} fs-4`}></i>
          </button>
          {/* Brand */}
          <Link className="navbar-brand d-flex align-items-center text-white fw-bold fs-3" to="/">
            <img
              src={config.app_icon || defaultAppIcon}
              alt={t("navigation.appIcon")}
              className="me-2"
              style={{ width: "32px", height: "32px", objectFit: "contain" }}
            />
            {config.app_name}
            {isAdmin && <span className="badge bg-warning text-dark ms-2 px-2 py-1">{t("navigation.roles.admin")}</span>}
            {!isAdmin && isGroupAdmin && (
              <span className="badge bg-info text-dark ms-2 px-2 py-1">{t("navigation.roles.groupAdmin")}</span>
            )}
          </Link>

          <div className={`collapse navbar-collapse app-mobile-drawer ${showMobileMenu ? 'show' : ''}`} id="primaryNav">
            <div className="app-mobile-drawer__heading d-lg-none">
              <span>{t("navigation.menu")}</span>
              <button type="button" className="btn btn-sm" onClick={() => setShowMobileMenu(false)} aria-label={t("navigation.closeNavigation")}><i className="fas fa-xmark" /></button>
            </div>
            {isAuthenticated && (
              <ul className="navbar-nav me-auto mb-2 mb-lg-0 flex-column flex-lg-row">
                <li className="nav-item">
                  <NavLink to="/" end className={navLinkClass} style={{ color: 'white', fontSize: showMobileMenu ? '1.1rem' : 'inherit' }} onClick={() => setShowMobileMenu(false)}>
                    {t("navigation.dashboard")}
                  </NavLink>
                </li>
                {moduleGroups.map((module) =>
                  module.items.length === 1 ? (
                    <li className="nav-item" key={module.code}>
                      <NavLink to={module.items[0].route} className={navLinkClass} style={{ color: 'white', fontSize: showMobileMenu ? '1.1rem' : 'inherit' }} onClick={() => setShowMobileMenu(false)}>
                        <i className={`fas ${module.items[0].icon} me-1`} />{translateServerValue(t, i18n, module.items[0].label_key, module.items[0].label)}
                      </NavLink>
                    </li>
                  ) : (
                    <li className="nav-item dropdown" data-module-dropdown={module.code} key={module.code}>
                      <button
                        type="button"
                        className={`nav-link dropdown-toggle btn btn-link text-white border-0 p-2 d-flex align-items-center justify-content-between w-100 ${openModuleDropdown === module.code ? 'show' : ''}`}
                        onClick={() => setOpenModuleDropdown(openModuleDropdown === module.code ? null : module.code)}
                      >
                        <span><i className={`fas ${module.icon} me-1`} />{translateServerValue(t, i18n, module.nameKey, module.name)}</span>
                      </button>
                      <ul className={`dropdown-menu shadow-lg border-0 ${showMobileMenu ? 'w-100' : ''} ${openModuleDropdown === module.code ? 'show' : ''}`} style={{ position: showMobileMenu ? 'static' : 'absolute' }}>
                        {module.items.map((item) => (
                          <li key={item.route}>
                            <NavLink
                              to={item.route}
                              className={({ isActive }) => `dropdown-item d-flex align-items-center ${isActive ? 'active' : ''}`}
                              onClick={() => { setOpenModuleDropdown(null); setShowMobileMenu(false); }}
                            >
                              <i className={`fas ${item.icon} me-2`} />{translateServerValue(t, i18n, item.label_key, item.label)}
                            </NavLink>
                          </li>
                        ))}
                      </ul>
                    </li>
                  )
                )}

                {/* Admin Dropdown */}
                {hasAdminAccess && (
                  <li className="nav-item dropdown" ref={adminDropdownRef}>
                    <button
                      className="nav-link dropdown-toggle btn btn-link text-white border-0 p-2 d-flex align-items-center justify-content-between w-100"
                      type="button"
                      onClick={() => setShowAdminDropdown(!showAdminDropdown)}
                    >
                      <span>{t("navigation.admin")}</span>
                    </button>
                    <ul className={`dropdown-menu shadow-lg border-0 ${showMobileMenu ? 'w-100' : ''} ${showAdminDropdown ? 'show' : ''}`} style={{ position: showMobileMenu ? 'static' : 'absolute' }}>
                      {Object.entries(groupedAdminItems).map(([section, items]) => <li key={section} className="border-bottom"><button type="button" className="dropdown-item fw-bold d-flex justify-content-between" onClick={()=>setOpenAdminSections(current=>({...current,[section]:!current[section]}))}>{translateServerValue(t, i18n, section, items[0]?.section)}<i className={`fas fa-chevron-${openAdminSections[section]?"up":"down"}`}/></button>{openAdminSections[section]&&<ul className="list-unstyled mb-1">{items.map(item=><li key={item.route}><NavLink to={item.route} className="dropdown-item ps-4" onClick={() => { setShowAdminDropdown(false); setShowMobileMenu(false); }}>{translateServerValue(t, i18n, item.label_key, item.label)}</NavLink></li>)}</ul>}</li>)}
                      {legacyAdminMenu && canReviewCompletions && (
                        <li>
                          <NavLink to="/admin/approvals" className="dropdown-item d-flex align-items-center" onClick={() => { setShowAdminDropdown(false); setShowMobileMenu(false); }}>
                            {t("navigation.approvals")}
                          </NavLink>
                        </li>
                      )}
                      {legacyAdminMenu && (isAdmin || isGroupAdmin) && (
                        <li>
                          <NavLink to="/inventory" className="dropdown-item d-flex align-items-center" onClick={() => { setShowAdminDropdown(false); setShowMobileMenu(false); }}>
                            {t("navigation.inventory")}
                          </NavLink>
                        </li>
                      )}
                      {legacyAdminMenu && isAdmin && (
                        <li>
                          <NavLink to="/admin/tasks" className="dropdown-item d-flex align-items-center" onClick={() => { setShowAdminDropdown(false); setShowMobileMenu(false); }}>
                            {t("navigation.tasksAdmin")}
                          </NavLink>
                        </li>
                      )}
                      {legacyAdminMenu && isAdmin && (
                        <li>
                          <NavLink to="/admin/stats" className="dropdown-item d-flex align-items-center" onClick={() => { setShowAdminDropdown(false); setShowMobileMenu(false); }}>
                            {t("navigation.stats")}
                          </NavLink>
                        </li>
                      )}
                      {legacyAdminMenu && isAdmin && (
                        <li>
                          <NavLink to="/admin/config" className="dropdown-item d-flex align-items-center" onClick={() => { setShowAdminDropdown(false); setShowMobileMenu(false); }}>
                            {t("navigation.config")}
                          </NavLink>
                        </li>
                      )}
                      {legacyAdminMenu && isAdmin && (
                        <li><NavLink to="/admin/modules" className="dropdown-item d-flex align-items-center" onClick={() => { setShowAdminDropdown(false); setShowMobileMenu(false); }}>{t("navigation.modules")}</NavLink></li>
                      )}
                      {legacyAdminMenu && canManageUsers && (
                        <>
                          <li><hr className="dropdown-divider" /></li>
                          <li>
                            <NavLink to="/admin/teams" className="dropdown-item d-flex align-items-center" onClick={() => { setShowAdminDropdown(false); setShowMobileMenu(false); }}>
                              {t("navigation.teams")}
                            </NavLink>
                          </li>
                          <li>
                            <NavLink to="/admin/users" className="dropdown-item d-flex align-items-center" onClick={() => { setShowAdminDropdown(false); setShowMobileMenu(false); }}>
                              {t("navigation.users")}
                            </NavLink>
                          </li>
                          <li>
                            <NavLink to="/admin/announcements" className="dropdown-item d-flex align-items-center" onClick={() => { setShowAdminDropdown(false); setShowMobileMenu(false); }}>
                              {t("navigation.announcements")}
                            </NavLink>
                          </li>
                        </>
                      )}
                    </ul>
                  </li>
                )}
              </ul>
            )}

            {/* Right side navigation */}
            <div className={`d-flex align-items-center gap-2 ${showMobileMenu ? 'flex-column w-100 mt-3' : 'flex-wrap'}`}>
              <LanguageSwitcher isMobile={showMobileMenu} />

              {isAuthenticated ? (
                <div className={`dropdown ${showMobileMenu ? 'w-100' : ''}`} ref={userDropdownRef}>
                  <button
                    className={`btn btn-outline-light d-flex align-items-center px-3 py-2 ${showMobileMenu ? 'w-100 justify-content-between app-mobile-bottom-trigger' : ''}`}
                    type="button"
                    onClick={() => setShowUserDropdown(!showUserDropdown)}
                  >
                    <UserAvatar
                      user={profile?.user}
                      size={28}
                      fallbackClass="bg-success"
                      className="me-2"
                    />
                    <span
                      className={`fw-bold ${showMobileMenu ? '' : 'text-truncate d-inline-block'}`}
                      style={showMobileMenu ? undefined : { maxWidth: '180px' }}
                    >
                      {profile?.user?.real_name || profile?.user?.username}
                    </span>
                    <i className="fas fa-chevron-down ms-2"></i>
                  </button>
                  <ul
                    className={`dropdown-menu dropdown-menu-end ${showMobileMenu ? 'w-100' : ''} shadow-lg border-0 mt-2 ${showUserDropdown ? 'show' : ''}`}
                    style={{
                      position: showMobileMenu ? 'static' : 'absolute',
                      right: showMobileMenu ? undefined : 0,
                      left: showMobileMenu ? undefined : 'auto',
                      maxWidth: showMobileMenu ? undefined : 'min(22rem, calc(100vw - 1rem))',
                      minWidth: showMobileMenu ? undefined : '14rem',
                      overflowX: 'hidden',
                    }}
                  >
                    <li className="dropdown-header d-flex align-items-center gap-2">
                      <UserAvatar
                        user={profile?.user}
                        size={44}
                        fallbackClass="bg-success"
                      />
                      <div>
                        <div
                          className="fw-bold"
                          style={{ whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: 1.2 }}
                        >
                          {profile?.user?.real_name || profile?.user?.username}
                        </div>
                        {profile?.user?.team_name && (
                          <small
                            className="text-muted"
                            style={{ whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: 1.2 }}
                          >
                            {profile.user.team_name}
                          </small>
                        )}
                      </div>
                    </li>
                    <li><hr className="dropdown-divider" /></li>
                    <li>
                      <NavLink to="/settings" className="dropdown-item d-flex align-items-center" onClick={() => { setShowUserDropdown(false); setShowMobileMenu(false); }}>
                        {t("navigation.userSettings")}
                      </NavLink>
                    </li>
                    <li><hr className="dropdown-divider" /></li>
                    <li>
                      <button className="dropdown-item d-flex align-items-center text-danger" onClick={() => { logout(); setShowUserDropdown(false); setShowMobileMenu(false); }}>
                        {t("navigation.logout")}
                      </button>
                    </li>
                  </ul>
                </div>
              ) : (
                <NavLink to="/login" className={`btn btn-outline-light ${showMobileMenu ? 'w-100' : ''}`} onClick={() => setShowMobileMenu(false)}>
                  {t("navigation.login")}
                </NavLink>
              )}
            </div>
          </div>
        </div>
      </header>
      {showMobileMenu && <button type="button" className="app-mobile-menu-backdrop d-lg-none" aria-label={t("navigation.closeNavigation")} onClick={() => setShowMobileMenu(false)} />}
      <main className="app-content flex-grow-1 d-lg-flex align-items-stretch">
        {activeModule ? (
          <>
            <aside className="module-sidebar d-none d-lg-flex flex-column flex-shrink-0 border-end border-light-subtle">
              <nav className="list-group list-group-flush module-subnav">
                {activeModule.menu.map((item) => (
                  <NavLink
                    key={item.route}
                    to={item.route}
                    className={({ isActive }) => `list-group-item list-group-item-action border-0 ${isActive ? 'active' : ''}`}
                    onClick={() => setShowMobileMenu(false)}
                  >
                    <i className={`fas ${item.icon} me-2`} />{translateServerValue(t, i18n, item.label_key, item.label)}
                  </NavLink>
                ))}
              </nav>
            </aside>
            <div className="flex-grow-1 min-w-0 py-4 px-3 px-lg-4">
              <div className="mx-auto" style={{ maxWidth: '1400px' }}>
                {children}
              </div>
            </div>
          </>
        ) : (
          <div className="container-fluid py-4 px-3 mx-auto" style={{ maxWidth: '1400px' }}>
            {children}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

Layout.propTypes = {
  children: PropTypes.node.isRequired,
};
