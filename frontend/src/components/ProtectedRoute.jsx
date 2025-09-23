import { Navigate, Outlet } from "react-router-dom";
import PropTypes from "prop-types";

import { useAuth } from "../providers/AuthProvider";

export default function ProtectedRoute({ allowedRoles = [] }) {
  const { isAuthenticated, role, isLoading } = useAuth();

  if (isLoading) {
    return <div className="loader">Loading…</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles.length > 0 && (!role || !allowedRoles.includes(role))) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

ProtectedRoute.propTypes = {
  allowedRoles: PropTypes.arrayOf(PropTypes.string),
};
