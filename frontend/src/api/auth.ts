// src/api/auth.ts
import apiClient from './client';
import type { User } from '../types';

export const authApi = {
  /** Email-only sign in — no OTP, no password */
  signIn: (email: string) =>
    apiClient.post<{ access_token: string; user: User }>('/auth/signin', { email }),

  getMe: () =>
    apiClient.get<User>('/auth/me'),

  changeEmail: (new_email: string) =>
    apiClient.put<{ access_token: string; new_email: string }>('/auth/email', { new_email }),
};
