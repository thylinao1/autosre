import clsx from "clsx";
import type { ReactNode } from "react";

interface PanelProps {
  children: ReactNode;
  className?: string;
  label?: string;
  accent?: boolean;
}

export function Panel({ children, className, label, accent }: PanelProps) {
  return (
    <section
      className={clsx(
        "relative rounded-lg border overflow-hidden",
        accent
          ? "border-[var(--color-accent)] border-opacity-30 bg-[var(--color-surface-0)]"
          : "border-[var(--color-border)] bg-[var(--color-surface-0)]",
        className
      )}
    >
      {label && (
        <header className="flex items-center gap-2 px-4 py-2 border-b border-[var(--color-border-subtle)]">
          <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
            {label}
          </span>
          {accent && (
            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse-glow" />
          )}
        </header>
      )}
      {children}
    </section>
  );
}
