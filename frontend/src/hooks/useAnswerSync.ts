// src/hooks/useAnswerSync.ts
import { useState, useEffect, useCallback, useRef } from "react";
import { feedApi } from "../api";
import {
  getPendingAnswers,
  getFailedAnswers,
  markSyncing,
  markFailed,
  removeAnswer,
  getQueueCount,
} from "../lib/queueDb";

interface SyncState {
  pendingCount: number;
  syncing: boolean;
  lastSyncError: string | null;
}

/**
 * Hook that syncs queued answers on reconnect.
 * Uses the browser `online` event as the primary mechanism
 * (works in all browsers including Safari).
 *
 * ── Background Sync API (intentionally deferred) ──
 * Workbox's Background Sync plugin would make sync more robust on
 * Chrome/Android by retrying in the background even if the user closes
 * the tab. It was not integrated because:
 * 1. The `online` event listener is a complete fallback on its own.
 * 2. Background Sync requires configuring a Workbox route plugin in
 *    vite-plugin-pwa's workbox config, which adds build complexity.
 * 3. The app's primary use case (students on mobile networks) aligns
 *    with the `online` event approach — students typically keep the
 *    app open while answers are queued.
 * To add it later: configure a Workbox route for POST /feed/answer in
 * vite.config.ts workbox.runtimeCaching with a BackgroundSyncPlugin.
 */
export function useAnswerSync() {
  const [syncState, setSyncState] = useState<SyncState>({
    pendingCount: 0,
    syncing: false,
    lastSyncError: null,
  });
  const syncingRef = useRef(false);

  // Update pending count
  const refreshCount = useCallback(async () => {
    const count = await getQueueCount();
    setSyncState((prev) => ({ ...prev, pendingCount: count }));
  }, []);

  // Sync all pending + failed answers
  const syncNow = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncState((prev) => ({ ...prev, syncing: true, lastSyncError: null }));

    try {
      // Get all answers that need syncing (pending + failed, ordered by createdAt)
      const pending = await getPendingAnswers();
      const failed = await getFailedAnswers();
      const all = [...pending, ...failed].sort(
        (a, b) => a.createdAt - b.createdAt,
      );

      for (const entry of all) {
        try {
          await markSyncing(entry.id);
          await feedApi.submitAnswer(entry.questionId, entry.selectedAnswer);
          await removeAnswer(entry.id);
        } catch (err: any) {
          // Only mark as failed for network/server errors, not validation errors
          const status = err?.response?.status;
          if (status && status >= 400 && status < 500 && status !== 429) {
            // Client error (validation, etc.) — remove from queue, it won't succeed
            await removeAnswer(entry.id);
          } else {
            // Network error or server error — retry later
            await markFailed(
              entry.id,
              err?.message || "Sync failed",
            );
          }
        }
      }

      await refreshCount();
      setSyncState((prev) => ({ ...prev, syncing: false }));
    } catch (err: any) {
      setSyncState((prev) => ({
        ...prev,
        syncing: false,
        lastSyncError: err?.message || "Sync failed",
      }));
    } finally {
      syncingRef.current = false;
    }
  }, [refreshCount]);

  // Refresh count on mount
  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  // Listen for online event
  useEffect(() => {
    const handler = () => {
      syncNow();
    };
    window.addEventListener("online", handler);

    // Also sync on mount if online (catches page load with pending queue)
    if (navigator.onLine) {
      syncNow();
    }

    return () => window.removeEventListener("online", handler);
  }, [syncNow]);

  return { syncState, syncNow, refreshCount };
}
