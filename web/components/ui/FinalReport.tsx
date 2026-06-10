"use client";

import type { FinalEvent } from "@/lib/types";
import { cleanAgentText } from "@/lib/text";

interface FinalReportProps {
  event: FinalEvent;
}

export function FinalReport({ event }: FinalReportProps) {
  const { service_healthy, incident_resolved, outcome } = event;
  const report = cleanAgentText(event.report);

  const isSuccess = service_healthy && incident_resolved;
  const isDeclined = outcome === "declined";
  const isClear = outcome === "all_clear";

  const borderColor = isSuccess
    ? "rgba(32,204,128,0.3)"
    : isDeclined
    ? "rgba(242,168,50,0.25)"
    : isClear
    ? "rgba(0,204,232,0.25)"
    : "var(--color-border)";

  const bgColor = isSuccess
    ? "rgba(32,204,128,0.05)"
    : isDeclined
    ? "rgba(242,168,50,0.05)"
    : isClear
    ? "rgba(0,204,232,0.05)"
    : "var(--color-surface-1)";

  const iconColor = isSuccess
    ? "var(--color-green)"
    : isDeclined
    ? "var(--color-amber)"
    : "var(--color-accent)";

  const labelColor = iconColor;

  const label = isSuccess
    ? "Incident resolved"
    : isDeclined
    ? "Remediation declined"
    : isClear
    ? "All systems clear"
    : "Run complete";

  return (
    <div
      className="animate-slide-in-up"
      style={{
        borderRadius: "8px",
        border: `1px solid ${borderColor}`,
        backgroundColor: bgColor,
        padding: "12px 14px",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
        {/* Icon */}
        <div
          style={{
            flexShrink: 0,
            width: "30px",
            height: "30px",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: isSuccess ? "var(--color-green-dim)" : "transparent",
            color: iconColor,
          }}
        >
          {isSuccess ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          ) : isDeclined ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 8 12 12 14 14"/>
            </svg>
          )}
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: "11px",
            fontFamily: "var(--font-sans)",
            letterSpacing: "-0.005em",
            color: labelColor,
            marginBottom: "4px",
            fontWeight: 600,
          }}>
            {label}
          </p>
          <p style={{
            fontSize: "12.5px",
            fontFamily: "var(--font-sans)",
            color: "var(--color-text-secondary)",
            lineHeight: 1.6,
            letterSpacing: "-0.005em",
          }}>
            {report}
          </p>
        </div>
      </div>
    </div>
  );
}
