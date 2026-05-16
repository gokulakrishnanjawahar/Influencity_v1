// ─────────────────────────────────────────────
// StatusBadge — Campaign & Milestone Status
// ─────────────────────────────────────────────

import { cn } from "@/lib/utils";

const STATUS_CONFIG = {
  // Campaign statuses
  active: {
    label: "Active",
    className: "text-violet-400 bg-violet-400/10 border-violet-400/20",
    dot: "bg-violet-400",
    pulse: true,
  },
  pending: {
    label: "Pending",
    className: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    dot: "bg-amber-400",
    pulse: false,
  },
  completed: {
    label: "Completed",
    className: "text-green-400 bg-green-400/10 border-green-400/20",
    dot: "bg-green-400",
    pulse: false,
  },
  cancelled: {
    label: "Cancelled",
    className: "text-red-400 bg-red-400/10 border-red-400/20",
    dot: "bg-red-400",
    pulse: false,
  },
  // Milestone statuses
  PENDING: {
    label: "Pending",
    className: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    dot: "bg-amber-400",
    pulse: true,
  },
  MET: {
    label: "Met",
    className: "text-green-400 bg-green-400/10 border-green-400/20",
    dot: "bg-green-400",
    pulse: false,
  },
  FAILED: {
    label: "Failed",
    className: "text-red-400 bg-red-400/10 border-red-400/20",
    dot: "bg-red-400",
    pulse: false,
  },
};

export default function StatusBadge({ status, className }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
        config.className,
        className
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        {config.pulse && (
          <span
            className={cn(
              "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
              config.dot
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex rounded-full h-1.5 w-1.5",
            config.dot
          )}
        />
      </span>
      {config.label}
    </span>
  );
}