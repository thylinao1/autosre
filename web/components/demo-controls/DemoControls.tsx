"use client";

import { useState } from "react";
import clsx from "clsx";
import type { FaultType, RunStatus } from "@/lib/types";

interface DemoControlsProps {
  status: RunStatus;
  onStart: (inject: FaultType | null) => void;
  onReset: () => void;
}

const faultOptions: { value: FaultType; label: string; description: string; badge: string; color: string; dim: string; textColor: string }[] = [
  {
    value: "payment_errors",
    label: "Payment Errors",
    description: "22% checkout failure rate after deploy v2.3.1 enables bad feature flag",
    badge: "Availability",
    color: "var(--color-red)",
    dim: "var(--color-red-dim)",
    textColor: "var(--color-red-text)",
  },
  {
    value: "latency_spike",
    label: "Latency Spike",
    description: "P99 4,200ms, checkout-api under-provisioned and needs scaling",
    badge: "Performance",
    color: "var(--color-orange)",
    dim: "var(--color-orange-dim)",
    textColor: "var(--color-orange-text)",
  },
];

export function DemoControls({ status, onStart, onReset }: DemoControlsProps) {
  const [selectedFault, setSelectedFault] = useState<FaultType>("payment_errors");
  const [isExpanded, setIsExpanded] = useState(true);

  const isActive = status !== "idle" && status !== "error";
  const isTerminal = status === "resolved" || status === "declined" || status === "all_clear";

  const selectedOpt = faultOptions.find((o) => o.value === selectedFault) ?? faultOptions[0];
  const runLabel = isTerminal
    ? "Reset & Run Again"
    : `Run: ${selectedOpt.label}`;

  return (
    <div
      style={{
        borderRadius: "8px",
        border: "1px solid var(--color-border)",
        backgroundColor: "var(--color-surface-0)",
        overflow: "hidden",
      }}
    >
      {/* Collapsible header */}
      <button
        onClick={() => setIsExpanded((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          backgroundColor: "transparent",
          border: "none",
          cursor: "pointer",
          transition: `background-color var(--duration-fast) ease`,
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--color-surface-1)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polygon points="10 8 16 12 10 16 10 8"/>
          </svg>
          <span style={{
            fontSize: "11.5px",
            fontFamily: "var(--font-sans)",
            fontWeight: 600,
            letterSpacing: "-0.005em",
            color: "var(--color-text-secondary)",
          }}>
            Demo controls
          </span>
        </div>
        <svg
          width="9"
          height="9"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-text-dim)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transition: `transform var(--duration-fast) var(--ease-out-expo)`,
            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          <polyline points="18 15 12 9 6 15"/>
        </svg>
      </button>

      {isExpanded && (
        <div
          style={{
            padding: "0 12px 12px",
            borderTop: "1px solid var(--color-border-subtle)",
          }}
        >
          {/* Fault selector */}
          {!isActive && (
            <div style={{ marginBottom: "10px" }}>
              <p style={{
                fontSize: "11px",
                fontFamily: "var(--font-sans)",
                letterSpacing: "-0.005em",
                color: "var(--color-text-muted)",
                padding: "9px 0 7px",
                fontWeight: 600,
              }}>
                Inject fault
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {faultOptions.map((opt) => {
                  const isSelected = selectedFault === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setSelectedFault(opt.value)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        borderRadius: "6px",
                        border: "1px solid",
                        padding: "9px 11px",
                        cursor: "pointer",
                        transition: `all var(--duration-fast) var(--ease-out-expo)`,
                        borderColor: isSelected ? opt.color + "60" : "var(--color-border)",
                        backgroundColor: isSelected ? opt.dim : "var(--color-surface-1)",
                        boxShadow: isSelected ? `0 0 10px ${opt.dim}` : "none",
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          const t = e.currentTarget as HTMLButtonElement;
                          t.style.borderColor = "var(--color-border-strong)";
                          t.style.backgroundColor = "var(--color-surface-2)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          const t = e.currentTarget as HTMLButtonElement;
                          t.style.borderColor = "var(--color-border)";
                          t.style.backgroundColor = "var(--color-surface-1)";
                        }
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                        <span
                          style={{
                            fontSize: "10px",
                            fontFamily: "var(--font-sans)",
                            fontWeight: 600,
                            letterSpacing: "-0.005em",
                            padding: "1.5px 7px",
                            borderRadius: "4px",
                            color: opt.textColor,
                            backgroundColor: opt.dim,
                            border: `1px solid ${opt.color}40`,
                          }}
                        >
                          {opt.badge}
                        </span>
                        <span style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          color: isSelected ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                          transition: "color var(--duration-fast) ease",
                        }}>
                          {opt.label}
                        </span>
                      </div>
                      <p style={{
                        fontSize: "11px",
                        fontFamily: "var(--font-sans)",
                        color: isSelected ? "var(--color-text-secondary)" : "var(--color-text-muted)",
                        lineHeight: 1.5,
                        transition: "color var(--duration-fast) ease",
                      }}>
                        {opt.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action area: stack full-width buttons so labels always fit */}
          {isTerminal ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "2px" }}>
              <RunButton
                label={`Run ${selectedOpt.label} Again`}
                onClick={() => onStart(selectedFault)}
                variant="primary"
              />
              <RunButton
                label="Reset to Standby"
                onClick={() => onReset()}
                variant="secondary"
              />
            </div>
          ) : !isActive ? (
            <div style={{ marginTop: "2px" }}>
              <RunButton
                label={runLabel}
                onClick={() => onStart(selectedFault)}
                variant="primary"
              />
            </div>
          ) : (
            <div style={{ marginTop: "10px" }}>
              <div style={{
                height: "36px",
                borderRadius: "7px",
                border: "1px solid var(--color-border)",
                backgroundColor: "var(--color-surface-1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "7px",
              }}>
                <span
                  style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--color-accent)" }}
                  className="animate-status-blink"
                />
                <span style={{ fontSize: "12px", fontFamily: "var(--font-sans)", color: "var(--color-accent)" }}>
                  {status === "awaiting_approval" ? "Awaiting your approval" : "Agent running…"}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RunButton({
  label,
  onClick,
  variant,
}: {
  label: string;
  onClick: () => void;
  variant: "primary" | "secondary";
}) {
  const isPrimary = variant === "primary";

  return (
    <button
      onClick={onClick}
      className={clsx(
        "font-sans font-semibold rounded-[7px] w-full",
        "focus-visible:outline-2 focus-visible:outline-offset-2",
        isPrimary
          ? "focus-visible:outline-[var(--color-accent)]"
          : "focus-visible:outline-[var(--color-border-strong)]"
      )}
      style={{
        width: "100%",
        height: "38px",
        fontSize: "13px",
        cursor: "pointer",
        border: isPrimary ? "none" : "1px solid var(--color-border)",
        backgroundColor: isPrimary ? "var(--color-accent)" : "var(--color-surface-2)",
        color: isPrimary ? "var(--color-bg)" : "var(--color-text-secondary)",
        fontFamily: "var(--font-sans)",
        letterSpacing: "-0.01em",
        transition: `all var(--duration-fast) var(--ease-out-expo)`,
        boxShadow: isPrimary ? "inset 0 1px 0 rgba(255,255,255,0.12)" : "none",
      }}
      onMouseEnter={(e) => {
        const t = e.currentTarget as HTMLButtonElement;
        if (isPrimary) {
          t.style.filter = "brightness(1.1)";
          t.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.12), 0 0 20px var(--color-accent-glow)";
        } else {
          t.style.borderColor = "var(--color-border-strong)";
          t.style.color = "var(--color-text-primary)";
        }
      }}
      onMouseLeave={(e) => {
        const t = e.currentTarget as HTMLButtonElement;
        if (isPrimary) {
          t.style.filter = "brightness(1)";
          t.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.12)";
        } else {
          t.style.borderColor = "var(--color-border)";
          t.style.color = "var(--color-text-secondary)";
        }
      }}
      onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.97)"; }}
      onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
    >
      {label}
    </button>
  );
}
