import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { authApi } from '../api/auth';
import { useAuthStore } from '../store/authStore';

export default function AuthPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setLoading(true);
    try {
      const res = await authApi.signIn(trimmed);
      setAuth(res.data.user, res.data.access_token);
      toast.success(`Welcome${res.data.user.full_name ? ', ' + res.data.user.full_name : ''}`);
      navigate('/');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Sign-in failed. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-indigo-600 bg-grid-pattern flex items-center justify-center px-4 relative overflow-hidden">
      {/* Ambient orbs */}
      <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-cream-200/3 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/3 right-1/4 w-64 h-64 bg-accent-gold/5 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm"
      >
        {/* Brand */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="text-center mb-10"
        >
          <div className="text-cream-200/30 text-[10px] tracking-[0.35em] uppercase font-body mb-3">
            EdTech Platform
          </div>
          <h1 className="font-display text-5xl font-bold text-cream-200 tracking-tight">
            Scholara
          </h1>
          <div className="w-10 h-px bg-cream-200/20 mx-auto mt-5 mb-4" />
          <p className="text-cream-200/40 text-xs font-body tracking-wide">
            Powered by <span className="text-cream-200/65">Nexus Core</span>
          </p>
        </motion.div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="card p-8"
        >
          <div className="flex items-center gap-3 mb-7">
            <div className="w-9 h-9 rounded-xl bg-cream-200/8 flex items-center justify-center">
              <Mail size={16} className="text-cream-200/50" />
            </div>
            <div>
              <h2 className="font-display text-xl text-cream-200 font-semibold leading-tight">
                Sign In
              </h2>
              <p className="text-cream-200/35 text-xs mt-0.5 font-body">
                Enter your email to access your account
              </p>
            </div>
          </div>

          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="block text-cream-200/50 text-xs font-medium mb-2 tracking-wide">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
                className="input-field font-body text-sm"
              />
            </div>

            <motion.button
              type="submit"
              disabled={loading || !email.trim()}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className="btn-primary w-full flex items-center justify-center gap-2 font-body text-sm mt-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-indigo-600/30 border-t-indigo-700 rounded-full animate-spin" />
              ) : (
                <>
                  Continue
                  <ArrowRight size={15} />
                </>
              )}
            </motion.button>
          </form>

          <p className="text-cream-200/20 text-[11px] text-center mt-6 font-body leading-relaxed">
            Your email is your identity. No password needed.
            <br />
            New emails create a fresh account automatically.
          </p>
        </motion.div>

        <p className="text-center text-cream-200/15 text-[10px] mt-5 font-body">
          BSc. Software Engineering — 100L
        </p>
      </motion.div>
    </div>
  );
}
