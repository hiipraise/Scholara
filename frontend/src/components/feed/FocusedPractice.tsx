import { motion } from "framer-motion";
import clsx from "clsx";
import { COURSE_COLORS } from "../../constants/courseColors";

interface FocusedPracticeProps {
  courses: Array<{ id: string; code: string }>;
  selectedCourseIds: string[];
  onToggleCourse: (id: string) => void;
  count: 30 | 60;
  onCountChange: (n: 30 | 60) => void;
  onGenerate: () => void;
  onBackToFeed: () => void;
  isPending: boolean;
  history: { history?: Array<{ attempted: number }> } | null;
  customFeed: any | null;
  customDone: number;
  customTotal: number;
  customCorrect: number;
}

export default function FocusedPractice({
  courses,
  selectedCourseIds,
  onToggleCourse,
  count,
  onCountChange,
  onGenerate,
  onBackToFeed,
  isPending,
  history,
  customFeed,
  customDone,
  customTotal,
  customCorrect,
}: FocusedPracticeProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.19 }}
      className="card p-5"
    >
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div>
          <h3 className="text-cream-200/85 text-sm font-semibold">
            Focused Practice
          </h3>
          <p className="text-cream-200/35 text-xs">
            Home feed stays as-is. Generate extra 30–60 questions for selected
            course(s).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onCountChange(30)}
            className={clsx(
              "badge border text-xs",
              count === 30
                ? "bg-cream-200/12 border-cream-200/25 text-cream-200"
                : "border-cream-200/10 text-cream-200/35",
            )}
          >
            30
          </button>
          <button
            onClick={() => onCountChange(60)}
            className={clsx(
              "badge border text-xs",
              count === 60
                ? "bg-cream-200/12 border-cream-200/25 text-cream-200"
                : "border-cream-200/10 text-cream-200/35",
            )}
          >
            60
          </button>
          <button onClick={onBackToFeed} className="btn-ghost text-xs">
            Back to Home Feed
          </button>
          <button
            onClick={onGenerate}
            className="btn-primary text-xs"
            disabled={isPending}
          >
            {isPending ? "Generating..." : "Generate"}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {courses?.map((c, i) => {
          const selected = selectedCourseIds.includes(c.id);
          return (
            <button
              key={c.id}
              onClick={() => onToggleCourse(c.id)}
              className="badge border text-xs"
              style={
                selected
                  ? {
                      background: `${COURSE_COLORS[i % COURSE_COLORS.length]}18`,
                      borderColor: `${COURSE_COLORS[i % COURSE_COLORS.length]}30`,
                      color: COURSE_COLORS[i % COURSE_COLORS.length],
                    }
                  : {
                      borderColor: "rgba(240,231,213,0.1)",
                      color: "rgba(240,231,213,0.4)",
                    }
              }
            >
              {c.code}
            </button>
          );
        })}
      </div>

      {history?.history?.length ? (
        <p className="text-cream-200/30 text-xs mt-3">
          14-day progress history:{" "}
          {history.history.filter((h) => h.attempted > 0).length} active
          day(s).
        </p>
      ) : null}

      {customFeed && (
        <p className="text-cream-200/35 text-xs mt-2">
          Focused progress: {customDone}/{customTotal} completed · Correct:{" "}
          {customCorrect}
        </p>
      )}
    </motion.div>
  );
}
