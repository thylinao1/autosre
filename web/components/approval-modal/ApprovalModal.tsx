"use client";

import { useEffect, useRef, useState } from "react";
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
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
    description: "Adjusts the replica count for checkout-api on the cluster.",
  },
  rollback_deployment: {
    label: "Rollback Deployment",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      ? value ? "true" : "false"
      : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);

  const isBoolean = typeof value === "boolean";
  const isFalse = isBoolean && !value;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "16px",
      padding: "7px 0",
      borderBottom: "1px solid var(--color-border-subtle)",
    }}
    className="last:border-0"
    >
      <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)", flexShrink: 0 }}>
        {label}
      </span>
      <span
        style={{
          fontSize: "11px",
          fontFamily: "var(--font-mono)",
          fontWeight: 500,
          textAlign: "right",
          color: isBoolean
            ? isFalse ? "var(--color-red-text)" : "var(--color-green-text)"
            : "var(--color-amber)",
        }}
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
    await new Promise((r) => setTimeout(r, 180));
    onDecide(approved);
    setSubmitting(false);
  }

  // Latest values for the mounted-once keydown handler (avoids stale closure).
  const cardRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ decided, submitting });
  stateRef.current = { decided, submitting };
  const decideRef = useRef(handleDecide);
  decideRef.current = handleDecide;

  // Dialog a11y: focus the modal on open, trap Tab inside it, Escape = reject
  // (dismiss == stand down), and restore focus to the trigger when it closes.
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const getFocusable = () =>
      Array.from(
        cardRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );
    getFocusable()[0]?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (stateRef.current.decided === null && !stateRef.current.submitting) {
          e.preventDefault();
          decideRef.current(false);
        }
        return;
      }
      if (e.key !== "Tab") return;
      const items = getFocusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!cardRef.current?.contains(active as Node)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      prevFocus?.focus?.();
    };
  }, []);

  const isApproved = decided === true;
  const isRejected = decided === false;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
      aria-labelledby="approval-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 animate-backdrop-in"
        style={{
          backgroundColor: "rgba(9,12,17,0.9)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      />

      {/* Modal card — layered depth */}
      <div
        ref={cardRef}
        className={clsx(
          "relative w-full max-w-[420px] rounded-xl border",
          decided === null ? "animate-modal-pending" : "animate-modal-in"
        )}
        style={{
          backgroundColor: "var(--color-surface-0)",
          borderColor: decided !== null
            ? isApproved ? "rgba(32,204,128,0.35)" : "rgba(224,58,72,0.3)"
            : "rgba(242,168,50,0.4)",
          /* Layered shadow: ambient + directional + inner highlight */
          boxShadow: decided !== null
            ? isApproved
              ? "0 0 0 1px rgba(32,204,128,0.12), 0 0 60px rgba(32,204,128,0.1), 0 40px 100px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)"
              : "0 0 0 1px rgba(224,58,72,0.12), 0 0 60px rgba(224,58,72,0.08), 0 40px 100px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)"
            : "0 0 0 1px rgba(242,168,50,0.06), 0 40px 100px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)",
          transition: "box-shadow var(--duration-slow) var(--ease-out-expo), border-color var(--duration-slow) var(--ease-out-expo)",
          /* Scanline texture */
          backgroundImage: "linear-gradient(rgba(255,255,255,0.01) 1px, transparent 1px)",
          backgroundSize: "100% 3px",
        }}
      >
        {/* Top accent bar — shimmer while pending, solid on decide */}
        <div
          style={{
            height: "2.5px",
            borderRadius: "12px 12px 0 0",
            transition: "background var(--duration-slow) var(--ease-out-expo)",
            background: decided !== null
              ? isApproved
                ? "linear-gradient(90deg, transparent 0%, var(--color-green) 20%, var(--color-green-text) 50%, var(--color-green) 80%, transparent 100%)"
                : "linear-gradient(90deg, transparent 0%, var(--color-red) 20%, var(--color-red-text) 50%, var(--color-red) 80%, transparent 100%)"
              : "linear-gradient(90deg, var(--color-amber) 0%, #f8c860 25%, rgba(242,168,50,0.5) 50%, #f8c860 75%, var(--color-amber) 100%)",
            backgroundSize: "200% auto",
            animation: decided === null ? "amber-shimmer 2.2s linear infinite" : "none",
          }}
        />

        {/* Header */}
        <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid var(--color-border-subtle)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "10px" }}>
            {/* Icon container */}
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid",
                flexShrink: 0,
                transition: "all 0.45s var(--ease-out-expo)",
                borderColor: decided !== null
                  ? isApproved ? "rgba(32,204,128,0.4)" : "rgba(224,58,72,0.4)"
                  : "rgba(242,168,50,0.4)",
                backgroundColor: decided !== null
                  ? isApproved ? "var(--color-green-dim)" : "var(--color-red-dim)"
                  : "var(--color-amber-dim)",
                color: decided !== null
                  ? isApproved ? "var(--color-green)" : "var(--color-red-text)"
                  : "var(--color-amber)",
                boxShadow: decided !== null
                  ? isApproved ? "0 0 12px rgba(32,204,128,0.15)" : "0 0 12px rgba(224,58,72,0.12)"
                  : "0 0 12px rgba(242,168,50,0.12)",
              }}
            >
              {decided !== null ? (
                isApproved ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                )
              ) : (
                toolCfg.icon ?? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                )
              )}
            </div>

            {/* Title block */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontSize: "11px",
                  fontFamily: "var(--font-sans)",
                  letterSpacing: "-0.005em",
                  marginBottom: "3px",
                  transition: "color 0.45s var(--ease-out-expo)",
                  color: decided !== null
                    ? isApproved ? "var(--color-green)" : "var(--color-red-text)"
                    : "var(--color-amber)",
                  fontWeight: 600,
                }}
              >
                {decided !== null
                  ? isApproved
                    ? "Approved, executing the fix"
                    : "Rejected, standing down"
                  : "Approval required"}
              </p>
              <h2
                id="approval-modal-title"
                style={{
                  fontSize: "1rem",
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                  lineHeight: 1.3,
                  letterSpacing: "-0.01em",
                }}
              >
                {toolCfg.label}
              </h2>
            </div>
          </div>

          <p style={{
            fontSize: "12.5px",
            fontFamily: "var(--font-sans)",
            color: "var(--color-text-secondary)",
            lineHeight: 1.6,
            letterSpacing: "-0.005em",
          }}>
            {toolCfg.description}{" "}
            <span style={{ color: "var(--color-text-muted)" }}>
              Nothing has reached production yet. This stays blocked until you decide.
            </span>
          </p>
        </div>

        {/* Args */}
        <div style={{ padding: "14px 22px" }}>
          <p style={{
            fontSize: "11px",
            fontFamily: "var(--font-sans)",
            letterSpacing: "-0.005em",
            color: "var(--color-text-muted)",
            marginBottom: "8px",
            fontWeight: 600,
          }}>
            Proposed arguments
          </p>
          <div style={{
            borderRadius: "8px",
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-surface-1)",
            padding: "0 12px",
          }}>
            {Object.entries(event.args).map(([k, v]) => (
              <ArgRow key={k} label={k} value={v} />
            ))}
          </div>
        </div>

        {/* Hint */}
        {event.hint && (
          <div style={{ padding: "0 22px 14px" }}>
            <div style={{
              borderRadius: "8px",
              border: "1px solid rgba(120,85,240,0.2)",
              backgroundColor: "rgba(120,85,240,0.06)",
              padding: "10px 12px",
            }}>
              <p style={{
                fontSize: "11px",
                fontFamily: "var(--font-sans)",
                letterSpacing: "-0.005em",
                color: "#9b7cf6",
                marginBottom: "4px",
                fontWeight: 600,
              }}>
                Agent note
              </p>
              <p style={{
                fontSize: "12.5px",
                fontFamily: "var(--font-sans)",
                color: "var(--color-text-secondary)",
                lineHeight: 1.6,
                letterSpacing: "-0.005em",
              }}>
                {event.hint}
              </p>
            </div>
          </div>
        )}

        {/* Confirmation ID */}
        <div style={{ padding: "0 22px 12px" }}>
          <p style={{
            fontSize: "9px",
            fontFamily: "var(--font-mono)",
            color: "var(--color-text-dim)",
            letterSpacing: "0.04em",
          }}>
            confirmation_id:{" "}
            <span style={{ color: "var(--color-text-muted)" }}>{event.id}</span>
          </p>
        </div>

        {/* Action buttons */}
        <div style={{ padding: "0 22px 20px" }}>
          {decided === null ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              {/* Reject button */}
              <button
                onClick={() => handleDecide(false)}
                disabled={submitting}
                className={clsx(
                  "h-11 rounded-lg border text-sm font-semibold font-sans",
                  "transition-all",
                  "focus-visible:outline-2 focus-visible:outline-[var(--color-red)]",
                  "disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
                )}
                style={{
                  backgroundColor: "var(--color-surface-1)",
                  borderColor: "var(--color-border)",
                  color: "var(--color-text-secondary)",
                  transitionDuration: "var(--duration-fast)",
                  transitionTimingFunction: "var(--ease-out-expo)",
                }}
                onMouseEnter={(e) => {
                  const t = e.currentTarget as HTMLButtonElement;
                  t.style.borderColor = "rgba(224,58,72,0.5)";
                  t.style.color = "var(--color-red-text)";
                  t.style.backgroundColor = "var(--color-red-dim)";
                  t.style.boxShadow = "0 0 14px rgba(224,58,72,0.1)";
                }}
                onMouseLeave={(e) => {
                  const t = e.currentTarget as HTMLButtonElement;
                  t.style.borderColor = "var(--color-border)";
                  t.style.color = "var(--color-text-secondary)";
                  t.style.backgroundColor = "var(--color-surface-1)";
                  t.style.boxShadow = "none";
                }}
                onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.97)"; }}
                onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
              >
                Reject
              </button>

              {/* Approve button */}
              <button
                onClick={() => handleDecide(true)}
                disabled={submitting}
                className={clsx(
                  "h-11 rounded-lg text-sm font-semibold font-sans",
                  "transition-all",
                  "focus-visible:outline-2 focus-visible:outline-[var(--color-amber)]",
                  "disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
                )}
                style={{
                  backgroundColor: "var(--color-amber)",
                  color: "#1a0e00",
                  transitionDuration: "var(--duration-fast)",
                  transitionTimingFunction: "var(--ease-out-expo)",
                  boxShadow: "0 1px 0 rgba(255,255,255,0.15) inset",
                }}
                onMouseEnter={(e) => {
                  const t = e.currentTarget as HTMLButtonElement;
                  t.style.filter = "brightness(1.1)";
                  t.style.boxShadow = "0 1px 0 rgba(255,255,255,0.15) inset, 0 0 28px var(--color-amber-glow)";
                }}
                onMouseLeave={(e) => {
                  const t = e.currentTarget as HTMLButtonElement;
                  t.style.filter = "brightness(1)";
                  t.style.boxShadow = "0 1px 0 rgba(255,255,255,0.15) inset";
                }}
                onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.97)"; }}
                onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
              >
                Approve
              </button>
            </div>
          ) : (
            <div
              className="animate-confirm-in"
              style={{
                height: "44px",
                borderRadius: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                fontSize: "13px",
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
                border: "1px solid",
                borderColor: isApproved ? "rgba(32,204,128,0.3)" : "rgba(224,58,72,0.3)",
                backgroundColor: isApproved ? "var(--color-green-dim)" : "var(--color-red-dim)",
                color: isApproved ? "var(--color-green-text)" : "var(--color-red-text)",
              }}
            >
              {isApproved ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Approved, executing…
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                  Rejected, standing down
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
