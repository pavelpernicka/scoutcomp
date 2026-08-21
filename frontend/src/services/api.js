import axios from "axios";

export const TOKEN_STORAGE_KEY = "scoutcomp.tokens";
export const SESSION_TOKEN_STORAGE_KEY = "scoutcomp.session-tokens";

const api = axios.create({
  baseURL: "/api",
  withCredentials: false,
});

const readTokens = (storage, key) => {
  try {
    const stored = storage.getItem(key);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

export const loadAuthTokens = () => {
  if (typeof window === "undefined") return;

  const persistentTokens = readTokens(window.localStorage, TOKEN_STORAGE_KEY);
  if (persistentTokens?.accessToken) {
    return { ...persistentTokens, rememberMe: true };
  }

  const sessionTokens = readTokens(window.sessionStorage, SESSION_TOKEN_STORAGE_KEY);
  return sessionTokens?.accessToken ? { ...sessionTokens, rememberMe: false } : null;
};

export const persistAuthTokens = (tokens) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    window.sessionStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
    if (!tokens) return;

    const storage = tokens.rememberMe === false ? window.sessionStorage : window.localStorage;
    const key = tokens.rememberMe === false ? SESSION_TOKEN_STORAGE_KEY : TOKEN_STORAGE_KEY;
    storage.setItem(key, JSON.stringify(tokens));
  } catch {
    // Storage can be unavailable in private or embedded browser contexts.
  }
};

let authTokens = null;
let isRefreshing = false;
const refreshQueue = [];

const processQueue = (error, token = null) => {
  while (refreshQueue.length > 0) {
    const { resolve, reject } = refreshQueue.shift();
    if (error) reject(error);
    else resolve(token);
  }
};

const isAuthRequest = (config) => String(config?.url || "").startsWith("/auth/");

export const isAccessTokenExpired = (accessToken, safetyWindowMs = 10_000) => {
  try {
    const payload = accessToken?.split(".")[1];
    if (!payload) return false;
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof decoded.exp === "number" && decoded.exp * 1000 <= Date.now() + safetyWindowMs;
  } catch {
    return false;
  }
};

if (typeof window !== "undefined") {
  const storedTokens = loadAuthTokens();
  if (storedTokens) {
    authTokens = storedTokens;
    api.defaults.headers.common.Authorization = `Bearer ${storedTokens.accessToken}`;
  }
}

export const setAuthTokens = (tokens) => {
  authTokens = tokens;
  if (tokens?.accessToken) api.defaults.headers.common.Authorization = `Bearer ${tokens.accessToken}`;
  else delete api.defaults.headers.common.Authorization;
};

export const clearAuthTokens = () => {
  authTokens = null;
  persistAuthTokens(null);
  delete api.defaults.headers.common.Authorization;
};

const requestTokenRefresh = async () => {
  if (!authTokens?.refreshToken) throw new Error("No refresh token available");
  const { data } = await axios.post("/api/auth/refresh", { refresh_token: authTokens.refreshToken });
  const nextTokens = { ...authTokens, accessToken: data.access_token, expiresIn: data.expires_in };
  setAuthTokens(nextTokens);
  persistAuthTokens(nextTokens);
  return nextTokens.accessToken;
};

const refreshAccessToken = async () => {
  if (isRefreshing) {
    return new Promise((resolve, reject) => refreshQueue.push({ resolve, reject }));
  }

  isRefreshing = true;
  try {
    const token = await requestTokenRefresh();
    processQueue(null, token);
    return token;
  } catch (error) {
    if ([400, 401, 403].includes(error.response?.status)) clearAuthTokens();
    processQueue(error, null);
    throw error;
  } finally {
    isRefreshing = false;
  }
};

api.interceptors.request.use(async (config) => {
  if (authTokens?.accessToken && !isAuthRequest(config) && isAccessTokenExpired(authTokens.accessToken) && authTokens.refreshToken) {
    await refreshAccessToken();
  }
  if (authTokens?.accessToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${authTokens.accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && authTokens?.refreshToken && !originalRequest?._retry && !isAuthRequest(originalRequest)) {
      originalRequest._retry = true;
      try {
        const token = await refreshAccessToken();
        originalRequest.headers = originalRequest.headers ?? {};
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api.request(originalRequest);
      } catch (refreshError) {
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  },
);

export default api;
