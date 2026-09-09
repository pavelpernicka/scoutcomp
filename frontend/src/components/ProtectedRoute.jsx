import React, { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

import { useAuth } from "../providers/AuthProvider";

export default function ProtectedRoute({ allowedPermissions = [] }) {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading, can, refreshProfile } = useAuth();
  const location = useLocation();
  const [checkedRequirement, setCheckedRequirement] = useState(null);
  const [isRefreshingPermissions, setIsRefreshingPermissions] = useState(false);
  const requirement = `${location.pathname}\u0000${allowedPermissions.join("\u0000")}`;
  const hasAllowedPermission = allowedPermissions.length === 0
    || allowedPermissions.some((permission) => can(permission));

  useEffect(() => {
    if (
      isLoading
      || !isAuthenticated
      || hasAllowedPermission
      || checkedRequirement === requirement
    ) return undefined;

    let active = true;
    setIsRefreshingPermissions(true);
    Promise.resolve(refreshProfile?.()).finally(() => {
      if (!active) return;
      setCheckedRequirement(requirement);
      setIsRefreshingPermissions(false);
    });
    return () => { active = false; };
  }, [checkedRequirement, hasAllowedPermission, isAuthenticated, isLoading, refreshProfile, requirement]);

  if (isLoading) {
    return <div className="loader">{t("common.loading")}</div>;
  }

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/login" replace state={{ from: returnTo }} />;
  }

  // The menu is resolved from current server-side group permissions. Before
  // rejecting a matching route, refresh the local profile once as it may have
  // been loaded before an administrator changed the user's group grants.
  if (!hasAllowedPermission && (isRefreshingPermissions || checkedRequirement !== requirement)) {
    return <div className="loader">{t("common.loading")}</div>;
  }

  if (!hasAllowedPermission) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

ProtectedRoute.propTypes = {
  allowedPermissions: PropTypes.arrayOf(PropTypes.string),
};
