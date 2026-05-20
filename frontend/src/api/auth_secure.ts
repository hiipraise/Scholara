// src/api/auth_secure.ts
/**
 * Enhanced authentication API with password support and email verification
 */
import apiClient from "./client_secure";
import type { User } from "../types";

export interface SignUpData {
  email: string;
  password: string;
  full_name?: string;
}

export interface SignInData {
  email: string;
  password: string;
}

export interface VerifyEmailData {
  email: string;
  token: string;
}

export const authApi = {
  /**
   * Sign up new account with password
   */
  signUp: (data: SignUpData) =>
    apiClient.post<{ message: string; email: string; email_verified: boolean }>(
      "/auth/signup",
      data,
    ),

  /**
   * Verify email using token
   */
  verifyEmail: (data: VerifyEmailData) =>
    apiClient.post<{ message: string }>("/auth/verify-email", data),

  /**
   * Sign in with email and password
   * Returns both access and refresh tokens
   */
  signIn: (data: SignInData) =>
    apiClient.post<{
      access_token: string;
      refresh_token: string;
      token_type: string;
      user: User;
    }>("/auth/signin", data),

  /**
   * Get current user profile
   */
  getMe: () => apiClient.get<User>("/auth/me"),

  /**
   * Change password
   */
  changePassword: (old_password: string, new_password: string) =>
    apiClient.put<{ message: string }>("/auth/password", {
      old_password,
      new_password,
    }),

  /**
   * Logout (client-side token clear)
   */
  logout: () => apiClient.post<{ message: string }>("/auth/logout"),
};
