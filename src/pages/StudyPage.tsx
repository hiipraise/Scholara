import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, ChevronDown, ChevronUp, Clock, AlertTriangle } from 'lucide-react';
import { format, parseISO, isToday, isPast, addDays } from 'date-fns';
import clsx from 'clsx';
import { adminApi } from '../api/index';
import { useAuthStore } from '../store/authStore';
import type { ExamSlot } from '../types';

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

// Compute which "study day" today is (cycling 1-5 from lectures start)
function getCurrentStudyDay(lecturesStart: Date | null): number {
  if (!lecturesStart) return 1;
  const today = new Date();
  const diffDays = Math.floor((today.getTime() - lecturesStart.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 1;
  return (diffDays % 5) + 1;
}

const COURSE_COLORS = [
  '#4a7fb5', '#5a8a6e', '#c9a84c', '#8a6eaf',
  '#d4604a', '#4aa8af', '#af8a4a', '#6e8a5a',
];

export default function StudyPage() {
  const { user } = useAuthStore();
  const [showFullCycle, setShowFullCycle] = useState(false);

  const { data: cycle, isLoading: cycleLoading } = useQuery({
    queryKey: ['study-cycle', user?.level, user?.semester],
    queryFn: () => adminApi.getStudyCycle(user?.level, user?.semester).then(r => r.data),
  });

  const { data: examSlots, isLoading: examLoading } = useQuery({
    queryKey: ['exam-timetable', user?.level, user?.semester],
    queryFn: () => adminApi.getExamTimetable(user?.level, user?.semester).then(r => r.data),
  });

  const { data: calendars } = useQuery({
    queryKey: ['calendars'],
    queryFn: () => adminApi.getCalendars().then(r => r.data),
  });

  const activeCalendar = calendars?.find(c => c.level === user?.level && c.semester === user?.semester);
  const lecturesStart = activeCalendar?.lectures_start_date
    ? new Date(activeCalendar.lectures_start_date)
    : null;

  const currentStudyDay = getCurrentStudyDay(lecturesStart);

  // Group exams by date
  const examsByDate = examSlots?.reduce<Record<string, ExamSlot[]>>((acc, slot) => {
    if (!acc[slot.exam_date]) acc[slot.exam_date] = [];
    acc[slot.exam_date].push(slot);
    return acc;
  }, {}) ?? {};

  const sortedExamDates = Object.keys(examsByDate).sort();
  const upcomingExams = sortedExamDates.filter(d => !isPast(parseISO(d)) || isToday(parseISO(d)));

  // Days to display: current, next 2
  const displayDays = cycle
    ? [
        cycle.find(d => d.day_number === currentStudyDay),
        cycle.find(d => d.day_number === ((currentStudyDay % 5) + 1)),
        cycle.find(d => d.day_number === (((currentStudyDay + 1) % 5) + 1)),
      ].filter(Boolean)
    : [];

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="text-cream-200/35 text-xs tracking-widest uppercase font-body mb-1">
          Schedule
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-cream-200">
          Study Cycle
        </h1>
        <p className="text-cream-200/45 text-sm mt-1">
          {user?.level} · Semester {user?.semester} · BSc. Software Engineering
        </p>
      </motion.div>

      {/* Today + next days */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-cream-200/70 text-sm font-semibold uppercase tracking-wider">
            Current Cycle
          </h2>
          <button
            onClick={() => setShowFullCycle(!showFullCycle)}
            className="flex items-center gap-1.5 text-cream-200/40 hover:text-cream-200/70 text-xs transition-colors"
          >
            {showFullCycle ? 'Hide' : 'View full timetable'}
            {showFullCycle ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>

        {cycleLoading ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {[1, 2, 3].map(i => <div key={i} className="card h-36 shimmer-bg" />)}
          </div>
        ) : (
          <>
            {/* Current + next 2 days */}
            <div className="grid gap-3 sm:grid-cols-3">
              {displayDays.map((day, idx) => day && (
                <motion.div
                  key={day.day_number}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.07 }}
                  className={clsx(
                    'card p-4',
                    idx === 0 && 'border-cream-200/20 shadow-glow-cream'
                  )}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-cream-200/35 text-[10px] uppercase tracking-widest">
                        {idx === 0 ? 'Today' : idx === 1 ? 'Tomorrow' : 'Day After'}
                      </div>
                      <div className="text-cream-200/80 font-display text-lg font-semibold">
                        Day {day.day_number}
                      </div>
                    </div>
                    {idx === 0 && (
                      <div className="w-2 h-2 rounded-full bg-accent-sage animate-pulse" />
                    )}
                  </div>

                  <div className="space-y-2">
                    {day.courses.map((course, ci) => (
                      <div
                        key={course.id}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg"
                        style={{ background: `${COURSE_COLORS[ci % COURSE_COLORS.length]}12` }}
                      >
                        <div
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: COURSE_COLORS[ci % COURSE_COLORS.length] }}
                        />
                        <div className="min-w-0">
                          <div className="text-cream-200/90 text-xs font-semibold">{course.code}</div>
                          <div className="text-cream-200/40 text-[10px] truncate">{course.title}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Full timetable */}
            <AnimatePresence>
              {showFullCycle && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden mt-4"
                >
                  <div className="card overflow-hidden">
                    <div className="p-4 border-b border-cream-200/8">
                      <h3 className="text-cream-200/70 text-sm font-semibold">Full 5-Day Cycle</h3>
                    </div>
                    <div className="divide-y divide-cream-200/6">
                      {cycle?.map(day => (
                        <div
                          key={day.day_number}
                          className={clsx(
                            'flex items-start gap-4 px-4 py-3',
                            day.day_number === currentStudyDay && 'bg-cream-200/3'
                          )}
                        >
                          <div className="w-16 shrink-0">
                            <div className="text-cream-200/50 text-xs font-semibold">Day {day.day_number}</div>
                            {day.day_number === currentStudyDay && (
                              <div className="text-accent-sage text-[10px]">Today</div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {day.courses.map((c, ci) => (
                              <span
                                key={c.id}
                                className="badge border text-[10px]"
                                style={{
                                  background: `${COURSE_COLORS[ci % COURSE_COLORS.length]}15`,
                                  borderColor: `${COURSE_COLORS[ci % COURSE_COLORS.length]}25`,
                                  color: COURSE_COLORS[ci % COURSE_COLORS.length],
                                }}
                              >
                                {c.code}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </motion.div>

      {/* Exam Timetable */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Calendar size={16} className="text-cream-200/40" />
          <h2 className="text-cream-200/70 text-sm font-semibold uppercase tracking-wider">
            Exam Timetable
          </h2>
          <span className="text-cream-200/25 text-xs">April 2026</span>
        </div>

        {examLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="card h-20 shimmer-bg" />)}
          </div>
        ) : sortedExamDates.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-cream-200/35 text-sm">No exam slots scheduled yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedExamDates.map(dateStr => {
              const slots = examsByDate[dateStr];
              const dateObj = parseISO(dateStr);
              const isPastDate = isPast(dateObj) && !isToday(dateObj);
              const isTodayDate = isToday(dateObj);

              return (
                <motion.div
                  key={dateStr}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={clsx(
                    'card p-4',
                    isTodayDate && 'border-accent-coral/30 shadow-glow-gold',
                    isPastDate && 'opacity-40'
                  )}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-14 shrink-0 text-center">
                      <div className="font-mono text-2xl font-bold text-cream-200 leading-none">
                        {format(dateObj, 'd')}
                      </div>
                      <div className="text-cream-200/40 text-[10px] uppercase tracking-wider mt-0.5">
                        {format(dateObj, 'MMM')}
                      </div>
                      {isTodayDate && (
                        <div className="text-accent-coral text-[9px] font-bold uppercase tracking-wider mt-1">
                          Today
                        </div>
                      )}
                    </div>

                    <div className="flex-1 space-y-2">
                      {slots.map(slot => (
                        <div key={slot.id} className="flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-2 text-cream-200/40 text-xs font-mono">
                            <Clock size={11} />
                            {slot.start_time} – {slot.end_time}
                          </div>
                          <div>
                            <span className="text-cream-200 font-semibold text-sm">{slot.course_code}</span>
                            <span className="text-cream-200/45 text-xs ml-2">{slot.course_title}</span>
                          </div>
                          {isTodayDate && (
                            <span className="badge bg-accent-coral/15 text-accent-coral border border-accent-coral/25 text-[10px]">
                              Exam Today
                            </span>
                          )}
                          {!isPastDate && !isTodayDate && (
                            (() => {
                              const daysLeft = Math.ceil((dateObj.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                              if (daysLeft <= 3) return (
                                <span className="badge bg-accent-gold/15 text-accent-gold border border-accent-gold/20 text-[10px]">
                                  <AlertTriangle size={9} /> {daysLeft}d left
                                </span>
                              );
                              return null;
                            })()
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Academic Calendar */}
      {activeCalendar && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="card p-5"
        >
          <h3 className="text-cream-200/60 text-sm font-semibold mb-4">Academic Calendar</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'School Resumed', value: format(parseISO(activeCalendar.school_resume_date), 'MMM d, yyyy') },
              { label: 'Lectures Started', value: format(parseISO(activeCalendar.lectures_start_date), 'MMM d, yyyy') },
              ...(activeCalendar.semester_end_date ? [{ label: 'Semester Ends', value: format(parseISO(activeCalendar.semester_end_date), 'MMM d, yyyy') }] : []),
            ].map(({ label, value }) => (
              <div key={label} className="bg-cream-200/4 rounded-xl p-3">
                <div className="text-cream-200/35 text-[10px] uppercase tracking-wider mb-1">{label}</div>
                <div className="text-cream-200/80 text-sm font-semibold">{value}</div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
