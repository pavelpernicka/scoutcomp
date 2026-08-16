import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import PropTypes from "prop-types";

import { useAuth } from "../providers/AuthProvider";

export default function ProtectedRoute({ allowedRoles = [], allowedPermissions = [] }) {
  const { isAuthenticated, role, isLoading, can } = useAuth();

  if (isLoading) {
    return <div className="loader">Loading…</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
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
