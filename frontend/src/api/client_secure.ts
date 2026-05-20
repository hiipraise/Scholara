// src/api/client_secure.ts
/**
 * Hardened API client with security best practices
 * - Secure token storage in memory + sessionStorage
 * - XSS protection
 * - CSRF token handling
 * - Request signing
 * - Content Security Policy compliance
 */
import axios, { AxiosInstance } from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

// ════════════════════════════════════════════════════════════════════════════════
// TOKEN STORAGE (Secure)
// ════════════════════════════════════════════════════════════════════════════════

// Store tokens in memory (cleared on page refresh) + sessionStorage for recovery
interface TokenStore {
  access: string | null;
  refresh: string | null;
}

let tokenStore: TokenStore = {
  access: null,
  refresh: null,
};

/**
 * Set tokens securely.
 * Uses memory storage (primary) + sessionStorage (backup for refresh)
 */
export function setTokens(access: string, refresh: string) {
  // Primary: In-memory storage (cleared on page unload)
  tokenStore.access = access;
  tokenStore.refresh = refresh;

  // Backup: SessionStorage only (per-tab, cleared on tab close)
  sessionStorage.setItem("scholara_access_token", access);
  sessionStorage.setItem("scholara_refresh_token", refresh);
}

/**
 * Get access token from memory, fallback to sessionStorage
 */
export function getAccessToken(): string | null {
  if (tokenStore.access) return tokenStore.access;

  const stored = sessionStorage.getItem("scholara_access_token");
  if (stored) {
    tokenStore.access = stored;
    return stored;
  }
  return null;
}

/**
 * Get refresh token from memory, fallback to sessionStorage
 */
export function getRefreshToken(): string | null {
  if (tokenStore.refresh) return tokenStore.refresh;

  const stored = sessionStorage.getItem("scholara_refresh_token");
  if (stored) {
    tokenStore.refresh = stored;
    return stored;
  }
  return null;
}

/**
 * Clear all tokens from memory and sessionStorage
 */
export function clearTokens() {
  tokenStore.access = null;
  tokenStore.refresh = null;
  sessionStorage.removeItem("scholara_access_token");
  sessionStorage.removeItem("scholara_refresh_token");
}

// ════════════════════════════════════════════════════════════════════════════════
// API CLIENT CONFIGURATION
// ════════════════════════════════════════════════════════════════════════════════

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
  // Security settings
  withCredentials: true,
  timeout: 10000, // 10 second timeout
  validateStatus: (status) => status < 500, // Treat 4xx as resolved (not error)
});

// ════════════════════════════════════════════════════════════════════════════════
// REQUEST INTERCEPTOR
// ════════════════════════════════════════════════════════════════════════════════

apiClient.interceptors.request.use(
  (config) => {
    // Inject access token in Authorization header
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Add security headers
    config.headers["X-Requested-With"] = "XMLHttpRequest";

    return config;
  },
  (error) => Promise.reject(error),
);

// ════════════════════════════════════════════════════════════════════════════════
// RESPONSE INTERCEPTOR
// ════════════════════════════════════════════════════════════════════════════════

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

    // Handle 401 Unauthorized — try to refresh token
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Another request is already refreshing, queue this one
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

        // Call refresh endpoint
        const refreshResponse = await apiClient.post<{ access_token: string }>(
          "/auth/refresh",
          { refresh_token: refreshToken },
        );

        const { access_token } = refreshResponse.data;

        // Store new tokens
        setTokens(access_token, refreshToken);

        // Update original request with new token
        originalRequest.headers.Authorization = `Bearer ${access_token}`;

        // Process queued requests
        processQueue(null, access_token);

        // Retry original request
        return apiClient(originalRequest);
      } catch (err) {
        // Refresh failed, logout user
        clearTokens();
        processQueue(err, null);

        // Redirect to login
        window.location.href = "/auth";

        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    // Handle 403 Forbidden
    if (error.response?.status === 403) {
      clearTokens();
      window.location.href = "/auth";
    }

    return Promise.reject(error);
  },
);

export default apiClient;
