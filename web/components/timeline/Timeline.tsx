"use client";

import { useRef } from "react";
import clsx from "clsx";
import type { TimelineEntry, Phase } from "@/lib/types";

interface TimelineProps {
  entries: TimelineEntry[];
  currentPhase: Phase | null;
}

const PHASE_ORDER: Phase[] = ["detect", "diagnose", "act", "verify"];

const phaseConfig: Record<Phase, { label: string; color: string; bg: string; border: string; glow: string }> = {
  detect: {
    label: "DETECT",
    color: "text-[var(--color-detect)]",
    bg: "bg-[var(--color-accent-dim)]",
    border: "border-[var(--color-detect)] border-opacity-40",
    glow: "shadow-[0_0_8px_var(--color-accent-glow)]",
  },
  diagnose: {
    label: "DIAGNOSE",
    color: "text-[#8060f0]",
    bg: "bg-[rgba(128,96,240,0.12)]",
    border: "border-[#8060f0] border-opacity-40",
    glow: "shadow-[0_0_8px_rgba(128,96,240,0.5)]",
  },
  act: {
    label: "ACT",
    color: "text-[var(--color-act)]",
    bg: "bg-[var(--color-amber-dim)]",
    border: "border-[var(--color-act)] border-opacity-40",
    glow: "shadow-[0_0_8px_var(--color-amber-glow)]",
  },
  verify: {
    label: "VERIFY",
    color: "text-[var(--color-verify)]",
    bg: "bg-[var(--color-green-dim)]",
    border: "border-[var(--color-verify)] border-opacity-40",
    glow: "shadow-[0_0_8px_var(--color-green-glow)]",
  },
};

const entryKindConfig: Record<
  TimelineEntry["kind"],
  { icon: React.ReactNode; dotColor: string; dotGlow: string }
> = {
  step: {
    icon: (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    ),
    dotColor: "bg-[var(--color-text-muted)]",
    dotGlow: "",
  },
  tool_call: {
    icon: (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
      </svg>
    ),
    dotColor: "bg-[var(--color-accent)]",
    dotGlow: "shadow-[0_0_5px_var(--color-accent-glow)]",
  },
  tool_result: {
    icon: (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    ),
    dotColor: "bg-[var(--color-text-secondary)]",
    dotGlow: "",
  },
  agent_message: {
    icon: (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
    dotColor: "bg-[#8060f0]",
    dotGlow: "shadow-[0_0_5px_rgba(128,96,240,0.6)]",
  },
  approval_request: {
    icon: (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    ),
    dotColor: "bg-[var(--color-amber)]",
    dotGlow: "shadow-[0_0_6px_var(--color-amber-glow)]",
  },
  approval_resolved: {
    icon: (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    ),
    dotColor: "bg-[var(--color-green)]",
    dotGlow: "shadow-[0_0_5px_var(--color-green-glow)]",
  },
  final: {
    icon: (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    ),
    dotColor: "bg-[var(--color-green)]",
    dotGlow: "shadow-[0_0_8px_var(--color-green-glow)]",
  },
  error: {
    icon: (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
    ),
    dotColor: "bg-[var(--color-red)]",
    dotGlow: "shadow-[0_0_5px_var(--color-red-glow)]",
  },
};

function PhaseHeader({ phase, isActive, isDone }: { phase: Phase; isActive: boolean; isDone: boolean }) {
  const cfg = phaseConfig[phase];
  return (
    <div
      className={clsx(
        "flex items-center gap-2 py-1.5",
        "text-[10px] font-mono font-semibold uppercase tracking-widest",
        "transition-colors duration-300",
        isDone ? "text-[var(--color-text-dim)]" : isActive ? cfg.color : "text-[var(--color-text-dim)]"
      )}
    >
      <div
        className={clsx(
          "w-4 h-4 rounded flex items-center justify-center border text-[8px]",
          "transition-all duration-300",
          isDone
            ? "border-[var(--color-border)] text-[var(--color-text-muted)]"
            : isActive
            ? clsx(cfg.bg, cfg.border, cfg.color, cfg.glow)
            : "border-[var(--color-border-subtle)] text-[var(--color-text-dim)]"
        )}
      >
        {isDone ? (
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        ) : (
          PHASE_ORDER.indexOf(phase) + 1
        )}
      </div>
      {cfg.label}
      {isActive && (
        <span className="w-1 h-1 rounded-full bg-current animate-pulse-glow" />
      )}
    </div>
  );
}

interface EntryRowProps {
  entry: TimelineEntry;
  isLast: boolean;
  isNewest: boolean;
  staggerIndex: number;
}

function EntryRow({ entry, isLast, isNewest, staggerIndex }: EntryRowProps) {
  const cfg = entryKindConfig[entry.kind] ?? entryKindConfig.tool_call;
  const isStep = entry.kind === "step";
  const isApproval = entry.kind === "approval_request";
  const isError = entry.kind === "error";
  const isAgentMsg = entry.kind === "agent_message";

  if (isStep) return null;

  const staggerDelay = Math.min(staggerIndex * 40, 200);

  return (
    <div
      className={clsx(
        "flex gap-3 pl-6 animate-timeline-in",
        isNewest && "entry-flash-once",
        isLast ? "" : "pb-1"
      )}
      style={{
        animationDelay: `${staggerDelay}ms`,
        ...(isNewest
          ? {
              animation: `timeline-entry-in var(--duration-slow) var(--ease-out-expo) both,
                          entry-flash var(--duration-xslow) var(--ease-out-quart) both`,
            }
          : undefined),
      }}
    >
      {/* Connector line + dot */}
      <div className="flex flex-col items-center flex-shrink-0 w-3 -mt-0.5">
        <div
          className={clsx(
            "w-2 h-2 rounded-full flex-shrink-0 mt-1 transition-all duration-300",
            cfg.dotColor,
            cfg.dotGlow
          )}
        />
        {!isLast && (
          <div className="w-px flex-1 bg-[var(--color-border-subtle)] mt-1" />
        )}
      </div>

      {/* Content */}
      <div
        className={clsx(
          "flex-1 min-w-0 pb-3",
          isApproval ? "text-[var(--color-amber)]" : isError ? "text-[var(--color-red-text)]" : ""
        )}
      >
        <p
          className={clsx(
            "text-xs font-mono leading-snug",
            isAgentMsg
              ? "text-[var(--color-text-secondary)] italic"
              : isApproval
              ? "text-[var(--color-amber)] font-medium"
              : isError
              ? "text-[var(--color-red-text)]"
              : "text-[var(--color-text-primary)]"
          )}
        >
          {entry.label}
        </p>
        {entry.detail && (
          <p className="text-[11px] font-mono text-[var(--color-text-muted)] mt-0.5 leading-snug line-clamp-2">
            {entry.detail}
          </p>
        )}
      </div>
    </div>
  );
}

export function Timeline({ entries, currentPhase }: TimelineProps) {
  const prevCountRef = useRef(0);
  const renderedCount = entries.filter((e) => e.kind !== "step").length;

  // Group entries by phase
  const phaseEntries = PHASE_ORDER.reduce<Record<Phase, TimelineEntry[]>>(
    (acc, phase) => {
      acc[phase] = [];
      return acc;
    },
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

  // Track which entries are "new" since last render for flash effect
  const newEntriesThreshold = prevCountRef.current;
  prevCountRef.current = renderedCount;

  if (!hasAnyEntry) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div
          className="w-10 h-10 rounded-lg border border-[var(--color-border)] flex items-center justify-center mb-4"
          style={{ transition: "border-color var(--duration-normal) var(--ease-out-expo)" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
        </div>
        <p className="text-xs font-mono text-[var(--color-text-muted)]">
          Start an incident sweep to see the agent&apos;s reasoning
        </p>
      </div>
    );
  }

  return (
    <div className="py-3 px-4 space-y-1 overflow-y-auto max-h-full">
      {PHASE_ORDER.map((phase, i) => {
        const phaseItemEntries = phaseEntries[phase];
        const isActive = currentPhase === phase;
        const isDone = activePhaseIndex > i;
        const hasItems = phaseItemEntries.length > 0;

        if (!hasItems && !isActive && !isDone && i > activePhaseIndex + 1) return null;

        const visibleEntries = phaseItemEntries.filter((e) => e.kind !== "step");

        return (
          <div key={phase}>
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
                  />
                );
              })}
              {/* Active phase "thinking" indicator */}
              {isActive && visibleEntries.length === 0 && (
                <div className="flex gap-3 pl-6 pb-3 animate-fade-in">
                  <div className="flex flex-col items-center flex-shrink-0 w-3">
                    <div className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-status-blink mt-1" />
                  </div>
                  <p className="text-[11px] font-mono text-[var(--color-accent)] italic">
                    processing…
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
