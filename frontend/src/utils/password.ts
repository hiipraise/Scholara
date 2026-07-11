/**
 * Shared password-strength validation (client-side convenience).
 *
 * The **authoritative** server-side check lives in backend/app/core/password.py.
 * This copy exists solely for realtime UX feedback — never trust it for
 * enforcement.
 */

export function validatePasswordStrength(pw: string): string[] {
  const errors: string[] = [];
  if (pw.length < 8) errors.push("At least 8 characters");
  if (!/[A-Z]/.test(pw)) errors.push("One uppercase letter");
  if (!/[a-z]/.test(pw)) errors.push("One lowercase letter");
  if (!/[0-9]/.test(pw)) errors.push("One digit");
  if (!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(pw))
    errors.push("One special character");
  return errors;
}
