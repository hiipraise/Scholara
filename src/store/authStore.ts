// src/store/authStore.ts
import { create } from 'zustand';
import type { User } from '../types';
import { setToken, clearToken, getToken } from '../api/client';
import { authApi } from '../api/auth';

interface AuthStore {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isHydrated: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  updateUser: (partial: Partial<User>) => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  token: getToken(),
  isAuthenticated: false,
  isHydrated: false,

  setAuth: (user, token) => {
    setToken(token);
    set({
      user,
      token,
      isAuthenticated: true,
      isHydrated: true,
    });
  },

  logout: () => {
    clearToken();
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      isHydrated: true,
    });
  },

  refreshUser: async () => {
    try {
      const token = getToken();
      if (!token) {
        set({ isHydrated: true });
        return;
      }

      const res = await authApi.getMe();

      set({
        user: res.data,
        token,
        isAuthenticated: true,
        isHydrated: true,
      });
    } catch {
      get().logout();
    }
  },

  updateUser: (partial) => {
    const user = get().user;
    if (user) set({ user: { ...user, ...partial } });
  },
}));