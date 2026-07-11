import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  Mail,
  Lock,
  Edit2,
  Save,
  X,
  Shield,
  GraduationCap,
  Check,
  Eye,
  EyeOff,
  AlertTriangle,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { setTokens } from "../api/client";
import { authApi } from "../api/auth";
import { usersApi } from "../api/index";
import { validatePasswordStrength } from "../utils/password";
import toast from "react-hot-toast";
import clsx from "clsx";

export default function ProfilePage() {
  const { user, updateUser } = useAuthStore();

  const [editName, setEditName] = useState(false);
  const [nameVal, setNameVal] = useState(user?.full_name || "");
  const [editEmail, setEditEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [editAcademic, setEditAcademic] = useState(false);
  const [levelVal, setLevelVal] = useState(user?.level || "100L");
  const [semesterVal, setSemesterVal] = useState<number>(user?.semester || 1);
  const [editPassword, setEditPassword] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

  const nameMutation = useMutation({
    mutationFn: (name: string) => usersApi.updateProfile({ full_name: name }),
    onSuccess: () => {
      updateUser({ full_name: nameVal });
      setEditName(false);
      toast.success("Name updated");
    },
  });

  const emailMutation = useMutation({
    mutationFn: () => authApi.changeEmail(newEmail, passwordConfirm),
    onSuccess: (res) => {
      updateUser({ email: res.data.new_email });
      setTokens(res.data.access_token, res.data.refresh_token);
      setEditEmail(false);
      setNewEmail("");
      setPasswordConfirm("");
      toast.success("Email updated");
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.detail || "Failed to update email"),
  });

  const academicMutation = useMutation({
    mutationFn: () =>
      usersApi.updateProfile({ level: levelVal, semester: semesterVal }),
    onSuccess: () => {
      updateUser({ level: levelVal, semester: semesterVal });
      setEditAcademic(false);
      toast.success("Academic settings updated");
    },
    onError: (e: any) =>
      toast.error(
        e.response?.data?.detail || "Failed to update academic settings",
      ),
  });

  const passwordMutation = useMutation({
    mutationFn: () =>
      useAuthStore.getState().changePassword(oldPassword, newPassword),
    onSuccess: () => {
      setEditPassword(false);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password updated");
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.detail || "Failed to update password"),
  });

  function canSubmitPassword(): boolean {
    if (!oldPassword || !newPassword || !confirmPassword) return false;
    if (newPassword !== confirmPassword) return false;
    if (oldPassword === newPassword) return false;
    return validatePasswordStrength(newPassword).length === 0;
  }

  const ROLE_CONFIG: Record<
    string,
    { label: string; color: string; icon: React.ElementType }
  > = {
    superadmin: {
      label: "SuperAdmin",
      color: "text-accent-gold",
      icon: Shield,
    },
    admin: { label: "Admin", color: "text-accent-sky", icon: Shield },
    student: {
      label: "Student",
      color: "text-cream-200/55",
      icon: GraduationCap,
    },
  };
  const roleConf = ROLE_CONFIG[user?.role || "student"];
  const RoleIcon = roleConf.icon;

  return (
    <div className="space-y-6 pb-12 max-w-2xl">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="text-cream-200/35 text-xs tracking-widest uppercase font-body mb-1">
          Account
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-cream-200">
          Profile
        </h1>
      </motion.div>

      {/* Identity card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card p-6"
      >
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-cream-200/8 border border-cream-200/10 flex items-center justify-center shrink-0">
            <User size={26} className="text-cream-200/35" />
          </div>
          <div className="min-w-0">
            <div className="font-display text-xl font-semibold text-cream-200">
              {user?.full_name || (
                <span className="text-cream-200/30 italic text-base">
                  Name not set
                </span>
              )}
            </div>
            <div className="text-cream-200/45 text-sm mt-0.5 truncate">
              {user?.email}
            </div>
            <div
              className={clsx(
                "flex items-center gap-1.5 mt-2 text-xs font-medium",
                roleConf.color,
              )}
            >
              <RoleIcon size={12} />
              {roleConf.label} · {user?.level} · Semester {user?.semester}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Academic settings */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="card p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <GraduationCap size={15} className="text-cream-200/40" />
            <span className="text-cream-200/70 text-sm font-semibold">
              Academic Settings
            </span>
          </div>
          {!editAcademic ? (
            <button
              onClick={() => {
                setLevelVal(user?.level || "100L");
                setSemesterVal(user?.semester || 1);
                setEditAcademic(true);
              }}
              className="flex items-center gap-1.5 text-cream-200/30 hover:text-cream-200/65 text-xs transition-colors"
            >
              <Edit2 size={12} /> Edit
            </button>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => academicMutation.mutate()}
                disabled={academicMutation.isPending}
                className="flex items-center gap-1.5 text-accent-sage text-xs hover:opacity-80"
              >
                <Save size={12} />{" "}
                {academicMutation.isPending ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => setEditAcademic(false)}
                className="flex items-center gap-1.5 text-cream-200/30 text-xs hover:text-cream-200/60"
              >
                <X size={12} /> Cancel
              </button>
            </div>
          )}
        </div>

        {editAcademic ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-cream-200/28 text-[10px] uppercase tracking-wider mb-1">
                Level
              </div>
              <select
                value={levelVal}
                onChange={(e) => setLevelVal(e.target.value)}
                className="input-field"
              >
                {["100L", "200L", "300L", "400L"].map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-cream-200/28 text-[10px] uppercase tracking-wider mb-1">
                Semester
              </div>
              <select
                value={semesterVal}
                onChange={(e) => setSemesterVal(Number(e.target.value))}
                className="input-field"
              >
                <option value={1}>Semester 1</option>
                <option value={2}>Semester 2</option>
              </select>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-cream-200/4 rounded-xl p-3">
              <div className="text-cream-200/28 text-[10px] uppercase tracking-wider mb-1">
                Level
              </div>
              <div className="text-cream-200/70 text-sm font-medium">
                {user?.level}
              </div>
            </div>
            <div className="bg-cream-200/4 rounded-xl p-3">
              <div className="text-cream-200/28 text-[10px] uppercase tracking-wider mb-1">
                Semester
              </div>
              <div className="text-cream-200/70 text-sm font-medium">
                Semester {user?.semester}
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* Full Name */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="card p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <User size={15} className="text-cream-200/40" />
            <span className="text-cream-200/70 text-sm font-semibold">
              Full Name
            </span>
          </div>
          {!editName ? (
            <button
              onClick={() => {
                setNameVal(user?.full_name || "");
                setEditName(true);
              }}
              className="flex items-center gap-1.5 text-cream-200/30 hover:text-cream-200/65 text-xs transition-colors"
            >
              <Edit2 size={12} /> Edit
            </button>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => nameMutation.mutate(nameVal)}
                disabled={nameMutation.isPending}
                className="flex items-center gap-1.5 text-accent-sage text-xs hover:opacity-80"
              >
                <Save size={12} />{" "}
                {nameMutation.isPending ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => setEditName(false)}
                className="flex items-center gap-1.5 text-cream-200/30 text-xs hover:text-cream-200/60"
              >
                <X size={12} /> Cancel
              </button>
            </div>
          )}
        </div>
        {editName ? (
          <input
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && nameMutation.mutate(nameVal)}
            className="input-field"
            autoFocus
            placeholder="Your full name"
          />
        ) : (
          <p className="text-cream-200/60 text-sm">
            {user?.full_name || (
              <span className="text-cream-200/25 italic">Not set</span>
            )}
          </p>
        )}
      </motion.div>

      {/* Email */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="card p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Mail size={15} className="text-cream-200/40" />
            <span className="text-cream-200/70 text-sm font-semibold">
              Email Address
            </span>
          </div>
          {!editEmail && (
            <button
              onClick={() => setEditEmail(true)}
              className="flex items-center gap-1.5 text-cream-200/30 hover:text-cream-200/65 text-xs transition-colors"
            >
              <Edit2 size={12} /> Change
            </button>
          )}
        </div>

        <p className="text-cream-200/70 text-sm font-mono mb-3">
          {user?.email}
        </p>

        <AnimatePresence>
          {editEmail && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-3 border-t border-cream-200/8 space-y-3">
                <p className="text-cream-200/35 text-xs">
                  Changing your email grants access under the new address
                  immediately. Confirm your current password to proceed.
                </p>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="input-field text-sm"
                  placeholder="new@email.com"
                  autoFocus
                />
                <input
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  className="input-field text-sm mt-2"
                  placeholder="Current password to confirm"
                  autoComplete="current-password"
                />
                <div className="flex gap-3 mt-2">
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => emailMutation.mutate()}
                    disabled={!newEmail || !passwordConfirm || emailMutation.isPending}
                    className="btn-primary text-sm flex items-center gap-2"
                  >
                    <Check size={14} />
                    {emailMutation.isPending ? "Updating..." : "Update Email"}
                  </motion.button>
                  <button
                    onClick={() => {
                      setEditEmail(false);
                      setNewEmail("");
                      setPasswordConfirm("");
                    }}
                    className="btn-ghost text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Change Password */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.23 }}
        className="card p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Lock size={15} className="text-cream-200/40" />
            <span className="text-cream-200/70 text-sm font-semibold">
              Change Password
            </span>
          </div>
          {!editPassword ? (
            <button
              onClick={() => setEditPassword(true)}
              className="flex items-center gap-1.5 text-cream-200/30 hover:text-cream-200/65 text-xs transition-colors"
            >
              <Edit2 size={12} /> Change
            </button>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => {
                  if (passwordMutation.isPending) return;
                  setShowPasswordConfirm(true);
                }}
                disabled={!canSubmitPassword() || passwordMutation.isPending}
                className="flex items-center gap-1.5 text-accent-sage text-xs hover:opacity-80 disabled:opacity-40"
              >
                <Save size={12} />{" "}
                {passwordMutation.isPending ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => {
                  setEditPassword(false);
                  setOldPassword("");
                  setNewPassword("");
                  setConfirmPassword("");
                }}
                className="flex items-center gap-1.5 text-cream-200/30 text-xs hover:text-cream-200/60"
              >
                <X size={12} /> Cancel
              </button>
            </div>
          )}
        </div>

        <AnimatePresence>
          {editPassword ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-3 border-t border-cream-200/8 space-y-3">
                <p className="text-cream-200/35 text-xs">
                  Enter your current password and a new password. Must be at
                  least 8 characters with uppercase, lowercase, digit, and
                  special character.
                </p>

                {/* Current password */}
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    className="input-field text-sm pr-10"
                    placeholder="Current password"
                    autoComplete="current-password"
                    autoFocus
                  />
                </div>

                {/* New password */}
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="input-field text-sm pr-10"
                    placeholder="New password"
                    autoComplete="new-password"
                  />
                </div>

                {/* Confirm new password */}
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input-field text-sm pr-10"
                    placeholder="Confirm new password"
                    autoComplete="new-password"
                  />
                </div>

                {/* Show/hide toggle */}
                <button
                  onClick={() => setShowPassword((v) => !v)}
                  className="flex items-center gap-1.5 text-cream-200/25 hover:text-cream-200/50 text-xs transition-colors"
                >
                  {showPassword ? (
                    <EyeOff size={13} />
                  ) : (
                    <Eye size={13} />
                  )}
                  {showPassword ? "Hide" : "Show"} passwords
                </button>

                {/* Strength validation */}
                {newPassword && (
                  <div className="space-y-1">
                    <div className="text-cream-200/28 text-[10px] uppercase tracking-wider">
                      Requirements
                    </div>
                    {[
                      { label: "At least 8 characters", test: newPassword.length >= 8 },
                      { label: "One uppercase letter", test: /[A-Z]/.test(newPassword) },
                      { label: "One lowercase letter", test: /[a-z]/.test(newPassword) },
                      { label: "One digit", test: /[0-9]/.test(newPassword) },
                      { label: "One special character", test: /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(newPassword) },
                      ...(confirmPassword
                        ? [{ label: "Passwords match", test: newPassword === confirmPassword }]
                        : []),
                      ...(oldPassword && newPassword
                        ? [{ label: "Different from current", test: oldPassword !== newPassword }]
                        : []),
                    ].map(({ label, test }) => (
                      <div
                        key={label}
                        className="flex items-center gap-2"
                      >
                        <div
                          className={clsx(
                            "w-1.5 h-1.5 rounded-full shrink-0",
                            test ? "bg-accent-sage" : "bg-cream-200/15",
                          )}
                        />
                        <span
                          className={clsx(
                            "text-[11px]",
                            test
                              ? "text-cream-200/55"
                              : "text-cream-200/25",
                          )}
                        >
                          {label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setShowPasswordConfirm(true)}
                    disabled={!canSubmitPassword() || passwordMutation.isPending}
                    className="btn-primary text-sm flex items-center gap-2"
                  >
                    <Check size={14} />
                    {passwordMutation.isPending
                      ? "Updating..."
                      : "Update Password"}
                  </motion.button>
                  <button
                    onClick={() => {
                      setEditPassword(false);
                      setOldPassword("");
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                    className="btn-ghost text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            <p className="text-cream-200/35 text-xs">
              Last changed — review your account security regularly.
            </p>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Password change confirmation modal */}
      <AnimatePresence>
        {showPasswordConfirm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-40"
              onClick={() => setShowPasswordConfirm(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="w-full max-w-md card p-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-accent-gold/15 p-2.5 shrink-0">
                    <AlertTriangle size={20} className="text-accent-gold" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-display text-lg text-cream-200">
                      Change password?
                    </h4>
                    <p className="text-cream-200/55 text-sm mt-2">
                      You will be signed out after changing your password.
                      Make sure you remember your new password before
                      proceeding.
                    </p>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-5">
                  <button
                    className="btn-ghost text-sm"
                    onClick={() => setShowPasswordConfirm(false)}
                    disabled={passwordMutation.isPending}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-primary text-sm flex items-center gap-2"
                    onClick={() => {
                      setShowPasswordConfirm(false);
                      passwordMutation.mutate();
                    }}
                    disabled={passwordMutation.isPending}
                  >
                    <Lock size={13} />
                    {passwordMutation.isPending
                      ? "Changing..."
                      : "Change Password"}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Account info grid */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="card p-5"
      >
        <h3 className="text-cream-200/55 text-sm font-semibold mb-4">
          Account Details
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Role", value: user?.role },
            { label: "Level", value: user?.level },
            { label: "Semester", value: `Semester ${user?.semester}` },
            { label: "Status", value: user?.is_active ? "Active" : "Inactive" },
            { label: "Program", value: "BSc. Software Engineering" },
            { label: "AI Engine", value: "Nexus Core v2.0" },
          ].map(({ label, value }) => (
            <div key={label} className="bg-cream-200/4 rounded-xl p-3">
              <div className="text-cream-200/28 text-[10px] uppercase tracking-wider mb-1">
                {label}
              </div>
              <div className="text-cream-200/70 text-sm font-medium capitalize">
                {value}
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
