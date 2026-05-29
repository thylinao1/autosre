"use client";

import clsx from "clsx";
import type { DynatraceProblem, RunStatus, ServiceHealth } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";

interface ProblemCardProps {
  problem: DynatraceProblem | null;
  status: RunStatus;
  health: ServiceHealth | null;
  currentPhase: string | null;
}

function HealthyState({ health }: { health: ServiceHealth | null }) {
  return (
    <div className="p-6 animate-fade-in">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-[var(--color-green-dim)] border border-[rgba(34,200,128,0.3)] flex items-center justify-center">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-mono uppercase tracking-widest text-[var(--color-green)] mb-1">
            All Systems Operational
          </p>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] leading-tight">
            checkout-api
          </h2>
          {health && (
            <div className="mt-3 grid grid-cols-3 gap-3">
              <MetricCell label="Failure Rate" value={`${health.metrics.failure_rate}%`} ok />
              <MetricCell label="P99 Latency" value={`${health.metrics.p99_latency_ms}ms`} ok />
              <MetricCell label="Replicas" value={String(health.metrics.replicas)} ok />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCell({ label, value, ok, alert }: { label: string; value: string; ok?: boolean; alert?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5">
        {label}
      </span>
      <span
        className={clsx(
          "text-base font-mono font-semibold transition-colors duration-500",
          ok ? "text-[var(--color-green-text)]" : alert ? "text-[var(--color-red-text)]" : "text-[var(--color-text-primary)]"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function IncidentState({
  problem,
  isResolved,
  health,
}: {
  problem: DynatraceProblem;
  isResolved: boolean;
  health: ServiceHealth | null;
}) {
  const severity = problem.severity;
  const isAvailability = severity === "AVAILABILITY";

  const severityVariant = isResolved ? "healthy" : isAvailability ? "availability" : "performance";
  const severityLabel = isResolved ? "RESOLVED" : severity;

  const metricLabel = problem.impacted_metric === "failure_rate" ? "Failure Rate" : "P99 Latency";

  // In resolved state, show recovered metrics from health if available, otherwise show baselines
  const resolvedFailureRate = health?.metrics.failure_rate ?? 0;
  const resolvedLatency = health?.metrics.p99_latency_ms ?? 0;

  const metricValue = isResolved
    ? problem.impacted_metric === "failure_rate"
      ? `${resolvedFailureRate}%`
      : `${resolvedLatency}ms`
    : problem.impacted_metric === "failure_rate"
    ? `${problem.observed_value}%`
    : `${problem.observed_value.toLocaleString()}ms`;

  const baselineValue = problem.impacted_metric === "failure_rate" ? "< 1%" : "< 300ms";

  return (
    <div
      className={clsx(
        "p-6",
        isResolved ? "animate-flip-healthy" : ""
      )}
    >
      <div className="flex items-start gap-4">
        {/* Severity indicator */}
        <div
          className={clsx(
            "flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center border",
            "transition-all duration-700",
            isResolved
              ? "bg-[var(--color-green-dim)] border-[rgba(34,200,128,0.3)]"
              : isAvailability
              ? "bg-[var(--color-red-dim)] border-[rgba(224,60,74,0.4)]"
              : "bg-[var(--color-orange-dim)] border-[var(--color-orange)] border-opacity-40"
          )}
        >
          {isResolved ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          ) : isAvailability ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-red-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-orange-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          )}
        </div>

        {/* Problem details */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Badge label={severityLabel} variant={severityVariant} pulse={!isResolved} />
            <span className="text-[10px] font-mono text-[var(--color-text-muted)]">
              {problem.problemId}
            </span>
          </div>

          <h2
            className={clsx(
              "text-base font-semibold leading-tight mb-1 transition-colors duration-700",
              isResolved ? "text-[var(--color-green-text)]" : "text-[var(--color-text-primary)]"
            )}
          >
            {isResolved ? "Incident resolved — " : ""}
            {problem.title}
          </h2>

          <p className="text-xs text-[var(--color-text-muted)] mb-3 font-mono">
            Service: <span className="text-[var(--color-text-secondary)]">{problem.affected_entity}</span>
            {problem.deploy_version && (
              <>
                {" "}· Deploy:{" "}
                <span className="text-[var(--color-text-secondary)]">{problem.deploy_version}</span>
              </>
            )}
          </p>

          {/* Metrics — show healthy values on resolve, incident values while active */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <MetricCell
              label={metricLabel}
              value={metricValue}
              alert={!isResolved}
              ok={isResolved}
            />
            <MetricCell
              label="Baseline"
              value={baselineValue}
              ok
            />
            {/* In resolved state: show replicas (healthy indicator). In incident state: show active feature flags. */}
            {isResolved ? (
              <MetricCell
                label="Status"
                value="Healthy"
                ok
              />
            ) : (
              problem.active_feature_flags &&
              Object.entries(problem.active_feature_flags)
                .slice(0, 1)
                .map(([flag, val]) => (
                  <MetricCell
                    key={flag}
                    label="Active Flag"
                    value={`${flag}: ${String(val)}`}
                    alert={val === true}
                  />
                ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProblemCard({ problem, status, health, currentPhase }: ProblemCardProps) {
  const isResolved = status === "resolved";
  const isRunning = status === "running" || status === "awaiting_approval" || status === "starting";

  const borderColor = problem && !isResolved
    ? problem.severity === "AVAILABILITY"
      ? "border-[rgba(224,60,74,0.4)]"
      : "border-[rgba(224,120,48,0.4)]"
    : isResolved
    ? "border-[rgba(34,200,128,0.4)]"
    : "border-[var(--color-border)]";

  return (
    <div
      className={clsx(
        "relative rounded-lg border overflow-hidden bg-[var(--color-surface-0)]",
        "transition-all duration-700",
        borderColor,
        problem && !isResolved
          ? "shadow-[0_0_20px_var(--color-red-dim)]"
          : isResolved
          ? "shadow-[0_0_28px_var(--color-green-dim),0_0_0_1px_rgba(34,200,128,0.08)]"
          : ""
      )}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border-subtle)]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
            Dynatrace Problem
          </span>
          {isRunning && !problem && (
            <span className="text-[10px] font-mono text-[var(--color-accent)]">— scanning…</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {currentPhase && (
            <span
              className={clsx(
                "text-[10px] font-mono px-2 py-0.5 rounded transition-all duration-300",
                currentPhase === "detect" ? "text-[var(--color-detect)] bg-[var(--color-accent-dim)]" :
                currentPhase === "diagnose" ? "text-[#8060f0] bg-[rgba(128,96,240,0.12)]" :
                currentPhase === "act" ? "text-[var(--color-act)] bg-[var(--color-amber-dim)]" :
                currentPhase === "verify" ? "text-[var(--color-verify)] bg-[var(--color-green-dim)]" : ""
              )}
            >
              {currentPhase.toUpperCase()}
            </span>
          )}
          {/* Live indicator */}
          {isRunning && (
            <span className="flex items-center gap-1 text-[10px] font-mono text-[var(--color-accent)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-status-blink" />
              LIVE
            </span>
          )}
          {/* Resolved indicator */}
          {isResolved && (
            <span className="flex items-center gap-1 text-[10px] font-mono text-[var(--color-green)] animate-fade-in">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-green)]" />
              RESTORED
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      {!problem && !isResolved ? (
        <HealthyState health={health} />
      ) : problem ? (
        <IncidentState problem={problem} isResolved={isResolved} health={health} />
      ) : null}
    </div>
  );
}
