import { NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutGrid, BookOpen, Calendar, User, Settings,
  LogOut, X, GraduationCap, Shield
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import clsx from 'clsx';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const NAV_ITEMS = [
  { path: '/', label: 'Home Feed', icon: LayoutGrid, exact: true },
  { path: '/courses', label: 'Courses', icon: BookOpen },
  { path: '/study', label: 'Study Cycle', icon: Calendar },
  { path: '/profile', label: 'Profile', icon: User },
];

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const isSuperAdmin = user?.role === 'superadmin';

  function handleLogout() {
    logout();
    navigate('/auth');
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-indigo-900 border-r border-cream-200/8">
      {/* Brand */}
      <div className="px-6 py-6 border-b border-cream-200/8">
        <div className="text-cream-200/30 text-[10px] tracking-[0.3em] uppercase font-body mb-1">
          EdTech Platform
        </div>
        <h1 className="font-display text-2xl font-bold text-cream-200 tracking-tight">
          Scholara
        </h1>
        {isSuperAdmin && (
          <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-accent-gold/15 border border-accent-gold/25">
            <Shield size={10} className="text-accent-gold" />
            <span className="text-accent-gold text-[10px] font-semibold tracking-wider uppercase">
              SuperAdmin
            </span>
          </div>
        )}
        {user?.role === 'admin' && (
          <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-accent-sky/15 border border-accent-sky/25">
            <Shield size={10} className="text-accent-sky" />
            <span className="text-accent-sky text-[10px] font-semibold tracking-wider uppercase">
              Admin
            </span>
          </div>
        )}
      </div>

      {/* User info */}
      <div className="px-6 py-4 border-b border-cream-200/8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-cream-200/10 flex items-center justify-center">
            <GraduationCap size={16} className="text-cream-200/60" />
          </div>
          <div className="min-w-0">
            <div className="text-cream-200 text-sm font-medium truncate">
              {user?.full_name || user?.email?.split('@')[0]}
            </div>
            <div className="text-cream-200/35 text-xs mt-0.5">
              {user?.level} · Semester {user?.semester}
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ path, label, icon: Icon, exact }) => (
          <NavLink
            key={path}
            to={path}
            end={exact}
            onClick={onClose}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-cream-200/10 text-cream-200 border border-cream-200/10'
                  : 'text-cream-200/50 hover:text-cream-200/80 hover:bg-cream-200/5'
              )
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}

        {isAdmin && (
          <>
            <div className="pt-3 pb-1 px-3">
              <div className="text-cream-200/20 text-[10px] uppercase tracking-widest font-medium">
                Administration
              </div>
            </div>
            <NavLink
              to="/admin"
              onClick={onClose}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-accent-gold/10 text-accent-gold border border-accent-gold/15'
                    : 'text-cream-200/50 hover:text-cream-200/80 hover:bg-cream-200/5'
                )
              }
            >
              <Settings size={17} />
              Admin Panel
            </NavLink>
          </>
        )}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-cream-200/8">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-cream-200/40 hover:text-cream-200/70 hover:bg-cream-200/5 transition-all duration-200"
        >
          <LogOut size={17} />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden lg:block fixed left-0 top-0 h-full w-64 z-30">
        <SidebarContent />
      </div>

      {/* Mobile overlay */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
              onClick={onClose}
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="lg:hidden fixed left-0 top-0 h-full w-64 z-50"
            >
              <div className="relative h-full">
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 p-1.5 rounded-lg text-cream-200/40 hover:text-cream-200/70 hover:bg-cream-200/8 z-10"
                >
                  <X size={18} />
                </button>
                <SidebarContent />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
