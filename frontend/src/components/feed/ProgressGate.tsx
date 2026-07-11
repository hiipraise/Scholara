import { motion } from "framer-motion";
import { Clock } from "lucide-react";
import clsx from "clsx";

interface CourseProgress {
  course_id: string;
  course_code: string;
  unlocked_week: number;
  current_academic_week: number;
  weeks_done: number[];
  question_counts?: Record<number, number>;
}

interface ProgressGateProps {
  progress: { courses: CourseProgress[] } | null;
  onMarkWeek: (courseId: string, week: number, done: boolean) => void;
}

export default function ProgressGate({
  progress,
  onMarkWeek,
}: ProgressGateProps) {
  if (!progress) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="card p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <Clock size={15} className="text-cream-200/40" />
        <h3 className="text-cream-200/80 text-sm font-semibold">
          Progress Gate
        </h3>
        <span className="text-cream-200/30 text-xs">
          — mark weeks done to unlock questions
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Array.isArray(progress.courses) &&
          progress.courses.map((cp: CourseProgress) => (
            <div key={cp.course_id} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-cream-200/70 text-xs font-semibold">
                    {cp.course_code}
                  </span>
                  <span className="text-cream-200/35 text-xs">
                    Unlocked: Wk {cp.unlocked_week} /{" "}
                    {cp.current_academic_week}
                  </span>
                </div>
                <div className="flex gap-1 items-end">
                  {Array.from(
                    { length: Math.min(cp.current_academic_week, 15) },
                    (_, i) => i + 1,
                  ).map((w) => {
                    const qCount = cp.question_counts?.[w] ?? 0;
                    return (
                      <button
                        key={w}
                        onClick={() =>
                          onMarkWeek(
                            cp.course_id,
                            w,
                            !cp.weeks_done.includes(w),
                          )
                        }
                        title={`Week ${w} — ${qCount} question${qCount === 1 ? "" : "s"} · ${cp.weeks_done.includes(w) ? "Done (click to undo)" : "Not done"}`}
                        className={clsx(
                          "group relative rounded-sm flex-1 max-w-[18px] transition-all duration-200 hover:opacity-80",
                          cp.weeks_done.includes(w)
                            ? "bg-accent-sage/60"
                            : w <= cp.current_academic_week
                              ? "bg-cream-200/12 border border-cream-200/15"
                              : "bg-cream-200/5",
                          qCount > 0 && !cp.weeks_done.includes(w) && "ring-1 ring-inset ring-accent-sky/20",
                        )}
                        style={{ height: Math.max(4, Math.min(qCount, 8)) * 4 + 8 + "px" }}
                      >
                        {/* Question count label below bar */}
                        {qCount > 0 && (
                          <span className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 text-[8px] text-cream-200/35 leading-none">
                            {qCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
      </div>
    </motion.div>
  );
}
