// ─────────────────────────────────────────────
// EmptyState
// ─────────────────────────────────────────────

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-8 text-center",
        className
      )}
    >
      {Icon && (
        <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-zinc-900 border border-zinc-800 mb-6">
          <Icon className="h-8 w-8 text-zinc-600" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-zinc-200 mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-zinc-500 max-w-sm mb-6">{description}</p>
      )}
      {action && (
        <Button
          onClick={action.onClick}
          className="bg-violet-600 hover:bg-violet-500 text-white"
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}