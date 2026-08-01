import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import {
  BookOpen,
  Brain,
  Calendar,
  Grip,
  LayoutGrid,
  LogOut,
  Settings,
  Shield,
  Sparkles,
  User,
  X,
} from "lucide-react";
import clsx from "clsx";
import { useAuthStore } from "../../store/authStore";

const NAV_ITEMS = [
  { path: "/", label: "Home", icon: LayoutGrid, exact: true },
  { path: "/courses", label: "Courses", icon: BookOpen },
  { path: "/study", label: "Study", icon: Calendar },
  { path: "/intelligence", label: "Intel", icon: Brain },
  { path: "/profile", label: "Profile", icon: User },
];

export default function FloatingBentoMenu() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const controls = useDragControls();
  const constraintsRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [dragged, setDragged] = useState(false);

  const items = useMemo(() => {
    const isAdmin = user?.role === "admin" || user?.role === "superadmin";
    return isAdmin
      ? [...NAV_ITEMS, { path: "/admin", label: "Admin", icon: Settings }]
      : NAV_ITEMS;
  }, [user?.role]);

  useEffect(() => {
    function closeOnEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  function handleLogout() {
    logout();
    navigate("/auth");
  }

  return (
    <div ref={constraintsRef} className="fixed inset-0 z-50 pointer-events-none">
      <motion.div
        drag
        dragControls={controls}
        dragMomentum={false}
        dragElastic={0.08}
        dragConstraints={constraintsRef}
        onDragStart={() => setDragged(true)}
        onDragEnd={() => window.setTimeout(() => setDragged(false), 0)}
        initial={{ x: 0, y: 0, opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        className="pointer-events-auto fixed bottom-5 right-5 sm:bottom-7 sm:right-7 touch-none"
      >
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              className="absolute bottom-16 right-0 w-[min(20rem,calc(100vw-2rem))] max-h-[min(34rem,calc(100vh-7rem))] overflow-hidden rounded-3xl border border-cream-200/12 bg-indigo-900/95 shadow-card-hover backdrop-blur-xl"
              role="dialog"
              aria-label="Scholara navigation"
            >
              <div className="flex items-center justify-between border-b border-cream-200/8 px-4 py-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-cream-200/30">Bento</p>
                  <h2 className="font-display text-lg font-semibold text-cream-200">Scholara</h2>
                </div>
                <button onClick={() => setOpen(false)} className="rounded-xl p-2 text-cream-200/45 hover:bg-cream-200/8 hover:text-cream-200" aria-label="Close menu">
                  <X size={16} />
                </button>
              </div>
              <div className="max-h-[calc(min(34rem,calc(100vh-7rem))-4.5rem)] overflow-y-auto p-3">
                <div className="mb-3 rounded-2xl bg-cream-200/5 p-3">
                  <div className="flex items-center gap-2 text-sm text-cream-200/85">
                    {(user?.role === "admin" || user?.role === "superadmin") && <Shield size={14} className="text-accent-gold" />}
                    <span className="truncate">{user?.full_name || user?.email}</span>
                  </div>
                  <p className="mt-1 text-xs text-cream-200/35">{user?.level} · Semester {user?.semester}</p>
                </div>
                <nav className="grid grid-cols-2 gap-2">
                  {items.map(({ path, label, icon: Icon, exact }) => (
                    <NavLink key={path} to={path} end={exact} onClick={() => setOpen(false)} className={({ isActive }) => clsx("group min-h-24 rounded-2xl border p-3 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent-gold/40", isActive ? "border-cream-200/18 bg-cream-200/12 text-cream-200" : "border-cream-200/9 bg-cream-200/4 text-cream-200/58 hover:border-cream-200/18 hover:bg-cream-200/8 hover:text-cream-200") }>
                      <Icon size={20} />
                      <div className="mt-5 text-sm font-medium">{label}</div>
                    </NavLink>
                  ))}
                </nav>
                <button onClick={handleLogout} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-cream-200/10 bg-cream-200/4 px-4 py-3 text-sm text-cream-200/50 transition-colors hover:bg-cream-200/8 hover:text-cream-200">
                  <LogOut size={16} /> Sign Out
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          type="button"
          onPointerDown={(e) => controls.start(e)}
          onClick={() => !dragged && setOpen((v) => !v)}
          className="group flex h-14 w-14 items-center justify-center rounded-2xl border border-cream-200/14 bg-cream-200/12 text-cream-200 shadow-card-hover backdrop-blur-xl transition-all duration-200 hover:scale-105 hover:bg-cream-200/18 focus:outline-none focus:ring-2 focus:ring-accent-gold/50"
          aria-expanded={open}
          aria-label="Open Scholara bento menu. Drag to move."
        >
          <span className="absolute -left-1 -top-1 rounded-full bg-accent-gold p-1 text-indigo-950 opacity-0 transition-opacity group-hover:opacity-100"><Grip size={10} /></span>
          <Sparkles size={21} />
        </button>
      </motion.div>
    </div>
  );
}
