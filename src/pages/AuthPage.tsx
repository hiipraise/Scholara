import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { authApi } from '../api/auth';
import { useAuthStore } from '../store/authStore';

const navItems = ['Home', 'Features', 'About', 'Contact'];

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
      toast.success(`Welcome${res.data.user.full_name ? `, ${res.data.user.full_name}` : ''}`);
      navigate('/');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Sign-in failed. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#212842] text-cream-200">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        <motion.nav
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="border border-cream-200/10 bg-indigo-900/40 px-4 py-4"
        >
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-10">
            <div className="order-2 flex flex-wrap items-center justify-center gap-5 text-xs uppercase tracking-[0.2em] text-cream-200/55 sm:order-1">
              {navItems.slice(0, 2).map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>

            <h1 className="order-1 font-display text-3xl font-semibold tracking-tight sm:order-2">
              Scholara
            </h1>

            <div className="order-3 flex flex-wrap items-center justify-center gap-5 text-xs uppercase tracking-[0.2em] text-cream-200/55">
              {navItems.slice(2).map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>
        </motion.nav>

        <main className="flex flex-1 items-center justify-center py-12 sm:py-16">
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="w-full border border-cream-200/10 bg-indigo-900/30 px-5 py-10 sm:px-10"
          >
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs uppercase tracking-[0.28em] text-cream-200/50">Learning, structured</p>
              <h2 className="mt-4 font-display text-4xl leading-tight sm:text-5xl lg:text-6xl">
                Smarter daily study flow for software engineering students
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-sm text-cream-200/70 sm:text-base">
                Scholara gives you a focused academic timeline, clear weekly progression, and question-based learning
                in one calm workspace built for consistency.
              </p>

              <form onSubmit={handleSignIn} className="mx-auto mt-10 flex w-full max-w-xl flex-col gap-4">
                <label htmlFor="email" className="text-left text-xs uppercase tracking-[0.14em] text-cream-200/60">
                  Enter email to continue
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                  className="w-full border border-cream-200/20 bg-indigo-950/50 px-4 py-3 text-sm text-cream-200 outline-none"
                />
                <motion.button
                  type="submit"
                  disabled={loading || !email.trim()}
                  whileTap={{ scale: 0.98 }}
                  className="mt-2 w-full border border-cream-200/20 bg-cream-200 px-6 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-indigo-700 disabled:opacity-40"
                >
                  {loading ? 'Signing in...' : 'Start with Scholara'}
                </motion.button>
              </form>
            </div>
          </motion.section>
        </main>
      </div>
    </div>
  );
}
