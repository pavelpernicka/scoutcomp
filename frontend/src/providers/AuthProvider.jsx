import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import PropTypes from "prop-types";

import api, { TOKEN_STORAGE_KEY, clearAuthTokens, setAuthTokens } from "../services/api";

const AuthContext = createContext(undefined);

const parseStoredTokens = () => {
  try {
    const raw = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn("Failed to parse stored tokens", error);
    return null;
  }
};

export function AuthProvider({ children }) {
  const [tokens, setTokens] = useState(() => parseStoredTokens());
  const [profile, setProfile] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const persistTokens = (nextTokens) => {
    setTokens(nextTokens);
    if (nextTokens) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(nextTokens));
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  };

  const fetchProfile = async () => {
    try {
      const { data } = await api.get("/users/me");
      setProfile(data);
    } catch (error) {
      console.error("Unable to load profile", error);
      persistTokens(null);
      setProfile(null);
      clearAuthTokens();
    } finally {
      setIsLoaded(true);
    }
  };

  useEffect(() => {
    if (tokens?.accessToken) {
      setAuthTokens(tokens);
      setIsLoaded(false);
      fetchProfile();
    } else {
      clearAuthTokens();
      setProfile(null);
      setIsLoaded(true);
    }
  }, [tokens?.accessToken]);

  const login = async ({ username, password }) => {
    const { data } = await api.post("/auth/login", { username, password });
    const nextTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
    persistTokens(nextTokens);
    setAuthTokens(nextTokens);
    await fetchProfile();
  };

  const logout = async () => {
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
    };
    persistTokens(nextTokens);
    setAuthTokens(nextTokens);
    await fetchProfile();
  };

  const role = profile?.user?.role ?? null;
  const userId = profile?.user?.id ?? null;
  const managedTeamIds = profile?.user?.managed_team_ids ?? [];
  const isAdmin = role === "admin";
  const isGroupAdmin = role === "group_admin";
  const canManageUsers = isAdmin || isGroupAdmin;

  const value = {
    profile,
    isLoading: !isLoaded,
    isAuthenticated: Boolean(profile),
    userId,
    role,
    managedTeamIds,
    isAdmin,
    isGroupAdmin,
    canManageUsers,
    canReviewCompletions: canManageUsers,
    login,
    logout,
    register,
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
