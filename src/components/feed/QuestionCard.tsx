import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, ChevronDown, ChevronUp, BookOpen } from 'lucide-react';
import clsx from 'clsx';
import type { Question, AnswerResult } from '../../types';
import { feedApi } from '../../api/index';
import toast from 'react-hot-toast';

interface Props {
  question: Question;
  courseCode: string;
  courseColor: string;
  index: number;
  onAnswered?: (result: AnswerResult) => void;
}

const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;

const DIFFICULTY_STYLES: Record<string, string> = {
  easy:   'bg-accent-sage/15 text-accent-sage border-accent-sage/20',
  medium: 'bg-accent-gold/15 text-accent-gold border-accent-gold/20',
  hard:   'bg-accent-coral/15 text-accent-coral border-accent-coral/20',
};

export default function QuestionCard({ question, courseCode, courseColor, index, onAnswered }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [loading, setLoading] = useState(false);

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
        toast.success('Correct answer!', { duration: 1500 });
      } else {
        toast.error('Incorrect', { duration: 1500 });
      }
    } catch {
      toast.error('Failed to submit answer');
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }

  const explanation = result?.explanation || question.explanation;
  const isCorrect = result?.is_correct ?? (
    isAnswered && selected === correctAnswer
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
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
          <span className="text-cream-200/30 text-xs">Week {question.week_number}</span>
          {question.topic && (
            <span className="text-cream-200/30 text-xs hidden sm:inline">· {question.topic}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={clsx('badge text-[10px] border', DIFFICULTY_STYLES[question.difficulty] || DIFFICULTY_STYLES.medium)}>
            {question.difficulty}
          </span>
          {isAnswered && (
            <div className={clsx('w-5 h-5 rounded-full flex items-center justify-center',
              isCorrect ? 'bg-accent-sage/20' : 'bg-accent-coral/20'
            )}>
              {isCorrect
                ? <CheckCircle size={13} className="text-accent-sage" />
                : <XCircle size={13} className="text-accent-coral" />
              }
            </div>
          )}
        </div>
      </div>

      {/* Question */}
      <p className="text-cream-200/90 text-sm sm:text-base font-body leading-relaxed mb-4">
        {question.question_text}
      </p>

      {/* Options */}
      {question.options && (
        <div className="space-y-2">
          {OPTION_KEYS.filter(k => question.options?.[k]).map((key) => {
            const optionText = question.options![key];
            const isSelected = selected === key || (isAnswered && question.correct_answer === key && !result);
            const isCorrectOpt = isAnswered && key === correctAnswer;
            const isWrongSelected = isAnswered && key === selected && !isCorrectOpt;

            return (
              <motion.button
                key={key}
                onClick={() => handleSelect(key)}
                disabled={isAnswered || loading}
                whileHover={!isAnswered ? { x: 3 } : {}}
                whileTap={!isAnswered ? { scale: 0.99 } : {}}
                className={clsx(
                  'w-full flex items-start gap-3 px-4 py-3 rounded-xl text-left text-sm transition-all duration-200 border',
                  isCorrectOpt
                    ? 'bg-accent-sage/12 border-accent-sage/30 text-cream-200'
                    : isWrongSelected
                    ? 'bg-accent-coral/10 border-accent-coral/25 text-cream-200/70'
                    : isAnswered
                    ? 'bg-cream-200/3 border-cream-200/8 text-cream-200/40 cursor-default'
                    : selected === key
                    ? 'bg-cream-200/10 border-cream-200/25 text-cream-200'
                    : 'bg-cream-200/4 border-cream-200/10 text-cream-200/70 hover:bg-cream-200/8 hover:border-cream-200/20 hover:text-cream-200/90'
                )}
              >
                <span className={clsx(
                  'shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-xs font-semibold mt-0.5',
                  isCorrectOpt
                    ? 'bg-accent-sage/25 text-accent-sage'
                    : isWrongSelected
                    ? 'bg-accent-coral/20 text-accent-coral'
                    : 'bg-cream-200/8 text-cream-200/50'
                )}>
                  {key}
                </span>
                <span className="leading-snug">{optionText}</span>
                {isCorrectOpt && <CheckCircle size={14} className="text-accent-sage ml-auto shrink-0 mt-0.5" />}
                {isWrongSelected && <XCircle size={14} className="text-accent-coral ml-auto shrink-0 mt-0.5" />}
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
            animate={{ opacity: 1, height: 'auto' }}
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
                {showExplanation ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              <AnimatePresence>
                {showExplanation && (
                  <motion.p
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
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
