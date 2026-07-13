// src/hooks/useNetworkStatus.ts
import { useState, useEffect, useRef } from "react";

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);
  const onlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      setWasOffline(true);
      // Clear the "back online" banner after 3 seconds
      if (onlineTimerRef.current) clearTimeout(onlineTimerRef.current);
      onlineTimerRef.current = setTimeout(() => setWasOffline(false), 3000);
    }
    function handleOffline() {
      setIsOnline(false);
      setWasOffline(true);
      if (onlineTimerRef.current) clearTimeout(onlineTimerRef.current);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (onlineTimerRef.current) clearTimeout(onlineTimerRef.current);
    };
  }, []);

  // Show "back online" briefly after coming back, then return to true without banner
  const showOnlineBanner = isOnline && wasOffline;
  const showOfflineBanner = !isOnline;

  return { isOnline, showOnlineBanner, showOfflineBanner };
}
