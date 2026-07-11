import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Flag,
  MessageSquareText,
  RotateCcw,
} from "lucide-react";
import clsx from "clsx";
import type { Question, AnswerResult } from "../../types";
import { feedApi, questionsApi } from "../../api/index";
import toast from "react-hot-toast";

interface Props {
  question: Question;
  courseCode: string;
  courseColor: string;
  index: number;
  onAnswered?: (result: AnswerResult) => void;
  onFlagged?: (questionId: string) => void;
}

const OPTION_KEYS = ["A", "B", "C", "D"] as const;

const DIFFICULTY_STYLES: Record<string, string> = {
  easy: "bg-accent-sage/15 text-accent-sage border-accent-sage/20",
  medium: "bg-accent-gold/15 text-accent-gold border-accent-gold/20",
  hard: "bg-accent-coral/15 text-accent-coral border-accent-coral/20",
};

export default function QuestionCard({
  question,
  courseCode,
  courseColor,
  index,
  onAnswered,
  onFlagged,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [unflagging, setUnflagging] = useState(false);
  const [isFlagged, setIsFlagged] = useState(false);
  const [showFlagConfirm, setShowFlagConfirm] = useState(false);
  const [flagReason, setFlagReason] = useState("");

  const isAnswered = question.is_completed || !!result;
  const correctAnswer = result?.correct_answer || question.correct_answer;

  async function handleSelect(key: string) {
    if (isAnswered || loading) return;
    setSelected(key);
    setLoading(true);
    try {
      const res = await feedApi.submitAnswer(question.id, key);
      setResult(res.data);
      onAnswered?.(res.data);
      if (res.data.is_correct) {
        toast.success("Correct answer!", { duration: 1500 });
      } else {
        toast.error("Incorrect", { duration: 1500 });
      }
    } catch {
      toast.error("Failed to submit answer");
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleFlagQuestion(reason?: string) {
    if (flagging || isFlagged) return;
    setFlagging(true);
    try {
      await questionsApi.flag(question.id, reason || undefined);
      setIsFlagged(true);
      toast.success("Question flagged for admin review", { duration: 1200 });
      onFlagged?.(question.id);
    } catch {
      toast.error("Could not flag question");
    } finally {
      setFlagging(false);
    }
  }

  async function handleUnflagQuestion() {
    if (unflagging || !isFlagged) return;
    setUnflagging(true);
    try {
      await questionsApi.unflag(question.id);
      setIsFlagged(false);
      toast.success("Flag removed", { duration: 1200 });
    } catch {
      toast.error("Could not remove flag");
    } finally {
      setUnflagging(false);
    }
  }

  function openFlagConfirm() {
    setFlagReason("");
    setShowFlagConfirm(true);
  }

  function confirmFlag() {
    setShowFlagConfirm(false);
    handleFlagQuestion(flagReason || undefined);
  }

  const explanation = result?.explanation || question.explanation;
  const isCorrect =
    result?.is_correct ?? (isAnswered && selected === correctAnswer);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: index * 0.02,
        duration: 0.4,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="card p-5 hover:shadow-card-hover transition-shadow duration-300"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="badge text-[10px] font-semibold uppercase tracking-wider border"
            style={{
              background: `${courseColor}18`,
              color: courseColor,
              borderColor: `${courseColor}30`,
            }}
          >
            {courseCode}
          </span>
          <span className="text-cream-200/30 text-xs">
            Week {question.week_number}
          </span>
          {question.topic && (
            <span className="text-cream-200/30 text-xs hidden sm:inline">
              · {question.topic}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              if (isFlagged) handleUnflagQuestion();
              else openFlagConfirm();
            }}
            disabled={flagging || unflagging}
            className={clsx(
              "w-7 h-7 rounded-lg border flex items-center justify-center gap-1 transition-colors",
              isFlagged
                ? "bg-accent-coral/15 border-accent-coral/25 text-accent-coral/70 hover:bg-accent-coral/25 hover:border-accent-coral/40"
                : "bg-cream-200/4 border-cream-200/10 text-cream-200/40 hover:text-accent-coral hover:border-accent-coral/30",
            )}
            title={isFlagged ? "Remove flag" : "Flag this question"}
            aria-label={isFlagged ? "Remove flag" : "Flag this question"}
          >
            {unflagging ? (
              <RotateCcw size={13} className="animate-spin" />
            ) : (
              <Flag size={13} />
            )}
          </button>
          <span
            className={clsx(
              "badge text-[10px] border",
              DIFFICULTY_STYLES[question.difficulty] ||
                DIFFICULTY_STYLES.medium,
            )}
          >
            {question.difficulty}
          </span>
          {isAnswered && (
            <div
              className={clsx(
                "w-5 h-5 rounded-full flex items-center justify-center",
                isCorrect ? "bg-accent-sage/20" : "bg-accent-coral/20",
              )}
            >
              {isCorrect ? (
                <CheckCircle size={13} className="text-accent-sage" />
              ) : (
                <XCircle size={13} className="text-accent-coral" />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Flag confirmation dialog */}
      <AnimatePresence>
        {showFlagConfirm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-40"
              onClick={() => setShowFlagConfirm(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="w-full max-w-md card p-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-accent-coral/15 p-2.5 shrink-0">
                    <AlertTriangle size={20} className="text-accent-coral" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-display text-lg text-cream-200">
                      Flag this question?
                    </h4>
                    <p className="text-cream-200/55 text-sm mt-2">
                      This question will be reviewed by an administrator.
                      You can optionally provide a reason to help with the
                      review.
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <MessageSquareText size={13} className="text-cream-200/35" />
                    <span className="text-cream-200/30 text-[11px] uppercase tracking-wider">
                      Reason (optional)
                    </span>
                  </div>
                  <textarea
                    value={flagReason}
                    onChange={(e) => setFlagReason(e.target.value)}
                    placeholder="e.g. Incorrect answer, unclear wording, duplicate..."
                    rows={2}
                    className="input-field text-xs resize-none"
                    autoFocus
                  />
                </div>

                <div className="flex justify-end gap-2 mt-5">
                  <button
                    className="btn-ghost text-sm"
                    onClick={() => setShowFlagConfirm(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-primary text-sm flex items-center gap-2"
                    onClick={confirmFlag}
                    disabled={flagging}
                  >
                    <Flag size={13} />
                    {flagging ? "Flagging..." : "Flag Question"}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Question */}
      <p className="text-cream-200/90 text-sm sm:text-base font-body leading-relaxed mb-4">
        {question.question_text}
      </p>

      {/* Options */}
      {question.options && (
        <div className="space-y-2">
          {OPTION_KEYS.filter((k) => question.options?.[k]).map((key) => {
            const optionText = question.options![key];
            const isSelected =
              selected === key ||
              (isAnswered && question.correct_answer === key && !result);
            const isCorrectOpt = isAnswered && key === correctAnswer;
            const isWrongSelected =
              isAnswered && key === selected && !isCorrectOpt;

            return (
              <motion.button
                key={key}
                onClick={() => handleSelect(key)}
                disabled={isAnswered || loading}
                whileHover={!isAnswered ? { x: 3 } : {}}
                whileTap={!isAnswered ? { scale: 0.99 } : {}}
                className={clsx(
                  "w-full flex items-start gap-3 px-4 py-3 rounded-xl text-left text-sm transition-all duration-200 border",
                  isCorrectOpt
                    ? "bg-accent-sage/12 border-accent-sage/30 text-cream-200"
                    : isWrongSelected
                      ? "bg-accent-coral/10 border-accent-coral/25 text-cream-200/70"
                      : isAnswered
                        ? "bg-cream-200/3 border-cream-200/8 text-cream-200/40 cursor-default"
                        : selected === key
                          ? "bg-cream-200/10 border-cream-200/25 text-cream-200"
                          : "bg-cream-200/4 border-cream-200/10 text-cream-200/70 hover:bg-cream-200/8 hover:border-cream-200/20 hover:text-cream-200/90",
                )}
              >
                <span
                  className={clsx(
                    "shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-xs font-semibold mt-0.5",
                    isCorrectOpt
                      ? "bg-accent-sage/25 text-accent-sage"
                      : isWrongSelected
                        ? "bg-accent-coral/20 text-accent-coral"
                        : "bg-cream-200/8 text-cream-200/50",
                  )}
                >
                  {key}
                </span>
                <span className="leading-snug">{optionText}</span>
                {isCorrectOpt && (
                  <CheckCircle
                    size={14}
                    className="text-accent-sage ml-auto shrink-0 mt-0.5"
                  />
                )}
                {isWrongSelected && (
                  <XCircle
                    size={14}
                    className="text-accent-coral ml-auto shrink-0 mt-0.5"
                  />
                )}
              </motion.button>
            );
          })}
        </div>
      )}

      {/* Explanation */}
      <AnimatePresence>
        {isAnswered && explanation && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-cream-200/8">
              <button
                onClick={() => setShowExplanation(!showExplanation)}
                className="flex items-center gap-2 text-cream-200/40 hover:text-cream-200/70 text-xs font-medium transition-colors"
              >
                <BookOpen size={13} />
                Explanation
                {showExplanation ? (
                  <ChevronUp size={13} />
                ) : (
                  <ChevronDown size={13} />
                )}
              </button>
              <AnimatePresence>
                {showExplanation && (
                  <motion.p
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: "auto", marginTop: 8 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    className="text-cream-200/55 text-sm leading-relaxed overflow-hidden"
                  >
                    {explanation}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
