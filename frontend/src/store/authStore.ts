// src/store/authStore.ts
/**
 * Authentication store — password-based with access + refresh tokens.
 * No emailVerified state — signup logs user in immediately.
 * Tokens managed via client.ts (in-memory + IndexedDB + sessionStorage for access).
 */
import { create } from 'zustand';
import type { User } from '../types';
import { setTokens, clearTokens, getAccessToken, getRefreshToken, apiClient } from '../api/client';
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
  forceLogout: () => Promise<void>;
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
      await setTokens(access_token, refresh_token);
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
      await setTokens(access_token, refresh_token);
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
      await clearTokens();
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
      let token = getAccessToken();

      // If no access token in memory, try to use the refresh token from
      // IndexedDB to get a new one. This handles page refreshes and PWA
      // relaunches where only the refresh token survives.
      if (!token) {
        const storedRefreshToken = await getRefreshToken();
        if (storedRefreshToken) {
          try {
            const refreshRes = await apiClient.post<{ access_token: string }>(
              "/auth/refresh",
              { refresh_token: storedRefreshToken },
              { headers: { "X-Refresh-Request": "true" } } as any,
            );
            const { access_token } = refreshRes.data;
            await setTokens(access_token, storedRefreshToken);
            token = access_token;
          } catch {
            // Refresh failed — token may be expired or revoked.
            await clearTokens();
            set({ user: null, isAuthenticated: false, isHydrated: true });
            return;
          }
        } else {
          // No access token and no refresh token — nothing to restore.
          set({ isHydrated: true });
          return;
        }
      }

      // Now we have a valid access token — get the user profile.
      const res = await authApi.getMe();
      set({
        user: res.data,
        isAuthenticated: true,
        isHydrated: true,
      });
    } catch {
      await clearTokens();
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

  forceLogout: async () => {
    await clearTokens();
    set({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isHydrated: true,
      error: null,
    });
  },

  updateUser: (partial) => {
    const user = get().user;
    if (user) set({ user: { ...user, ...partial } });
  },

  setError: (error) => set({ error }),
}));