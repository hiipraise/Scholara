import { motion } from "framer-motion";
import { BookOpen, CheckSquare, TrendingUp } from "lucide-react";
import clsx from "clsx";

interface StatsRowProps {
  stats: {
    total_attempted: number;
    total_correct: number;
    accuracy: number;
  } | null;
}

export default function StatsRow({ stats }: StatsRowProps) {
  if (!stats) return null;

  const items = [
    { label: "Attempted", value: stats.total_attempted, icon: BookOpen },
    {
      label: "Correct",
      value: stats.total_correct,
      icon: CheckSquare,
      color: "text-accent-sage",
    },
    {
      label: "Accuracy",
      value: `${stats.accuracy}%`,
      icon: TrendingUp,
      color: "text-accent-gold",
    },
  ] as const;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="grid grid-cols-3 gap-3"
    >
      {items.map((item) => {
        const { label, value, icon: Icon, color } = item as typeof item & { color?: string };
        return (
          <div key={label} className="card p-4 text-center">
            <Icon
              size={16}
              className={clsx("mx-auto mb-2", color || "text-cream-200/30")}
            />
            <div className="font-mono text-xl font-bold text-cream-200">
              {value}
            </div>
            <div className="text-cream-200/35 text-xs mt-0.5">{label}</div>
          </div>
        );
      })}
    </motion.div>
  );
}
