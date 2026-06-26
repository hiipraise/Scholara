// src/api/client.ts
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "/api";
const TOKEN_KEY = "scholara_token";
const AUTH_PATH = "/auth";

function isBrowserStorageAvailable() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function redirectToAuth() {
  if (typeof window !== "undefined" && window.location.pathname !== AUTH_PATH) {
    window.location.assign(AUTH_PATH);
  }
}

export const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
  },
  withCredentials: false,
});

// Token injection
apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token && /^[A-Za-z0-9._~+/-]+=*$/.test(token)) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response error handling
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      clearToken();
      redirectToAuth();
    }
    return Promise.reject(err);
  },
);

// Token storage — uses module-level variable (no localStorage)
let _token: string | null = null;

export function setToken(token: string) {
  if (!token || token.length > 4096) {
    clearToken();
    return;
  }
  _token = token;
  // Use sessionStorage as a fallback for page refresh (per-tab only, not localStorage)
  if (isBrowserStorageAvailable()) sessionStorage.setItem(TOKEN_KEY, token);
}

export function getToken(): string | null {
  if (_token) return _token;
  // Try to recover from sessionStorage after refresh
  if (!isBrowserStorageAvailable()) return null;
  const stored = sessionStorage.getItem(TOKEN_KEY);
  if (stored) {
    _token = stored;
    return stored;
  }
  return null;
}

export function clearToken() {
  _token = null;
  if (isBrowserStorageAvailable()) sessionStorage.removeItem(TOKEN_KEY);
}

export default apiClient;
