import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Mail, Edit2, Save, X, ArrowRight, Shield, GraduationCap, Check } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { authApi } from '../api/auth';
import { usersApi } from '../api/index';
import toast from 'react-hot-toast';
import clsx from 'clsx';

export default function ProfilePage() {
  const { user, updateUser, setAuth } = useAuthStore();

  const [editName, setEditName]     = useState(false);
  const [nameVal, setNameVal]       = useState(user?.full_name || '');
  const [editEmail, setEditEmail]   = useState(false);
  const [newEmail, setNewEmail]     = useState('');

  const nameMutation = useMutation({
    mutationFn: (name: string) => usersApi.updateProfile({ full_name: name }),
    onSuccess: () => {
      updateUser({ full_name: nameVal });
      setEditName(false);
      toast.success('Name updated');
    },
  });

  const emailMutation = useMutation({
    mutationFn: () => authApi.changeEmail(newEmail),
    onSuccess: res => {
      updateUser({ email: res.data.new_email });
      setAuth({ ...user!, email: res.data.new_email }, res.data.access_token);
      setEditEmail(false);
      setNewEmail('');
      toast.success('Email updated');
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to update email'),
  });

  const ROLE_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    superadmin: { label: 'SuperAdmin', color: 'text-accent-gold', icon: Shield },
    admin:      { label: 'Admin',      color: 'text-accent-sky',  icon: Shield },
    student:    { label: 'Student',    color: 'text-cream-200/55', icon: GraduationCap },
  };
  const roleConf = ROLE_CONFIG[user?.role || 'student'];
  const RoleIcon = roleConf.icon;

  return (
    <div className="space-y-6 pb-12 max-w-2xl">
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="text-cream-200/35 text-xs tracking-widest uppercase font-body mb-1">Account</div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-cream-200">Profile</h1>
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
              {user?.full_name || <span className="text-cream-200/30 italic text-base">Name not set</span>}
            </div>
            <div className="text-cream-200/45 text-sm mt-0.5 truncate">{user?.email}</div>
            <div className={clsx('flex items-center gap-1.5 mt-2 text-xs font-medium', roleConf.color)}>
              <RoleIcon size={12} />
              {roleConf.label} · {user?.level} · Semester {user?.semester}
            </div>
          </div>
        </div>
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
            <span className="text-cream-200/70 text-sm font-semibold">Full Name</span>
          </div>
          {!editName ? (
            <button
              onClick={() => { setNameVal(user?.full_name || ''); setEditName(true); }}
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
                <Save size={12} /> {nameMutation.isPending ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setEditName(false)} className="flex items-center gap-1.5 text-cream-200/30 text-xs hover:text-cream-200/60">
                <X size={12} /> Cancel
              </button>
            </div>
          )}
        </div>
        {editName ? (
          <input
            value={nameVal}
            onChange={e => setNameVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && nameMutation.mutate(nameVal)}
            className="input-field"
            autoFocus
            placeholder="Your full name"
          />
        ) : (
          <p className="text-cream-200/60 text-sm">
            {user?.full_name || <span className="text-cream-200/25 italic">Not set</span>}
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
            <span className="text-cream-200/70 text-sm font-semibold">Email Address</span>
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

        <p className="text-cream-200/70 text-sm font-mono mb-3">{user?.email}</p>

        <AnimatePresence>
          {editEmail && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-3 border-t border-cream-200/8 space-y-3">
                <p className="text-cream-200/35 text-xs">
                  Changing your email grants access under the new address immediately.
                </p>
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  className="input-field text-sm"
                  placeholder="new@email.com"
                  autoFocus
                />
                <div className="flex gap-3">
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => emailMutation.mutate()}
                    disabled={!newEmail || emailMutation.isPending}
                    className="btn-primary text-sm flex items-center gap-2"
                  >
                    <Check size={14} />
                    {emailMutation.isPending ? 'Updating...' : 'Update Email'}
                  </motion.button>
                  <button
                    onClick={() => { setEditEmail(false); setNewEmail(''); }}
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

      {/* Account info grid */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="card p-5"
      >
        <h3 className="text-cream-200/55 text-sm font-semibold mb-4">Account Details</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Role',      value: user?.role },
            { label: 'Level',     value: user?.level },
            { label: 'Semester',  value: `Semester ${user?.semester}` },
            { label: 'Status',    value: user?.is_active ? 'Active' : 'Inactive' },
            { label: 'Programme', value: 'BSc. Software Engineering' },
            { label: 'AI Engine', value: 'Nexus Core v2.0' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-cream-200/4 rounded-xl p-3">
              <div className="text-cream-200/28 text-[10px] uppercase tracking-wider mb-1">{label}</div>
              <div className="text-cream-200/70 text-sm font-medium capitalize">{value}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
