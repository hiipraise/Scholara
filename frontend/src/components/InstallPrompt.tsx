// src/components/InstallPrompt.tsx
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, Smartphone, ExternalLink } from "lucide-react";
import {
  getDeferredPrompt,
  onDeferredPrompt,
  clearDeferredPrompt,
} from "../lib/deferredPrompt";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Detect if the app is already running in standalone (installed) mode.
 */
function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

/**
 * Detect iOS Safari (which doesn't support beforeinstallprompt).
 */
function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  // Dismiss state: persist in sessionStorage so it survives navigation
  const [dismissed, setDismissed] = useState(() => {
    const stored = sessionStorage.getItem("scholara_install_dismissed");
    if (!stored) return false;
    const until = parseInt(stored, 10);
    return Date.now() < until;
  });

  // Persist dismissed state with a 7-day cooldown
  const persistDismiss = useCallback(() => {
    const until = Date.now() + 7 * 24 * 60 * 60 * 1000;
    sessionStorage.setItem("scholara_install_dismissed", String(until));
    setDismissed(true);
  }, []);

  // Check if we should show the install prompt
  const tryShow = useCallback(
    (prompt: BeforeInstallPromptEvent | null) => {
      if (isStandalone() || dismissed) return;

      const visits = parseInt(
        sessionStorage.getItem("scholara_visits") || "0",
        10,
      );
      if (visits < 1) return; // Show on second page load (visit count = 1)

      if (isIOS()) {
        setShowIOSInstructions(true);
      } else if (prompt) {
        setShowPrompt(true);
      }
    },
    [dismissed],
  );

  // Track page visits
  useEffect(() => {
    const visits = parseInt(
      sessionStorage.getItem("scholara_visits") || "0",
      10,
    );
    sessionStorage.setItem("scholara_visits", String(visits + 1));
  }, []);

  // On mount: read any already-captured deferred prompt from the shared module
  useEffect(() => {
    const existing = getDeferredPrompt();
    if (existing) {
      setDeferredPrompt(existing);
      tryShow(existing);
    }
    // Subscribe for future events (in case prompt fires after mount)
    const unsub = onDeferredPrompt((e) => {
      setDeferredPrompt(e);
      tryShow(e);
    });
    return unsub;
  }, [tryShow]);

  async function handleInstall() {
    const prompt = deferredPrompt || getDeferredPrompt();
    if (!prompt) return;

    prompt.prompt();
    const { outcome } = await prompt.userChoice;

    if (outcome === "accepted") {
      setShowPrompt(false);
      setDismissed(true);
      sessionStorage.setItem("scholara_installed", "true");
    }
    clearDeferredPrompt();
    setDeferredPrompt(null);
  }

  function handleDismiss() {
    setShowPrompt(false);
    setShowIOSInstructions(false);
    persistDismiss();
  }

  return (
    <AnimatePresence>
      {/* Android install prompt */}
      {showPrompt && deferredPrompt && (
        <motion.div
          initial={{ opacity: 0, y: 40, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          exit={{ opacity: 0, y: 40, x: "-50%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed bottom-6 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm"
        >
          <div className="card p-4 shadow-2xl border border-cream-200/15">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-accent-sky/15 p-2 shrink-0">
                <Download size={18} className="text-accent-sky" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-cream-200 text-sm font-semibold">
                  Install Scholara
                </h4>
                <p className="text-cream-200/50 text-xs mt-1">
                  Add to your home screen for quick access, even offline.
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={handleInstall}
                    className="btn-primary text-xs flex items-center gap-1.5"
                  >
                    <Download size={12} />
                    Install
                  </button>
                  <button
                    onClick={handleDismiss}
                    className="btn-ghost text-xs"
                  >
                    Not now
                  </button>
                </div>
              </div>
              <button
                onClick={handleDismiss}
                className="text-cream-200/30 hover:text-cream-200/60 transition-colors p-1"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* iOS instructions prompt */}
      {showIOSInstructions && (
        <motion.div
          initial={{ opacity: 0, y: 40, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          exit={{ opacity: 0, y: 40, x: "-50%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed bottom-6 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm"
        >
          <div className="card p-4 shadow-2xl border border-cream-200/15">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-accent-sky/15 p-2 shrink-0">
                <Smartphone size={18} className="text-accent-sky" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-cream-200 text-sm font-semibold">
                  Add to Home Screen
                </h4>
                <p className="text-cream-200/50 text-xs mt-1 leading-relaxed">
                  For the best experience, add Scholara to your home screen:
                </p>
                <ol className="text-cream-200/45 text-xs mt-2 space-y-1 ml-4 list-decimal">
                  <li>
                    Tap the{" "}
                    <strong className="text-cream-200/70">Share</strong> button{" "}
                    <ExternalLink size={10} className="inline" /> in Safari
                  </li>
                  <li>
                    Scroll down and tap{" "}
                    <strong className="text-cream-200/70">
                      "Add to Home Screen"
                    </strong>
                  </li>
                  <li>
                    Tap{" "}
                    <strong className="text-cream-200/70">"Add"</strong> in the
                    top-right corner
                  </li>
                </ol>
                <div className="mt-3">
                  <button
                    onClick={handleDismiss}
                    className="btn-primary text-xs"
                  >
                    Got it
                  </button>
                </div>
              </div>
              <button
                onClick={handleDismiss}
                className="text-cream-200/30 hover:text-cream-200/60 transition-colors p-1"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
