import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BookOpen,
  Lightbulb,
  AlertTriangle,
  RefreshCw,
  Send,
  GraduationCap,
  ListChecks,
  ExternalLink,
  Loader2,
  BookMarked,
  WifiOff,
} from "lucide-react";
import { lessonApi, coursesApi } from "../api/index";
import { useAuthStore } from "../store/authStore";
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { getStoredLesson } from "../lib/contentDb";
import OfflineBadge from "../components/OfflineBadge";
import type { Lesson, LessonSection, ChatMessage, FormulaCard } from "../types";
import toast from "react-hot-toast";

export default function LessonPage() {
  const { courseId, week } = useParams<{
    courseId: string;
    week: string;
  }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { isOnline } = useNetworkStatus();
  const weekNumber = parseInt(week || "1", 10);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<number>>(
    new Set([0]),
  );
  const [offlineLesson, setOfflineLesson] = useState<Lesson | null>(null);
  const [offlineLoading, setOfflineLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Fetch course for breadcrumb
  const { data: courses } = useQuery({
    queryKey: ["courses", user?.level, user?.semester],
    queryFn: () => coursesApi.list(user?.level, user?.semester).then((r) => r.data),
  });
  const course = Array.isArray(courses)
    ? courses.find((c) => c.id === courseId)
    : null;

  // Fetch lesson (online)
  const {
    data: lesson,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["lesson", courseId, weekNumber],
    queryFn: () => lessonApi.get(courseId!, weekNumber).then((r) => r.data),
    enabled: !!courseId && isOnline,
    retry: 1,
    staleTime: 1000 * 60 * 5,
  });

  // Offline fallback: read from IndexedDB
  useEffect(() => {
    if (isOnline || !courseId) return;
    setOfflineLoading(true);
    getStoredLesson(courseId, weekNumber).then((stored) => {
      if (stored) setOfflineLesson(stored);
      setOfflineLoading(false);
    });
  }, [isOnline, courseId, weekNumber]);

  // Chat mutation
  const chatMutation = useMutation({
    mutationFn: (msg: string) =>
      lessonApi.chat(courseId!, weekNumber, msg, chatMessages),
    onSuccess: ({ data }) => {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply },
      ]);
    },
    onError: () => {
      toast.error("Chat failed. Please try again.");
    },
  });

  // Regenerate mutation (admin only)
  const regenerateMutation = useMutation({
    mutationFn: () => lessonApi.regenerate(courseId!, weekNumber),
    onSuccess: () => {
      toast.success("Lesson regenerated!");
      refetch();
    },
    onError: () => {
      toast.error("Failed to regenerate lesson.");
    },
  });

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  function handleSend() {
    const msg = chatInput.trim();
    if (!msg) return;
    setChatMessages((prev) => [...prev, { role: "user", content: msg }]);
    setChatInput("");
    chatMutation.mutate(msg);
  }

  function toggleSection(i: number) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  // Loading state (offline fallback check first)
  if (isLoading || offlineLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center max-w-md"
        >
          <div className="relative w-16 h-16 mx-auto mb-4">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
              className="absolute inset-0"
            >
              <BookMarked size={64} className="text-accent-sky/30" />
            </motion.div>
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <GraduationCap size={28} className="text-accent-sky/60" />
            </motion.div>
          </div>
          <h2 className="font-display text-lg text-cream-200 mb-2">
            {!isOnline ? "Loading offline lesson..." : "Building your lesson..."}
          </h2>
          <p className="text-cream-200/45 text-sm">
            {!isOnline ? (
              "Looking for a cached copy of this lesson in your offline storage."
            ) : (
              <>
                Nexus Core is reading the lecture material, researching
                supplementary references, and crafting a structured lesson for{" "}
                <strong className="text-cream-200/70">
                  {course?.code || `Week ${weekNumber}`}
                </strong>
                . This usually takes a few seconds.
              </>
            )}
          </p>
          <motion.div
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="mt-6 h-1 w-32 mx-auto bg-accent-sky/30 rounded-full"
          />
        </motion.div>
      </div>
    );
  }

  // Error state — try offline fallback
  if (error && !offlineLesson) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-sm">
          <AlertTriangle size={40} className="text-accent-coral/60 mx-auto mb-3" />
          <h2 className="font-display text-lg text-cream-200 mb-2">
            Lesson unavailable
          </h2>
          <p className="text-cream-200/45 text-sm mb-4">
            {!isOnline
              ? "You appear to be offline and this lesson hasn't been downloaded for offline access. Connect to the internet or download this course for offline use."
              : (error as any)?.response?.data?.detail ||
                "Could not load this lesson. The lecture content may not be processed yet."}
          </p>
          <div className="flex justify-center gap-2">
            <button
              onClick={() => navigate(-1)}
              className="btn-ghost text-sm"
            >
              Go Back
            </button>
            <button
              onClick={() => refetch()}
              className="btn-primary text-sm"
              disabled={isFetching}
            >
              {isFetching ? "Retrying..." : "Retry"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Determine which lesson to display (online or offline fallback)
  const displayLesson = lesson || offlineLesson;
  if (!displayLesson) return null;
  const isOfflineView = !!offlineLesson;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between gap-4"
      >
        <div>
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-cream-200/40 hover:text-cream-200/70 text-xs mb-2 transition-colors"
          >
            <ArrowLeft size={14} />
            Back
          </button>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-xl sm:text-2xl font-bold text-cream-200">
              Teach Me — Week {displayLesson.week_number}
            </h1>
            {isOfflineView && <OfflineBadge size="sm" />}
          </div>
          <p className="text-cream-200/45 text-sm mt-1">
            {displayLesson.course_code} — {displayLesson.course_title}
          </p>
        </div>
        {!isOfflineView && (user?.role === "admin" || user?.role === "superadmin") ? (
          <button
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending}
            className="btn-ghost text-xs flex items-center gap-1.5"
          >
            <RefreshCw
              size={13}
              className={regenerateMutation.isPending ? "animate-spin" : ""}
            />
            {regenerateMutation.isPending ? "Regenerating..." : "Regenerate"}
          </button>
        ) : null}
      </motion.div>

      {/* Overview */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="card p-5"
      >
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-accent-sky/15 p-2.5 shrink-0">
            <BookOpen size={18} className="text-accent-sky" />
          </div>
          <div>
            <h2 className="font-display text-base text-cream-200 mb-1">
              Overview
            </h2>
            <p className="text-cream-200/65 text-sm leading-relaxed">
              {displayLesson.overview}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Sections */}
      <div className="space-y-3">
        {(displayLesson.sections || []).map((section: LessonSection, i: number) => {
          const isOpen = expandedSections.has(i);
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.03 }}
              className="card overflow-hidden"
            >
              <button
                onClick={() => toggleSection(i)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-cream-200/3 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-accent-sky/15 text-accent-sky flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </div>
                  <span className="text-cream-200/85 text-sm font-semibold">
                    {section.title}
                  </span>
                </div>
                <motion.svg
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-cream-200/40"
                >
                  <path d="M6 9l6 6 6-6" />
                </motion.svg>
              </button>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-cream-200/8"
                >
                  <div className="p-4 space-y-4">
                    <p className="text-cream-200/70 text-sm leading-relaxed">
                      {section.explanation}
                    </p>

                    {section.examples?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-accent-sky/70 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <Lightbulb size={12} />
                          Examples
                        </h4>
                        <ul className="space-y-2">
                          {(section.examples || []).map((ex: string, j: number) => (
                            <li
                              key={j}
                              className="text-cream-200/55 text-sm bg-cream-200/3 rounded-lg p-3 border border-cream-200/8"
                            >
                              {ex}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {section.common_mistakes?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-accent-coral/70 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <AlertTriangle size={12} />
                          Common Mistakes
                        </h4>
                        <ul className="space-y-1.5">
                          {(section.common_mistakes || []).map((m: string, j: number) => (
                            <li
                              key={j}
                              className="text-cream-200/55 text-sm flex items-start gap-2"
                            >
                              <span className="text-accent-coral/50 mt-0.5">•</span>
                              {m}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Formula Cards */}
      {displayLesson.formula_cards?.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-3"
        >
          <h3 className="font-display text-base text-cream-200 flex items-center gap-2">
            <BookMarked size={16} className="text-accent-gold/60" />
            Formula Cards
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(displayLesson.formula_cards || []).map((fc: FormulaCard, i: number) => (
              <FormulaCardView key={i} card={fc} />
            ))}
          </div>
        </motion.div>
      )}

      {/* Key Takeaways */}
      {displayLesson.key_takeaways?.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="card p-5"
        >
          <h3 className="font-display text-base text-cream-200 mb-3 flex items-center gap-2">
            <ListChecks size={16} className="text-accent-sage/60" />
            Key Takeaways
          </h3>
          <ul className="space-y-2">
            {(displayLesson.key_takeaways || []).map((takeaway: string, i: number) => (
              <li
                key={i}
                className="flex items-start gap-2.5 text-cream-200/65 text-sm"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-accent-sage/50 mt-1.5 shrink-0" />
                {takeaway}
              </li>
            ))}
          </ul>
        </motion.div>
      )}

      {/* Further Reading */}
      {displayLesson.further_reading?.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="card p-5"
        >
          <h3 className="font-display text-base text-cream-200 mb-3 flex items-center gap-2">
            <ExternalLink size={16} className="text-accent-sky/60" />
            Further Reading
          </h3>
          <div className="space-y-2">
            {displayLesson.further_reading.map((fr, i) => (
              <a
                key={i}
                href={fr.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-3 rounded-lg bg-cream-200/3 border border-cream-200/8 hover:bg-cream-200/6 hover:border-cream-200/15 transition-colors group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-cream-200/70 text-sm font-medium group-hover:text-accent-sky transition-colors">
                      {fr.title}
                    </span>
                    {fr.note && (
                      <p className="text-cream-200/40 text-xs mt-0.5">
                        {fr.note}
                      </p>
                    )}
                  </div>
                  <ExternalLink
                    size={12}
                    className="text-cream-200/30 mt-1 shrink-0"
                  />
                </div>
              </a>
            ))}
          </div>
        </motion.div>
      )}

      {/* Chat Panel */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="card p-4 border-2 border-accent-sky/15"
      >
        <h3 className="font-display text-sm text-cream-200 mb-3 flex items-center gap-2">
          <GraduationCap size={15} className="text-accent-sky/60" />
          Ask me anything about this lesson
        </h3>

        <div className="h-64 overflow-y-auto mb-3 space-y-3 pr-1 custom-scrollbar">
          {chatMessages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="text-cream-200/30 text-xs text-center">
                Ask a question about this week's material — concepts,
                examples, or clarification.
              </p>
            </div>
          )}
          {chatMessages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm ${
                  msg.role === "user"
                    ? "bg-accent-sky/15 text-cream-200/85"
                    : "bg-cream-200/5 text-cream-200/70 border border-cream-200/10"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {chatMutation.isPending && (
            <div className="flex justify-start">
              <div className="bg-cream-200/5 border border-cream-200/10 rounded-xl px-3.5 py-2.5">
                <motion.div
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ repeat: Infinity, duration: 1.2 }}
                  className="flex items-center gap-1"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-cream-200/40" />
                  <span className="w-1.5 h-1.5 rounded-full bg-cream-200/40" />
                  <span className="w-1.5 h-1.5 rounded-full bg-cream-200/40" />
                </motion.div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type your question..."
            className="input-field flex-1 text-sm"
            disabled={chatMutation.isPending}
          />
          <button
            onClick={handleSend}
            disabled={!chatInput.trim() || chatMutation.isPending}
            className="btn-primary text-sm p-2.5"
          >
            <Send size={15} />
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Formula Card Component ────────────────────────────────────────────────

function FormulaCardView({ card }: { card: FormulaCard }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-cream-200/3 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-accent-gold font-mono text-sm">
            {card.formula_name}
          </span>
        </div>
        <motion.svg
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-cream-200/40"
        >
          <path d="M6 9l6 6 6-6" />
        </motion.svg>
      </button>
      {isOpen && (
        <div className="border-t border-cream-200/8 p-3 space-y-2">
          <div className="bg-cream-200/5 rounded-lg p-2.5 font-mono text-sm text-accent-gold/80 text-center">
            {card.expression}
          </div>
          {card.variables?.length > 0 && (
            <p className="text-cream-200/45 text-xs">
              <strong className="text-cream-200/60">Variables:</strong>{" "}
              {card.variables.join(", ")}
            </p>
          )}
          {card.conditions && (
            <p className="text-cream-200/45 text-xs">
              <strong className="text-cream-200/60">Conditions:</strong>{" "}
              {card.conditions}
            </p>
          )}
          {card.common_mistakes?.length > 0 && (
            <div>
              <p className="text-cream-200/45 text-xs mb-1">
                <strong className="text-accent-coral/60">Common mistakes:</strong>
              </p>
              <ul className="text-cream-200/40 text-xs space-y-0.5 list-disc list-inside">
                {card.common_mistakes.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          {card.worked_example && (
            <div>
              <p className="text-cream-200/45 text-xs mb-1">
                <strong className="text-accent-sky/60">Worked example:</strong>
              </p>
              <p className="text-cream-200/50 text-xs bg-accent-sky/5 rounded-lg p-2">
                {card.worked_example}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
