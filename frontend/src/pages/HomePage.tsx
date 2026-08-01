import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  RefreshCw,
  AlertCircle,
  CheckSquare,
} from "lucide-react";
import { format } from "date-fns";
import clsx from "clsx";
import { feedApi, coursesApi } from "../api/index";
import { useAuthStore } from "../store/authStore";
import QuestionCard from "../components/feed/QuestionCard";
import type { Question } from "../types";
import { COURSE_COLORS } from "../constants/courseColors";
import toast from "react-hot-toast";
import { useSessionBackup } from "../hooks/useSessionBackup";

import ScrollToTop from "../components/feed/ScrollToTop";
import ProgressBar from "../components/feed/ProgressBar";
import StatsRow from "../components/feed/StatsRow";
import InsightsCards from "../components/feed/InsightsCards";
import FocusedPractice from "../components/feed/FocusedPractice";
import ProgressGate from "../components/feed/ProgressGate";
import FeedFilters from "../components/feed/FeedFilters";
import PracticeResultModal from "../components/feed/PracticeResultModal";
import FeedCompleteModal from "../components/feed/FeedCompleteModal";

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
  const [practiceWeek, setPracticeWeek] = useState<number | null>(null);
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

  // Persist / restore focused-practice session
  useSessionBackup({
    userId: user?.id,
    customFeed,
    practiceResults,
    setCustomFeed,
    setPracticeResults,
  });

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
        week_number: practiceWeek,
      }),
    onSuccess: ({ data }) => {
      setCustomFeed(data);
      setHiddenQuestionIds([]);
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

  const activeTotal = activeQuestions.length;
  const activeCompletedCount = useMemo(
    () => activeQuestions.filter((q) => q.is_completed).length,
    [activeQuestions],
  );
  const isActiveFeedFullyAnswered =
    activeTotal > 0 && activeCompletedCount >= activeTotal;

  const remainingActiveUnanswered = useMemo(
    () =>
      activeQuestions.filter(
        (q) =>
          !q.is_completed &&
          (!shouldHideFlaggedLocally || !hiddenQuestionIds.includes(q.id)),
      ).length,
    [activeQuestions, hiddenQuestionIds, shouldHideFlaggedLocally],
  );

  // Show practice result modal when all questions answered
  useEffect(() => {
    if (!customFeed?.questions?.length) return;
    if (isActiveFeedFullyAnswered) {
      setShowPracticeResultModal(true);
    }
  }, [customFeed, isActiveFeedFullyAnswered]);

  // Show completion modal for true completion or "hidden-by-flag" exhaustion.
  useEffect(() => {
    if (!feed) return;
    const feedFullyAnswered =
      feed.questions?.length > 0 &&
      feed.questions.every((q: Question) => q.is_completed);
    if (feedFullyAnswered) {
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
    if (Array.isArray(courses)) {
      courses.forEach((c, i) => {
        map[c.id] = {
          code: c.code,
          color: COURSE_COLORS[i % COURSE_COLORS.length],
        };
      });
    }
    return map;
  }, [courses]);

  const currentCourses = (Array.isArray(courses) ? courses : []).filter(
    (c) => c.level === user?.level && c.semester === user?.semester,
  );
  const practicePool = currentCourses;
  const availablePracticeWeeks = useMemo(() => {
    const weeks = new Set<number>();
    progress?.courses?.forEach((courseProgress) => {
      Object.keys(courseProgress.question_counts || {}).forEach((week) => {
        const n = Number(week);
        if (n > 0) weeks.add(n);
      });
    });
    return Array.from(weeks).sort((a, b) => a - b);
  }, [progress]);

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
    if (!feed?.questions || !Array.isArray(courses)) return [];
    return courses
      .map((course, i) => {
        const courseQs = feed.questions.filter(
          (q) => q.course_id === course.id,
        );
        const done = courseQs.filter((q) => q.is_completed).length;
        return {
          id: course.id,
          code: course.code,
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
      <ProgressBar
        progressPct={feed?.progress_pct ?? 0}
        courses={questionsByCourse}
      />

      {/* Stats Row */}
      <StatsRow stats={stats ?? null} />

      {/* Progress history + focus insights */}
      <InsightsCards insights={insights ?? null} />

      {/* Focused practice */}
      <FocusedPractice
        courses={practicePool ?? []}
        selectedCourseIds={practiceCourseIds}
        onToggleCourse={(id) =>
          setPracticeCourseIds((prev) =>
            prev.includes(id)
              ? prev.filter((pid) => pid !== id)
              : [...prev, id],
          )
        }
        count={practiceCount}
        onCountChange={setPracticeCount}
        selectedWeek={practiceWeek}
        onWeekChange={setPracticeWeek}
        availableWeeks={availablePracticeWeeks}
        onGenerate={() => practiceMutation.mutate()}
        onBackToFeed={() => {
          setCustomFeed(null);
          setPracticeResults({});
          setHiddenQuestionIds([]);
          setShowPracticeResultModal(false);
        }}
        isPending={practiceMutation.isPending}
        history={history ?? null}
        customFeed={customFeed}
        customDone={customDone}
        customTotal={customTotal}
        customCorrect={customCorrect}
      />

      {/* Week Progress Gate */}
      <ProgressGate
        progress={progress ?? null}
        onMarkWeek={(courseId, week, done) =>
          markWeekMutation.mutate({ courseId, week, done })
        }
      />

      {/* Filters */}
      <FeedFilters
        show={showFilters}
        onToggle={() => setShowFilters((v) => !v)}
        filterDone={filterDone}
        onFilterDoneChange={setFilterDone}
        filterCourse={filterCourse}
        onFilterCourseChange={setFilterCourse}
        total={feed?.total ?? 0}
        completedCount={feed?.completed_count ?? 0}
        courses={Array.isArray(courses) ? courses : []}
      />

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
              total={activeTotal || displayedQuestions.length}
              displayNumber={
                activeQuestions.findIndex((aq) => aq.id === q.id) + 1 || i + 1
              }
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
                        total > 0 && completedCount >= total,
                      progress_pct: total
                        ? Math.round((completedCount / total) * 1000) / 10
                        : prev.progress_pct,
                      questions: prev.questions.map((pq: Question) =>
                        pq.id === q.id ? { ...pq, is_completed: true } : pq,
                      ),
                    };
                  });
                }
                if (
                  !customFeed &&
                  result.total &&
                  result.completed_count != null &&
                  result.completed_count >= result.total
                ) {
                  setFeedModalMode("complete");
                  setShowFeedCompleteModal(true);
                }
                qc.invalidateQueries({ queryKey: ["feed", "today"] });
                qc.invalidateQueries({ queryKey: ["feed", "stats"] });
              }}
              onFlagged={(qid) => {
                if (shouldHideFlaggedLocally) {
                  setHiddenQuestionIds((prev) =>
                    prev.includes(qid) ? prev : [...prev, qid],
                  );
                }
                qc.invalidateQueries({ queryKey: ["feed", "today"] });
                qc.invalidateQueries({ queryKey: ["feed", "stats"] });
              }}
            />
          ))}
        </div>
      )}

      <ScrollToTop />

      <PracticeResultModal
        open={showPracticeResultModal && Boolean(customFeed)}
        customTotal={customTotal}
        customCorrect={customCorrect}
        onClose={() => setShowPracticeResultModal(false)}
        onBackToFeed={() => {
          setCustomFeed(null);
          setPracticeResults({});
          setHiddenQuestionIds([]);
          setShowPracticeResultModal(false);
        }}
      />

      <FeedCompleteModal
        open={showFeedCompleteModal}
        mode={feedModalMode}
        total={feed?.total ?? 60}
        correctCount={feed?.correct_count ?? 0}
        accuracyPct={feed?.accuracy_pct ?? 0}
        hiddenCount={hiddenInActiveFeed}
        onClose={() => setShowFeedCompleteModal(false)}
        onShowFlagged={() => {
          setShowFeedCompleteModal(false);
          setHiddenQuestionIds([]);
        }}
        onLoadFresh={() => refreshFeedMutation.mutate()}
        loading={refreshFeedMutation.isPending}
      />
    </div>
  );
}
