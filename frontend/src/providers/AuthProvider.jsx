import React from "react";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import PropTypes from "prop-types";

import api, {
  clearAuthTokens,
  loadAuthTokens,
  persistAuthTokens,
  setAuthTokens,
} from "../services/api";
import { removeCurrentPushSubscription } from "../utils/pushNotifications";

export class PasswordChangeRequiredError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PasswordChangeRequiredError';
  }
}

const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [tokens, setTokens] = useState(() => loadAuthTokens());
  const [profile, setProfile] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const profileRequestRef = useRef(null);

  const persistTokens = (nextTokens) => {
    setTokens(nextTokens);
    persistAuthTokens(nextTokens);
  };

  const fetchProfile = async (accessToken = tokens?.accessToken) => {
    const pending = profileRequestRef.current;
    if (pending?.accessToken === accessToken) return pending.promise;

    let request;
    request = (async () => {
      try {
        const { data } = await api.get("/users/me");
        if (profileRequestRef.current?.promise === request) setProfile(data);
      } catch (error) {
        if (profileRequestRef.current?.promise !== request) return;
        // Preserve the mobile/PWA session while offline; only an explicit auth
        // rejection means the stored credentials are no longer usable.
        if (error.response?.status === 401) {
          persistTokens(null);
          setProfile(null);
          clearAuthTokens();
        } else {
          console.error("Unable to load profile", error);
        }
      } finally {
        if (profileRequestRef.current?.promise === request) {
          profileRequestRef.current = null;
          setIsLoaded(true);
        }
      }
    })();
    profileRequestRef.current = { accessToken, promise: request };
    return request;
  };

  useEffect(() => {
    if (tokens?.accessToken) {
      setAuthTokens(tokens);
      setIsLoaded(false);
      fetchProfile(tokens.accessToken);
    } else {
      profileRequestRef.current = null;
      clearAuthTokens();
      setProfile(null);
      setIsLoaded(true);
    }
  }, [tokens?.accessToken]);

  const login = async ({ username, password, rememberMe = false }) => {
    const { data } = await api.post("/auth/login", {
      username,
      password,
      remember_me: rememberMe,
    });

    // Check if password change is required
    if (data.requires_password_change) {
      throw new PasswordChangeRequiredError(data.message || "Password change required");
    }

    const nextTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      rememberMe,
    };
    persistTokens(nextTokens);
    setAuthTokens(nextTokens);
    // Pass the new token explicitly.  Reading it from the render closure here
    // races with the state update above and can start a second profile request
    // under the previous (or empty) authentication state.
    await fetchProfile(nextTokens.accessToken);
  };

  const changePassword = async ({ username, oldPassword, newPassword, rememberMe = false }) => {
    const { data } = await api.post("/auth/force-change-password", {
      username,
      old_password: oldPassword,
      new_password: newPassword,
      remember_me: rememberMe,
    });
    const nextTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      rememberMe,
    };
    persistTokens(nextTokens);
    setAuthTokens(nextTokens);
    await fetchProfile(nextTokens.accessToken);
  };

  const logout = async () => {
    // Give device cleanup a short chance while the bearer token is still
    // present, but never let service-worker/provider availability block logout.
    await Promise.race([
      removeCurrentPushSubscription().catch(() => undefined),
      new Promise((resolve) => window.setTimeout(resolve, 1000)),
    ]);
    if (tokens?.refreshToken) {
      try {
        await api.post("/auth/logout", { refresh_token: tokens.refreshToken });
      } catch (error) {
        console.warn("Failed to notify backend about logout", error);
      }
    }
    persistTokens(null);
    clearAuthTokens();
    setProfile(null);
    setIsLoaded(true);
    window.location.reload();
  };

  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    const nextTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      rememberMe: true,
    };
    persistTokens(nextTokens);
    setAuthTokens(nextTokens);
    await fetchProfile(nextTokens.accessToken);
  };

  const userId = profile?.user?.id ?? null;
  const managedTeamIds = profile?.user?.managed_team_ids ?? [];
  const permissions = profile?.user?.permissions ?? [];
  const permissionScopes = profile?.user?.permission_scopes ?? {};
  const can = (permission) => permissions.includes(permission);
  const hasPermissionScope = (permission, scope) => (permissionScopes[permission] || []).includes(scope);
  const canGlobally = (permission) => hasPermissionScope(permission, "any");

  const updateProfile = (patch) => {
    setProfile((prev) =>
      prev ? { ...prev, user: { ...prev.user, ...patch } } : prev
    );
  };

  const value = {
    profile,
    isLoading: !isLoaded,
    isAuthenticated: Boolean(profile),
    userId,
    managedTeamIds,
    canReviewCompletions: can("competitions.approvals.audit"),
    permissions,
    permissionScopes,
    can,
    hasPermissionScope,
    canGlobally,
    login,
    logout,
    register,
    changePassword,
    updateProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
