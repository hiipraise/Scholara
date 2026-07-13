// src/components/OfflineBadge.tsx
import { WifiOff } from "lucide-react";

interface OfflineBadgeProps {
  size?: "xs" | "sm";
}

export default function OfflineBadge({ size = "xs" }: OfflineBadgeProps) {
  const sizeClasses = size === "sm" ? "text-[10px] px-2 py-0.5" : "text-[8px] px-1.5 py-0.5";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-accent-gold/15 text-accent-gold border border-accent-gold/20 font-semibold uppercase tracking-wider ${sizeClasses}`}
      title="You are viewing a cached offline copy. It may not reflect the latest version."
    >
      <WifiOff size={size === "sm" ? 10 : 8} />
      Offline copy
    </span>
  );
}
