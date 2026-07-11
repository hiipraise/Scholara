import { motion, AnimatePresence } from "framer-motion";

interface FeedCompleteModalProps {
  open: boolean;
  mode: "complete" | "flagged";
  total: number;
  correctCount: number;
  accuracyPct: number;
  hiddenCount: number;
  onClose: () => void;
  onShowFlagged: () => void;
  onLoadFresh: () => void;
  loading?: boolean;
}

export default function FeedCompleteModal({
  open,
  mode,
  total,
  correctCount,
  accuracyPct,
  hiddenCount,
  onClose,
  onShowFlagged,
  onLoadFresh,
  loading,
}: FeedCompleteModalProps) {
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
                Daily Feed Complete
              </h3>
              <p className="text-cream-200/55 text-sm mb-4">
                {mode === "complete"
                  ? "You've completed this 60-question batch. Great work — load a fresh set now or switch to focused practice."
                  : "You have no active questions left in view because some were flagged. You can show flagged questions again to continue this session."}
              </p>
              <div className="grid grid-cols-3 gap-2 mb-5">
                <div className="bg-cream-200/5 rounded-lg p-3 text-center">
                  <div className="text-cream-200/35 text-[10px] uppercase">
                    Total
                  </div>
                  <div className="text-cream-200 font-mono text-lg">
                    {total}
                  </div>
                </div>
                <div className="bg-cream-200/5 rounded-lg p-3 text-center">
                  <div className="text-cream-200/35 text-[10px] uppercase">
                    Correct
                  </div>
                  <div className="text-accent-sage font-mono text-lg">
                    {correctCount}
                  </div>
                </div>
                <div className="bg-cream-200/5 rounded-lg p-3 text-center">
                  <div className="text-cream-200/35 text-[10px] uppercase">
                    {mode === "complete" ? "Accuracy" : "Flagged"}
                  </div>
                  <div className="text-cream-200 font-mono text-lg">
                    {mode === "complete" ? `${accuracyPct}%` : hiddenCount}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button className="btn-ghost text-sm" onClick={onClose}>
                  Close
                </button>
                <button
                  className="btn-primary text-sm"
                  onClick={() => {
                    if (mode === "flagged") {
                      onShowFlagged();
                    } else {
                      onLoadFresh();
                    }
                  }}
                  disabled={loading}
                >
                  {mode === "complete"
                    ? loading
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
  );
}
