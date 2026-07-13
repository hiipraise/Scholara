// src/components/PendingSyncIndicator.tsx
import { motion, AnimatePresence } from "framer-motion";
import { Upload, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import { useAnswerSync } from "../hooks/useAnswerSync";

export default function PendingSyncIndicator() {
  const { syncState, syncNow } = useAnswerSync();
  const { pendingCount, syncing, lastSyncError } = syncState;

  if (pendingCount === 0 && !syncing) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed bottom-20 right-4 z-40"
      >
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-xl shadow-lg border text-xs font-medium ${
            lastSyncError
              ? "bg-accent-coral/10 border-accent-coral/20 text-accent-coral"
              : syncing
                ? "bg-accent-sky/10 border-accent-sky/20 text-accent-sky"
                : "bg-accent-gold/10 border-accent-gold/20 text-accent-gold"
          }`}
        >
          {syncing ? (
            <Loader2 size={12} className="animate-spin" />
          ) : lastSyncError ? (
            <AlertTriangle size={12} />
          ) : (
            <Upload size={12} />
          )}
          <span>
            {syncing
              ? "Syncing..."
              : lastSyncError
                ? "Sync error"
                : `${pendingCount} answer${pendingCount !== 1 ? "s" : ""} pending sync`}
          </span>
          {!syncing && pendingCount > 0 && (
            <button
              onClick={syncNow}
              className="ml-1 px-2 py-0.5 rounded-lg bg-current/10 hover:bg-current/20 transition-colors"
            >
              Sync now
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
