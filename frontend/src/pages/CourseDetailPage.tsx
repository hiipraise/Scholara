import { useMemo, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle,
  Clock,
  Download,
  FileText,
  GraduationCap,
  HelpCircle,
  Loader2,
  Trash2,
  WifiOff,
} from "lucide-react";
import clsx from "clsx";
import { coursesApi, feedApi } from "../api/index";
import { COURSE_COLORS } from "../constants/courseColors";
import toast from "react-hot-toast";
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { useOfflineDownload } from "../hooks/useOfflineDownload";
import { getDownloadState, type DownloadState } from "../lib/contentDb";

export default function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { isOnline } = useNetworkStatus();
  const { progress: dlProgress, downloadCourse, removeDownload } = useOfflineDownload();

  const [offlineState, setOfflineState] = useState<DownloadState | undefined>(undefined);
  const [checkingOffline, setCheckingOffline] = useState(true);

  // Check offline download state for this course
  useEffect(() => {
    if (!courseId) return;
    setCheckingOffline(true);
    getDownloadState(courseId).then((state) => {
      setOfflineState(state);
      setCheckingOffline(false);
    });
  }, [courseId, dlProgress.status]);
  // Fetch all courses to find this one
  const { data: courses, isLoading: coursesLoading } = useQuery({
    queryKey: ["courses", "all"],
    queryFn: () => coursesApi.list().then((r) => r.data),
  });

  // Fetch progress data for the user's level/semester
  const { data: progress } = useQuery({
    queryKey: ["feed", "progress"],
    queryFn: () => feedApi.getProgress().then((r) => r.data),
  });

  // Fetch PDFs for this course
  const { data: pdfs, isLoading: pdfsLoading } = useQuery({
    queryKey: ["course-pdfs", courseId],
    queryFn: () => coursesApi.getPdfs(courseId!).then((r) => r.data),
    enabled: !!courseId,
  });

  const course = useMemo(
    () => (Array.isArray(courses) ? courses.find((c) => c.id === courseId) : null),
    [courses, courseId],
  );

  const courseIndex = useMemo(
    () =>
      Array.isArray(courses)
        ? courses.findIndex((c) => c.id === courseId)
        : 0,
    [courses, courseId],
  );

  const color = COURSE_COLORS[Math.max(0, courseIndex) % COURSE_COLORS.length];

  // Find progress data for this course
  const courseProgress = useMemo(() => {
    if (!progress?.courses) return null;
    return progress.courses.find((cp) => cp.course_id === courseId) || null;
  }, [progress, courseId]);

  // Build week data: which weeks have PDFs and question counts
  const weekData = useMemo(() => {
    const maxWeek = Math.max(
      courseProgress?.current_academic_week ?? 12,
      12,
    );
    const weeks: {
      week: number;
      pdfCount: number;
      questionCount: number;
      isDone: boolean;
      isUnlocked: boolean;
    }[] = [];

    for (let w = 1; w <= Math.min(maxWeek, 15); w++) {
      const pdfCount = Array.isArray(pdfs)
        ? pdfs.filter((p) => p.week_number === w).length
        : 0;
      const questionCount =
        courseProgress?.question_counts?.[w] ?? 0;
      const isDone = courseProgress?.weeks_done?.includes(w) ?? false;
      const isUnlocked = w <= (courseProgress?.unlocked_week ?? 1);

      weeks.push({ week: w, pdfCount, questionCount, isDone, isUnlocked });
    }

    return weeks;
  }, [courseProgress, pdfs]);

  if (coursesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={24} className="animate-spin text-cream-200/30" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-center">
          <BookOpen size={40} className="text-cream-200/20 mx-auto mb-3" />
          <h2 className="font-display text-lg text-cream-200 mb-2">
            Course not found
          </h2>
          <button onClick={() => navigate("/courses")} className="btn-ghost text-sm mt-2">
            Back to Courses
          </button>
        </div>
      </div>
    );
  }

  const unlockedWeek = courseProgress?.unlocked_week ?? 1;
  const academicWeek = courseProgress?.current_academic_week ?? 1;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between gap-4"
      >
        <div>
          <button
            onClick={() => navigate("/courses")}
            className="flex items-center gap-1.5 text-cream-200/40 hover:text-cream-200/70 text-xs mb-2 transition-colors"
          >
            <ArrowLeft size={14} />
            All Courses
          </button>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `${color}18` }}
            >
              <BookOpen size={18} style={{ color }} />
            </div>
            <div>
              <h1 className="font-display text-xl sm:text-2xl font-bold text-cream-200">
                {course.code}
              </h1>
              <p className="text-cream-200/45 text-sm mt-0.5">
                {course.title}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="text-cream-200/35 text-xs">
              {course.credit_units} units
            </span>
            <span className="text-cream-200/20 text-xs">·</span>
            <span className="text-cream-200/35 text-xs">
              {course.level} · Semester {course.semester}
            </span>
            <span className="text-cream-200/20 text-xs">·</span>
            <span className="text-cream-200/35 text-xs">
              {course.pdf_count} PDFs
            </span>
            <span className="text-cream-200/20 text-xs">·</span>
            <span className="text-cream-200/35 text-xs">
              {course.question_count} questions
            </span>

            {/* Offline download status */}
            {!checkingOffline && (
              <>
                {offlineState?.status === "complete" && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-accent-sage/15 text-accent-sage border border-accent-sage/20 font-semibold uppercase tracking-wider">
                    <Download size={8} />
                    Offline available
                  </span>
                )}
                {offlineState?.status === "partial" && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-accent-gold/15 text-accent-gold border border-accent-gold/20 font-semibold uppercase tracking-wider">
                    <WifiOff size={8} />
                    Partial download
                  </span>
                )}
                {dlProgress.status === "downloading" && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-accent-sky/15 text-accent-sky border border-accent-sky/20 font-semibold uppercase tracking-wider">
                    <Loader2 size={8} className="animate-spin" />
                    {dlProgress.progressPct}%
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Download / Remove offline button */}
        <div className="flex items-center gap-2 shrink-0">
          {!checkingOffline && (() => {
            if (offlineState?.status === "complete") {
              return (
                <button
                  onClick={() => {
                    if (course) removeDownload(course.id);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent-coral/10 hover:bg-accent-coral/20 text-accent-coral/70 hover:text-accent-coral text-xs transition-colors border border-accent-coral/15"
                  title="Remove offline content"
                >
                  <Trash2 size={13} />
                  Remove offline
                </button>
              );
            }
            if (dlProgress.status === "downloading") {
              return (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-sky/10 text-accent-sky/70 text-xs">
                  <Loader2 size={13} className="animate-spin" />
                  <span>{dlProgress.progressPct}%</span>
                </div>
              );
            }
            return (
              <button
                onClick={() => {
                  if (course) downloadCourse(course);
                }}
                disabled={!isOnline}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent-sky/10 hover:bg-accent-sky/20 text-accent-sky/70 hover:text-accent-sky text-xs transition-colors border border-accent-sky/15 disabled:opacity-40 disabled:cursor-not-allowed"
                title={!isOnline ? "Connect to the internet to download" : "Download for offline access"}
              >
                <Download size={13} />
                {!isOnline ? "Offline" : "Download for offline"}
              </button>
            );
          })()}
        </div>
      </motion.div>

      {/* Progress snapshot */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="card p-4"
      >
        <div className="flex items-center gap-2 mb-3">
          <Clock size={15} className="text-cream-200/40" />
          <span className="text-cream-200/60 text-xs font-semibold uppercase tracking-wider">
            Progress
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-cream-200/4 rounded-lg p-3 text-center">
            <div className="text-cream-200/30 text-[10px] uppercase">Unlocked</div>
            <div className="text-cream-200 font-mono text-lg mt-0.5">
              Week {unlockedWeek}
            </div>
          </div>
          <div className="bg-cream-200/4 rounded-lg p-3 text-center">
            <div className="text-cream-200/30 text-[10px] uppercase">Academic</div>
            <div className="text-cream-200 font-mono text-lg mt-0.5">
              Week {academicWeek}
            </div>
          </div>
          <div className="bg-cream-200/4 rounded-lg p-3 text-center">
            <div className="text-cream-200/30 text-[10px] uppercase">Done</div>
            <div className="text-accent-sage font-mono text-lg mt-0.5">
              {courseProgress?.weeks_done?.length ?? 0}/{Math.min(academicWeek, 12)}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Week grid */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h2 className="font-display text-base text-cream-200 mb-3 flex items-center gap-2">
          <FileText size={16} className="text-cream-200/40" />
          Weeks
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {weekData.map((week, i) => (
            <motion.div
              key={week.week}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 + i * 0.025 }}
              className={clsx(
                "card p-4 transition-all duration-200",
                !week.isUnlocked && "opacity-40",
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className={clsx(
                      "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold font-mono",
                      week.isDone
                        ? "bg-accent-sage/15 text-accent-sage"
                        : week.isUnlocked
                          ? "bg-cream-200/10 text-cream-200/70"
                          : "bg-cream-200/5 text-cream-200/30",
                    )}
                  >
                    {week.week}
                  </div>
                  <div>
                    <span className="text-cream-200/70 text-sm font-medium">
                      Week {week.week}
                    </span>
                    <div className="flex items-center gap-2 text-[10px] text-cream-200/35">
                      <span>{week.questionCount} question{week.questionCount !== 1 ? "s" : ""}</span>
                      {week.pdfCount > 0 && (
                        <>
                          <span>·</span>
                          <span>{week.pdfCount} PDF{week.pdfCount !== 1 ? "s" : ""}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {week.isDone && (
                  <CheckCircle size={16} className="text-accent-sage/60 shrink-0" />
                )}
              </div>

              <div className="flex items-center gap-2">
                {week.isUnlocked ? (
                  <>
                    <button
                      onClick={() =>
                        navigate(
                          `/courses/${courseId}/weeks/${week.week}/learn`,
                        )
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-sky/10 hover:bg-accent-sky/20 text-accent-sky/70 hover:text-accent-sky text-xs transition-colors"
                    >
                      <GraduationCap size={12} />
                      Teach Me
                    </button>
                    {week.questionCount > 0 && (
                      <button
                        onClick={() => {
                          toast.success(
                            `Practice for Week ${week.week} coming soon!`,
                          );
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cream-200/8 hover:bg-cream-200/12 text-cream-200/50 hover:text-cream-200/70 text-xs transition-colors"
                      >
                        <HelpCircle size={12} />
                        Practice
                      </button>
                    )}
                  </>
                ) : (
                  <span className="text-cream-200/25 text-xs flex items-center gap-1">
                    <Clock size={10} />
                    Locked — complete week {week.week - 1} first
                  </span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
