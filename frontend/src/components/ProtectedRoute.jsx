import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

import { useAuth } from "../providers/AuthProvider";

export default function ProtectedRoute({ allowedRoles = [], allowedPermissions = [] }) {
  const { t } = useTranslation();
  const { isAuthenticated, role, isLoading, can } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div className="loader">{t("common.loading")}</div>;
  }

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/login" replace state={{ from: returnTo }} />;
  }

  if (allowedRoles.length > 0 && (!role || !allowedRoles.includes(role))) {
    return <Navigate to="/" replace />;
  }

  if (allowedPermissions.length > 0 && !allowedPermissions.some(permission => can(permission))) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

ProtectedRoute.propTypes = {
  allowedRoles: PropTypes.arrayOf(PropTypes.string),
  allowedPermissions: PropTypes.arrayOf(PropTypes.string),
};
