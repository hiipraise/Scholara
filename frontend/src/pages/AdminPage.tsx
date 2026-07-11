import { useState, type ElementType } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Calendar,
  LayoutGrid,
  Settings,
  Flag,
} from "lucide-react";
import clsx from "clsx";
import { adminApi } from "../api/index";
import { useAuthStore } from "../store/authStore";

import ExamTimetableAdmin from "../components/admin/ExamTimetableAdmin";
import StudyCycleAdmin from "../components/admin/StudyCycleAdmin";
import CalendarAdmin from "../components/admin/CalendarAdmin";
import QuestionFlagsAdmin from "../components/admin/QuestionFlagsAdmin";
import UsersAdmin from "../components/admin/UsersAdmin";

type Tab = "exam" | "cycle" | "calendar" | "flags" | "users";

export default function AdminPage() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<Tab>("exam");
  const isSuperAdmin = user?.role === "superadmin";

  const { data: jobStats } = useQuery({
    queryKey: ["admin-jobs"],
    queryFn: () => adminApi.getJobs().then((r) => r.data),
    refetchInterval: 5000,
  });

  const TABS: { id: Tab; label: string; icon: ElementType }[] = [
    { id: "exam", label: "Exam Timetable", icon: Calendar },
    { id: "cycle", label: "Study Cycle", icon: LayoutGrid },
    { id: "calendar", label: "Academic Calendar", icon: Settings },
    { id: "flags", label: "Question Flags", icon: Flag },
    ...(isSuperAdmin
      ? [{ id: "users" as Tab, label: "Users", icon: Users }]
      : []),
  ];

  return (
    <div className="space-y-6 pb-12">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="text-cream-200/35 text-xs tracking-widest uppercase font-body mb-1">
          Administration
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-cream-200">
          Admin Panel
        </h1>
        <p className="text-cream-200/45 text-sm mt-1">
          {isSuperAdmin ? "SuperAdmin" : "Admin"} — Full system control
        </p>
      </motion.div>

      {jobStats && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="card p-4 space-y-3"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-cream-200/35 text-xs tracking-widest uppercase font-body mb-1">
                Background PDF Jobs
              </div>
              <h3 className="font-display text-lg text-cream-200">
                Queue depth: {jobStats.queue_depth}
              </h3>
              <p className="text-cream-200/40 text-xs mt-1">
                Monitoring pending and processing PDF jobs with retry tracking.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["pending", "Pending", "text-accent-gold"],
                  ["processing", "Processing", "text-accent-sky"],
                  ["done", "Done", "text-accent-sage"],
                  ["failed", "Failed", "text-accent-coral"],
                ] as const
              ).map(([key, label, color]) => (
                <span
                  key={key}
                  className={clsx(
                    "badge border text-[10px] px-2 py-1",
                    color,
                    "border-cream-200/10 bg-cream-200/4",
                  )}
                >
                  {label}: {jobStats.counts[key]}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {jobStats.jobs.length > 0 ? (
              jobStats.jobs.slice(0, 5).map((job) => (
                <div
                  key={job.id}
                  className="flex flex-col gap-1 rounded-xl border border-cream-200/8 bg-cream-200/4 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="text-cream-200/85 text-sm font-medium truncate">
                      {job.course_code} · Week {job.week_number}
                    </div>
                    <div className="text-cream-200/35 text-xs truncate">
                      {job.course_title} · {job.job_type} · attempt{" "}
                      {job.attempt_count}/{job.max_attempts}
                      {job.last_error ? ` · ${job.last_error}` : ""}
                    </div>
                  </div>
                  <div
                    className={clsx(
                      "badge border text-[10px] self-start sm:self-auto",
                      job.status === "pending" &&
                        "border-accent-gold/25 bg-accent-gold/10 text-accent-gold",
                      job.status === "processing" &&
                        "border-accent-sky/25 bg-accent-sky/10 text-accent-sky",
                      job.status === "done" &&
                        "border-accent-sage/25 bg-accent-sage/10 text-accent-sage",
                      job.status === "failed" &&
                        "border-accent-coral/25 bg-accent-coral/10 text-accent-coral",
                    )}
                  >
                    {job.status}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-cream-200/35 text-sm">
                No PDF jobs recorded yet.
              </p>
            )}
          </div>
        </motion.div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-indigo-900/80 rounded-2xl border border-cream-200/8 overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap",
              tab === id
                ? "bg-cream-200/10 text-cream-200 border border-cream-200/10"
                : "text-cream-200/40 hover:text-cream-200/70",
            )}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {tab === "exam" && <ExamTimetableAdmin />}
          {tab === "cycle" && <StudyCycleAdmin />}
          {tab === "calendar" && <CalendarAdmin />}
          {tab === "flags" && <QuestionFlagsAdmin />}
          {tab === "users" && isSuperAdmin && <UsersAdmin />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
