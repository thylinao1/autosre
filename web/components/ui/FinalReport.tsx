"use client";

import clsx from "clsx";
import type { FinalEvent } from "@/lib/types";

interface FinalReportProps {
  event: FinalEvent;
}

export function FinalReport({ event }: FinalReportProps) {
  const { report, service_healthy, incident_resolved, outcome } = event;

  const isSuccess = service_healthy && incident_resolved;
  const isDeclined = outcome === "declined";
  const isClear = outcome === "all_clear";

  return (
    <div
      className={clsx(
        "rounded-lg border p-4 animate-slide-in-up",
        isSuccess
          ? "border-[var(--color-green)] border-opacity-40 bg-[var(--color-green-dim)]"
          : isDeclined
          ? "border-[var(--color-amber)] border-opacity-30 bg-[var(--color-amber-dim)]"
          : isClear
          ? "border-[var(--color-accent)] border-opacity-30 bg-[var(--color-accent-dim)]"
          : "border-[var(--color-border)] bg-[var(--color-surface-1)]"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={clsx(
            "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
            isSuccess
              ? "bg-[var(--color-green-dim)] text-[var(--color-green)]"
              : isDeclined
              ? "text-[var(--color-amber)]"
              : "text-[var(--color-accent)]"
          )}
        >
          {isSuccess ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          ) : isDeclined ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 8 12 12 14 14"/>
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={clsx(
              "text-[10px] font-mono uppercase tracking-widest mb-1",
              isSuccess
                ? "text-[var(--color-green)]"
                : isDeclined
                ? "text-[var(--color-amber)]"
                : "text-[var(--color-accent)]"
            )}
          >
            {isSuccess
              ? "Incident Resolved"
              : isDeclined
              ? "Remediation Declined"
              : isClear
              ? "All Systems Clear"
              : "Run Complete"}
          </p>
          <p className="text-xs font-mono text-[var(--color-text-secondary)] leading-relaxed">
            {report}
          </p>
        </div>
      </div>
    </div>
  );
}
