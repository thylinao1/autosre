"use client";

import { useState } from "react";
import clsx from "clsx";
import type { FaultType, RunStatus } from "@/lib/types";

interface DemoControlsProps {
  status: RunStatus;
  onStart: (inject: FaultType | null) => void;
  onReset: () => void;
}

const faultOptions: { value: FaultType | null; label: string; description: string; badge: string }[] = [
  {
    value: "payment_errors",
    label: "Payment Errors",
    description: "22% checkout failure rate after deploy v2.3.1 enables bad feature flag",
    badge: "AVAILABILITY",
  },
  {
    value: "latency_spike",
    label: "Latency Spike",
    description: "P99 4,200ms — checkout-api under-provisioned, needs scaling",
    badge: "PERFORMANCE",
  },
];

export function DemoControls({ status, onStart, onReset }: DemoControlsProps) {
  const [selectedFault, setSelectedFault] = useState<FaultType>("payment_errors");
  const [isExpanded, setIsExpanded] = useState(true);

  const isActive = status !== "idle" && status !== "error";
  const isTerminal = status === "resolved" || status === "declined" || status === "all_clear";

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-0)] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[var(--color-surface-1)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <polygon points="10 8 16 12 10 16 10 8"/>
          </svg>
          <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
            Demo Controls
          </span>
        </div>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-text-muted)"
          strokeWidth="2"
          className={clsx("transition-transform duration-200", isExpanded ? "rotate-180" : "")}
        >
          <polyline points="18 15 12 9 6 15"/>
        </svg>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 pt-1 border-t border-[var(--color-border-subtle)]">
          {/* Fault selector */}
          {!isActive && (
            <div className="space-y-2 mb-3">
              <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--color-text-muted)] pt-2">
                Inject Fault
              </p>
              {faultOptions.map((opt) => (
                <button
                  key={opt.value ?? "none"}
                  onClick={() => opt.value && setSelectedFault(opt.value)}
                  className={clsx(
                    "w-full text-left rounded-md border px-3 py-2.5 transition-all duration-150",
                    selectedFault === opt.value
                      ? opt.badge === "AVAILABILITY"
                        ? "border-[var(--color-red)] border-opacity-50 bg-[var(--color-red-dim)]"
                        : "border-[var(--color-orange)] border-opacity-50 bg-[var(--color-orange-dim)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface-1)] hover:border-[var(--color-border-strong)]"
                  )}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className={clsx(
                        "text-[9px] font-mono font-bold uppercase tracking-widest px-1.5 py-0.5 rounded",
                        opt.badge === "AVAILABILITY"
                          ? "text-[var(--color-red-text)] bg-[var(--color-red-dim)]"
                          : "text-[var(--color-orange-text)] bg-[var(--color-orange-dim)]"
                      )}
                    >
                      {opt.badge}
                    </span>
                    <span className="text-xs font-semibold text-[var(--color-text-primary)]">
                      {opt.label}
                    </span>
                  </div>
                  <p className="text-[10px] font-mono text-[var(--color-text-muted)] leading-snug">
                    {opt.description}
                  </p>
                </button>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 mt-2">
            {!isActive || isTerminal ? (
              <button
                onClick={() => {
                  if (isTerminal) onReset();
                  else onStart(selectedFault);
                }}
                className={clsx(
                  "flex-1 h-9 rounded-md text-xs font-semibold font-mono transition-all duration-150",
                  "active:scale-[0.98]",
                  isTerminal
                    ? "bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]"
                    : "bg-[var(--color-accent)] text-[var(--color-bg)] hover:brightness-110 hover:shadow-[0_0_14px_var(--color-accent-glow)]"
                )}
              >
                {isTerminal ? "Reset & Run Again" : `Run: ${selectedFault === "payment_errors" ? "Payment Errors" : "Latency Spike"}`}
              </button>
            ) : (
              <div className="flex-1 h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-1)] flex items-center justify-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-status-blink" />
                <span className="text-[11px] font-mono text-[var(--color-accent)]">
                  {status === "awaiting_approval" ? "Awaiting approval" : "Agent running…"}
                </span>
              </div>
            )}

            {isTerminal && (
              <button
                onClick={() => onStart(selectedFault)}
                className={clsx(
                  "h-9 px-3 rounded-md text-xs font-semibold font-mono transition-all duration-150",
                  "active:scale-[0.98]",
                  "bg-[var(--color-accent)] text-[var(--color-bg)] hover:brightness-110"
                )}
              >
                New Run
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
