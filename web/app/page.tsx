"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { useIncidentStream } from "@/hooks/useIncidentStream";
import { ProblemCard } from "@/components/problem-card/ProblemCard";
import { Timeline } from "@/components/timeline/Timeline";
import { DqlPanel } from "@/components/dql-panel/DqlPanel";
import { ApprovalModal } from "@/components/approval-modal/ApprovalModal";
import { DemoControls } from "@/components/demo-controls/DemoControls";
import { FinalReport } from "@/components/ui/FinalReport";
import type { FaultType, ServiceHealth } from "@/lib/types";
import { getHealth } from "@/lib/api";

export default function MissionControlPage() {
  const { state, startIncident, approve, reset } = useIncidentStream();
  const [serviceHealth, setServiceHealth] = useState<ServiceHealth | null>(null);

  useEffect(() => {
    getHealth()
      .then(setServiceHealth)
      .catch(() => null);
  }, []);

  function handleStart(inject: FaultType | null) {
    startIncident(inject);
  }

  function handleApprove(approved: boolean) {
    approve(approved);
  }

  async function handleReset() {
    await reset();
    const h = await getHealth().catch(() => null);
    if (h) setServiceHealth(h);
  }

  const isBusy = state.status === "starting" || state.status === "running";
  const isTerminal =
    state.status === "resolved" ||
    state.status === "declined" ||
    state.status === "all_clear" ||
    state.status === "error";

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Top navigation bar ── */}
      <header
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 1.5rem",
          height: "48px",
          borderBottom: "1px solid var(--color-border-subtle)",
          backgroundColor: "var(--color-surface-0)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--color-accent-dim)",
              border: "1px solid rgba(0,200,224,0.4)",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2.5">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
            <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text-primary)", letterSpacing: "-0.01em" }}>
              AutoSRE
            </span>
            <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--color-text-muted)" }}>
              Mission Control
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                flexShrink: 0,
                transition: "background-color 0.5s ease, box-shadow 0.5s ease",
                backgroundColor:
                  state.status === "resolved" || state.status === "all_clear" ? "var(--color-green)" :
                  state.status === "awaiting_approval" ? "var(--color-amber)" :
                  isBusy ? "var(--color-accent)" :
                  state.status === "error" ? "var(--color-red)" :
                  "var(--color-text-dim)",
                boxShadow:
                  state.status === "resolved" || state.status === "all_clear" ? "0 0 6px var(--color-green-glow)" :
                  state.status === "awaiting_approval" ? "0 0 6px var(--color-amber-glow)" :
                  isBusy ? "0 0 5px var(--color-accent-glow)" :
                  "none",
                animation: (isBusy || state.status === "awaiting_approval") ? "status-blink 1.4s ease-in-out infinite" : "none",
              }}
            />
            {state.status === "idle" && "STANDBY"}
            {state.status === "starting" && "STARTING"}
            {state.status === "running" && "RUNNING"}
            {state.status === "awaiting_approval" && "APPROVAL"}
            {state.status === "resolved" && "RESOLVED"}
            {state.status === "declined" && "DECLINED"}
            {state.status === "all_clear" && "CLEAR"}
            {state.status === "error" && "ERROR"}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--color-accent)", flexShrink: 0 }} />
            <span className="hidden xs:inline">Dynatrace MCP</span>
          </div>
          <div className="hidden md:flex" style={{ alignItems: "center", gap: "6px", fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--color-text-dim)", flexShrink: 0 }} />
            Vertex AI
          </div>
        </div>
      </header>

      {/* ── Main 3-column grid ── */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {/* 3-column layout via CSS grid — inline for full control */}
        <div
          className="layout-desktop"
          style={{
            gridTemplateColumns: "clamp(280px, 22vw, 340px) 1fr clamp(240px, 20vw, 300px)",
            minHeight: 0,
            height: "calc(100vh - 48px)",
          }}
        >
          {/* Left sidebar */}
          <LeftSidebar
            state={state}
            serviceHealth={serviceHealth}
            onStart={handleStart}
            onReset={handleReset}
          />

          {/* Center timeline */}
          <CenterTimeline state={state} isBusy={isBusy} isTerminal={isTerminal} />

          {/* Right DQL panel */}
          <RightPanel state={state} />
        </div>

        {/* Mobile: stacked layout */}
        <div className="layout-mobile" style={{ flexDirection: "column", overflowY: "auto", padding: "16px", gap: "16px" }}>
          {state.status === "error" && state.errorMessage && (
            <div style={{ borderRadius: "8px", border: "1px solid rgba(224,60,74,0.4)", backgroundColor: "var(--color-red-dim)", padding: "12px" }}>
              <p style={{ fontSize: "10px", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-red-text)", marginBottom: "4px" }}>Error</p>
              <p style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>{state.errorMessage}</p>
            </div>
          )}
          <ProblemCard problem={state.problem} status={state.status} health={serviceHealth} currentPhase={state.currentPhase} />
          {state.finalEvent && <FinalReport event={state.finalEvent} />}
          <DemoControls status={state.status} onStart={handleStart} onReset={handleReset} />
          <div style={{ border: "1px solid var(--color-border)", borderRadius: "8px", overflow: "hidden" }}>
            <div style={{ borderBottom: "1px solid var(--color-border-subtle)", padding: "8px 16px" }}>
              <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-text-muted)" }}>Agent Timeline</span>
            </div>
            <Timeline entries={state.timeline} currentPhase={state.currentPhase} />
          </div>
          <div style={{ border: "1px solid var(--color-border)", borderRadius: "8px", overflow: "hidden" }}>
            <div style={{ borderBottom: "1px solid var(--color-border-subtle)", padding: "8px 16px" }}>
              <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-text-muted)" }}>DQL Evidence</span>
            </div>
            <DqlPanel query={state.dqlQuery} records={state.dqlRecords} reasoning={state.agentReasoning} />
          </div>
        </div>
      </main>

      {/* Approval modal */}
      {state.pendingApproval && (
        <ApprovalModal event={state.pendingApproval} onDecide={handleApprove} />
      )}
    </div>
  );
}

// ── Sub-components for the 3-column layout ──────────────────────────

function LeftSidebar({
  state,
  serviceHealth,
  onStart,
  onReset,
}: {
  state: ReturnType<typeof useIncidentStream>["state"];
  serviceHealth: ServiceHealth | null;
  onStart: (inject: FaultType | null) => void;
  onReset: () => Promise<void>;
}) {
  return (
    <aside
      style={{
        borderRight: "1px solid var(--color-border-subtle)",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        padding: "16px",
        overflowY: "auto",
      }}
    >
      {state.status === "error" && state.errorMessage && (
        <div style={{ borderRadius: "8px", border: "1px solid rgba(224,60,74,0.4)", backgroundColor: "var(--color-red-dim)", padding: "12px" }} className="animate-slide-in-up">
          <p style={{ fontSize: "10px", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-red-text)", marginBottom: "4px" }}>Error</p>
          <p style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>{state.errorMessage}</p>
        </div>
      )}

      <ProblemCard
        problem={state.problem}
        status={state.status}
        health={serviceHealth}
        currentPhase={state.currentPhase}
      />

      {state.finalEvent && <FinalReport event={state.finalEvent} />}

      <hr style={{ border: "none", borderTop: "1px solid var(--color-border-subtle)" }} />

      <DemoControls status={state.status} onStart={onStart} onReset={onReset} />

      {/* Stack info */}
      <div
        style={{
          borderRadius: "8px",
          border: "1px solid var(--color-border-subtle)",
          backgroundColor: "var(--color-surface-0)",
          padding: "12px",
          marginTop: "auto",
        }}
      >
        <p style={{ fontSize: "10px", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-text-muted)", marginBottom: "8px" }}>
          Agent Stack
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {[
            ["Agent", "ADK · Gemini 3"],
            ["Runtime", "Vertex AI Agent Engine"],
            ["Senses", "Dynatrace MCP"],
            ["Gate", "require_confirmation"],
            ["Target", "checkout-api"],
          ].map(([label, value]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>{label}</span>
              <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function CenterTimeline({
  state,
  isBusy,
  isTerminal,
}: {
  state: ReturnType<typeof useIncidentStream>["state"];
  isBusy: boolean;
  isTerminal: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
        borderRight: "1px solid var(--color-border-subtle)",
      }}
    >
      {/* Header */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 16px",
          borderBottom: "1px solid var(--color-border-subtle)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-text-muted)" }}>
            Agent Timeline
          </span>
          {isBusy && (
            <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--color-accent)" }}>
              — live
            </span>
          )}
        </div>
        {state.runId && (
          <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--color-text-dim)" }}>
            {state.runId.slice(0, 8)}
          </span>
        )}
      </div>

      {/* Progress scan */}
      {isBusy && (
        <div style={{ height: "2px", position: "relative", overflow: "hidden", flexShrink: 0, backgroundColor: "var(--color-surface-2)" }}>
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              width: "25%",
              background: "linear-gradient(90deg, transparent, var(--color-accent-glow), transparent)",
              animation: "scan-progress 1.4s ease-in-out infinite",
            }}
          />
        </div>
      )}

      {/* Timeline feed */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <Timeline entries={state.timeline} currentPhase={state.currentPhase} />
      </div>

      {/* Phase progress bar */}
      {(state.currentPhase || isTerminal) && (
        <div
          style={{
            flexShrink: 0,
            borderTop: "1px solid var(--color-border-subtle)",
            padding: "12px 16px",
          }}
        >
          <div style={{ display: "flex", gap: "4px", marginBottom: "6px" }}>
            {(["detect", "diagnose", "act", "verify"] as const).map((phase) => {
              const phases = ["detect", "diagnose", "act", "verify"] as const;
              const currentIdx = state.currentPhase ? phases.indexOf(state.currentPhase) : -1;
              const phaseIdx = phases.indexOf(phase);
              const isDone = isTerminal || phaseIdx < currentIdx;
              const isActive = phase === state.currentPhase;

              const activeColors: Record<string, string> = {
                detect: "var(--color-detect)",
                diagnose: "#8060f0",
                act: "var(--color-act)",
                verify: "var(--color-verify)",
              };
              const activeGlow: Record<string, string> = {
                detect: "0 0 6px 1px rgba(0,200,224,0.55)",
                diagnose: "0 0 6px 1px rgba(128,96,240,0.55)",
                act: "0 0 6px 1px rgba(240,160,48,0.55)",
                verify: "0 0 6px 1px rgba(34,200,128,0.55)",
              };
              const fillColor = isDone
                ? isTerminal && phase === "verify" ? "var(--color-green)" : "var(--color-accent)"
                : isActive ? activeColors[phase]
                : "transparent";

              return (
                <div
                  key={phase}
                  style={{
                    flex: 1,
                    height: "3px",
                    borderRadius: "2px",
                    overflow: "hidden",
                    backgroundColor: "var(--color-border)",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: "2px",
                      backgroundColor: fillColor,
                      opacity: isDone ? 0.7 : isActive ? 1 : 0,
                      boxShadow: isActive ? activeGlow[phase] : "none",
                      transform: `scaleX(${isDone || isActive ? 1 : 0})`,
                      transformOrigin: "left",
                      transition: "transform 0.55s cubic-bezier(0.16,1,0.3,1), opacity 0.4s ease, background-color 0.6s ease, box-shadow 0.4s ease",
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            {(["detect", "diagnose", "act", "verify"] as const).map((phase, i) => {
              const labels = ["DETECT", "DIAGNOSE", "ACT", "VERIFY"];
              const phases = ["detect", "diagnose", "act", "verify"] as const;
              const currentIdx = state.currentPhase ? phases.indexOf(state.currentPhase) : -1;
              const isDone = isTerminal || i < currentIdx;
              const isActive = phase === state.currentPhase;
              return (
                <span
                  key={phase}
                  style={{
                    fontSize: "8px",
                    fontFamily: "var(--font-mono)",
                    transition: "color 0.4s ease",
                    color: isActive
                      ? "var(--color-text-secondary)"
                      : isDone
                      ? "var(--color-text-muted)"
                      : "var(--color-text-dim)",
                    fontWeight: isActive ? "600" : "400",
                  }}
                >
                  {labels[i]}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function RightPanel({ state }: { state: ReturnType<typeof useIncidentStream>["state"] }) {
  return (
    <aside
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 16px",
          borderBottom: "1px solid var(--color-border-subtle)",
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2">
          <ellipse cx="12" cy="5" rx="9" ry="3"/>
          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
        </svg>
        <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-text-muted)" }}>
          DQL Evidence
        </span>
        {state.dqlRecords.length > 0 && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: "10px",
              fontFamily: "var(--font-mono)",
              padding: "2px 6px",
              borderRadius: "3px",
              color: "var(--color-accent)",
              backgroundColor: "var(--color-accent-dim)",
            }}
          >
            {state.dqlRecords.length}
          </span>
        )}
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <DqlPanel
          query={state.dqlQuery}
          records={state.dqlRecords}
          reasoning={state.agentReasoning}
        />
      </div>
    </aside>
  );
}

// suppress unused import warning
const _clsx = clsx;
