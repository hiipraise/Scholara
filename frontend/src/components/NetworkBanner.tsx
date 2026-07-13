// src/components/NetworkBanner.tsx
import { motion, AnimatePresence } from "framer-motion";
import { WifiOff, Wifi } from "lucide-react";
import { useNetworkStatus } from "../hooks/useNetworkStatus";

export default function NetworkBanner() {
  const { showOnlineBanner, showOfflineBanner } = useNetworkStatus();

  return (
    <AnimatePresence>
      {showOfflineBanner && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className="flex items-center justify-center gap-2 bg-accent-gold/15 border-b border-accent-gold/20 px-4 py-2">
            <WifiOff size={14} className="text-accent-gold shrink-0" />
            <span className="text-accent-gold text-xs font-medium">
              You are offline. Some features may be limited.
            </span>
          </div>
        </motion.div>
      )}
      {showOnlineBanner && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className="flex items-center justify-center gap-2 bg-accent-sage/10 border-b border-accent-sage/15 px-4 py-1.5">
            <Wifi size={12} className="text-accent-sage shrink-0" />
            <span className="text-accent-sage text-[10px] font-medium">
              Back online
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
