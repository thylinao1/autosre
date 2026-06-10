"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import type { ApprovalRequestEvent, RiskTier } from "@/lib/types";
import { cleanAgentText } from "@/lib/text";

interface ApprovalModalProps {
  event: ApprovalRequestEvent;
  onDecide: (approved: boolean) => void;
  // Optional latest "Second opinion:" critique to surface in the modal.
  secondOpinion?: string;
}

// The args and hint are model-controlled, so they are a security surface: cap the
// length and always render as plain text (the JSX below never uses innerHTML).
const MAX_FIELD_CHARS = 240;

function truncate(value: string): string {
  const clean = cleanAgentText(value);
  return clean.length > MAX_FIELD_CHARS ? clean.slice(0, MAX_FIELD_CHARS) + "…" : clean;
}

const RISK_LABEL: Record<RiskTier, string> = {
  low: "Low risk",
  medium: "Medium risk",
  high: "High risk",
};

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
  const rawVal =
    typeof value === "boolean"
      ? value ? "true" : "false"
      : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
  // Args are model-controlled: cap length and render as plain text only.
  const displayVal = truncate(rawVal);

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

export function ApprovalModal({ event, onDecide, secondOpinion }: ApprovalModalProps) {
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
  const decidedState = decided === null ? "pending" : isApproved ? "approved" : "rejected";
  const risk = event.risk;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
      aria-labelledby="approval-modal-title"
      aria-describedby="approval-modal-desc"
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

      {/* Modal card - layered depth */}
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
        {/* Top accent bar - shimmer while pending, solid on decide */}
        <div
          style={{
            height: "2.5px",
            borderRadius: "12px 12px 0 0",
            transition: "background-image var(--duration-slow) var(--ease-out-expo)",
            backgroundImage: decided !== null
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
            {/* Gate seal - the visual signature of the approval moment. A shield
                glyph framed by an amber ring, sitting over the tool icon, so the
                hero moment reads as a deliberate gate rather than a generic dialog.
                Color follows the pending/approved/rejected tokens. */}
            <div
              className="gate-seal"
              data-decided={decidedState}
              style={{ flexDirection: "column", gap: "4px" }}
            >
              <div
                style={{
                  position: "relative",
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
                <span className="gate-seal-ring" aria-hidden="true" />
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
                  /* Shield + check = the gate glyph while awaiting a decision. */
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 2.5 5 5.2v5.5c0 4.4 3 7.7 7 8.8 4-1.1 7-4.4 7-8.8V5.2L12 2.5Z"/>
                    <polyline points="9 11.5 11.2 13.7 15 9.6"/>
                  </svg>
                )}
              </div>
              <span className="gate-label" aria-hidden="true">Gate</span>
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

          {/* Risk tier - makes graduated autonomy visible. Renders nothing when
              the backend did not attach a risk assessment. */}
          {risk && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
              <span className="risk-badge" data-tier={risk.tier}>
                <span className="risk-badge-dot" aria-hidden="true" />
                {RISK_LABEL[risk.tier]}
              </span>
              {risk.rationale && (
                <span style={{
                  fontSize: "11px",
                  fontFamily: "var(--font-sans)",
                  color: "var(--color-text-muted)",
                  lineHeight: 1.5,
                  letterSpacing: "-0.005em",
                }}>
                  {truncate(risk.rationale)}
                </span>
              )}
            </div>
          )}

          <p
            id="approval-modal-desc"
            style={{
              fontSize: "12.5px",
              fontFamily: "var(--font-sans)",
              color: "var(--color-text-secondary)",
              lineHeight: 1.6,
              letterSpacing: "-0.005em",
            }}
          >
            {toolCfg.description}{" "}
            <span style={{ color: "var(--color-text-muted)" }}>
              Nothing has reached production yet. This stays blocked until you decide.
            </span>
            {/* Visually-hidden so screen readers hear WHAT will run (args + agent
                note), not just the tool name, when the dialog opens. */}
            <span className="visually-hidden">
              {" "}Proposed arguments:{" "}
              {Object.entries(event.args)
                .map(([k, v]) => `${k} is ${typeof v === "object" ? truncate(JSON.stringify(v)) : truncate(String(v))}`)
                .join(", ")}
              .
              {event.hint ? ` Agent note: ${truncate(event.hint)}` : ""}
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

        {/* Hint - agent note. The hint is model-controlled: truncated and rendered
            as plain text, with a caption marking it as unverified. */}
        {event.hint && (
          <div style={{ padding: "0 22px 14px" }}>
            <div style={{
              borderRadius: "8px",
              border: "1px solid rgba(120,85,240,0.2)",
              backgroundColor: "rgba(120,85,240,0.06)",
              padding: "10px 12px",
            }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px", marginBottom: "4px" }}>
                <p style={{
                  fontSize: "11px",
                  fontFamily: "var(--font-sans)",
                  letterSpacing: "-0.005em",
                  color: "#9b7cf6",
                  fontWeight: 600,
                }}>
                  Agent note
                </p>
                <span style={{
                  fontSize: "9px",
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-text-muted)",
                  letterSpacing: "0.02em",
                  whiteSpace: "nowrap",
                }}>
                  agent-generated, unverified
                </span>
              </div>
              <p style={{
                fontSize: "12.5px",
                fontFamily: "var(--font-sans)",
                color: "var(--color-text-secondary)",
                lineHeight: 1.6,
                letterSpacing: "-0.005em",
              }}>
                {truncate(event.hint)}
              </p>
            </div>
          </div>
        )}

        {/* Second opinion - an independent critique of the proposed fix, when the
            agent ran one. Surfaced so the operator sees the dissent before deciding. */}
        {secondOpinion && (
          <div style={{ padding: "0 22px 14px" }}>
            <div style={{
              borderRadius: "8px",
              border: "1px solid rgba(0,212,240,0.2)",
              backgroundColor: "var(--color-accent-dim)",
              padding: "10px 12px",
            }}>
              <p style={{
                fontSize: "11px",
                fontFamily: "var(--font-sans)",
                letterSpacing: "-0.005em",
                color: "var(--color-accent)",
                marginBottom: "4px",
                fontWeight: 600,
              }}>
                Second opinion
              </p>
              <p style={{
                fontSize: "12.5px",
                fontFamily: "var(--font-sans)",
                color: "var(--color-text-secondary)",
                lineHeight: 1.6,
                letterSpacing: "-0.005em",
              }}>
                {truncate(secondOpinion)}
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
              {/* Reject - hover/active/focus live in CSS (.approval-btn-reject) so
                  keyboard and touch get the same affordances. */}
              <button
                onClick={() => handleDecide(false)}
                disabled={submitting}
                className="approval-btn-reject"
              >
                Reject
              </button>

              {/* Approve - see .approval-btn-approve. */}
              <button
                onClick={() => handleDecide(true)}
                disabled={submitting}
                className="approval-btn-approve"
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
