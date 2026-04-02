import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw, Filter, ChevronDown, CheckSquare,
  AlertCircle, BookOpen, Calendar, TrendingUp, Clock
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import clsx from 'clsx';
import { feedApi, coursesApi } from '../api/index';
import { useAuthStore } from '../store/authStore';
import QuestionCard from '../components/feed/QuestionCard';
import type { Question } from '../types';
import toast from 'react-hot-toast';

type AnswerLog = {
  questionId: string;
  courseId: string;
  weekNumber: number;
  isCorrect: boolean;
  answeredAt: string;
};

const ANSWER_LOG_KEY = 'scholara-answer-log-v1';

// Color palette for courses
const COURSE_COLORS = [
  '#4a7fb5', '#5a8a6e', '#c9a84c', '#8a6eaf',
  '#d4604a', '#4aa8af', '#af8a4a', '#6e8a5a',
];

export default function HomePage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [filterCourse, setFilterCourse] = useState<string | null>(null);
  const [filterDone, setFilterDone] = useState<'all' | 'pending' | 'done'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [practiceMode, setPracticeMode] = useState<'home' | 'focused'>('home');
  const [focusedCourseIds, setFocusedCourseIds] = useState<string[]>([]);
  const [focusedCount, setFocusedCount] = useState<30 | 60>(30);
  const [logVersion, setLogVersion] = useState(0);

  const answerLog = useMemo<AnswerLog[]>(() => {
    try {
      const raw = localStorage.getItem(ANSWER_LOG_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as AnswerLog[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [logVersion]);

  const { data: feed, isLoading: feedLoading, error: feedError } = useQuery({
    queryKey: ['feed', 'today'],
    queryFn: () => feedApi.getToday().then(r => r.data),
    staleTime: 1000 * 30,
  });

  const { data: progress } = useQuery({
    queryKey: ['feed', 'progress'],
    queryFn: () => feedApi.getProgress().then(r => r.data),
  });

  const { data: courses } = useQuery({
    queryKey: ['courses', user?.level, user?.semester],
    queryFn: () => coursesApi.list(user?.level, user?.semester).then(r => r.data),
  });

  const { data: stats } = useQuery({
    queryKey: ['feed', 'stats'],
    queryFn: () => feedApi.getStats().then(r => r.data),
  });

  const markWeekMutation = useMutation({
    mutationFn: ({ courseId, week, done }: { courseId: string; week: number; done: boolean }) =>
      feedApi.markWeekDone(courseId, week, done),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feed'] });
      toast.success('Progress updated');
    },
  });

  // Build course map with colors
  const courseMap = useMemo(() => {
    const map: Record<string, { code: string; color: string }> = {};
    courses?.forEach((c, i) => {
      map[c.id] = { code: c.code, color: COURSE_COLORS[i % COURSE_COLORS.length] };
    });
    return map;
  }, [courses]);

  // Filter questions
  const displayedQuestions = useMemo(() => {
    if (!feed?.questions) return [];
    let qs = feed.questions;

    if (practiceMode === 'focused') {
      if (focusedCourseIds.length > 0) {
        qs = qs.filter(q => focusedCourseIds.includes(q.course_id));
      }
      qs = qs.slice(0, focusedCount);
    }

    if (filterCourse !== null) qs = qs.filter(q => q.course_id === filterCourse);
    if (filterDone === 'pending') qs = qs.filter(q => !q.is_completed);
    if (filterDone === 'done') qs = qs.filter(q => q.is_completed);
    return qs;
  }, [feed, filterCourse, filterDone, practiceMode, focusedCourseIds, focusedCount]);

  // Progress groups by course
  const questionsByCourse = useMemo(() => {
    if (!feed?.questions || !courses) return [];
    return courses.map((course, i) => {
      const courseQs = feed.questions.filter(q => q.course_id === course.id);
      const done = courseQs.filter(q => q.is_completed).length;
      return { course, color: COURSE_COLORS[i % COURSE_COLORS.length], total: courseQs.length, done };
    }).filter(g => g.total > 0);
  }, [feed, courses]);

  const currentWeek = progress?.current_academic_week ?? 1;
  const today = format(new Date(), 'EEEE, MMMM d');

  const dailyHistory = useMemo(() => {
    const grouped = new Map<string, { attempted: number; correct: number }>();
    answerLog.forEach((item) => {
      const day = item.answeredAt.slice(0, 10);
      const current = grouped.get(day) ?? { attempted: 0, correct: 0 };
      grouped.set(day, {
        attempted: current.attempted + 1,
        correct: current.correct + (item.isCorrect ? 1 : 0),
      });
    });

    return Array.from(grouped.entries())
      .map(([date, value]) => ({ date, ...value }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-7);
  }, [answerLog]);

  const weakLinks = useMemo(() => {
    const byCourse = new Map<string, { correct: number; incorrect: number }>();
    const byWeek = new Map<number, { correct: number; incorrect: number }>();

    answerLog.forEach((item) => {
      const courseStats = byCourse.get(item.courseId) ?? { correct: 0, incorrect: 0 };
      byCourse.set(item.courseId, {
        correct: courseStats.correct + (item.isCorrect ? 1 : 0),
        incorrect: courseStats.incorrect + (item.isCorrect ? 0 : 1),
      });

      const weekStats = byWeek.get(item.weekNumber) ?? { correct: 0, incorrect: 0 };
      byWeek.set(item.weekNumber, {
        correct: weekStats.correct + (item.isCorrect ? 1 : 0),
        incorrect: weekStats.incorrect + (item.isCorrect ? 0 : 1),
      });
    });

    const courseStats = Array.from(byCourse.entries()).map(([courseId, stat]) => ({
      courseId,
      ...stat,
      score: stat.correct - stat.incorrect,
    }));
    const weekStats = Array.from(byWeek.entries()).map(([weekNumber, stat]) => ({
      weekNumber,
      ...stat,
      score: stat.correct - stat.incorrect,
    }));

    return {
      weakestCourse: courseStats.sort((a, b) => a.score - b.score)[0] ?? null,
      strongestCourse: courseStats.sort((a, b) => b.score - a.score)[0] ?? null,
      weakestWeek: weekStats.sort((a, b) => a.score - b.score)[0] ?? null,
      strongestWeek: weekStats.sort((a, b) => b.score - a.score)[0] ?? null,
    };
  }, [answerLog]);

  const streakInfo = useMemo(() => {
    const answeredDates = new Set(answerLog.map(item => item.answeredAt.slice(0, 10)));
    let streak = 0;
    let cursor = new Date();

    while (answeredDates.has(format(cursor, 'yyyy-MM-dd'))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const missedYesterday = !answeredDates.has(format(yesterday, 'yyyy-MM-dd'));

    return { streak, missedYesterday };
  }, [answerLog]);

  function toggleFocusedCourse(courseId: string) {
    setFocusedCourseIds((prev) => prev.includes(courseId)
      ? prev.filter(id => id !== courseId)
      : [...prev, courseId]);
  }

  function recordAnswer(question: Question, isCorrect: boolean) {
    const nextItem: AnswerLog = {
      questionId: question.id,
      courseId: question.course_id,
      weekNumber: question.week_number,
      isCorrect,
      answeredAt: new Date().toISOString(),
    };

    try {
      const raw = localStorage.getItem(ANSWER_LOG_KEY);
      const parsed = raw ? (JSON.parse(raw) as AnswerLog[]) : [];
      const deduped = parsed.filter(item => item.questionId !== question.id);
      localStorage.setItem(ANSWER_LOG_KEY, JSON.stringify([...deduped, nextItem]));
      setLogVersion(v => v + 1);
    } catch {
      // no-op: history widgets degrade gracefully when storage is unavailable.
    }
  }

  if (feedError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle size={40} className="text-accent-coral/60 mx-auto mb-3" />
          <p className="text-cream-200/50">Failed to load feed. Please refresh.</p>
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
            Academic Week <span className="text-cream-200/75 font-semibold">{currentWeek}</span>
            {' · '}BSc. Software Engineering
          </p>
        </div>

        <div className="text-right">
          <div className="font-mono text-2xl font-bold text-cream-200">
            {feed?.completed_count ?? 0}
            <span className="text-cream-200/30 text-lg">/{feed?.total ?? 60}</span>
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
            transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
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
                    width: total > 0 ? `${(done / total) * 100}%` : '0%',
                    background: color,
                  }}
                />
              </div>
              <div className="text-[9px] font-mono text-cream-200/30">{course.code.replace(/\D/g, '')}</div>
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
            { label: 'Attempted', value: stats.total_attempted, icon: BookOpen },
            { label: 'Correct', value: stats.total_correct, icon: CheckSquare, color: 'text-accent-sage' },
            { label: 'Accuracy', value: `${stats.accuracy}%`, icon: TrendingUp, color: 'text-accent-gold' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="card p-4 text-center">
              <Icon size={16} className={clsx('mx-auto mb-2', color || 'text-cream-200/30')} />
              <div className="font-mono text-xl font-bold text-cream-200">{value}</div>
              <div className="text-cream-200/35 text-xs mt-0.5">{label}</div>
            </div>
          ))}
        </motion.div>
      )}

      {/* History / weak links / streak */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="card p-4">
          <h3 className="text-sm text-cream-200/75 font-semibold mb-3">History of progress</h3>
          <div className="space-y-2">
            {dailyHistory.length === 0 ? (
              <p className="text-xs text-cream-200/35">Answer questions to start building your history.</p>
            ) : dailyHistory.map(day => (
              <div key={day.date} className="flex items-center justify-between text-xs">
                <span className="text-cream-200/45">{day.date}</span>
                <span className="text-cream-200/75">{day.correct}/{day.attempted} correct</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-4">
          <h3 className="text-sm text-cream-200/75 font-semibold mb-3">Weak links</h3>
          <div className="space-y-2 text-xs text-cream-200/65">
            <div>
              Weakest course:{' '}
              <span className="text-accent-coral">
                {weakLinks.weakestCourse
                  ? courseMap[weakLinks.weakestCourse.courseId]?.code ?? 'Unknown'
                  : '—'}
              </span>
            </div>
            <div>
              Strongest course:{' '}
              <span className="text-accent-sage">
                {weakLinks.strongestCourse
                  ? courseMap[weakLinks.strongestCourse.courseId]?.code ?? 'Unknown'
                  : '—'}
              </span>
            </div>
            <div>
              Weakest week: <span className="text-accent-coral">{weakLinks.weakestWeek ? `Week ${weakLinks.weakestWeek.weekNumber}` : '—'}</span>
            </div>
            <div>
              Strongest week: <span className="text-accent-sage">{weakLinks.strongestWeek ? `Week ${weakLinks.strongestWeek.weekNumber}` : '—'}</span>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <h3 className="text-sm text-cream-200/75 font-semibold mb-3">Streak</h3>
          <div className="text-2xl font-mono text-cream-200">{streakInfo.streak} days</div>
          <p className="text-xs text-cream-200/45 mt-1">
            {streakInfo.missedYesterday
              ? 'You missed yesterday — answer today to restart your streak.'
              : 'Great consistency. Keep your streak alive today.'}
          </p>
        </div>
      </div>

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
            <h3 className="text-cream-200/80 text-sm font-semibold">Progress Gate</h3>
            <span className="text-cream-200/30 text-xs">— mark weeks done to unlock questions</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {progress.courses.map((cp) => (
              <div key={cp.course_id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-cream-200/70 text-xs font-semibold">{cp.course_code}</span>
                    <span className="text-cream-200/35 text-xs">
                      Unlocked: Wk {cp.unlocked_week} / {cp.current_academic_week}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {Array.from({ length: Math.min(cp.current_academic_week, 15) }, (_, i) => i + 1).map(w => (
                      <button
                        key={w}
                        onClick={() => markWeekMutation.mutate({
                          courseId: cp.course_id,
                          week: w,
                          done: !cp.weeks_done.includes(w),
                        })}
                        title={`Week ${w} — ${cp.weeks_done.includes(w) ? 'Done (click to undo)' : 'Not done'}`}
                        className={clsx(
                          'h-4 rounded-sm flex-1 max-w-[18px] transition-all duration-200 hover:opacity-80',
                          cp.weeks_done.includes(w)
                            ? 'bg-accent-sage/60'
                            : w <= cp.current_academic_week
                            ? 'bg-cream-200/12 border border-cream-200/15'
                            : 'bg-cream-200/5'
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPracticeMode('home')}
            className={clsx('badge border text-xs transition-colors',
              practiceMode === 'home'
                ? 'bg-cream-200/10 border-cream-200/25 text-cream-200'
                : 'border-cream-200/10 text-cream-200/40'
            )}
          >
            Home Feed
          </button>
          <button
            onClick={() => setPracticeMode('focused')}
            className={clsx('badge border text-xs transition-colors',
              practiceMode === 'focused'
                ? 'bg-accent-gold/15 border-accent-gold/35 text-accent-gold'
                : 'border-cream-200/10 text-cream-200/40'
            )}
          >
            Focused Practice
          </button>
        </div>

        {practiceMode === 'focused' && (
          <div className="w-full card p-3 text-xs text-cream-200/65 space-y-2">
            <p>Home feed stays unchanged. Pick courses and a session size.</p>
            <div className="flex flex-wrap items-center gap-2">
              {[30, 60].map(count => (
                <button
                  key={count}
                  onClick={() => setFocusedCount(count as 30 | 60)}
                  className={clsx('badge border', focusedCount === count
                    ? 'bg-cream-200/10 border-cream-200/25 text-cream-200'
                    : 'border-cream-200/10 text-cream-200/40')}
                >
                  {count} questions
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {courses?.map((c) => (
                <button
                  key={c.id}
                  onClick={() => toggleFocusedCourse(c.id)}
                  className={clsx('badge border', focusedCourseIds.includes(c.id)
                    ? 'bg-cream-200/10 border-cream-200/25 text-cream-200'
                    : 'border-cream-200/10 text-cream-200/40')}
                >
                  {c.code}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 text-cream-200/50 hover:text-cream-200/80 text-sm transition-colors"
        >
          <Filter size={14} />
          Filters
          <ChevronDown size={13} className={clsx('transition-transform', showFilters && 'rotate-180')} />
        </button>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="w-full overflow-hidden"
            >
              <div className="flex items-center gap-2 flex-wrap pt-2">
                <button
                  onClick={() => setFilterDone('all')}
                  className={clsx('badge border text-xs cursor-pointer transition-colors',
                    filterDone === 'all' ? 'bg-cream-200/10 border-cream-200/25 text-cream-200' : 'border-cream-200/10 text-cream-200/40'
                  )}
                >
                  All ({feed?.total ?? 0})
                </button>
                <button
                  onClick={() => setFilterDone('pending')}
                  className={clsx('badge border text-xs cursor-pointer transition-colors',
                    filterDone === 'pending' ? 'bg-cream-200/10 border-cream-200/25 text-cream-200' : 'border-cream-200/10 text-cream-200/40'
                  )}
                >
                  Pending ({(feed?.total ?? 0) - (feed?.completed_count ?? 0)})
                </button>
                <button
                  onClick={() => setFilterDone('done')}
                  className={clsx('badge border text-xs cursor-pointer transition-colors',
                    filterDone === 'done' ? 'bg-accent-sage/15 border-accent-sage/25 text-accent-sage' : 'border-cream-200/10 text-cream-200/40'
                  )}
                >
                  Done ({feed?.completed_count ?? 0})
                </button>
                <div className="w-px h-4 bg-cream-200/15" />
                <button
                  onClick={() => setFilterCourse(null)}
                  className={clsx('badge border text-xs cursor-pointer transition-colors',
                    filterCourse === null ? 'bg-cream-200/10 border-cream-200/25 text-cream-200' : 'border-cream-200/10 text-cream-200/40'
                  )}
                >
                  All Courses
                </button>
                {courses?.map((c, i) => (
                  <button
                    key={c.id}
                    onClick={() => setFilterCourse(filterCourse === c.id ? null : c.id)}
                    className={clsx('badge border text-xs cursor-pointer transition-colors')}
                    style={filterCourse === c.id ? {
                      background: `${COURSE_COLORS[i % COURSE_COLORS.length]}18`,
                      borderColor: `${COURSE_COLORS[i % COURSE_COLORS.length]}30`,
                      color: COURSE_COLORS[i % COURSE_COLORS.length],
                    } : {
                      borderColor: 'rgba(240,231,213,0.1)',
                      color: 'rgba(240,231,213,0.4)',
                    }}
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
              <CheckSquare size={40} className="text-accent-sage/60 mx-auto mb-3" />
              <h3 className="font-display text-xl text-cream-200 mb-2">Feed Complete</h3>
              <p className="text-cream-200/45 text-sm">
                All 60 questions done today. Fresh questions arrive tomorrow.
              </p>
            </>
          ) : (
            <>
              <AlertCircle size={40} className="text-cream-200/20 mx-auto mb-3" />
              <h3 className="font-display text-xl text-cream-200 mb-2">No questions available</h3>
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
              courseCode={courseMap[q.course_id]?.code || 'COURSE'}
              courseColor={courseMap[q.course_id]?.color || '#4a7fb5'}
              index={i}
              onAnswered={(question, result) => {
                recordAnswer(question, result.is_correct);
                // Refresh both the feed (progress bar / completed_count) and stats
                qc.invalidateQueries({ queryKey: ['feed', 'today'] });
                qc.invalidateQueries({ queryKey: ['feed', 'stats'] });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
