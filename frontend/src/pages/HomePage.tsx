import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw,
  Filter,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  AlertCircle,
  BookOpen,
  Calendar,
  TrendingUp,
  Clock,
  Flame,
  Target,
  Activity,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import clsx from "clsx";
import { feedApi, coursesApi } from "../api/index";
import { useAuthStore } from "../store/authStore";
import QuestionCard from "../components/feed/QuestionCard";
import type { Question } from "../types";
import toast from "react-hot-toast";

// Color palette for courses
const COURSE_COLORS = [
  "#4a7fb5",
  "#5a8a6e",
  "#c9a84c",
  "#8a6eaf",
  "#d4604a",
  "#4aa8af",
  "#af8a4a",
  "#6e8a5a",
];

const PRACTICE_SESSION_KEY_PREFIX = "scholara.practice.session";

/**
 * sessionStorage wrapper — same API as localStorage but per-tab only,
 * cleared when the tab closes.
 */
function sessionStoreGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function sessionStoreSet(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Storage full or unavailable — silently skip.
  }
}

function sessionStoreRemove(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Best-effort.
  }
}

export default function HomePage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [filterCourse, setFilterCourse] = useState<string | null>(null);
  const [filterDone, setFilterDone] = useState<"all" | "pending" | "done">(
    "all",
  );
  const [showFilters, setShowFilters] = useState(false);
  const [practiceCourseIds, setPracticeCourseIds] = useState<string[]>([]);
  const [practiceCount, setPracticeCount] = useState<30 | 60>(30);
  const [customFeed, setCustomFeed] = useState<any | null>(null);
  const [practiceResults, setPracticeResults] = useState<
    Record<string, boolean>
  >({});
  const [hiddenQuestionIds, setHiddenQuestionIds] = useState<string[]>([]);
  const [showPracticeResultModal, setShowPracticeResultModal] = useState(false);
  const [showFeedCompleteModal, setShowFeedCompleteModal] = useState(false);
  const [feedModalMode, setFeedModalMode] = useState<"complete" | "flagged">(
    "complete",
  );
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 320);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const sessionKey = user?.id
    ? `${PRACTICE_SESSION_KEY_PREFIX}.${user.id}`
    : null;

  useEffect(() => {
    if (!sessionKey) return;
    const raw = sessionStoreGet(sessionKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        customFeed?: any;
        practiceResults?: Record<string, boolean>;
      };
      if (parsed?.customFeed?.questions?.length) {
        setCustomFeed(parsed.customFeed);
        setPracticeResults(parsed.practiceResults || {});
        toast.success("Resumed focused practice session");
      }
    } catch {
      sessionStoreRemove(sessionKey);
    }
  }, [sessionKey]);

  useEffect(() => {
    if (!sessionKey) return;
    if (!customFeed) {
      sessionStoreRemove(sessionKey);
      return;
    }
    sessionStoreSet(
      sessionKey,
      JSON.stringify({ customFeed, practiceResults }),
    );
  }, [sessionKey, customFeed, practiceResults]);

  const {
    data: feed,
    isLoading: feedLoading,
    error: feedError,
  } = useQuery({
    queryKey: ["feed", "today"],
    queryFn: () => feedApi.getToday().then((r) => r.data),
    staleTime: 1000 * 30,
  });

  const { data: progress } = useQuery({
    queryKey: ["feed", "progress"],
    queryFn: () => feedApi.getProgress().then((r) => r.data),
  });

  const { data: courses } = useQuery({
    queryKey: ["courses", user?.level, user?.semester],
    queryFn: () =>
      coursesApi.list(user?.level, user?.semester).then((r) => r.data),
  });

  const { data: stats } = useQuery({
    queryKey: ["feed", "stats"],
    queryFn: () => feedApi.getStats().then((r) => r.data),
  });
  const { data: history } = useQuery({
    queryKey: ["feed", "history"],
    queryFn: () => feedApi.getHistory(14).then((r) => r.data),
  });
  const { data: insights } = useQuery({
    queryKey: ["feed", "insights"],
    queryFn: () => feedApi.getInsights().then((r) => r.data),
  });

  const markWeekMutation = useMutation({
    mutationFn: ({
      courseId,
      week,
      done,
    }: {
      courseId: string;
      week: number;
      done: boolean;
    }) => feedApi.markWeekDone(courseId, week, done),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feed"] });
      toast.success("Progress updated");
    },
  });
  const practiceMutation = useMutation({
    mutationFn: () =>
      feedApi.getPractice({
        course_ids: practiceCourseIds,
        count: practiceCount,
      }),
    onSuccess: ({ data }) => {
      setCustomFeed(data);
      setPracticeResults({});
      setShowPracticeResultModal(false);
      toast.success(`Loaded ${data.total} focused questions`);
    },
  });

  const refreshFeedMutation = useMutation({
    mutationFn: () => feedApi.refreshToday(),
    onSuccess: ({ data }) => {
      qc.setQueryData(["feed", "today"], data);
      qc.invalidateQueries({ queryKey: ["feed", "stats"] });
      qc.invalidateQueries({ queryKey: ["feed", "history"] });
      setCustomFeed(null);
      setPracticeResults({});
      setFilterDone("all");
      setShowFeedCompleteModal(false);
      setShowPracticeResultModal(false);
      toast.success(`Loaded ${data.total || 60} fresh questions`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: () => {
      toast.error("Could not load a fresh feed. Please try again.");
    },
  });

  const customTotal = customFeed?.questions?.length ?? 0;
  const customDone =
    customFeed?.questions?.filter((q: Question) => q.is_completed).length ?? 0;
  const customCorrect = Object.values(practiceResults).filter(Boolean).length;
  const shouldHideFlaggedLocally = Boolean(customFeed);

  const activeQuestions: Question[] = useMemo(() => {
    const source = customFeed ?? feed;
    return source?.questions ?? [];
  }, [customFeed, feed]);

  const hiddenInActiveFeed = useMemo(
    () =>
      shouldHideFlaggedLocally
        ? activeQuestions.filter((q) => hiddenQuestionIds.includes(q.id)).length
        : 0,
    [activeQuestions, hiddenQuestionIds, shouldHideFlaggedLocally],
  );

  const remainingActiveUnanswered = useMemo(
    () =>
      activeQuestions.filter(
        (q) =>
          !q.is_completed &&
          (!shouldHideFlaggedLocally || !hiddenQuestionIds.includes(q.id)),
      ).length,
    [activeQuestions, hiddenQuestionIds, shouldHideFlaggedLocally],
  );

  useEffect(() => {
    if (!customFeed?.questions?.length) return;
    if (remainingActiveUnanswered === 0) {
      setShowPracticeResultModal(true);
    }
  }, [customFeed, remainingActiveUnanswered]);

  // Show completion modal for true completion or "hidden-by-flag" exhaustion.
  useEffect(() => {
    if (!feed) return;
    if (feed.is_fully_completed) {
      setFeedModalMode("complete");
      setShowFeedCompleteModal(true);
      return;
    }
    if (
      !customFeed &&
      remainingActiveUnanswered === 0 &&
      hiddenInActiveFeed > 0
    ) {
      setFeedModalMode("flagged");
      setShowFeedCompleteModal(true);
    }
  }, [feed, customFeed, remainingActiveUnanswered, hiddenInActiveFeed]);

  // Build course map with colors
  const courseMap = useMemo(() => {
    const map: Record<string, { code: string; color: string }> = {};
    courses?.forEach((c, i) => {
      map[c.id] = {
        code: c.code,
        color: COURSE_COLORS[i % COURSE_COLORS.length],
      };
    });
    return map;
  }, [courses]);

  const currentCourses = (courses || []).filter(
    (c) => c.level === user?.level && c.semester === user?.semester,
  );
  const practicePool = currentCourses;

  // Filter questions
  const displayedQuestions = useMemo(() => {
    const source = customFeed ?? feed;
    if (!source?.questions) return [];
    let qs = source.questions;
    if (filterCourse !== null)
      qs = qs.filter((q: Question) => q.course_id === filterCourse);
    if (filterDone === "pending")
      qs = qs.filter((q: Question) => !q.is_completed);
    if (filterDone === "done") qs = qs.filter((q: Question) => q.is_completed);
    // Exclude locally-hidden (flagged) questions for immediate UX response.
    // Keep this behavior scoped to focused practice so home feed cannot appear "stuck"
    // with only completed items left on screen.
    if (shouldHideFlaggedLocally && hiddenQuestionIds.length)
      qs = qs.filter((q: Question) => !hiddenQuestionIds.includes(q.id));
    return qs;
  }, [
    feed,
    customFeed,
    filterCourse,
    filterDone,
    hiddenQuestionIds,
    shouldHideFlaggedLocally,
  ]);

  // Progress groups by course
  const questionsByCourse = useMemo(() => {
    if (!feed?.questions || !courses) return [];
    return courses
      .map((course, i) => {
        const courseQs = feed.questions.filter(
          (q) => q.course_id === course.id,
        );
        const done = courseQs.filter((q) => q.is_completed).length;
        return {
          course,
          color: COURSE_COLORS[i % COURSE_COLORS.length],
          total: courseQs.length,
          done,
        };
      })
      .filter((g) => g.total > 0);
  }, [feed, courses]);

  const currentWeek = progress?.current_academic_week ?? 1;
  const today = format(new Date(), "EEEE, MMMM d");

  if (feedError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle
            size={40}
            className="text-accent-coral/60 mx-auto mb-3"
          />
          <p className="text-cream-200/50">
            Failed to load feed. Please refresh.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between gap-4"
      >
        <div>
          <div className="text-cream-200/35 text-xs tracking-widest uppercase font-body mb-1">
            {today}
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-cream-200">
            Daily Feed
          </h1>
          <p className="text-cream-200/45 text-sm mt-1">
            Academic Week{" "}
            <span className="text-cream-200/75 font-semibold">
              {currentWeek}
            </span>
            {" · "}BSc. Software Engineering
          </p>
        </div>

        <div className="text-right">
          <div className="font-mono text-2xl font-bold text-cream-200">
            {feed?.completed_count ?? 0}
            <span className="text-cream-200/30 text-lg">
              /{feed?.total ?? 60}
            </span>
          </div>
          <div className="text-cream-200/35 text-xs mt-0.5">questions done</div>
        </div>
      </motion.div>

      {/* Overall Progress Bar */}
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
            {feed?.progress_pct ?? 0}%
          </span>
        </div>

        <div className="h-2 bg-cream-200/8 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${feed?.progress_pct ?? 0}%` }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
            className="h-full bg-gradient-to-r from-cream-200/60 to-cream-200/40 rounded-full"
          />
        </div>

        {/* Per-course mini progress */}
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 mt-4">
          {questionsByCourse.map(({ course, color, total, done }) => (
            <div key={course.id} className="text-center">
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
                {course.code.replace(/\D/g, "")}
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Stats Row */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="grid grid-cols-3 gap-3"
        >
          {[
            {
              label: "Attempted",
              value: stats.total_attempted,
              icon: BookOpen,
            },
            {
              label: "Correct",
              value: stats.total_correct,
              icon: CheckSquare,
              color: "text-accent-sage",
            },
            {
              label: "Accuracy",
              value: `${stats.accuracy}%`,
              icon: TrendingUp,
              color: "text-accent-gold",
            },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="card p-4 text-center">
              <Icon
                size={16}
                className={clsx("mx-auto mb-2", color || "text-cream-200/30")}
              />
              <div className="font-mono text-xl font-bold text-cream-200">
                {value}
              </div>
              <div className="text-cream-200/35 text-xs mt-0.5">{label}</div>
            </div>
          ))}
        </motion.div>
      )}

      {/* Progress history + focus insights */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-3"
      >
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Flame size={15} className="text-accent-coral/80" />
            <h3 className="text-cream-200/70 text-sm font-semibold">Streak</h3>
          </div>
          <div className="font-mono text-2xl text-cream-200">
            {insights?.streak.current ?? 0}d
          </div>
          <div className="text-cream-200/35 text-xs mt-1">
            Longest: {insights?.streak.longest ?? 0}d · Missed(14d):{" "}
            {insights?.streak.missed_last_14_days ?? 14}
          </div>
        </div>
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
                {insights.weakest_week.correct}/{insights.weakest_week.attempts}
                )
              </div>
            </>
          ) : (
            <div className="text-cream-200/35 text-xs">No attempts yet</div>
          )}
        </div>
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

      {/* Focused practice */}
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
              onClick={() => setPracticeCount(30)}
              className={clsx(
                "badge border text-xs",
                practiceCount === 30
                  ? "bg-cream-200/12 border-cream-200/25 text-cream-200"
                  : "border-cream-200/10 text-cream-200/35",
              )}
            >
              30
            </button>
            <button
              onClick={() => setPracticeCount(60)}
              className={clsx(
                "badge border text-xs",
                practiceCount === 60
                  ? "bg-cream-200/12 border-cream-200/25 text-cream-200"
                  : "border-cream-200/10 text-cream-200/35",
              )}
            >
              60
            </button>
            <button
              onClick={() => {
                setCustomFeed(null);
                setPracticeResults({});
                setShowPracticeResultModal(false);
              }}
              className="btn-ghost text-xs"
            >
              Back to Home Feed
            </button>
            <button
              onClick={() => practiceMutation.mutate()}
              className="btn-primary text-xs"
              disabled={practiceMutation.isPending}
            >
              {practiceMutation.isPending ? "Generating..." : "Generate"}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {practicePool?.map((c, i) => (
            <button
              key={c.id}
              onClick={() =>
                setPracticeCourseIds((prev) =>
                  prev.includes(c.id)
                    ? prev.filter((id) => id !== c.id)
                    : [...prev, c.id],
                )
              }
              className="badge border text-xs"
              style={
                practiceCourseIds.includes(c.id)
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

      {/* Week Progress Gate */}
      {progress && (
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
            {progress.courses.map((cp) => (
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
                  <div className="flex gap-1">
                    {Array.from(
                      { length: Math.min(cp.current_academic_week, 15) },
                      (_, i) => i + 1,
                    ).map((w) => (
                      <button
                        key={w}
                        onClick={() =>
                          markWeekMutation.mutate({
                            courseId: cp.course_id,
                            week: w,
                            done: !cp.weeks_done.includes(w),
                          })
                        }
                        title={`Week ${w} — ${cp.weeks_done.includes(w) ? "Done (click to undo)" : "Not done"}`}
                        className={clsx(
                          "h-4 rounded-sm flex-1 max-w-[18px] transition-all duration-200 hover:opacity-80",
                          cp.weeks_done.includes(w)
                            ? "bg-accent-sage/60"
                            : w <= cp.current_academic_week
                              ? "bg-cream-200/12 border border-cream-200/15"
                              : "bg-cream-200/5",
                        )}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 text-cream-200/50 hover:text-cream-200/80 text-sm transition-colors"
        >
          <Filter size={14} />
          Filters
          <ChevronDown
            size={13}
            className={clsx(
              "transition-transform",
              showFilters && "rotate-180",
            )}
          />
        </button>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="w-full overflow-hidden"
            >
              <div className="flex items-center gap-2 flex-wrap pt-2">
                <button
                  onClick={() => setFilterDone("all")}
                  className={clsx(
                    "badge border text-xs cursor-pointer transition-colors",
                    filterDone === "all"
                      ? "bg-cream-200/10 border-cream-200/25 text-cream-200"
                      : "border-cream-200/10 text-cream-200/40",
                  )}
                >
                  All ({feed?.total ?? 0})
                </button>
                <button
                  onClick={() => setFilterDone("pending")}
                  className={clsx(
                    "badge border text-xs cursor-pointer transition-colors",
                    filterDone === "pending"
                      ? "bg-cream-200/10 border-cream-200/25 text-cream-200"
                      : "border-cream-200/10 text-cream-200/40",
                  )}
                >
                  Pending ({(feed?.total ?? 0) - (feed?.completed_count ?? 0)})
                </button>
                <button
                  onClick={() => setFilterDone("done")}
                  className={clsx(
                    "badge border text-xs cursor-pointer transition-colors",
                    filterDone === "done"
                      ? "bg-accent-sage/15 border-accent-sage/25 text-accent-sage"
                      : "border-cream-200/10 text-cream-200/40",
                  )}
                >
                  Done ({feed?.completed_count ?? 0})
                </button>
                <div className="w-px h-4 bg-cream-200/15" />
                <button
                  onClick={() => setFilterCourse(null)}
                  className={clsx(
                    "badge border text-xs cursor-pointer transition-colors",
                    filterCourse === null
                      ? "bg-cream-200/10 border-cream-200/25 text-cream-200"
                      : "border-cream-200/10 text-cream-200/40",
                  )}
                >
                  All Courses
                </button>
                {courses?.map((c, i) => (
                  <button
                    key={c.id}
                    onClick={() =>
                      setFilterCourse(filterCourse === c.id ? null : c.id)
                    }
                    className={clsx(
                      "badge border text-xs cursor-pointer transition-colors",
                    )}
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

      {/* Feed */}
      {feedLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card p-5 h-36 shimmer-bg rounded-2xl" />
          ))}
        </div>
      ) : displayedQuestions.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="card p-12 text-center"
        >
          {feed?.is_fully_completed ? (
            <>
              <CheckSquare
                size={40}
                className="text-accent-sage/60 mx-auto mb-3"
              />
              <h3 className="font-display text-xl text-cream-200 mb-2">
                Feed Complete
              </h3>
              <p className="text-cream-200/45 text-sm mb-4">
                All {feed?.total ?? 60} questions in this batch are done. Load
                another fresh batch when you are ready.
              </p>
              <button
                type="button"
                onClick={() => refreshFeedMutation.mutate()}
                disabled={refreshFeedMutation.isPending}
                className="btn-primary text-sm inline-flex items-center gap-2"
              >
                <RefreshCw
                  size={14}
                  className={clsx(
                    refreshFeedMutation.isPending && "animate-spin",
                  )}
                />
                {refreshFeedMutation.isPending ? "Loading..." : "Load Fresh 60"}
              </button>
            </>
          ) : (
            <>
              <AlertCircle
                size={40}
                className="text-cream-200/20 mx-auto mb-3"
              />
              <h3 className="font-display text-xl text-cream-200 mb-2">
                No questions available
              </h3>
              <p className="text-cream-200/45 text-sm">
                No PDFs uploaded yet, or Progress Gate is restricting the view.
                <br />
                Mark previous weeks as done, or ask your admin to upload PDFs.
              </p>
            </>
          )}
        </motion.div>
      ) : (
        <div className="space-y-4">
          {displayedQuestions.map((q: Question, i: number) => (
            <QuestionCard
              key={q.id}
              question={q}
              courseCode={courseMap[q.course_id]?.code || "COURSE"}
              courseColor={courseMap[q.course_id]?.color || "#4a7fb5"}
              index={i}
              onAnswered={(result) => {
                if (customFeed) {
                  setPracticeResults((prev) => ({
                    ...prev,
                    [q.id]: result.is_correct,
                  }));
                  setCustomFeed((prev: any) => {
                    if (!prev?.questions) return prev;
                    return {
                      ...prev,
                      questions: prev.questions.map((pq: Question) =>
                        pq.id === q.id ? { ...pq, is_completed: true } : pq,
                      ),
                    };
                  });
                }
                if (!customFeed) {
                  qc.setQueryData(["feed", "today"], (prev: any) => {
                    if (!prev) return prev;
                    const completedCount =
                      result.completed_count ?? prev.completed_count;
                    const total = result.total || prev.total;
                    return {
                      ...prev,
                      completed_count: completedCount,
                      correct_count: result.correct_count ?? prev.correct_count,
                      accuracy_pct: result.accuracy_pct ?? prev.accuracy_pct,
                      is_fully_completed:
                        result.feed_completed ?? prev.is_fully_completed,
                      progress_pct: total
                        ? Math.round((completedCount / total) * 1000) / 10
                        : prev.progress_pct,
                      questions: prev.questions.map((pq: Question) =>
                        pq.id === q.id ? { ...pq, is_completed: true } : pq,
                      ),
                    };
                  });
                }
                if (!customFeed && result.feed_completed) {
                  setFeedModalMode("complete");
                  setShowFeedCompleteModal(true);
                }
                // Refresh both the feed (progress bar / completed_count) and stats
                qc.invalidateQueries({ queryKey: ["feed", "today"] });
                qc.invalidateQueries({ queryKey: ["feed", "stats"] });
              }}
              onFlagged={(qid) => {
                if (shouldHideFlaggedLocally) {
                  // hide immediately in focused-practice UI only
                  setHiddenQuestionIds((prev) =>
                    prev.includes(qid) ? prev : [...prev, qid],
                  );
                }
                // also refresh server-side feed counters/stats
                qc.invalidateQueries({ queryKey: ["feed", "today"] });
                qc.invalidateQueries({ queryKey: ["feed", "stats"] });
              }}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2 }}
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="fixed right-5 bottom-20 sm:bottom-8 z-40 h-11 w-11 rounded-full border border-cream-200/20 bg-[#1a2136]/90 text-cream-200 shadow-glow-cream backdrop-blur-sm hover:bg-[#212842] transition-colors"
            aria-label="Scroll to top"
            title="Scroll to top"
          >
            <ChevronUp size={18} className="mx-auto" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPracticeResultModal && customFeed && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-40"
            />
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="w-full max-w-md card p-6">
                <h3 className="font-display text-xl text-cream-200 mb-2">
                  Focused Practice Complete
                </h3>
                <p className="text-cream-200/55 text-sm mb-4">
                  Session finished successfully. Here is your result summary.
                </p>
                <div className="grid grid-cols-3 gap-2 mb-5">
                  <div className="bg-cream-200/5 rounded-lg p-3 text-center">
                    <div className="text-cream-200/35 text-[10px] uppercase">
                      Total
                    </div>
                    <div className="text-cream-200 font-mono text-lg">
                      {customTotal}
                    </div>
                  </div>
                  <div className="bg-cream-200/5 rounded-lg p-3 text-center">
                    <div className="text-cream-200/35 text-[10px] uppercase">
                      Correct
                    </div>
                    <div className="text-accent-sage font-mono text-lg">
                      {customCorrect}
                    </div>
                  </div>
                  <div className="bg-cream-200/5 rounded-lg p-3 text-center">
                    <div className="text-cream-200/35 text-[10px] uppercase">
                      Accuracy
                    </div>
                    <div className="text-cream-200 font-mono text-lg">
                      {customTotal
                        ? Math.round((customCorrect / customTotal) * 100)
                        : 0}
                      %
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    className="btn-ghost text-sm"
                    onClick={() => setShowPracticeResultModal(false)}
                  >
                    Review Questions
                  </button>
                  <button
                    className="btn-primary text-sm"
                    onClick={() => {
                      setCustomFeed(null);
                      setPracticeResults({});
                      setShowPracticeResultModal(false);
                    }}
                  >
                    Back to Home Feed
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
        {showFeedCompleteModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-40"
            />
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="w-full max-w-md card p-6">
                <h3 className="font-display text-xl text-cream-200 mb-2">
                  Daily Feed Complete
                </h3>
                <p className="text-cream-200/55 text-sm mb-4">
                  {feedModalMode === "complete"
                    ? "You've completed this 60-question batch. Great work — load a fresh set now or switch to focused practice."
                    : "You have no active questions left in view because some were flagged. You can show flagged questions again to continue this session."}
                </p>
                <div className="grid grid-cols-3 gap-2 mb-5">
                  <div className="bg-cream-200/5 rounded-lg p-3 text-center">
                    <div className="text-cream-200/35 text-[10px] uppercase">
                      Total
                    </div>
                    <div className="text-cream-200 font-mono text-lg">
                      {feed?.total ?? 60}
                    </div>
                  </div>
                  <div className="bg-cream-200/5 rounded-lg p-3 text-center">
                    <div className="text-cream-200/35 text-[10px] uppercase">
                      Correct
                    </div>
                    <div className="text-accent-sage font-mono text-lg">
                      {feed?.correct_count ?? 0}
                    </div>
                  </div>
                  <div className="bg-cream-200/5 rounded-lg p-3 text-center">
                    <div className="text-cream-200/35 text-[10px] uppercase">
                      {feedModalMode === "complete" ? "Accuracy" : "Flagged"}
                    </div>
                    <div className="text-cream-200 font-mono text-lg">
                      {feedModalMode === "complete"
                        ? `${feed?.accuracy_pct ?? 0}%`
                        : hiddenInActiveFeed}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    className="btn-ghost text-sm"
                    onClick={() => setShowFeedCompleteModal(false)}
                  >
                    Close
                  </button>
                  <button
                    className="btn-primary text-sm"
                    onClick={() => {
                      setShowFeedCompleteModal(false);
                      if (feedModalMode === "flagged") {
                        setHiddenQuestionIds([]);
                        return;
                      }
                      refreshFeedMutation.mutate();
                    }}
                    disabled={refreshFeedMutation.isPending}
                  >
                    {feedModalMode === "complete"
                      ? refreshFeedMutation.isPending
                        ? "Loading Fresh Feed..."
                        : "Load Fresh 60"
                      : "Show Flagged Questions"}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
