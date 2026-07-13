// src/lib/deferredPrompt.ts
/**
 * Module-level deferred install prompt.
 * The `beforeinstallprompt` event fires on page load, but InstallPrompt
 * only mounts after authentication (it's inside Layout > ProtectedRoute).
 * This module captures the event early so InstallPrompt can read it later.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let _deferredPrompt: BeforeInstallPromptEvent | null = null;
let _listeners: Array<(e: BeforeInstallPromptEvent) => void> = [];

/**
 * Register the beforeinstallprompt listener once at the app level.
 * Call this in App.tsx on mount so it fires before any auth-gated components.
 */
export function initDeferredPrompt() {
  window.addEventListener("beforeinstallprompt", (e: Event) => {
    // Note: intentionally NOT calling e.preventDefault() so Chrome's native
    // install banner is not suppressed. If we suppress it, we must call
    // prompt() on the deferred event or the user never sees a banner.
    // We capture the event here so our themed InstallPrompt can also show
    // as an enhancement, but the native banner is the primary UX.
    _deferredPrompt = e as BeforeInstallPromptEvent;
    // Notify any subscribers (e.g. InstallPrompt once it mounts)
    _listeners.forEach((fn) => fn(_deferredPrompt!));
  });
}

/**
 * Get the current deferred prompt (null if not yet fired or already used).
 */
export function getDeferredPrompt(): BeforeInstallPromptEvent | null {
  return _deferredPrompt;
}

/**
 * Subscribe to deferred prompt events (for components that mount after the event fires).
 * Returns an unsubscribe function.
 */
export function onDeferredPrompt(
  fn: (e: BeforeInstallPromptEvent) => void,
): () => void {
  _listeners.push(fn);
  // If already captured, fire immediately
  if (_deferredPrompt) {
    fn(_deferredPrompt);
  }
  return () => {
    _listeners = _listeners.filter((l) => l !== fn);
  };
}

/**
 * Clear the deferred prompt after use (e.g. after user installs or dismisses).
 */
export function clearDeferredPrompt() {
  _deferredPrompt = null;
}
