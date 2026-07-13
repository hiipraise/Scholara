// src/hooks/useServiceWorkerUpdate.tsx
/**
 * Hook that detects a waiting service worker (new version available)
 * and exposes a refresh action so the user can manually apply the update.
 * Works with vite-plugin-pwa's registerType: 'prompt'.
 *
 * Call once in App.tsx.
 */
import { useEffect } from "react";
import { registerSW } from "virtual:pwa-register";
import toast from "react-hot-toast";

export function useServiceWorkerUpdate() {
  useEffect(() => {
    const updateSW = registerSW({
      onNeedRefresh() {
        toast(
          (t) => (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              fontFamily: "DM Sans, sans-serif",
            }}>
              <span style={{ color: "#F0E7D5", fontSize: "14px" }}>
                A new version of Scholara is available.
              </span>
              <button
                onClick={() => {
                  updateSW(true);
                  toast.dismiss(t.id);
                }}
                style={{
                  background: "rgba(74, 144, 226, 0.2)",
                  color: "#4a90e2",
                  border: "none",
                  padding: "6px 12px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Reload
              </button>
            </div>
          ),
          {
            duration: Infinity,
            style: {
              background: "#1a2136",
              color: "#F0E7D5",
              border: "1px solid rgba(240, 231, 213, 0.15)",
              fontFamily: "DM Sans, sans-serif",
              maxWidth: "400px",
            },
          },
        );
      },
      onRegistered() {
        // SW registered successfully
      },
      onRegisterError(error) {
        console.warn("SW registration failed:", error);
        // Show a toast so the user knows the app can't update automatically.
        // The app still works — just without PWA update support on this browser.
        toast.error("App update check unavailable on this browser", {
          duration: 3000,
        });
      },
    });
  }, []);
}
