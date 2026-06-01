import clsx from "clsx";

interface BadgeProps {
  label: string;
  variant: "availability" | "performance" | "healthy" | "clear" | "muted" | "accent";
  pulse?: boolean;
}

const styles: Record<BadgeProps["variant"], string> = {
  availability:
    "bg-[var(--color-red-dim)] text-[var(--color-red-text)] border border-[var(--color-red)] border-opacity-40",
  performance:
    "bg-[var(--color-orange-dim)] text-[var(--color-orange-text)] border border-[var(--color-orange)] border-opacity-40",
  healthy:
    "bg-[var(--color-green-dim)] text-[var(--color-green-text)] border border-[var(--color-green)] border-opacity-40",
  clear: "bg-[var(--color-accent-dim)] text-[var(--color-accent)] border border-[var(--color-accent)] border-opacity-30",
  muted: "bg-[var(--color-surface-2)] text-[var(--color-text-muted)] border border-[var(--color-border)]",
  accent: "bg-[var(--color-accent-dim)] text-[var(--color-accent)] border border-[var(--color-accent)] border-opacity-40",
};

export function Badge({ label, variant, pulse = false }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] leading-none font-sans font-semibold whitespace-nowrap shrink-0",
        styles[variant]
      )}
    >
      {pulse && (
        <span
          className={clsx(
            "inline-block w-1.5 h-1.5 rounded-full",
            variant === "availability" ? "bg-[var(--color-red)]" :
            variant === "performance" ? "bg-[var(--color-orange)]" :
            variant === "healthy" ? "bg-[var(--color-green)]" :
            "bg-[var(--color-accent)]",
            "animate-status-blink"
          )}
        />
      )}
      {label}
    </span>
  );
}
