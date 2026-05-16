// ─────────────────────────────────────────────
// LoadingSpinner
// ─────────────────────────────────────────────

import { cn } from "@/lib/utils";

export default function LoadingSpinner({ size = "md", className }) {
  const sizes = {
    sm: "h-4 w-4 border-2",
    md: "h-8 w-8 border-2",
    lg: "h-12 w-12 border-3",
    xl: "h-16 w-16 border-4",
  };

  return (
    <div className={cn("flex items-center justify-center", className)}>
      <div
        className={cn(
          "rounded-full border-zinc-800 border-t-violet-500 animate-spin",
          sizes[size]
        )}
      />
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <LoadingSpinner size="lg" />
        <p className="text-sm text-zinc-500 animate-pulse">Loading...</p>
      </div>
    </div>
  );
}