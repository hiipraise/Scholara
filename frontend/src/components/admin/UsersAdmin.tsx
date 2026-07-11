import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Shield,
  GraduationCap,
  Edit2,
  Save,
  X,
  KeyRound,
  Copy,
  AlertTriangle,
  CheckCircle,
  Trash2,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import clsx from "clsx";
import { adminApi } from "../../api/index";
import type { AuditLogEntry } from "../../types";
import toast from "react-hot-toast";

const ROLE_BADGE: Record<string, string> = {
  superadmin: "bg-accent-gold/15 text-accent-gold border-accent-gold/25",
  admin: "bg-accent-sky/15 text-accent-sky border-accent-sky/25",
  student: "bg-cream-200/8 text-cream-200/50 border-cream-200/10",
};

export default function UsersAdmin() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({
    email: "",
    full_name: "",
    role: "student",
    level: "100L",
    semester: 1,
  });
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState("student");
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{
    email: string;
    new_password: string;
  } | null>(null);

  const { data: users } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => adminApi.listUsers().then((r) => r.data.items),
  });

  const { data: auditLogs } = useQuery({
    queryKey: ["admin-audit-logs"],
    queryFn: () => adminApi.getAuditLogs().then((r) => r.data.items),
  });

  const createMutation = useMutation({
    mutationFn: () => adminApi.createUser(newUser),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("User created");
      setShowCreate(false);
      setNewUser({
        email: "",
        full_name: "",
        role: "student",
        level: "100L",
        semester: 1,
      });
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.detail || "Failed to create user"),
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      adminApi.updateUserRole(id, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setEditingRole(null);
      toast.success("Role updated");
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => adminApi.deactivateUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("User deactivated");
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (id: string) => adminApi.resetPassword(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      const found = users?.find((u) => u.id === res.data.user_id);
      setResetResult({
        email: found?.email || res.data.user_id,
        new_password: res.data.new_password,
      });
      setResettingUserId(null);
    },
    onError: (e: any) => {
      setResettingUserId(null);
      toast.error(e.response?.data?.detail || "Failed to reset password");
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-cream-200/70 text-sm font-semibold">
          Users ({users?.length ?? 0})
        </h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 btn-ghost text-sm"
        >
          <Plus size={13} /> Add User
        </button>
      </div>

      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="card p-5 mb-3">
              <h4 className="text-cream-200/60 text-xs font-semibold uppercase tracking-wider mb-3">
                Create New User
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                <input
                  placeholder="Email address"
                  type="email"
                  value={newUser.email}
                  onChange={(e) =>
                    setNewUser((u) => ({ ...u, email: e.target.value }))
                  }
                  className="input-field col-span-2 sm:col-span-1"
                />
                <input
                  placeholder="Full name (optional)"
                  value={newUser.full_name}
                  onChange={(e) =>
                    setNewUser((u) => ({ ...u, full_name: e.target.value }))
                  }
                  className="input-field"
                />
                <select
                  value={newUser.role}
                  onChange={(e) =>
                    setNewUser((u) => ({ ...u, role: e.target.value }))
                  }
                  className="input-field"
                >
                  <option value="student">Student</option>
                  <option value="admin">Admin</option>
                  <option value="superadmin">SuperAdmin</option>
                </select>
                <select
                  value={newUser.level}
                  onChange={(e) =>
                    setNewUser((u) => ({ ...u, level: e.target.value }))
                  }
                  className="input-field"
                >
                  {["100L", "200L", "300L", "400L"].map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
                <select
                  value={newUser.semester}
                  onChange={(e) =>
                    setNewUser((u) => ({
                      ...u,
                      semester: Number(e.target.value),
                    }))
                  }
                  className="input-field"
                >
                  <option value={1}>Semester 1</option>
                  <option value={2}>Semester 2</option>
                </select>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => createMutation.mutate()}
                  disabled={!newUser.email || createMutation.isPending}
                  className="btn-primary text-sm"
                >
                  {createMutation.isPending ? "Creating..." : "Create User"}
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  className="btn-ghost text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* User list */}
      <div className="card overflow-hidden divide-y divide-cream-200/6">
        {users?.map((u) => (
          <div key={u.id} className="flex items-center gap-4 px-4 py-3">
            <div className="w-9 h-9 rounded-xl bg-cream-200/8 flex items-center justify-center shrink-0">
              {u.role === "superadmin" ? (
                <Shield size={15} className="text-accent-gold/70" />
              ) : (
                <GraduationCap size={15} className="text-cream-200/40" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-cream-200/85 text-sm font-medium truncate">
                {u.full_name || u.email}
              </div>
              <div className="text-cream-200/35 text-xs mt-0.5 truncate">
                {u.email}
              </div>
              <div className="text-cream-200/25 text-[10px]">
                {u.level} · Sem {u.semester}
              </div>
              {u.must_change_password && (
                <span className="badge border border-accent-gold/25 bg-accent-gold/12 text-accent-gold text-[10px]">
                  Force reset
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {editingRole === u.id ? (
                <div className="flex items-center gap-2">
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                    className="input-field py-1.5 text-xs"
                  >
                    <option value="student">Student</option>
                    <option value="admin">Admin</option>
                    <option value="superadmin">SuperAdmin</option>
                  </select>
                  <button
                    onClick={() =>
                      roleMutation.mutate({ id: u.id, role: selectedRole })
                    }
                    className="p-1.5 rounded-lg bg-cream-200/10 text-cream-200/70 hover:bg-cream-200/20"
                  >
                    <Save size={12} />
                  </button>
                  <button
                    onClick={() => setEditingRole(null)}
                    className="p-1.5 rounded-lg text-cream-200/30 hover:text-cream-200/60"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <>
                  <span
                    className={clsx(
                      "badge border text-[10px]",
                      ROLE_BADGE[u.role] || ROLE_BADGE.student,
                    )}
                  >
                    {u.role}
                  </span>
                  <button
                    onClick={() => {
                      setEditingRole(u.id);
                      setSelectedRole(u.role);
                    }}
                    className="p-1.5 rounded-lg text-cream-200/20 hover:text-cream-200/60 hover:bg-cream-200/8 transition-colors"
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    onClick={() => setResettingUserId(u.id)}
                    disabled={resetPasswordMutation.isPending}
                    className="p-1.5 rounded-lg text-cream-200/20 hover:text-accent-sky hover:bg-accent-sky/10 transition-colors disabled:opacity-30"
                    title="Reset password"
                  >
                    <KeyRound size={12} />
                  </button>
                  {u.is_active && (
                    <button
                      onClick={() => deactivateMutation.mutate(u.id)}
                      className="p-1.5 rounded-lg text-cream-200/20 hover:text-accent-coral hover:bg-accent-coral/10 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
        {(!users || users.length === 0) && (
          <div className="p-8 text-center text-cream-200/30 text-sm">
            No users found.
          </div>
        )}
      </div>

      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-cream-200/70 text-sm font-semibold">
              Audit Log
            </h4>
            <p className="text-cream-200/35 text-xs mt-1">
              Latest 100 destructive actions and privileged changes.
            </p>
          </div>
          <span className="badge border border-cream-200/10 text-cream-200/45 text-[10px]">
            {auditLogs?.length ?? 0} entries
          </span>
        </div>

        <div className="space-y-2 max-h-[32rem] overflow-auto pr-1">
          {auditLogs && auditLogs.length > 0 ? (
            auditLogs.map((entry: AuditLogEntry) => (
              <div
                key={entry.id}
                className="rounded-xl border border-cream-200/8 bg-cream-200/4 px-3 py-2"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-cream-200/85 text-sm font-medium truncate">
                      {entry.action}
                    </div>
                    <div className="text-cream-200/35 text-xs truncate">
                      actor {entry.actor_id} · target {entry.target_id}
                    </div>
                  </div>
                  <div className="text-cream-200/30 text-[10px] shrink-0">
                    {format(parseISO(entry.timestamp), "MMM d, yyyy h:mm a")}
                  </div>
                </div>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-black/20 p-2 text-[10px] leading-relaxed text-cream-200/55">
                  {JSON.stringify(entry.payload, null, 2)}
                </pre>
              </div>
            ))
          ) : (
            <p className="text-cream-200/35 text-sm">No audit entries yet.</p>
          )}
        </div>
      </div>

      {/* ── Reset Password: Confirmation Modal ──────────────────────────────── */}
      <AnimatePresence>
        {resettingUserId && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-40"
              onClick={() => setResettingUserId(null)}
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
                      Reset password?
                    </h4>
                    <p className="text-cream-200/55 text-sm mt-2">
                      This will reset the password for{" "}
                      <strong className="text-cream-200/80">
                        {users?.find((u) => u.id === resettingUserId)?.email ||
                          resettingUserId}
                      </strong>
                      . Their current password will stop working immediately.
                    </p>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-5">
                  <button
                    className="btn-ghost text-sm"
                    onClick={() => setResettingUserId(null)}
                    disabled={resetPasswordMutation.isPending}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-primary text-sm flex items-center gap-2"
                    onClick={() => {
                      if (resettingUserId)
                        resetPasswordMutation.mutate(resettingUserId);
                    }}
                    disabled={resetPasswordMutation.isPending}
                  >
                    <KeyRound size={13} />
                    {resetPasswordMutation.isPending
                      ? "Resetting..."
                      : "Reset Password"}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Reset Password: New Password Display Modal ───────────────────────── */}
      <AnimatePresence>
        {resetResult && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-40"
              onClick={() => setResetResult(null)}
            />
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="w-full max-w-md card p-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-accent-sage/15 p-2.5 shrink-0">
                    <CheckCircle size={20} className="text-accent-sage" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-display text-lg text-cream-200">
                      Password reset for {resetResult.email}
                    </h4>
                    <p className="text-accent-coral/80 text-xs mt-1 font-medium">
                      This password will only be shown once. Share it securely
                      with the user.
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-accent-gold/20 bg-accent-gold/5 px-4 py-3">
                  <div className="text-cream-200/40 text-[10px] uppercase tracking-wider mb-1.5">
                    New password
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 block font-mono text-accent-gold text-sm break-all select-all">
                      {resetResult.new_password}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(resetResult.new_password);
                        toast.success("Password copied to clipboard");
                      }}
                      className="p-2 rounded-lg text-cream-200/30 hover:text-cream-200/70 hover:bg-cream-200/8 transition-colors shrink-0"
                      title="Copy to clipboard"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-5">
                  <button
                    className="btn-ghost text-sm"
                    onClick={() => setResetResult(null)}
                  >
                    Done
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
