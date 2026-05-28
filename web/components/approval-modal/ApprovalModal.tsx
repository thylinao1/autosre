"use client";

import { useState } from "react";
import clsx from "clsx";
import type { ApprovalRequestEvent } from "@/lib/types";

interface ApprovalModalProps {
  event: ApprovalRequestEvent;
  onDecide: (approved: boolean) => void;
}

const toolDescriptions: Record<string, { label: string; icon: React.ReactNode; description: string }> = {
  toggle_feature_flag: {
    label: "Toggle Feature Flag",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18"/>
        <path d="M7 7h14"/>
        <path d="M7 12h8"/>
        <path d="M7 17h5"/>
      </svg>
    ),
    description: "Modifies a runtime feature flag on checkout-api.",
  },
  scale_service: {
    label: "Scale Service",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
    description: "Adjusts the replica count for checkout-api on the cluster.",
  },
  rollback_deployment: {
    label: "Rollback Deployment",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="1 4 1 10 7 10"/>
        <path d="M3.51 15a9 9 0 1 0 .49-4"/>
      </svg>
    ),
    description: "Rolls back checkout-api to a previous known-good deployment version.",
  },
};

function ArgRow({ label, value }: { label: string; value: unknown }) {
  const displayVal =
    typeof value === "boolean"
      ? value
        ? "true"
        : "false"
      : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);

  const isBoolean = typeof value === "boolean";
  const isFalse = isBoolean && !value;

  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-[var(--color-border-subtle)] last:border-0">
      <span className="text-[11px] font-mono text-[var(--color-text-muted)] flex-shrink-0">
        {label}
      </span>
      <span
        className={clsx(
          "text-[11px] font-mono font-medium text-right",
          isBoolean && isFalse
            ? "text-[var(--color-red-text)]"
            : isBoolean
            ? "text-[var(--color-green-text)]"
            : "text-[var(--color-amber)]"
        )}
      >
        {displayVal}
      </span>
    </div>
  );
}

export function ApprovalModal({ event, onDecide }: ApprovalModalProps) {
  const [decided, setDecided] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const toolCfg = toolDescriptions[event.tool] ?? {
    label: event.tool,
    icon: null,
    description: "Execute a remediation action on checkout-api.",
  };

  async function handleDecide(approved: boolean) {
    if (submitting || decided !== null) return;
    setSubmitting(true);
    setDecided(approved);
    await new Promise((r) => setTimeout(r, 200)); // let the state update render
    onDecide(approved);
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[var(--color-bg)] opacity-80" />

      {/* Modal card */}
      <div
        className={clsx(
          "relative w-full max-w-md rounded-xl border bg-[var(--color-surface-0)]",
          "border-[var(--color-amber)] border-opacity-50",
          "shadow-[0_0_60px_var(--color-amber-dim)]",
          decided === null ? "animate-approval-ring" : "",
          "animate-incident"
        )}
      >
        {/* Top accent bar */}
        <div className="h-1 rounded-t-xl bg-gradient-to-r from-[var(--color-amber)] via-[#f8c060] to-[var(--color-amber)] opacity-80" />

        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-[var(--color-border-subtle)]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--color-amber-dim)] border border-[var(--color-amber)] border-opacity-40 flex items-center justify-center text-[var(--color-amber)]">
              {toolCfg.icon ?? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              )}
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--color-amber)] mb-0.5">
                Approval Required — Production Action Pending
              </p>
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                {toolCfg.label}
              </h2>
            </div>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] font-mono leading-relaxed">
            {toolCfg.description}
            {" "}Nothing has touched production. This action is blocked until you decide.
          </p>
        </div>

        {/* Args */}
        <div className="px-6 py-4">
          <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--color-text-muted)] mb-2">
            Proposed Arguments
          </p>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 divide-y divide-[var(--color-border-subtle)]">
            {Object.entries(event.args).map(([k, v]) => (
              <ArgRow key={k} label={k} value={v} />
            ))}
          </div>
        </div>

        {/* Hint */}
        {event.hint && (
          <div className="px-6 pb-4">
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2.5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--color-text-muted)] mb-1">
                Agent note
              </p>
              <p className="text-xs font-mono text-[var(--color-text-secondary)] leading-relaxed">
                {event.hint}
              </p>
            </div>
          </div>
        )}

        {/* Confirmation ID */}
        <div className="px-6 pb-4">
          <p className="text-[10px] font-mono text-[var(--color-text-dim)]">
            confirmation_id: <span className="text-[var(--color-text-muted)]">{event.id}</span>
          </p>
        </div>

        {/* Action buttons */}
        {decided === null ? (
          <div className="px-6 pb-6 grid grid-cols-2 gap-3">
            {/* Reject */}
            <button
              onClick={() => handleDecide(false)}
              disabled={submitting}
              className={clsx(
                "h-11 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)]",
                "text-sm font-semibold font-mono text-[var(--color-text-secondary)]",
                "hover:border-[var(--color-red)] hover:border-opacity-60 hover:text-[var(--color-red-text)] hover:bg-[var(--color-red-dim)]",
                "active:scale-[0.98]",
                "transition-all duration-150",
                "focus-visible:ring-2 focus-visible:ring-[var(--color-red)] focus-visible:ring-opacity-40",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              Reject
            </button>

            {/* Approve */}
            <button
              onClick={() => handleDecide(true)}
              disabled={submitting}
              className={clsx(
                "h-11 rounded-lg",
                "bg-[var(--color-amber)] text-[#1a1000]",
                "text-sm font-semibold font-mono",
                "hover:brightness-110 hover:shadow-[0_0_20px_var(--color-amber-glow)]",
                "active:scale-[0.98]",
                "transition-all duration-150",
                "focus-visible:ring-2 focus-visible:ring-[var(--color-amber)] focus-visible:ring-opacity-60",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              Approve
            </button>
          </div>
        ) : (
          <div className="px-6 pb-6">
            <div
              className={clsx(
                "h-11 rounded-lg flex items-center justify-center gap-2 text-sm font-semibold font-mono",
                decided
                  ? "bg-[var(--color-green-dim)] border border-[var(--color-green)] border-opacity-40 text-[var(--color-green-text)]"
                  : "bg-[var(--color-red-dim)] border border-[var(--color-red)] border-opacity-40 text-[var(--color-red-text)]"
              )}
            >
              {decided ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Approved — executing…
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                  Rejected — standing down
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
