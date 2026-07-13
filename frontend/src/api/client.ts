// src/api/client.ts
/**
 * API client with access + refresh token handling.
 * Tokens stored in memory (primary):
 *   - Access token:  in-memory only (never persisted anywhere).
 *   - Refresh token: in-memory + IndexedDB (survives PWA close/reopen for
 *                     installed app).
 * NO localStorage or sessionStorage usage for tokens.
 */
import axios, { AxiosInstance } from "axios";
import {
  getRefreshToken as getPersistedRefreshToken,
  setRefreshToken as persistRefreshToken,
  clearRefreshToken as clearPersistedRefreshToken,
} from "../lib/authDb";

const API_BASE = import.meta.env.VITE_API_URL || "/api";
const AUTH_PATH = "/auth";

// ════════════════════════════════════════════════════════════════════════════
// TOKEN STORAGE
//   - Access token:  in-memory only — never persisted to IndexedDB,
//                     sessionStorage, or localStorage.
//   - Refresh token: in-memory + IndexedDB (survives PWA close/reopen)
//   - NO sessionStorage or localStorage usage anywhere.
// ════════════════════════════════════════════════════════════════════════════

interface TokenStore {
  access: string | null;
  refresh: string | null;
}

let tokenStore: TokenStore = { access: null, refresh: null };

export async function setTokens(access: string, refresh: string) {
  tokenStore.access = access;
  tokenStore.refresh = refresh;
  // Refresh token persisted to IndexedDB so the installed PWA can restore
  // the session after being fully closed and reopened.
  await persistRefreshToken(refresh);
}

export function getAccessToken(): string | null {
  return tokenStore.access;
}

export async function getRefreshToken(): Promise<string | null> {
  if (tokenStore.refresh) return tokenStore.refresh;
  // IndexedDB persistence for installed PWA (survives close/reopen)
  const persisted = await getPersistedRefreshToken();
  if (persisted) {
    tokenStore.refresh = persisted;
    return persisted;
  }
  return null;
}

export async function clearTokens() {
  tokenStore.access = null;
  tokenStore.refresh = null;
  await clearPersistedRefreshToken();
}

// ════════════════════════════════════════════════════════════════════════════
// UNAUTHORIZED CALLBACK — bridges axios interceptor to auth store
// Avoids circular dependency: client.ts → store → client.ts
// ════════════════════════════════════════════════════════════════════════════

let _onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(cb: () => void) {
  _onUnauthorized = cb;
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
  timeout: 30000,
  validateStatus: (status) => status >= 200 && status < 300,
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

    if ((error.response?.status === 401 || error.response?.status === 403) && !originalRequest._retry) {
      // ── Don't attempt refresh on auth endpoints — 401 means wrong      ──
      // ── credentials, not an expired session.                            ──
      const url = originalRequest.url || '';
      if (url.includes('/auth/signin') || url.includes('/auth/signup')) {
        return Promise.reject(error);
      }

      // ── Refresh request itself failed — immediate bailout ──────────────
      if (originalRequest.headers?.["X-Refresh-Request"] === "true") {
        await clearTokens();
        _onUnauthorized?.();
        if (
          typeof window !== "undefined" &&
          window.location.pathname !== AUTH_PATH
        ) {
          window.location.href = AUTH_PATH;
        }
        return Promise.reject(error);
      }

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
        const refreshToken = await getRefreshToken();
        if (!refreshToken) {
          throw new Error("No refresh token available");
        }

        // Mark refresh request to prevent deadlock:
        // if the refresh endpoint itself returns 401, the interceptor
        // will immediately bail out instead of queuing itself in failedQueue.
        const refreshResponse = await apiClient.post<{ access_token: string }>(
          "/auth/refresh",
          { refresh_token: refreshToken },
          { headers: { "X-Refresh-Request": "true" } } as any,
        );

        const { access_token } = refreshResponse.data;

        // Store new access token (keep same refresh token)
        await setTokens(access_token, refreshToken);

        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        processQueue(null, access_token);

        return apiClient(originalRequest);
      } catch (err) {
        await clearTokens();
        _onUnauthorized?.();
        processQueue(err, null);
        if (typeof window !== "undefined" && window.location.pathname !== AUTH_PATH) {
          window.location.href = AUTH_PATH;
        }
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default apiClient;
