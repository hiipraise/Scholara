import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";

interface ProgressBarProps {
  progressPct: number;
  courses: Array<{
    id: string;
    code: string;
    color: string;
    total: number;
    done: number;
  }>;
}

export default function ProgressBar({ progressPct, courses }: ProgressBarProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="card p-5"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={15} className="text-cream-200/40" />
          <span className="text-cream-200/60 text-sm">Today's Progress</span>
        </div>
        <span className="font-mono text-cream-200/80 text-sm font-semibold">
          {progressPct}%
        </span>
      </div>

      <div className="h-2 bg-cream-200/8 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
          className="h-full bg-gradient-to-r from-cream-200/60 to-cream-200/40 rounded-full"
        />
      </div>

      {/* Per-course mini progress */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 mt-4">
        {courses.map(({ id, code, color, total, done }) => (
          <div key={id} className="text-center">
            <div className="h-1.5 bg-cream-200/8 rounded-full overflow-hidden mb-1">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: total > 0 ? `${(done / total) * 100}%` : "0%",
                  background: color,
                }}
              />
            </div>
            <div className="text-[9px] font-mono text-cream-200/30">
              {code.replace(/\D/g, "")}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
