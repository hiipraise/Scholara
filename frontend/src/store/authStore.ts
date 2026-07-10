// src/store/authStore.ts
/**
 * Authentication store — password-based with access + refresh tokens.
 * No emailVerified state — signup logs user in immediately.
 * Tokens managed via client.ts (in-memory + sessionStorage, no localStorage).
 */
import { create } from 'zustand';
import type { User } from '../types';
import { setTokens, clearTokens, getAccessToken } from '../api/client';
import { authApi } from '../api/auth';

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isHydrated: boolean;
  error: string | null;

  signUp: (email: string, password: string, invite_code: string, full_name?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  changePassword: (old_password: string, new_password: string) => Promise<void>;
  updateUser: (partial: Partial<User>) => void;
  setError: (error: string | null) => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isHydrated: false,
  error: null,

  signUp: async (email, password, invite_code, full_name) => {
    set({ isLoading: true, error: null });
    try {
      const res = await authApi.signUp({ email, password, invite_code, full_name });
      const { access_token, refresh_token, user } = res.data;
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
        error: err.response?.data?.detail || 'Signup failed',
      });
      throw err;
    }
  },

  signIn: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await authApi.signIn({ email, password });
      const { access_token, refresh_token, user } = res.data;
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
        error: err.response?.data?.detail || 'Login failed',
      });
      throw err;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await authApi.logout();
    } catch {
      // Logout is best-effort; clear tokens regardless.
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
      const res = await authApi.getMe();
      set({
        user: res.data,
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
        error: err.response?.data?.detail || 'Password change failed',
      });
      throw err;
    }
  },

  updateUser: (partial) => {
    const user = get().user;
    if (user) set({ user: { ...user, ...partial } });
  },

  setError: (error) => set({ error }),
}));