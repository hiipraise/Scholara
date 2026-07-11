import { motion } from "framer-motion";
import { Flame, Target, Activity } from "lucide-react";

interface WeakStrongWeek {
  course_code: string;
  week_number: number;
  accuracy: number;
  correct: number;
  attempts: number;
}

interface InsightsCardsProps {
  insights: {
    streak?: { current: number; longest: number; missed_last_14_days: number } | null;
    weakest_week?: WeakStrongWeek | null;
    strongest_week?: WeakStrongWeek | null;
  } | null;
}

export default function InsightsCards({ insights }: InsightsCardsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18 }}
      className="grid grid-cols-1 md:grid-cols-3 gap-3"
    >
      {/* Streak */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Flame size={15} className="text-accent-coral/80" />
          <h3 className="text-cream-200/70 text-sm font-semibold">Streak</h3>
        </div>
        <div className="font-mono text-2xl text-cream-200">
          {insights?.streak?.current ?? 0}d
        </div>
        <div className="text-cream-200/35 text-xs mt-1">
          Longest: {insights?.streak?.longest ?? 0}d · Missed(14d):{" "}
          {insights?.streak?.missed_last_14_days ?? 14}
        </div>
      </div>

      {/* Weak Link */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Target size={15} className="text-accent-gold/80" />
          <h3 className="text-cream-200/70 text-sm font-semibold">
            Weak Link
          </h3>
        </div>
        {insights?.weakest_week ? (
          <>
            <div className="text-cream-200/85 text-sm font-semibold">
              {insights.weakest_week.course_code} · Wk{" "}
              {insights.weakest_week.week_number}
            </div>
            <div className="text-cream-200/35 text-xs mt-1">
              {insights.weakest_week.accuracy}% (
              {insights.weakest_week.correct}/{insights.weakest_week.attempts})
            </div>
          </>
        ) : (
          <div className="text-cream-200/35 text-xs">No attempts yet</div>
        )}
      </div>

      {/* Strong Link */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Activity size={15} className="text-accent-sage/80" />
          <h3 className="text-cream-200/70 text-sm font-semibold">
            Strong Link
          </h3>
        </div>
        {insights?.strongest_week ? (
          <>
            <div className="text-cream-200/85 text-sm font-semibold">
              {insights.strongest_week.course_code} · Wk{" "}
              {insights.strongest_week.week_number}
            </div>
            <div className="text-cream-200/35 text-xs mt-1">
              {insights.strongest_week.accuracy}% (
              {insights.strongest_week.correct}/
              {insights.strongest_week.attempts})
            </div>
          </>
        ) : (
          <div className="text-cream-200/35 text-xs">No attempts yet</div>
        )}
      </div>
    </motion.div>
  );
}
