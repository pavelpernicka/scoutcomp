import axios from "axios";

export const TOKEN_STORAGE_KEY = "scoutcomp.tokens";

const api = axios.create({
  baseURL: "/api",
  withCredentials: false,
});

let authTokens = null;
let isRefreshing = false;
const refreshQueue = [];

const processQueue = (error, token = null) => {
  while (refreshQueue.length > 0) {
    const { resolve, reject } = refreshQueue.shift();
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  }
};

if (typeof window !== "undefined") {
  try {
    const stored = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed?.accessToken) {
        authTokens = parsed;
        api.defaults.headers.common.Authorization = `Bearer ${parsed.accessToken}`;
      }
    }
  } catch (error) {
    console.warn("Failed to hydrate auth tokens from storage", error);
  }
}

export const setAuthTokens = (tokens) => {
  authTokens = tokens;
  if (tokens?.accessToken) {
    api.defaults.headers.common.Authorization = `Bearer ${tokens.accessToken}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
};

export const clearAuthTokens = () => {
  authTokens = null;
  delete api.defaults.headers.common.Authorization;
};

api.interceptors.request.use((config) => {
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
    if (
      error.response?.status === 401 &&
      authTokens?.refreshToken &&
      !originalRequest._retry
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api.request(originalRequest);
          })
          .catch((queueError) => Promise.reject(queueError));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axios.post("/api/auth/refresh", {
          refresh_token: authTokens.refreshToken,
        });
        const nextTokens = {
          ...authTokens,
          accessToken: data.access_token,
          expiresIn: data.expires_in,
        };
        setAuthTokens(nextTokens);
        processQueue(null, nextTokens.accessToken);
        return api.request(originalRequest);
      } catch (refreshError) {
        clearAuthTokens();
        processQueue(refreshError, null);
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export default api;
