// src/api/auth.ts
/**
 * Authentication API — password-based with invite-code signup gating.
 * No email verification flow.
 */
import apiClient from './client';
import type { User } from '../types';

export interface SignUpData {
  email: string;
  password: string;
  invite_code: string;
  full_name?: string;
}

export interface SignInData {
  email: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
  message?: string;
}

export const authApi = {
  /**
   * Sign up with email + password + invite code.
   * Logs the user in immediately on success.
   */
  signUp: (data: SignUpData) =>
    apiClient.post<AuthResponse>('/auth/signup', data),

  /**
   * Sign in with email + password.
   * Returns access + refresh tokens.
   */
  signIn: (data: SignInData) =>
    apiClient.post<AuthResponse>('/auth/signin', data),

  /**
   * Get current user profile.
   */
  getMe: () => apiClient.get<User>('/auth/me'),

  /**
   * Change password (requires old password verification).
   */
  changePassword: (old_password: string, new_password: string) =>
    apiClient.put<{ message: string }>('/auth/password', { old_password, new_password }),

  /**
   * Change email (requires password confirmation).
   */
  changeEmail: (new_email: string, password: string) =>
    apiClient.put<{ access_token: string; refresh_token: string; new_email: string }>(
      '/auth/email',
      { new_email, password },
    ),

  /**
   * Logout (client-side token clear, server-side not required).
   */
  logout: () => apiClient.post<{ message: string }>('/auth/logout'),
};
