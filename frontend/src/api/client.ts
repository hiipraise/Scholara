// src/api/client.ts
/**
 * API client with access + refresh token handling.
 * Tokens stored in memory (primary) + sessionStorage (backup for tab refresh).
 * NO localStorage usage anywhere.
 */
import axios, { AxiosInstance } from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "/api";
const AUTH_PATH = "/auth";

// ════════════════════════════════════════════════════════════════════════════
// TOKEN STORAGE (in-memory + sessionStorage backup — NO localStorage)
// ════════════════════════════════════════════════════════════════════════════

interface TokenStore {
  access: string | null;
  refresh: string | null;
}

let tokenStore: TokenStore = { access: null, refresh: null };

export function setTokens(access: string, refresh: string) {
  tokenStore.access = access;
  tokenStore.refresh = refresh;
  // sessionStorage backup for tab refresh recovery
  sessionStorage.setItem("scholara_access_token", access);
  sessionStorage.setItem("scholara_refresh_token", refresh);
}

export function getAccessToken(): string | null {
  if (tokenStore.access) return tokenStore.access;
  const stored = sessionStorage.getItem("scholara_access_token");
  if (stored) {
    tokenStore.access = stored;
    return stored;
  }
  return null;
}

export function getRefreshToken(): string | null {
  if (tokenStore.refresh) return tokenStore.refresh;
  const stored = sessionStorage.getItem("scholara_refresh_token");
  if (stored) {
    tokenStore.refresh = stored;
    return stored;
  }
  return null;
}

export function clearTokens() {
  tokenStore.access = null;
  tokenStore.refresh = null;
  sessionStorage.removeItem("scholara_access_token");
  sessionStorage.removeItem("scholara_refresh_token");
}

// ════════════════════════════════════════════════════════════════════════════
// AXIOS CLIENT
// ════════════════════════════════════════════════════════════════════════════

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
  timeout: 15000,
  validateStatus: (status) => status < 500,
});

// ════════════════════════════════════════════════════════════════════════════
// REQUEST INTERCEPTOR
// ════════════════════════════════════════════════════════════════════════════

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers["X-Requested-With"] = "XMLHttpRequest";
  return config;
});

// ════════════════════════════════════════════════════════════════════════════
// RESPONSE INTERCEPTOR — auto-refresh on 401
// ════════════════════════════════════════════════════════════════════════════

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token || "");
    }
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(apiClient(originalRequest));
            },
            reject: (err) => reject(err),
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = getRefreshToken();
        if (!refreshToken) {
          throw new Error("No refresh token available");
        }

        const refreshResponse = await apiClient.post<{ access_token: string }>(
          "/auth/refresh",
          { refresh_token: refreshToken },
        );

        const { access_token } = refreshResponse.data;

        // Store new access token (keep same refresh token)
        setTokens(access_token, refreshToken);

        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        processQueue(null, access_token);

        return apiClient(originalRequest);
      } catch (err) {
        clearTokens();
        processQueue(err, null);
        if (typeof window !== "undefined" && window.location.pathname !== AUTH_PATH) {
          window.location.href = AUTH_PATH;
        }
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    if (error.response?.status === 403) {
      clearTokens();
      if (typeof window !== "undefined" && window.location.pathname !== AUTH_PATH) {
        window.location.href = AUTH_PATH;
      }
    }

    return Promise.reject(error);
  },
);

export default apiClient;
