import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Lock, Eye, EyeOff, Check, AlertTriangle } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import toast from "react-hot-toast";
import clsx from "clsx";

export default function ForcePasswordChange() {
  const navigate = useNavigate();
  const { user, changePassword, isLoading } = useAuthStore();

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validatePasswordStrength(pw: string): string[] {
    const errors: string[] = [];
    if (pw.length < 8) errors.push("At least 8 characters");
    if (!/[A-Z]/.test(pw)) errors.push("One uppercase letter");
    if (!/[a-z]/.test(pw)) errors.push("One lowercase letter");
    if (!/[0-9]/.test(pw)) errors.push("One digit");
    if (!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(pw))
      errors.push("One special character");
    return errors;
  }

  function canSubmit(): boolean {
    if (!oldPassword || !newPassword || !confirmPassword) return false;
    if (newPassword !== confirmPassword) return false;
    if (oldPassword === newPassword) return false;
    return validatePasswordStrength(newPassword).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit() || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      await changePassword(oldPassword, newPassword);
      // Clear the must_change_password flag in the store to prevent
      // ProtectedRoute from redirecting right back.
      useAuthStore.getState().updateUser({ must_change_password: false });
      toast.success("Password updated. You can now access your account.");
      navigate("/");
    } catch (err: any) {
      const msg =
        err.response?.data?.detail || "Failed to update password.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const strengthIssues = newPassword ? validatePasswordStrength(newPassword) : [];

  return (
    <div className="min-h-screen bg-[#212842] text-cream-200 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="card p-6 sm:p-8">
          {/* Header */}
          <div className="flex items-start gap-3 mb-6">
            <div className="rounded-xl bg-accent-gold/15 p-2.5 shrink-0">
              <AlertTriangle size={20} className="text-accent-gold" />
            </div>
            <div>
              <h1 className="font-display text-xl font-semibold text-cream-200">
                Password reset required
              </h1>
              <p className="text-cream-200/50 text-sm mt-1">
                An administrator has reset your password. You must set a new
                password before accessing your account.
              </p>
            </div>
          </div>

          <p className="text-cream-200/35 text-xs mb-5 pb-4 border-b border-cream-200/8">
            Signed in as{" "}
            <span className="text-cream-200/70 font-medium">
              {user?.email}
            </span>
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Current password */}
            <div>
              <label className="block text-cream-200/40 text-xs uppercase tracking-wider mb-1.5">
                Current password (set by admin)
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="input-field text-sm pr-10"
                  placeholder="Enter the temporary password"
                  autoComplete="current-password"
                  autoFocus
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-cream-200/30 hover:text-cream-200/60 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* New password */}
            <div>
              <label className="block text-cream-200/40 text-xs uppercase tracking-wider mb-1.5">
                New password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input-field text-sm pr-10"
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-cream-200/30 hover:text-cream-200/60 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Confirm new password */}
            <div>
              <label className="block text-cream-200/40 text-xs uppercase tracking-wider mb-1.5">
                Confirm new password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input-field text-sm pr-10"
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-cream-200/30 hover:text-cream-200/60 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>



            {/* Strength validation */}
            {newPassword && (
              <div className="space-y-1.5 bg-cream-200/4 rounded-xl p-3">
                <div className="text-cream-200/28 text-[10px] uppercase tracking-wider mb-1.5">
                  Requirements
                </div>
                {[
                  {
                    label: "At least 8 characters",
                    test: newPassword.length >= 8,
                  },
                  { label: "One uppercase letter", test: /[A-Z]/.test(newPassword) },
                  { label: "One lowercase letter", test: /[a-z]/.test(newPassword) },
                  { label: "One digit", test: /[0-9]/.test(newPassword) },
                  {
                    label: "One special character",
                    test: /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(newPassword),
                  },
                  ...(confirmPassword
                    ? [
                        {
                          label: "Passwords match",
                          test: newPassword === confirmPassword,
                        },
                      ]
                    : []),
                  ...(oldPassword && newPassword
                    ? [
                        {
                          label: "Different from current",
                          test: oldPassword !== newPassword,
                        },
                      ]
                    : []),
                ].map(({ label, test }) => (
                  <div key={label} className="flex items-center gap-2">
                    <div
                      className={clsx(
                        "w-1.5 h-1.5 rounded-full shrink-0",
                        test ? "bg-accent-sage" : "bg-cream-200/15",
                      )}
                    />
                    <span
                      className={clsx(
                        "text-[11px]",
                        test ? "text-cream-200/55" : "text-cream-200/25",
                      )}
                    >
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Error */}
            {error && (
              <p className="text-accent-coral text-sm">{error}</p>
            )}

            {/* Submit */}
            <motion.button
              type="submit"
              disabled={!canSubmit() || submitting}
              whileTap={{ scale: 0.98 }}
              className="mt-2 w-full rounded-xl border border-cream-200/20 bg-cream-200 px-6 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-indigo-700 transition hover:bg-cream-100 focus:outline-none focus:ring-2 focus:ring-cream-200/60 disabled:cursor-not-allowed disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <Lock size={14} />
              {submitting ? "Updating..." : "Set New Password"}
            </motion.button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
