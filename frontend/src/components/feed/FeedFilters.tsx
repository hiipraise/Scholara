import { motion, AnimatePresence } from "framer-motion";
import { Filter, ChevronDown } from "lucide-react";
import clsx from "clsx";
import { COURSE_COLORS } from "../../constants/courseColors";

interface FeedFiltersProps {
  show: boolean;
  onToggle: () => void;
  filterDone: "all" | "pending" | "done";
  onFilterDoneChange: (v: "all" | "pending" | "done") => void;
  filterCourse: string | null;
  onFilterCourseChange: (id: string | null) => void;
  total: number;
  completedCount: number;
  courses: Array<{ id: string; code: string }>;
}

export default function FeedFilters({
  show,
  onToggle,
  filterDone,
  onFilterDoneChange,
  filterCourse,
  onFilterCourseChange,
  total,
  completedCount,
  courses,
}: FeedFiltersProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-cream-200/50 hover:text-cream-200/80 text-sm transition-colors"
      >
        <Filter size={14} />
        Filters
        <ChevronDown
          size={13}
          className={clsx("transition-transform", show && "rotate-180")}
        />
      </button>

      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="w-full overflow-hidden"
          >
            <div className="flex items-center gap-2 flex-wrap pt-2">
              <button
                onClick={() => onFilterDoneChange("all")}
                className={clsx(
                  "badge border text-xs cursor-pointer transition-colors",
                  filterDone === "all"
                    ? "bg-cream-200/10 border-cream-200/25 text-cream-200"
                    : "border-cream-200/10 text-cream-200/40",
                )}
              >
                All ({total})
              </button>
              <button
                onClick={() => onFilterDoneChange("pending")}
                className={clsx(
                  "badge border text-xs cursor-pointer transition-colors",
                  filterDone === "pending"
                    ? "bg-cream-200/10 border-cream-200/25 text-cream-200"
                    : "border-cream-200/10 text-cream-200/40",
                )}
              >
                Pending ({total - completedCount})
              </button>
              <button
                onClick={() => onFilterDoneChange("done")}
                className={clsx(
                  "badge border text-xs cursor-pointer transition-colors",
                  filterDone === "done"
                    ? "bg-accent-sage/15 border-accent-sage/25 text-accent-sage"
                    : "border-cream-200/10 text-cream-200/40",
                )}
              >
                Done ({completedCount})
              </button>
              <div className="w-px h-4 bg-cream-200/15" />
              <button
                onClick={() => onFilterCourseChange(null)}
                className={clsx(
                  "badge border text-xs cursor-pointer transition-colors",
                  filterCourse === null
                    ? "bg-cream-200/10 border-cream-200/25 text-cream-200"
                    : "border-cream-200/10 text-cream-200/40",
                )}
              >
                All Courses
              </button>
              {Array.isArray(courses) &&
                courses.map((c, i) => (
                  <button
                    key={c.id}
                    onClick={() =>
                      onFilterCourseChange(
                        filterCourse === c.id ? null : c.id,
                      )
                    }
                    className="badge border text-xs cursor-pointer transition-colors"
                    style={
                      filterCourse === c.id
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
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
