import { Link, NavLink } from "react-router-dom";
import PropTypes from "prop-types";
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../providers/AuthProvider";
import { useConfig } from "../providers/ConfigProvider";
import LanguageSwitcher from "./LanguageSwitcher";
import Footer from "./Footer";

const navLinkClass = ({ isActive }) => `nav-link ${isActive ? "active fw-bold" : ""}`;

export default function Layout({ children }) {
  const { t } = useTranslation();
  const { profile, logout, isAuthenticated, isAdmin, isGroupAdmin, canManageUsers, canReviewCompletions } = useAuth();
  const { config } = useConfig();
  const [showAdminDropdown, setShowAdminDropdown] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const adminDropdownRef = useRef(null);
  const userDropdownRef = useRef(null);

  const hasAdminAccess = isAdmin || isGroupAdmin || canManageUsers || canReviewCompletions;

  useEffect(() => {
    function handleClickOutside(event) {
      if (adminDropdownRef.current && !adminDropdownRef.current.contains(event.target)) {
        setShowAdminDropdown(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target)) {
        setShowUserDropdown(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="app-shell bg-light min-vh-100 d-flex flex-column">
      <header className="navbar navbar-expand-lg shadow-sm" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <div className="container-fluid">
          {/* Brand */}
          <Link className="navbar-brand d-flex align-items-center text-white fw-bold fs-3" to="/">
            <span className="me-2 fs-2">🏕️</span>
            {config.app_name}
            {isAdmin && <span className="badge bg-warning text-dark ms-2 px-2 py-1">ADMIN</span>}
            {!isAdmin && isGroupAdmin && (
              <span className="badge bg-info text-dark ms-2 px-2 py-1">GROUP ADMIN</span>
            )}
          </Link>

          {/* Mobile menu toggle */}
          <button
            className="navbar-toggler border-0"
            type="button"
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            aria-controls="primaryNav"
            aria-expanded={showMobileMenu}
            aria-label="Toggle navigation"
          >
            <span className="navbar-toggler-icon text-white"></span>
          </button>

          <div className={`collapse navbar-collapse ${showMobileMenu ? 'show' : ''}`} id="primaryNav">
            {isAuthenticated && (
              <ul className="navbar-nav me-auto mb-2 mb-lg-0">
                <li className="nav-item">
                  <NavLink to="/" end className={navLinkClass} style={{ color: 'white' }} onClick={() => setShowMobileMenu(false)}>
                    {t("navigation.dashboard", "Dashboard")}
                  </NavLink>
                </li>
                <li className="nav-item">
                  <NavLink to="/tasks" className={navLinkClass} style={{ color: 'white' }} onClick={() => setShowMobileMenu(false)}>
                    {t("navigation.tasks", "Tasks")}
                  </NavLink>
                </li>
                <li className="nav-item">
                  <NavLink to="/leaderboard" className={navLinkClass} style={{ color: 'white' }} onClick={() => setShowMobileMenu(false)}>
                    {t("navigation.leaderboard", "Leaderboard")}
                  </NavLink>
                </li>
                <li className="nav-item">
                  <NavLink to="/rules" className={navLinkClass} style={{ color: 'white' }} onClick={() => setShowMobileMenu(false)}>
                    {t("navigation.rules", "Rules")}
                  </NavLink>
                </li>

                {/* Admin Dropdown */}
                {hasAdminAccess && (
                  <li className="nav-item dropdown" ref={adminDropdownRef}>
                    <button
                      className="nav-link dropdown-toggle btn btn-link text-white border-0 p-2"
                      type="button"
                      onClick={() => setShowAdminDropdown(!showAdminDropdown)}
                    >
                      {t("navigation.admin", "Administration")}
                    </button>
                    <ul className={`dropdown-menu shadow-lg border-0 ${showAdminDropdown ? 'show' : ''}`}>
                      {canReviewCompletions && (
                        <li>
                          <NavLink to="/admin/approvals" className="dropdown-item d-flex align-items-center" onClick={() => { setShowAdminDropdown(false); setShowMobileMenu(false); }}>
                            {t("navigation.approvals", "Approvals")}
                          </NavLink>
                        </li>
                      )}
                      {isAdmin && (
                        <li>
                          <NavLink to="/admin/tasks" className="dropdown-item d-flex align-items-center" onClick={() => { setShowAdminDropdown(false); setShowMobileMenu(false); }}>
                            {t("navigation.tasksAdmin", "Tasks Admin")}
                          </NavLink>
                        </li>
                      )}
                      {isAdmin && (
                        <li>
                          <NavLink to="/admin/stats" className="dropdown-item d-flex align-items-center" onClick={() => { setShowAdminDropdown(false); setShowMobileMenu(false); }}>
                            {t("navigation.stats", "Statistics")}
                          </NavLink>
                        </li>
                      )}
                      {isAdmin && (
                        <li>
                          <NavLink to="/admin/config" className="dropdown-item d-flex align-items-center" onClick={() => { setShowAdminDropdown(false); setShowMobileMenu(false); }}>
                            {t("navigation.config", "Configuration")}
                          </NavLink>
                        </li>
                      )}
                      {canManageUsers && (
                        <>
                          <li><hr className="dropdown-divider" /></li>
                          <li>
                            <NavLink to="/admin/teams" className="dropdown-item d-flex align-items-center" onClick={() => { setShowAdminDropdown(false); setShowMobileMenu(false); }}>
                              {t("navigation.teams", "Teams")}
                            </NavLink>
                          </li>
                          <li>
                            <NavLink to="/admin/users" className="dropdown-item d-flex align-items-center" onClick={() => { setShowAdminDropdown(false); setShowMobileMenu(false); }}>
                              {t("navigation.users", "Users")}
                            </NavLink>
                          </li>
                          <li>
                            <NavLink to="/admin/announcements" className="dropdown-item d-flex align-items-center" onClick={() => { setShowAdminDropdown(false); setShowMobileMenu(false); }}>
                              {t("navigation.announcements", "Announcements")}
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
            <div className="d-flex align-items-center gap-3">
              <LanguageSwitcher />

              {isAuthenticated ? (
                <div className="dropdown" ref={userDropdownRef}>
                  <button
                    className="btn btn-outline-light d-flex align-items-center px-3 py-2"
                    type="button"
                    onClick={() => setShowUserDropdown(!showUserDropdown)}
                    style={{ borderRadius: '20px' }}
                  >
                    <span className="fw-bold">{profile?.user?.username}</span>
                    <span className="ms-2">▼</span>
                  </button>
                  <ul className={`dropdown-menu dropdown-menu-end shadow-lg border-0 mt-2 ${showUserDropdown ? 'show' : ''}`}>
                    <li className="dropdown-header d-flex align-items-center">
                      <div>
                        <div className="fw-bold">{profile?.user?.username}</div>
                        {profile?.user?.team_name && (
                          <small className="text-muted">{profile.user.team_name}</small>
                        )}
                      </div>
                    </li>
                    <li><hr className="dropdown-divider" /></li>
                    <li>
                      <NavLink to="/settings" className="dropdown-item d-flex align-items-center" onClick={() => { setShowUserDropdown(false); setShowMobileMenu(false); }}>
                        {t("navigation.userSettings", "User Settings")}
                      </NavLink>
                    </li>
                    <li><hr className="dropdown-divider" /></li>
                    <li>
                      <button className="dropdown-item d-flex align-items-center text-danger" onClick={() => { logout(); setShowUserDropdown(false); setShowMobileMenu(false); }}>
                        {t("navigation.logout", "Logout")}
                      </button>
                    </li>
                  </ul>
                </div>
              ) : (
                <NavLink to="/login" className="btn btn-outline-light" onClick={() => setShowMobileMenu(false)}>
                  {t("navigation.login", "Login")}
                </NavLink>
              )}
            </div>
          </div>
        </div>
      </header>
      <main className="app-content container-fluid py-4 flex-grow-1" style={{ maxWidth: '1400px' }}>{children}</main>
      <Footer />
    </div>
  );
}

Layout.propTypes = {
  children: PropTypes.node.isRequired,
};
