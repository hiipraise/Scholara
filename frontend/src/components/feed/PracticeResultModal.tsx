import { motion, AnimatePresence } from "framer-motion";

interface PracticeResultModalProps {
  open: boolean;
  customTotal: number;
  customCorrect: number;
  onClose: () => void;
  onBackToFeed: () => void;
}

export default function PracticeResultModal({
  open,
  customTotal,
  customCorrect,
  onClose,
  onBackToFeed,
}: PracticeResultModalProps) {
  return (
    <AnimatePresence>
      {open && (
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
                <button className="btn-ghost text-sm" onClick={onClose}>
                  Review Questions
                </button>
                <button className="btn-primary text-sm" onClick={onBackToFeed}>
                  Back to Home Feed
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
