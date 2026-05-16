// ─────────────────────────────────────────────
// ProgressBar — Milestone Progress
// ─────────────────────────────────────────────

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export default function ProgressBar({
  value = 0,
  max = 100,
  label,
  showPercentage = true,
  status = "PENDING",
  className,
}) {
  const percentage = Math.min(Math.round((value / max) * 100), 100);

  const colors = {
    PENDING: "from-violet-600 to-violet-400",
    MET: "from-green-600 to-green-400",
    FAILED: "from-red-600 to-red-400",
  };

  const bgColors = {
    PENDING: "bg-violet-500/20",
    MET: "bg-green-500/20",
    FAILED: "bg-red-500/20",
  };

  return (
    <div className={cn("w-full", className)}>
      {(label || showPercentage) && (
        <div className="flex items-center justify-between mb-2">
          {label && (
            <span className="text-xs text-zinc-500">{label}</span>
          )}
          {showPercentage && (
            <span className="text-xs font-medium text-zinc-400">
              {percentage}%
            </span>
          )}
        </div>
      )}
      <div className={cn("h-1.5 rounded-full overflow-hidden", bgColors[status] || "bg-zinc-800")}>
        <motion.div
          className={cn("h-full rounded-full bg-gradient-to-r", colors[status] || colors.PENDING)}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}