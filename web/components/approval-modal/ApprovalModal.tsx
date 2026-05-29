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
    await new Promise((r) => setTimeout(r, 200));
    onDecide(approved);
    setSubmitting(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
      aria-labelledby="approval-modal-title"
    >
      {/* Backdrop — blur + fade */}
      <div
        className="absolute inset-0 animate-backdrop-in"
        style={{
          backgroundColor: "rgba(11,14,20,0.88)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      />

      {/* Modal card */}
      <div
        className={clsx(
          "relative w-full max-w-md rounded-xl border bg-[var(--color-surface-0)]",
          "border-[rgba(240,160,48,0.45)]",
          "animate-modal-in",
          decided === null ? "animate-approval-ring" : ""
        )}
        style={{
          /* Layered shadow for depth */
          boxShadow: decided !== null
            ? decided
              ? "0 0 0 1px rgba(34,200,128,0.2), 0 0 48px rgba(34,200,128,0.12), 0 32px 80px rgba(0,0,0,0.6)"
              : "0 0 0 1px rgba(224,60,74,0.2), 0 0 48px rgba(224,60,74,0.08), 0 32px 80px rgba(0,0,0,0.6)"
            : undefined,
          transition: "box-shadow var(--duration-slow) var(--ease-out-expo)",
        }}
      >
        {/* Top accent bar — shimmer while pending */}
        <div
          className="h-[3px] rounded-t-xl"
          style={{
            background: decided !== null
              ? decided
                ? "linear-gradient(90deg, var(--color-green), rgba(34,200,128,0.6), var(--color-green))"
                : "linear-gradient(90deg, var(--color-red), rgba(224,60,74,0.6), var(--color-red))"
              : "linear-gradient(90deg, var(--color-amber), #f8c060, rgba(240,160,48,0.7), #f8c060, var(--color-amber))",
            backgroundSize: "200% auto",
            animation: decided === null ? "amber-shimmer 2.4s linear infinite" : "none",
            transition: "background var(--duration-slow) var(--ease-out-expo)",
          }}
        />

        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-[var(--color-border-subtle)]">
          <div className="flex items-center gap-3 mb-3">
            <div
              className={clsx(
                "w-10 h-10 rounded-lg flex items-center justify-center border",
                "transition-all duration-500",
                decided !== null && decided
                  ? "bg-[var(--color-green-dim)] border-[rgba(34,200,128,0.4)] text-[var(--color-green)]"
                  : decided !== null && !decided
                  ? "bg-[var(--color-red-dim)] border-[rgba(224,60,74,0.4)] text-[var(--color-red-text)]"
                  : "bg-[var(--color-amber-dim)] border-[rgba(240,160,48,0.4)] text-[var(--color-amber)]"
              )}
            >
              {decided !== null ? (
                decided ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                )
              ) : (
                toolCfg.icon ?? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                )
              )}
            </div>
            <div>
              <p
                className="text-[10px] font-mono uppercase tracking-widest mb-0.5 transition-colors duration-500"
                style={{
                  color: decided !== null
                    ? decided ? "var(--color-green)" : "var(--color-red-text)"
                    : "var(--color-amber)",
                }}
              >
                {decided !== null
                  ? decided
                    ? "Approved — executing remediation"
                    : "Rejected — standing down"
                  : "Approval Required — Production Action Pending"}
              </p>
              <h2 id="approval-modal-title" className="text-base font-semibold text-[var(--color-text-primary)]">
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

        {/* Action buttons / confirmation */}
        <div className="px-6 pb-6">
          {decided === null ? (
            <div className="grid grid-cols-2 gap-3">
              {/* Reject */}
              <button
                onClick={() => handleDecide(false)}
                disabled={submitting}
                className={clsx(
                  "h-11 rounded-lg border bg-[var(--color-surface-1)]",
                  "text-sm font-semibold font-mono",
                  "border-[var(--color-border)] text-[var(--color-text-secondary)]",
                  "transition-all duration-150",
                  "hover:border-[rgba(224,60,74,0.55)] hover:text-[var(--color-red-text)] hover:bg-[var(--color-red-dim)]",
                  "hover:shadow-[0_0_12px_var(--color-red-dim)]",
                  "active:scale-[0.97] active:brightness-95",
                  "focus-visible:outline-2 focus-visible:outline-[var(--color-red)]",
                  "disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
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
                  "transition-all duration-150",
                  "hover:brightness-110 hover:shadow-[0_0_24px_var(--color-amber-glow)]",
                  "active:scale-[0.97] active:brightness-95",
                  "focus-visible:outline-2 focus-visible:outline-[var(--color-amber)]",
                  "disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
                )}
              >
                Approve
              </button>
            </div>
          ) : (
            <div
              className={clsx(
                "h-11 rounded-lg flex items-center justify-center gap-2",
                "text-sm font-semibold font-mono animate-confirm-in",
                decided
                  ? "bg-[var(--color-green-dim)] border border-[rgba(34,200,128,0.35)] text-[var(--color-green-text)]"
                  : "bg-[var(--color-red-dim)] border border-[rgba(224,60,74,0.35)] text-[var(--color-red-text)]"
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
          )}
        </div>
      </div>
    </div>
  );
}
