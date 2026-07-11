import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import clsx from 'clsx';

export default function AuthPage() {
  const navigate = useNavigate();
  const { signIn, signUp, isLoading, error, isAuthenticated, setError } = useAuthStore();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) && normalizedEmail.length <= 254;
  const canSubmit = mode === 'signin'
    ? isValidEmail && password.length >= 1
    : isValidEmail && password.length >= 8 && inviteCode.trim().length >= 1;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      if (mode === 'signup') {
        await signUp(normalizedEmail, password, inviteCode.trim(), fullName.trim() || undefined);
        toast.success('Account created and signed in!');
      } else {
        await signIn(normalizedEmail, password);
        toast.success('Welcome back!');
      }
      navigate('/');
    } catch (err: any) {
      const msg = err.response?.data?.detail || (mode === 'signup' ? 'Sign up failed.' : 'Sign in failed.');
      toast.error(msg);
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
          <div className="flex items-center justify-center">
            <h1 className="font-display text-3xl font-semibold tracking-tight">Scholara</h1>
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
              <p className="text-xs uppercase tracking-[0.28em] text-cream-200/50">
                {mode === 'signin' ? 'Welcome back' : 'Join the platform'}
              </p>
              <h2 className="mt-4 font-display text-4xl leading-tight sm:text-5xl lg:text-6xl">
                Smarter daily study flow for software engineering students
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-sm text-cream-200/70 sm:text-base">
                Scholara gives you a focused academic timeline, clear weekly progression, and question-based learning
                in one calm workspace built for consistency.
              </p>

              {/* Mode toggle */}
              <div className="mx-auto mt-8 flex w-full max-w-xs rounded-xl border border-cream-200/10 p-1">
                <button
                  type="button"
                  onClick={() => { setMode('signin'); setError(null); }}
                  className={clsx(
                    'flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                    mode === 'signin'
                      ? 'bg-cream-200/12 text-cream-200'
                      : 'text-cream-200/40 hover:text-cream-200/70',
                  )}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('signup'); setError(null); }}
                  className={clsx(
                    'flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                    mode === 'signup'
                      ? 'bg-cream-200/12 text-cream-200'
                      : 'text-cream-200/40 hover:text-cream-200/70',
                  )}
                >
                  Sign Up
                </button>
              </div>

              <form onSubmit={handleSubmit} className="mx-auto mt-8 flex w-full max-w-xl flex-col gap-4">
                {/* Email */}
                <label htmlFor="email" className="text-left text-xs uppercase tracking-[0.14em] text-cream-200/60">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  maxLength={254}
                  autoComplete="email"
                  inputMode="email"
                  autoFocus
                  aria-invalid={email.length > 0 && !isValidEmail}
                  className="min-h-12 w-full rounded-xl border border-cream-200/20 bg-indigo-950/50 px-4 py-3 text-base text-cream-200 outline-none transition focus:border-cream-200/50 focus:ring-2 focus:ring-cream-200/20 sm:text-sm"
                />

                {/* Password */}
                <label htmlFor="password" className="text-left text-xs uppercase tracking-[0.14em] text-cream-200/60">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'signup' ? 'At least 8 characters, 1 uppercase, 1 digit, 1 special' : 'Your password'}
                    required
                    minLength={mode === 'signup' ? 8 : 1}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    className="min-h-12 w-full rounded-xl border border-cream-200/20 bg-indigo-950/50 px-4 py-3 pr-12 text-base text-cream-200 outline-none transition focus:border-cream-200/50 focus:ring-2 focus:ring-cream-200/20 sm:text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-cream-200/30 hover:text-cream-200/60 transition-colors"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {/* Full Name (signup only) */}
                <AnimatePresence>
                  {mode === 'signup' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <label htmlFor="full-name" className="block text-left text-xs uppercase tracking-[0.14em] text-cream-200/60">
                        Full name (optional)
                      </label>
                      <input
                        id="full-name"
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Your name"
                        maxLength={120}
                        className="mt-2 min-h-12 w-full rounded-xl border border-cream-200/20 bg-indigo-950/50 px-4 py-3 text-base text-cream-200 outline-none transition focus:border-cream-200/50 focus:ring-2 focus:ring-cream-200/20 sm:text-sm"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Invite code (signup only) */}
                <AnimatePresence>
                  {mode === 'signup' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <label htmlFor="invite-code" className="block text-left text-xs uppercase tracking-[0.14em] text-cream-200/60">
                        Invite code
                      </label>
                      <input
                        id="invite-code"
                        type="text"
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value)}
                        placeholder="Enter invite code"
                        required
                        className="mt-2 min-h-12 w-full rounded-xl border border-cream-200/20 bg-indigo-950/50 px-4 py-3 text-base text-cream-200 outline-none transition focus:border-cream-200/50 focus:ring-2 focus:ring-cream-200/20 sm:text-sm"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Error message */}
                {error && (
                  <p className="text-accent-coral text-sm text-left">{error}</p>
                )}

                <motion.button
                  type="submit"
                  disabled={isLoading || !canSubmit}
                  whileTap={{ scale: 0.98 }}
                  className="mt-2 min-h-12 w-full rounded-xl border border-cream-200/20 bg-cream-200 px-6 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-indigo-700 transition hover:bg-cream-100 focus:outline-none focus:ring-2 focus:ring-cream-200/60 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 size={16} className="animate-spin" />
                      {mode === 'signup' ? 'Creating account...' : 'Signing in...'}
                    </span>
                  ) : (
                    mode === 'signup' ? 'Create Account' : 'Sign In'
                  )}
                </motion.button>
              </form>

              <p className="mt-6 text-cream-200/35 text-xs">
                {mode === 'signin' ? (
                  <>Don't have an invite? Contact the platform admin to get one.</>
                ) : (
                  <>Already have an account? <button type="button" onClick={() => { setMode('signin'); setError(null); }} className="underline hover:text-cream-200/70">Sign in</button></>
                )}
              </p>
            </div>
          </motion.section>
        </main>
      </div>
    </div>
  );
}
