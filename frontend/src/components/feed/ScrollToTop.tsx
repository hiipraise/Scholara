import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp } from "lucide-react";

export default function ScrollToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 320);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.2 }}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed right-5 bottom-6 sm:bottom-8 z-40 h-11 w-11 rounded-full border border-cream-200/20 bg-[#1a2136]/90 text-cream-200 shadow-glow-cream backdrop-blur-sm hover:bg-[#212842] transition-colors"
          aria-label="Scroll to top"
          title="Scroll to top"
        >
          <ChevronUp size={18} className="mx-auto" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
