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

function MetricCell({
  label,
  value,
  ok,
  alert,
  large,
}: {
  label: string;
  value: string;
  ok?: boolean;
  alert?: boolean;
  large?: boolean;
}) {
  const valueColor = ok
    ? "var(--color-green-text)"
    : alert
    ? "var(--color-red-text)"
    : "var(--color-text-primary)";

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span style={{
        fontSize: "10.5px",
        fontFamily: "var(--font-sans)",
        letterSpacing: "-0.005em",
        color: "var(--color-text-muted)",
        marginBottom: "3px",
        fontWeight: 500,
      }}>
        {label}
      </span>
      <span
        style={{
          fontSize: large ? "1.25rem" : "0.9375rem",
          fontFamily: "var(--font-mono)",
          fontWeight: 600,
          color: valueColor,
          transition: "color 0.5s var(--ease-out-expo)",
          letterSpacing: large ? "-0.02em" : "-0.01em",
          lineHeight: 1.2,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function HealthyState({ health }: { health: ServiceHealth | null }) {
  return (
    <div
      className="animate-fade-in"
      style={{ padding: "16px 14px" }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
        {/* Icon */}
        <div style={{
          flexShrink: 0,
          width: "42px",
          height: "42px",
          borderRadius: "10px",
          backgroundColor: "var(--color-green-dim)",
          border: "1px solid rgba(32,204,128,0.28)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 0 16px rgba(32,204,128,0.08)",
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: "11px",
            fontFamily: "var(--font-sans)",
            letterSpacing: "-0.005em",
            color: "var(--color-green)",
            marginBottom: "3px",
            fontWeight: 600,
          }}>
            All systems operational
          </p>
          <h2 style={{
            fontSize: "1rem",
            fontWeight: 600,
            color: "var(--color-text-primary)",
            lineHeight: 1.3,
            letterSpacing: "-0.01em",
          }}>
            checkout-api
          </h2>
          {health && (
            <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
              <MetricCell label="Fail rate" value={`${health.metrics.failure_rate}%`} ok />
              <MetricCell label="P99" value={`${health.metrics.p99_latency_ms}ms`} ok />
              <MetricCell label="Replicas" value={String(health.metrics.replicas)} ok />
            </div>
          )}
        </div>
      </div>
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
  const severityLabel = isResolved ? "Resolved" : isAvailability ? "Availability" : "Performance";

  const metricLabel = problem.impacted_metric === "failure_rate" ? "Failure rate" : "P99 latency";

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

  const flagEntries = problem.active_feature_flags
    ? Object.entries(problem.active_feature_flags)
    : [];
  const firstFlag = flagEntries[0];

  return (
    <div
      className={clsx(isResolved ? "animate-flip-healthy" : "")}
      style={{ padding: "16px 14px" }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
        {/* Severity icon */}
        <div
          style={{
            flexShrink: 0,
            width: "42px",
            height: "42px",
            borderRadius: "10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid",
            transition: "all 0.7s var(--ease-out-expo)",
            borderColor: isResolved
              ? "rgba(32,204,128,0.28)"
              : isAvailability
              ? "rgba(224,58,72,0.35)"
              : "rgba(224,120,48,0.35)",
            backgroundColor: isResolved
              ? "var(--color-green-dim)"
              : isAvailability
              ? "var(--color-red-dim)"
              : "var(--color-orange-dim)",
            boxShadow: isResolved
              ? "0 0 16px rgba(32,204,128,0.08)"
              : isAvailability
              ? "0 0 16px rgba(224,58,72,0.08)"
              : "0 0 16px rgba(224,120,48,0.08)",
          }}
        >
          {isResolved ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          ) : isAvailability ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-red-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-orange-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          )}
        </div>

        {/* Problem details */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", marginBottom: "5px" }}>
            <Badge label={severityLabel} variant={severityVariant} pulse={!isResolved} />
            <span style={{ fontSize: "9.5px", fontFamily: "var(--font-mono)", color: "var(--color-text-dim)" }}>
              {problem.problemId}
            </span>
          </div>

          <h2
            style={{
              fontSize: "0.9375rem",
              fontWeight: 600,
              lineHeight: 1.35,
              marginBottom: "4px",
              transition: "color 0.7s var(--ease-out-expo)",
              color: isResolved ? "var(--color-green-text)" : "var(--color-text-primary)",
              letterSpacing: "-0.01em",
            }}
          >
            {isResolved ? "Resolved: " : ""}
            {problem.title}
          </h2>

          <p style={{
            fontSize: "10.5px",
            fontFamily: "var(--font-mono)",
            color: "var(--color-text-muted)",
            marginBottom: "12px",
          }}>
            {problem.affected_entity}
            {problem.deploy_version && (
              <span style={{ color: "var(--color-text-dim)" }}> · {problem.deploy_version}</span>
            )}
          </p>

          {/* Metrics - primary metric larger. Two columns while active (the long
              flag name gets its own full-width row below so it never overflows);
              three when resolved (adds a Status cell). */}
          <div style={{ display: "grid", gridTemplateColumns: isResolved ? "repeat(3, 1fr)" : "repeat(2, 1fr)", gap: "10px" }}>
            <MetricCell
              label={metricLabel}
              value={metricValue}
              alert={!isResolved}
              ok={isResolved}
              large
            />
            <MetricCell label="Baseline" value={baselineValue} ok />
            {isResolved && <MetricCell label="Status" value="Healthy" ok />}
          </div>

          {!isResolved && firstFlag && (
            <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 }}>
              <span style={{
                fontSize: "10.5px",
                fontFamily: "var(--font-sans)",
                letterSpacing: "-0.005em",
                color: "var(--color-text-muted)",
                fontWeight: 500,
              }}>
                Offending flag
              </span>
              <span style={{
                fontSize: "12.5px",
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
                color: "var(--color-red-text)",
                wordBreak: "break-word",
                lineHeight: 1.35,
              }}>
                {firstFlag[0]} = {String(firstFlag[1])}
              </span>
            </div>
          )}

          {!isResolved && problem.blast_radius?.summary && (
            <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "3px" }}>
              <span style={{
                fontSize: "10.5px",
                fontFamily: "var(--font-sans)",
                letterSpacing: "-0.005em",
                color: "var(--color-text-muted)",
                fontWeight: 500,
              }}>
                Blast radius
              </span>
              <span style={{
                fontSize: "11.5px",
                fontFamily: "var(--font-sans)",
                color: "var(--color-text-secondary)",
                lineHeight: 1.4,
                letterSpacing: "-0.005em",
              }}>
                {problem.blast_radius.summary}
              </span>
            </div>
          )}

          {!isResolved && problem.affected_entities && problem.affected_entities.length > 0 && (
            <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "5px", alignItems: "center" }}>
              {problem.affected_entities.map((e) => (
                <span
                  key={e}
                  style={{
                    fontSize: "9.5px",
                    fontFamily: "var(--font-mono)",
                    padding: "1.5px 6px",
                    borderRadius: "4px",
                    color: "var(--color-text-secondary)",
                    backgroundColor: "var(--color-surface-1)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  {e}
                </span>
              ))}
            </div>
          )}
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
      ? "rgba(224,58,72,0.35)"
      : "rgba(224,120,48,0.35)"
    : isResolved
    ? "rgba(32,204,128,0.35)"
    : "var(--color-border)";

  const outerGlow = problem && !isResolved
    ? "0 0 24px var(--color-red-dim)"
    : isResolved
    ? "0 0 32px var(--color-green-dim), 0 0 0 1px rgba(32,204,128,0.06)"
    : "none";

  return (
    <div
      style={{
        position: "relative",
        borderRadius: "10px",
        border: `1px solid ${borderColor}`,
        overflow: "hidden",
        backgroundColor: "var(--color-surface-0)",
        transition: "border-color 0.7s var(--ease-out-expo), box-shadow 0.7s var(--ease-out-expo)",
        boxShadow: outerGlow,
      }}
      className={isResolved ? "animate-green-flash" : ""}
    >
      {/* Card header bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 14px",
        borderBottom: `1px solid ${isResolved ? "rgba(32,204,128,0.15)" : "var(--color-border-subtle)"}`,
        backgroundColor: "var(--color-surface-0)",
        transition: "border-color 0.7s ease",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{
            fontSize: "11.5px",
            fontFamily: "var(--font-sans)",
            fontWeight: 600,
            letterSpacing: "-0.005em",
            color: "var(--color-text-secondary)",
          }}>
            Dynatrace problem
          </span>
          {isRunning && !problem && (
            <span style={{ fontSize: "9.5px", fontFamily: "var(--font-mono)", color: "var(--color-accent)" }}>
              · scanning…
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {/* Current phase chip */}
          {currentPhase && (
            <span
              style={{
                fontSize: "9.5px",
                fontFamily: "var(--font-mono)",
                padding: "1.5px 6px",
                borderRadius: "4px",
                transition: "all 0.3s ease",
                color: currentPhase === "detect" ? "var(--color-detect)" :
                       currentPhase === "diagnose" ? "var(--color-diagnose)" :
                       currentPhase === "act" ? "var(--color-act)" :
                       currentPhase === "verify" ? "var(--color-verify)" : "transparent",
                backgroundColor: currentPhase === "detect" ? "var(--color-accent-dim)" :
                                  currentPhase === "diagnose" ? "rgba(120,85,240,0.12)" :
                                  currentPhase === "act" ? "var(--color-amber-dim)" :
                                  currentPhase === "verify" ? "var(--color-green-dim)" : "transparent",
                border: "1px solid",
                borderColor: currentPhase === "detect" ? "rgba(0,204,232,0.25)" :
                              currentPhase === "diagnose" ? "rgba(120,85,240,0.25)" :
                              currentPhase === "act" ? "rgba(242,168,50,0.25)" :
                              currentPhase === "verify" ? "rgba(32,204,128,0.25)" : "transparent",
              }}
            >
              {currentPhase.charAt(0).toUpperCase() + currentPhase.slice(1)}
            </span>
          )}

          {/* Live indicator */}
          {isRunning && (
            <span style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "9.5px",
              fontFamily: "var(--font-mono)",
              color: "var(--color-accent)",
            }}>
              <span
                style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: "var(--color-accent)" }}
                className="animate-status-blink"
              />
              Live
            </span>
          )}

          {/* Restored indicator */}
          {isResolved && (
            <span
              className="animate-fade-in"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "9.5px",
                fontFamily: "var(--font-mono)",
                color: "var(--color-green)",
              }}
            >
              <span style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: "var(--color-green)" }} />
              Restored
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
