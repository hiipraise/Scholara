// src/api/client.ts
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
});

// Token injection
apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response error handling
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && err.config?.url?.includes("/auth/me")) {
      clearToken();
      window.location.href = "/auth";
    }
    return Promise.reject(err);
  },
);

// Token storage — uses module-level variable (no localStorage)
let _token: string | null = null;

export function setToken(token: string) {
  _token = token;
  // Use sessionStorage as a fallback for page refresh (per-tab only, not localStorage)
  sessionStorage.setItem("scholara_token", token);
}

export function getToken(): string | null {
  if (_token) return _token;
  // Try to recover from sessionStorage after refresh
  const stored = sessionStorage.getItem("scholara_token");
  if (stored) {
    _token = stored;
    return stored;
  }
  return null;
}

export function clearToken() {
  _token = null;
  sessionStorage.removeItem("scholara_token");
}

export default apiClient;
