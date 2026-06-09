"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useIncidentStream } from "@/hooks/useIncidentStream";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { ProblemCard } from "@/components/problem-card/ProblemCard";
import { Timeline } from "@/components/timeline/Timeline";
import { DqlPanel } from "@/components/dql-panel/DqlPanel";
import { ApprovalModal } from "@/components/approval-modal/ApprovalModal";
import { DemoControls } from "@/components/demo-controls/DemoControls";
import { AuditTrail } from "@/components/audit-trail/AuditTrail";
import { FinalReport } from "@/components/ui/FinalReport";
import type { FaultType, ServiceHealth, RunStatus } from "@/lib/types";
import { getHealth } from "@/lib/api";

export default function DemoPage() {
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

  // Gate which layout mounts so the shared surfaces (AuditTrail + its poller,
  // ProblemCard, DemoControls) instantiate exactly once. Matches the CSS 1024px
  // breakpoint. `false` on the server keeps SSR deterministic (mobile-first).
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  // The latest agent critique, if it is a "Second opinion:" message, surfaced in
  // the approval modal. The hook strips/keeps the full reasoning buffer; we only
  // forward a clearly-marked second opinion.
  const secondOpinion =
    state.agentReasoning.startsWith("Second opinion:")
      ? state.agentReasoning.slice("Second opinion:".length).trim()
      : undefined;

  // A soft "reconnecting…" hint can ride on errorMessage while the run is still
  // non-terminal (the stream blipped but the backend is still working). Only the
  // hard "error" status renders the alert banner; otherwise this is an inline note.
  const isHardError = state.status === "error";
  const softNotice = !isHardError && state.errorMessage ? state.errorMessage : null;

  // Screen-reader status line. Announces the run phase as plain text via aria-live.
  const statusAnnouncement =
    state.status === "idle" ? "Standby. No incident running." :
    state.status === "starting" ? "Starting incident sweep." :
    state.status === "running" ? `Running${state.currentPhase ? `, phase ${state.currentPhase}` : ""}.` :
    state.status === "awaiting_approval" ? "Awaiting your approval. A remediation is proposed and blocked until you decide." :
    state.status === "resolved" ? "Resolved. The service is healthy." :
    state.status === "declined" ? "Declined. The agent stood down, nothing changed." :
    state.status === "all_clear" ? "All clear. No action was needed." :
    "Error. Something went wrong.";

  return (
    <div className="min-h-screen flex flex-col">
      {/* Page-level heading and live status, for assistive tech only. */}
      <h1 className="visually-hidden">AutoSRE Mission Control - live incident response</h1>
      <div className="visually-hidden" role="status" aria-live="polite">
        {statusAnnouncement}
      </div>
      {/* ── Top navigation ── */}
      <header
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          height: "52px",
          borderBottom: "1px solid var(--color-border-subtle)",
          backgroundColor: "var(--color-surface-nav)",
          boxShadow: "inset 0 -1px 0 rgba(0,212,240,0.04), 0 1px 0 rgba(0,0,0,0.5)",
          position: "relative",
          zIndex: 10,
        }}
      >
        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* Back to landing */}
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              textDecoration: "none",
              color: "var(--color-text-muted)",
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              transition: "color 150ms ease",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--color-text-secondary)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--color-text-muted)"; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </Link>

          <div
            style={{
              width: "1px",
              height: "16px",
              backgroundColor: "var(--color-border-subtle)",
            }}
          />

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* Status dot */}
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                backgroundColor: "var(--color-accent)",
                boxShadow: "0 0 8px var(--color-accent-glow)",
                flexShrink: 0,
              }}
              className={isBusy ? "animate-status-blink" : ""}
            />
            <span
              style={{
                fontSize: "0.875rem",
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-primary)",
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}
            >
              autosre
            </span>
            <span
              style={{
                fontSize: "11px",
                fontFamily: "var(--font-sans)",
                letterSpacing: "-0.005em",
                color: "var(--color-text-muted)",
                fontWeight: 500,
              }}
            >
              Mission Control
            </span>
            <span
              className="hidden sm:inline-flex"
              title="Demo sandbox. Incidents are injected so the loop is repeatable. The agent reasoning, the approval gate, and the Dynatrace integration are real code; the target service runs in simulation."
              style={{
                alignItems: "center",
                gap: "5px",
                marginLeft: "4px",
                padding: "2px 9px",
                borderRadius: "9999px",
                border: "1px dashed var(--color-border-strong)",
                fontSize: "10px",
                fontFamily: "var(--font-sans)",
                fontWeight: 500,
                letterSpacing: "-0.005em",
                color: "var(--color-text-muted)",
                cursor: "default",
                flexShrink: 0,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: "5px",
                  height: "5px",
                  borderRadius: "50%",
                  backgroundColor: "var(--color-amber)",
                  flexShrink: 0,
                }}
              />
              Simulation
            </span>
          </div>
        </div>

        {/* Status indicators */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexShrink: 0 }}>
          <RunTimer startedAt={state.startedAt} proposedAt={state.proposedAt} endedAt={state.endedAt} status={state.status} />
          <StatusPill
            label={
              state.status === "idle" ? "Standby" :
              state.status === "starting" ? "Starting" :
              state.status === "running" ? "Running" :
              state.status === "awaiting_approval" ? "Approval" :
              state.status === "resolved" ? "Resolved" :
              state.status === "declined" ? "Declined" :
              state.status === "all_clear" ? "Clear" :
              "Error"
            }
            color={
              state.status === "resolved" || state.status === "all_clear" ? "var(--color-green)" :
              state.status === "awaiting_approval" ? "var(--color-amber)" :
              isBusy ? "var(--color-accent)" :
              state.status === "error" ? "var(--color-red)" :
              "var(--color-text-dim)"
            }
            glow={
              state.status === "resolved" || state.status === "all_clear" ? "0 0 7px var(--color-green-glow)" :
              state.status === "awaiting_approval" ? "0 0 7px var(--color-amber-glow)" :
              isBusy ? "0 0 6px var(--color-accent-glow)" :
              "none"
            }
            blink={isBusy || state.status === "awaiting_approval"}
          />
          <StatusPill label="Dynatrace MCP" color="var(--color-accent)" glow="none" blink={false} />
          <div className="hidden md:flex" style={{
            alignItems: "center",
            gap: "6px",
            fontSize: "11px",
            fontFamily: "var(--font-sans)",
            letterSpacing: "-0.005em",
            color: "var(--color-text-secondary)",
            whiteSpace: "nowrap",
          }}>
            <span style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: "var(--color-text-dim)", flexShrink: 0 }} />
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
        {/* Only ONE layout subtree mounts (gated on isDesktop), so AuditTrail and
            its 5s poller, ProblemCard, and DemoControls never double-mount. */}
        {isDesktop ? (
          <>
            {/* Desktop 3-column */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "clamp(280px, 22vw, 340px) 1fr clamp(248px, 20vw, 308px)",
                minHeight: 0,
                height: "calc(100vh - 52px - 40px)",
              }}
            >
              <LeftSidebar
                state={state}
                serviceHealth={serviceHealth}
                softNotice={softNotice}
                onStart={handleStart}
                onReset={handleReset}
              />
              <CenterTimeline state={state} isBusy={isBusy} isTerminal={isTerminal} />
              <RightPanel state={state} />
            </div>

            {/* Telemetry footer (desktop) */}
            <FooterTelemetry />
          </>
        ) : (
          /* Mobile stacked layout */
          <div style={{ display: "flex", flexDirection: "column", overflowY: "auto", padding: "14px", gap: "14px" }}>
            {isHardError && state.errorMessage && (
              <ErrorBanner message={state.errorMessage} />
            )}
            {softNotice && <SoftNotice message={softNotice} />}
            <ProblemCard problem={state.problem} status={state.status} health={serviceHealth} currentPhase={state.currentPhase} />
            {state.finalEvent && <FinalReport event={state.finalEvent} />}
            <DemoControls status={state.status} onStart={handleStart} onReset={handleReset} />
            <PanelBlock title="Agent timeline">
              <Timeline entries={state.timeline} currentPhase={state.currentPhase} isBusy={isBusy} />
            </PanelBlock>
            <PanelBlock title="DQL evidence">
              <DqlPanel query={state.dqlQuery} records={state.dqlRecords} reasoning={state.agentReasoning} />
            </PanelBlock>
            <AuditTrail refreshKey={state.status} />
          </div>
        )}
      </main>

      {/* Approval modal */}
      {state.pendingApproval && (
        <ApprovalModal event={state.pendingApproval} onDecide={handleApprove} secondOpinion={secondOpinion} />
      )}
    </div>
  );
}

/* ── Sub-components ── */

/* Two measured numbers, so the "30+ minutes by hand, seconds here" claim splits
   honestly into model time and total time:
     Agent: proposedAt - startedAt   (detection → proposed fix; pure model time)
     Total: endedAt - startedAt      (start → verified outcome; includes review)
   The Total label notes that it counts your deliberation, so neither number
   overstates the agent. Both freeze on the terminal frame. */
function RunTimer({
  startedAt,
  proposedAt,
  endedAt,
  status,
}: {
  startedAt: number | null;
  proposedAt: number | null;
  endedAt: number | null;
  status: RunStatus;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (startedAt === null || endedAt !== null) return;
    const id = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, [startedAt, endedAt]);

  if (startedAt === null) return null;
  const done = endedAt !== null;
  const totalSecs = (((endedAt ?? Date.now()) - startedAt) / 1000).toFixed(1);
  // Agent time = time to the proposed fix. Before the proposal arrives, the agent
  // is still working, so tick the live elapsed; freeze once proposed or terminal.
  const agentEnd = proposedAt ?? (done ? endedAt : Date.now());
  const agentSecs = ((agentEnd - startedAt) / 1000).toFixed(1);

  const totalColor = !done
    ? "var(--color-accent)"
    : status === "resolved" || status === "all_clear"
    ? "var(--color-green)"
    : status === "declined"
    ? "var(--color-amber)"
    : "var(--color-text-secondary)";

  return (
    <div
      title="Agent = detection to proposed fix (model time only). Total = start to a verified outcome, which includes the time you spent reviewing. A human does this triage in 30+ minutes."
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        fontFamily: "var(--font-mono)",
        fontSize: "12px",
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <polyline points="12 8 12 12 14.5 13.5" />
      </svg>
      <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--color-accent)" }}>
        <span style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sans)", fontSize: "10px", fontWeight: 500 }}>Agent</span>
        {agentSecs}s
      </span>
      <span
        style={{ display: "flex", alignItems: "center", gap: "4px", color: totalColor, transition: "color 0.5s var(--ease-out-expo)" }}
      >
        <span style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sans)", fontSize: "10px", fontWeight: 500 }}>Total</span>
        {totalSecs}s
        <span className="hidden xl:inline" style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-sans)", fontSize: "9px", fontWeight: 500 }}>
          incl. review
        </span>
      </span>
    </div>
  );
}

function StatusPill({
  label,
  color,
  glow,
  blink,
}: {
  label: string;
  color: string;
  glow: string;
  blink: boolean;
}) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "6px",
      fontSize: "11px",
      fontFamily: "var(--font-sans)",
      letterSpacing: "-0.005em",
      color: "var(--color-text-secondary)",
      whiteSpace: "nowrap",
    }}>
      <span
        style={{
          width: "5px",
          height: "5px",
          borderRadius: "50%",
          flexShrink: 0,
          transition: "background-color 0.5s var(--ease-out-expo), box-shadow 0.5s var(--ease-out-expo)",
          backgroundColor: color,
          boxShadow: glow,
          animation: blink ? "status-blink 1.6s ease-in-out infinite" : "none",
        }}
      />
      {label}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        borderRadius: "8px",
        border: "1px solid rgba(224,58,72,0.35)",
        backgroundColor: "var(--color-red-dim)",
        padding: "10px 14px",
      }}
      className="animate-slide-in-up"
    >
      <p style={{ fontSize: "11px", fontFamily: "var(--font-sans)", fontWeight: 600, letterSpacing: "-0.005em", color: "var(--color-red-text)", marginBottom: "3px" }}>Something went wrong</p>
      <p style={{ fontSize: "12.5px", fontFamily: "var(--font-sans)", letterSpacing: "-0.005em", color: "var(--color-text-secondary)" }}>{message}</p>
    </div>
  );
}

/* Soft, non-fatal notice (e.g. a stream blip mid-run). Distinct from the red
   error alert: amber, lighter weight, does not claim the run failed. */
function SoftNotice({ message }: { message: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        borderRadius: "8px",
        border: "1px solid rgba(242,168,50,0.3)",
        backgroundColor: "var(--color-amber-dim)",
        padding: "8px 12px",
      }}
    >
      <span
        aria-hidden="true"
        className="animate-status-blink"
        style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: "var(--color-amber)", flexShrink: 0 }}
      />
      <p style={{ fontSize: "11.5px", fontFamily: "var(--font-sans)", letterSpacing: "-0.005em", color: "var(--color-amber)" }}>{message}</p>
    </div>
  );
}

function PanelBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--color-border-subtle)", borderRadius: "8px", overflow: "hidden" }}>
      <div className="panel-header">{title}</div>
      {children}
    </div>
  );
}

function LeftSidebar({
  state,
  serviceHealth,
  softNotice,
  onStart,
  onReset,
}: {
  state: ReturnType<typeof useIncidentStream>["state"];
  serviceHealth: ServiceHealth | null;
  softNotice: string | null;
  onStart: (inject: FaultType | null) => void;
  onReset: () => Promise<void>;
}) {
  return (
    <aside
      style={{
        borderRight: "1px solid var(--color-border-subtle)",
        display: "flex",
        flexDirection: "column",
        padding: "20px 18px",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      {/* Pinned controls - the problem card and the Run button must stay visible
          no matter how full the audit trail gets, so they live in a non-scrolling
          block at the top of the rail. */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", flexShrink: 0 }}>
        {state.status === "error" && state.errorMessage && (
          <ErrorBanner message={state.errorMessage} />
        )}
        {softNotice && <SoftNotice message={softNotice} />}
        <ProblemCard
          problem={state.problem}
          status={state.status}
          health={serviceHealth}
          currentPhase={state.currentPhase}
        />
        <DemoControls status={state.status} onStart={onStart} onReset={onReset} />
      </div>

      {/* History - final report + audit trail take the remaining height and
          scroll internally, so a long trail can never push the controls or the
          problem card off-screen. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          marginTop: "16px",
        }}
      >
        {state.finalEvent && <FinalReport event={state.finalEvent} />}
        <AuditTrail refreshKey={state.status} />
      </div>
    </aside>
  );
}

/* Slim full-width telemetry strip under the columns. Holds the agent stack so
   it stays visible for judges without crowding the sidebar. Desktop only. */
function FooterTelemetry() {
  const chips: { label: string; value: string }[] = [
    { label: "Model", value: "Gemini 3" },
    { label: "Framework", value: "Google ADK" },
    { label: "Runtime", value: "Vertex AI · Cloud Run" },
    { label: "Senses", value: "Dynatrace MCP" },
    { label: "Human gate", value: "require_confirmation" },
    { label: "Target", value: "checkout-api" },
  ];
  return (
    <div
      className="hidden lg:flex"
      style={{
        flexShrink: 0,
        height: "40px",
        alignItems: "center",
        gap: "22px",
        padding: "0 22px 0 58px",
        borderTop: "1px solid var(--color-border-subtle)",
        backgroundColor: "var(--color-surface-nav)",
        overflow: "hidden",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          fontSize: "10px",
          fontFamily: "var(--font-sans)",
          fontWeight: 600,
          letterSpacing: "0.02em",
          color: "var(--color-text-dim)",
          flexShrink: 0,
        }}
      >
        Stack
      </span>
      {chips.map((c) => (
        <div key={c.label} style={{ display: "flex", alignItems: "center", gap: "7px", flexShrink: 0 }}>
          <span style={{ fontSize: "10.5px", fontFamily: "var(--font-sans)", color: "var(--color-text-dim)" }}>
            {c.label}
          </span>
          <span style={{ fontSize: "10.5px", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>
            {c.value}
          </span>
        </div>
      ))}
    </div>
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
  const phases = ["detect", "diagnose", "act", "verify"] as const;
  const phaseLabels = ["Detect", "Diagnose", "Act", "Verify"] as const;
  const activeColors: Record<string, string> = {
    detect:   "var(--color-detect)",
    diagnose: "var(--color-diagnose)",
    act:      "var(--color-act)",
    verify:   "var(--color-verify)",
  };
  const activeGlow: Record<string, string> = {
    detect:   "0 0 8px 2px rgba(0,212,240,0.5)",
    diagnose: "0 0 8px 2px rgba(139,92,246,0.5)",
    act:      "0 0 8px 2px rgba(242,168,50,0.5)",
    verify:   "0 0 8px 2px rgba(32,204,128,0.5)",
  };

  const currentIdx = state.currentPhase ? phases.indexOf(state.currentPhase) : -1;

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
          padding: "7px 16px",
          borderBottom: "1px solid var(--color-border-subtle)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-dim)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          <span style={{
            fontSize: "11.5px",
            fontFamily: "var(--font-sans)",
            fontWeight: 600,
            letterSpacing: "-0.005em",
            color: "var(--color-text-secondary)",
          }}>
            Agent timeline
          </span>
          {isBusy && (
            <span style={{ fontSize: "11px", fontFamily: "var(--font-sans)", color: "var(--color-accent)", opacity: 0.9 }}>
              · live
            </span>
          )}
        </div>
        {state.runId && (
          <span style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--color-text-dim)", letterSpacing: "0.04em" }}>
            {state.runId.slice(0, 8)}
          </span>
        )}
      </div>

      {/* Scan progress bar */}
      {isBusy && (
        <div style={{ height: "2px", position: "relative", overflow: "hidden", flexShrink: 0, backgroundColor: "var(--color-surface-2)" }}>
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              width: "20%",
              background: "linear-gradient(90deg, transparent 0%, var(--color-accent-dim) 30%, var(--color-accent) 50%, var(--color-accent-dim) 70%, transparent 100%)",
              animation: "scan-progress 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
            }}
          />
        </div>
      )}

      {/* Timeline feed */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <Timeline entries={state.timeline} currentPhase={state.currentPhase} isBusy={isBusy} />
      </div>

      {/* Phase progress bar */}
      {(state.currentPhase || isTerminal) && (
        <div
          style={{
            flexShrink: 0,
            borderTop: "1px solid var(--color-border-subtle)",
            padding: "11px 16px 10px",
            backgroundColor: "var(--color-surface-0)",
          }}
        >
          <div style={{ display: "flex", gap: "3px", marginBottom: "5px" }}>
            {phases.map((phase, i) => {
              const isDone = isTerminal || i < currentIdx;
              const isActive = phase === state.currentPhase;
              const fillColor = isDone
                ? (isTerminal && phase === "verify" ? "var(--color-green)" : "var(--color-accent)")
                : isActive
                ? activeColors[phase]
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
                      opacity: isDone ? 0.65 : isActive ? 1 : 0,
                      boxShadow: isActive ? activeGlow[phase] : "none",
                      transform: `scaleX(${isDone || isActive ? 1 : 0})`,
                      transformOrigin: "left",
                      transition: "transform 0.5s var(--ease-out-expo), opacity 0.35s ease, background-color 0.55s ease, box-shadow 0.35s ease",
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            {phases.map((phase, i) => {
              const isDone = isTerminal || i < currentIdx;
              const isActive = phase === state.currentPhase;
              return (
                <span
                  key={phase}
                  style={{
                    fontSize: "10px",
                    fontFamily: "var(--font-sans)",
                    transition: "color 0.35s ease",
                    color: isActive ? activeColors[phase] : isDone ? "var(--color-text-muted)" : "var(--color-text-dim)",
                    fontWeight: isActive ? 600 : 500,
                    letterSpacing: "-0.005em",
                  }}
                >
                  {phaseLabels[i]}
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
    <aside style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: "7px",
          padding: "7px 16px",
          borderBottom: "1px solid var(--color-border-subtle)",
        }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="12" cy="5" rx="9" ry="3"/>
          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
        </svg>
        <span style={{ fontSize: "11.5px", fontFamily: "var(--font-sans)", fontWeight: 600, letterSpacing: "-0.005em", color: "var(--color-text-secondary)" }}>
          DQL evidence
        </span>
        {state.dqlRecords.length > 0 && (
          <span style={{
            marginLeft: "auto",
            fontSize: "9.5px",
            fontFamily: "var(--font-mono)",
            padding: "1px 6px",
            borderRadius: "3px",
            color: "var(--color-accent)",
            backgroundColor: "var(--color-accent-dim)",
            border: "1px solid rgba(0,212,240,0.2)",
          }}>
            {state.dqlRecords.length}
          </span>
        )}
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <DqlPanel query={state.dqlQuery} records={state.dqlRecords} reasoning={state.agentReasoning} />
      </div>
    </aside>
  );
}
