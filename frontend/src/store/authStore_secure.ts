// src/store/authStore_secure.ts
/**
 * Secure authentication store with refresh token support
 */
import { create } from "zustand";
import type { User } from "../types";
import { setTokens, clearTokens, getAccessToken } from "../api/client_secure";
import { authApi } from "../api/auth_secure";

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isHydrated: boolean;
  error: string | null;
  emailVerified: boolean;

  // Actions
  signUp: (
    email: string,
    password: string,
    full_name?: string,
  ) => Promise<void>;
  verifyEmail: (email: string, token: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  changePassword: (old_password: string, new_password: string) => Promise<void>;
  setError: (error: string | null) => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isHydrated: false,
  error: null,
  emailVerified: true,

  signUp: async (email, password, full_name) => {
    set({ isLoading: true, error: null });
    try {
      await authApi.signUp({ email, password, full_name });
      set({ isLoading: false, emailVerified: false });
    } catch (err: any) {
      set({
        isLoading: false,
        error: err.response?.data?.detail || "Signup failed",
      });
      throw err;
    }
  },

  verifyEmail: async (email, token) => {
    set({ isLoading: true, error: null });
    try {
      await authApi.verifyEmail({ email, token });
      set({ isLoading: false, emailVerified: true });
    } catch (err: any) {
      set({
        isLoading: false,
        error: err.response?.data?.detail || "Verification failed",
      });
      throw err;
    }
  },

  signIn: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.signIn({ email, password });
      const { access_token, refresh_token, user } = response.data;

      // Store tokens securely
      setTokens(access_token, refresh_token);

      set({
        user,
        isAuthenticated: true,
        isLoading: false,
        isHydrated: true,
        error: null,
      });
    } catch (err: any) {
      set({
        isLoading: false,
        error: err.response?.data?.detail || "Login failed",
      });
      throw err;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await authApi.logout();
    } finally {
      clearTokens();
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isHydrated: true,
        error: null,
      });
    }
  },

  refreshUser: async () => {
    try {
      const token = getAccessToken();
      if (!token) {
        set({ isHydrated: true });
        return;
      }

      const response = await authApi.getMe();
      set({
        user: response.data,
        isAuthenticated: true,
        isHydrated: true,
      });
    } catch {
      clearTokens();
      set({
        user: null,
        isAuthenticated: false,
        isHydrated: true,
      });
    }
  },

  changePassword: async (old_password, new_password) => {
    set({ isLoading: true, error: null });
    try {
      await authApi.changePassword(old_password, new_password);
      set({ isLoading: false });
    } catch (err: any) {
      set({
        isLoading: false,
        error: err.response?.data?.detail || "Password change failed",
      });
      throw err;
    }
  },

  setError: (error) => set({ error }),
}));
