"use client";

import { useRef } from "react";
import clsx from "clsx";
import type { TimelineEntry, Phase } from "@/lib/types";
import { cleanAgentText } from "@/lib/text";

interface TimelineProps {
  entries: TimelineEntry[];
  currentPhase: Phase | null;
  // True while a run is in flight. Lets the empty state read as "agent waking"
  // instead of the idle prompt during the model's first-token / cold-start gap.
  isBusy?: boolean;
}

const PHASE_ORDER: Phase[] = ["detect", "diagnose", "act", "verify"];

const phaseConfig: Record<Phase, { label: string; color: string; bg: string; glow: string; dotColor: string }> = {
  detect: {
    label: "Detect",
    color: "var(--color-detect)",
    bg: "var(--color-accent-dim)",
    glow: "0 0 8px rgba(0,204,232,0.45)",
    dotColor: "var(--color-detect)",
  },
  diagnose: {
    label: "Diagnose",
    color: "var(--color-diagnose)",
    bg: "rgba(120,85,240,0.12)",
    glow: "0 0 8px rgba(120,85,240,0.45)",
    dotColor: "var(--color-diagnose)",
  },
  act: {
    label: "Act",
    color: "var(--color-act)",
    bg: "var(--color-amber-dim)",
    glow: "0 0 8px rgba(242,168,50,0.45)",
    dotColor: "var(--color-act)",
  },
  verify: {
    label: "Verify",
    color: "var(--color-verify)",
    bg: "var(--color-green-dim)",
    glow: "0 0 8px rgba(32,204,128,0.45)",
    dotColor: "var(--color-verify)",
  },
};

const entryKindConfig: Record<
  TimelineEntry["kind"],
  { icon: React.ReactNode; dotColor: string; dotGlow: string }
> = {
  step: {
    icon: null,
    dotColor: "var(--color-text-dim)",
    dotGlow: "",
  },
  tool_call: {
    icon: (
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
      </svg>
    ),
    dotColor: "var(--color-accent)",
    dotGlow: "0 0 5px var(--color-accent-glow)",
  },
  tool_result: {
    icon: (
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    ),
    dotColor: "var(--color-text-secondary)",
    dotGlow: "",
  },
  agent_message: {
    icon: (
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
    dotColor: "var(--color-diagnose)",
    dotGlow: "0 0 5px rgba(120,85,240,0.5)",
  },
  approval_request: {
    icon: (
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    ),
    dotColor: "var(--color-amber)",
    dotGlow: "0 0 6px var(--color-amber-glow)",
  },
  approval_resolved: {
    icon: (
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    ),
    dotColor: "var(--color-green)",
    dotGlow: "0 0 5px var(--color-green-glow)",
  },
  final: {
    icon: (
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    ),
    dotColor: "var(--color-green)",
    dotGlow: "0 0 8px var(--color-green-glow)",
  },
  error: {
    icon: (
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
    ),
    dotColor: "var(--color-red)",
    dotGlow: "0 0 5px var(--color-red-glow)",
  },
};

function PhaseHeader({ phase, isActive, isDone }: { phase: Phase; isActive: boolean; isDone: boolean }) {
  const cfg = phaseConfig[phase];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "2px 0 9px",
        fontSize: "11.5px",
        fontFamily: "var(--font-sans)",
        fontWeight: 600,
        letterSpacing: "-0.005em",
        transition: "color 0.3s ease",
        color: isDone ? "var(--color-text-dim)" : isActive ? cfg.color : "var(--color-text-dim)",
      }}
    >
      {/* Phase number/check badge */}
      <div
        style={{
          width: "15px",
          height: "15px",
          borderRadius: "4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid",
          fontSize: "7.5px",
          flexShrink: 0,
          transition: "all 0.3s ease",
          borderColor: isDone
            ? "var(--color-border)"
            : isActive
            ? cfg.color
            : "var(--color-border-subtle)",
          backgroundColor: isActive ? cfg.bg : "transparent",
          color: isDone ? "var(--color-text-dim)" : isActive ? cfg.color : "var(--color-text-dim)",
          boxShadow: isActive ? cfg.glow : "none",
        }}
      >
        {isDone ? (
          <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        ) : (
          PHASE_ORDER.indexOf(phase) + 1
        )}
      </div>
      {cfg.label}
      {isActive && (
        <span
          style={{
            width: "5px",
            height: "5px",
            borderRadius: "50%",
            backgroundColor: "currentColor",
          }}
          className="animate-pulse-glow"
        />
      )}
      {/* Hairline rule in the phase color, fading right: gives each phase a
          horizon line instead of a bare label. */}
      <div
        aria-hidden
        style={{
          flex: 1,
          height: "1px",
          marginLeft: "4px",
          background: isActive
            ? `linear-gradient(to right, color-mix(in srgb, ${cfg.color} 40%, transparent), transparent)`
            : "linear-gradient(to right, var(--color-border-subtle), transparent)",
          transition: "opacity 0.3s ease",
        }}
      />
    </div>
  );
}

interface EntryRowProps {
  entry: TimelineEntry;
  isLast: boolean;
  isNewest: boolean;
  staggerIndex: number;
  phaseColor: string;
}

function EntryRow({ entry, isLast, isNewest, staggerIndex, phaseColor }: EntryRowProps) {
  const cfg = entryKindConfig[entry.kind] ?? entryKindConfig.tool_call;
  const isStep = entry.kind === "step";
  const isApproval = entry.kind === "approval_request";
  const isError = entry.kind === "error";
  const isAgentMsg = entry.kind === "agent_message";
  const isToolCall = entry.kind === "tool_call";

  if (isStep) return null;

  /* Emil stagger: 40ms per entry, cap at 200ms */
  const staggerDelay = Math.min(staggerIndex * 40, 200);

  const label = cleanAgentText(entry.label);
  const detail = entry.detail ? cleanAgentText(entry.detail) : null;

  return (
    <div
      className="animate-timeline-in"
      style={{
        display: "flex",
        gap: "13px",
        paddingLeft: "20px",
        animationDelay: `${staggerDelay}ms`,
        ...(isNewest
          ? {
              animation: `timeline-entry-in var(--duration-slow) var(--ease-out-expo) ${staggerDelay}ms both, entry-flash var(--duration-xslow) var(--ease-out-quart) ${staggerDelay}ms both`,
            }
          : undefined),
      }}
    >
      {/* Connector: dot + a phase-tinted line that fades as it descends */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: "10px", marginTop: "1px" }}>
        <div
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            flexShrink: 0,
            marginTop: "4px",
            backgroundColor: cfg.dotColor,
            boxShadow: cfg.dotGlow,
            transition: "all 0.3s ease",
          }}
        />
        {!isLast && (
          <div
            style={{
              width: "1px",
              flex: 1,
              marginTop: "2px",
              background: `linear-gradient(to bottom, color-mix(in srgb, ${phaseColor} 35%, transparent), var(--color-border-subtle))`,
            }}
          />
        )}
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          paddingBottom: "17px",
        }}
      >
        {isAgentMsg ? (
          /* The agent thinking out loud: a quiet quote block in the body face,
             visually distinct from the machine rows around it. */
          <div
            style={{
              borderLeft: `2px solid color-mix(in srgb, var(--color-diagnose) 55%, transparent)`,
              backgroundColor: "color-mix(in srgb, var(--color-diagnose) 6%, transparent)",
              borderRadius: "0 8px 8px 0",
              padding: "7px 11px 8px",
            }}
          >
            <p
              style={{
                fontSize: "12.5px",
                fontFamily: "var(--font-sans)",
                lineHeight: 1.6,
                letterSpacing: "-0.005em",
                color: "var(--color-text-secondary)",
              }}
            >
              {label}
            </p>
            {detail && (
              <p
                style={{
                  fontSize: "12px",
                  fontFamily: "var(--font-sans)",
                  color: "var(--color-text-muted)",
                  marginTop: "4px",
                  lineHeight: 1.55,
                  letterSpacing: "-0.005em",
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {detail}
              </p>
            )}
          </div>
        ) : (
          <p
            style={{
              fontSize: "12px",
              fontFamily: "var(--font-mono)",
              lineHeight: 1.55,
              color: isApproval
                ? "var(--color-amber)"
                : isError
                ? "var(--color-red-text)"
                : "var(--color-text-primary)",
              fontWeight: isApproval ? 500 : 400,
              ...(isToolCall
                ? {
                    display: "inline-block",
                    padding: "2px 8px",
                    borderRadius: "6px",
                    backgroundColor: "color-mix(in srgb, var(--color-accent) 7%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--color-accent) 16%, transparent)",
                  }
                : undefined),
            }}
          >
            {label}
          </p>
        )}
        {detail && !isAgentMsg && (
          <p
            style={{
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              color: "var(--color-text-muted)",
              marginTop: "4px",
              lineHeight: 1.5,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {detail}
          </p>
        )}
      </div>
    </div>
  );
}

export function Timeline({ entries, currentPhase, isBusy = false }: TimelineProps) {
  const prevCountRef = useRef(0);
  const renderedCount = entries.filter((e) => e.kind !== "step").length;

  const phaseEntries = PHASE_ORDER.reduce<Record<Phase, TimelineEntry[]>>(
    (acc, phase) => { acc[phase] = []; return acc; },
    { detect: [], diagnose: [], act: [], verify: [] }
  );

  let currentGroup: Phase = "detect";
  let globalNonStepIndex = 0;

  for (const entry of entries) {
    if (entry.kind === "step" && entry.phase) {
      currentGroup = entry.phase;
      phaseEntries[currentGroup].push(entry);
    } else {
      phaseEntries[currentGroup].push(entry);
    }
  }

  const activePhaseIndex = currentPhase ? PHASE_ORDER.indexOf(currentPhase) : -1;
  const hasAnyEntry = entries.length > 0;

  const newEntriesThreshold = prevCountRef.current;
  prevCountRef.current = renderedCount;

  if (!hasAnyEntry) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100%",
          padding: "56px 24px",
          textAlign: "center",
          gap: "14px",
        }}
      >
        {/* Icon - breathes gently when idle, pulses an accent ring when working */}
        <div
          className={isBusy ? "animate-pulse-glow" : "animate-idle-breathe"}
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "12px",
            border: `1px solid ${isBusy ? "var(--color-accent)" : "var(--color-border)"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: isBusy ? "var(--color-accent-dim)" : "var(--color-surface-0)",
            boxShadow: isBusy ? "0 0 16px var(--color-accent-glow)" : "none",
            transition: "border-color 0.4s ease, background-color 0.4s ease",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isBusy ? "var(--color-accent)" : "var(--color-text-muted)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
        </div>
        <div>
          <p style={{
            fontSize: "13px",
            fontFamily: "var(--font-sans)",
            color: isBusy ? "var(--color-accent)" : "var(--color-text-secondary)",
            lineHeight: 1.6,
            letterSpacing: "-0.005em",
            fontWeight: isBusy ? 600 : 400,
          }}>
            {isBusy ? "Agent waking - querying Dynatrace…" : "Run an incident to watch the agent work."}
          </p>
          <p style={{
            fontSize: "12.5px",
            fontFamily: "var(--font-sans)",
            color: "var(--color-text-muted)",
            letterSpacing: "-0.005em",
          }}>
            {isBusy
              ? "Detecting open problems, then reasoning to root cause. Steps stream in here."
              : "Its reasoning shows up here, step by step."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 20px", overflowY: "auto", maxHeight: "100%" }}>
      {PHASE_ORDER.map((phase, i) => {
        const phaseItemEntries = phaseEntries[phase];
        const isActive = currentPhase === phase;
        const isDone = activePhaseIndex > i;
        const hasItems = phaseItemEntries.length > 0;

        if (!hasItems && !isActive && !isDone && i > activePhaseIndex + 1) return null;

        const visibleEntries = phaseItemEntries.filter((e) => e.kind !== "step");

        return (
          <div key={phase} style={{ marginBottom: "10px" }}>
            {(hasItems || isActive) && (
              <PhaseHeader phase={phase} isActive={isActive} isDone={isDone} />
            )}
            <div>
              {visibleEntries.map((entry, idx, arr) => {
                const globalIdx = globalNonStepIndex++;
                const isNewest = globalIdx >= newEntriesThreshold && newEntriesThreshold > 0;
                return (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    isLast={idx === arr.length - 1 && i === activePhaseIndex}
                    isNewest={isNewest}
                    staggerIndex={idx}
                    phaseColor={phaseConfig[phase].color}
                  />
                );
              })}
              {/* Active phase "processing" indicator */}
              {isActive && visibleEntries.length === 0 && (
                <div
                  className="animate-fade-in"
                  style={{ display: "flex", gap: "10px", paddingLeft: "18px", paddingBottom: "10px" }}
                >
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: "10px", marginTop: "1px" }}>
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        marginTop: "4px",
                        backgroundColor: "var(--color-accent)",
                      }}
                      className="animate-status-blink"
                    />
                  </div>
                  <span style={{ display: "inline-flex", gap: "4px", alignItems: "center", paddingTop: "7px" }} aria-label="processing">
                    {[0, 1, 2].map((d) => (
                      <span
                        key={d}
                        className="typing-dot"
                        style={{
                          width: "4px",
                          height: "4px",
                          borderRadius: "50%",
                          backgroundColor: "var(--color-accent)",
                          animationDelay: `${d * 160}ms`,
                        }}
                      />
                    ))}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
