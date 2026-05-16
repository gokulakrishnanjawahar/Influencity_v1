// ─────────────────────────────────────────────
// PageLayout — Consistent Page Wrapper
// ─────────────────────────────────────────────

import { motion } from "framer-motion";
import Navbar from "./Navbar";
import { cn } from "@/lib/utils";

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const pageTransition = {
  duration: 0.25,
  ease: "easeInOut",
};

export default function PageLayout({
  children,
  className,
  showNav = true,
  fullWidth = false,
}) {
  return (
    <div className="min-h-screen bg-zinc-950">
      {showNav && <Navbar />}
      <motion.main
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={pageTransition}
        className={cn(
          showNav && "pt-16",
          className
        )}
      >
        <div
          className={cn(
            !fullWidth && "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
          )}
        >
          {children}
        </div>
      </motion.main>
    </div>
  );
}

// Section wrapper with consistent padding
export function Section({ children, className }) {
  return (
    <section className={cn("py-8 sm:py-12", className)}>
      {children}
    </section>
  );
}

// Page header with title and optional action
export function PageHeader({ title, description, action, className }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 mb-8", className)}>
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-100 mb-1">
          {title}
        </h1>
        {description && (
          <p className="text-zinc-500 text-sm sm:text-base">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}