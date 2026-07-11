import { useEffect } from "react";
import toast from "react-hot-toast";

export const PRACTICE_SESSION_KEY_PREFIX = "scholara.practice.session";

function sessionStoreGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function sessionStoreSet(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Storage full or unavailable — silently skip.
  }
}

function sessionStoreRemove(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Best-effort.
  }
}

interface UseSessionBackupOptions {
  userId: string | undefined;
  customFeed: any | null;
  practiceResults: Record<string, boolean>;
  setCustomFeed: (feed: any) => void;
  setPracticeResults: (results: Record<string, boolean>) => void;
}

/**
 * Persists focused-practice session to sessionStorage so it survives
 * accidental tab closure or refresh. Restores on mount if present.
 */
export function useSessionBackup({
  userId,
  customFeed,
  practiceResults,
  setCustomFeed,
  setPracticeResults,
}: UseSessionBackupOptions) {
  const sessionKey = userId
    ? `${PRACTICE_SESSION_KEY_PREFIX}.${userId}`
    : null;

  // Restore session on mount
  useEffect(() => {
    if (!sessionKey) return;
    const raw = sessionStoreGet(sessionKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        customFeed?: any;
        practiceResults?: Record<string, boolean>;
      };
      if (parsed?.customFeed?.questions?.length) {
        setCustomFeed(parsed.customFeed);
        setPracticeResults(parsed.practiceResults || {});
        toast.success("Resumed focused practice session");
      }
    } catch {
      sessionStoreRemove(sessionKey);
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  // Persist on change
  useEffect(() => {
    if (!sessionKey) return;
    if (!customFeed) {
      sessionStoreRemove(sessionKey);
      return;
    }
    sessionStoreSet(
      sessionKey,
      JSON.stringify({ customFeed, practiceResults }),
    );
  }, [sessionKey, customFeed, practiceResults]);
}
