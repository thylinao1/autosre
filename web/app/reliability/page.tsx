import type { Metadata } from "next";
import Link from "next/link";
import { EVAL_RESULTS, type EvalScenario } from "@/lib/evalResults";

export const metadata: Metadata = {
  title: "AutoSRE - Reliability scorecard",
  description:
    "Graded, not vibes: the agent's diagnosis accuracy, false-action rate, and trap refusals, measured against an answer key it can never see.",
};

const REPO_URL = "https://github.com/thylinao1/autosre";

const SCORECARD_DQL = `fetch logs, from:now()-7d
| filter event.kind == "autosre.evals"
  and autosre.eval.record == "run"
| summarize runs = count(),
    falseActions = countIf(autosre.eval.false_action == "true"),
    correct = countIf(autosre.eval.correct == "true")`;

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function StatCard({
  label,
  value,
  counts,
  tone,
}: {
  label: string;
  value: string;
  counts: string;
  tone: "accent" | "green";
}) {
  const color = tone === "green" ? "var(--color-green-text)" : "var(--color-accent)";
  return (
    <div
      style={{
        flex: "1 1 180px",
        minWidth: "180px",
        padding: "20px",
        backgroundColor: "var(--color-surface-1)",
        border: "1px solid var(--color-border)",
        borderRadius: "10px",
      }}
    >
      <div
        style={{
          fontSize: "11px",
          fontFamily: "var(--font-mono)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--color-text-muted)",
          marginBottom: "10px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "2rem",
          lineHeight: 1.1,
          fontWeight: 700,
          fontFamily: "var(--font-display)",
          color,
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: "6px",
          fontSize: "12.5px",
          fontFamily: "var(--font-mono)",
          color: "var(--color-text-secondary)",
        }}
      >
        {counts}
      </div>
    </div>
  );
}

function ScenarioRow({ s }: { s: EvalScenario }) {
  const isTrap = !s.note.toLowerCase().startsWith("decoy") && s.name === "all_clear";
  const isDecoy = s.note.toUpperCase().startsWith("DECOY");
  const clean = s.correct === s.trials && s.false_actions === 0;
  return (
    <tr style={{ borderTop: "1px solid var(--color-border-subtle)" }}>
      <td style={{ padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--color-text-primary)", whiteSpace: "nowrap" }}>
        {s.name}
        {isDecoy && (
          <span style={{ marginLeft: "8px", fontSize: "10px", padding: "2px 6px", borderRadius: "4px", backgroundColor: "var(--color-amber-dim)", color: "var(--color-amber)", letterSpacing: "0.06em" }}>
            DECOY
          </span>
        )}
        {isTrap && (
          <span style={{ marginLeft: "8px", fontSize: "10px", padding: "2px 6px", borderRadius: "4px", backgroundColor: "var(--color-accent-dim)", color: "var(--color-accent)", letterSpacing: "0.06em" }}>
            NO-ACTION TRAP
          </span>
        )}
      </td>
      <td style={{ padding: "10px 14px", fontSize: "13px", color: "var(--color-text-secondary)" }}>
        {s.note.replace(/^DECOY:\s*/i, "")}
      </td>
      <td style={{ padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: "13px", color: clean ? "var(--color-green-text)" : "var(--color-red-text)", whiteSpace: "nowrap" }}>
        {s.correct}/{s.trials} correct
      </td>
    </tr>
  );
}

export default function ReliabilityPage() {
  const r = EVAL_RESULTS;
  const c = r.counts;
  const lat = r.latency_s;
  const generated = r.generated_at.slice(0, 16).replace("T", " ");

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* ── Top navigation (mirrors Mission Control) ── */}
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
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Link
            href="/demo"
            style={{ display: "flex", alignItems: "center", gap: "6px", textDecoration: "none", color: "var(--color-text-muted)", fontSize: "11px", fontFamily: "var(--font-mono)" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="15 18 9 12 15 6" />
            </svg>
            mission control
          </Link>
          <div style={{ width: "1px", height: "16px", backgroundColor: "var(--color-border-subtle)" }} />
          <span style={{ fontSize: "0.875rem", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--color-text-primary)", letterSpacing: "-0.02em" }}>
            autosre
          </span>
          <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontWeight: 500 }}>
            Reliability scorecard
          </span>
        </div>
        <a
          href={`${REPO_URL}/tree/main/tests/evals`}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)", textDecoration: "none" }}
        >
          tests/evals →
        </a>
      </header>

      <main style={{ flex: 1, maxWidth: "880px", width: "100%", margin: "0 auto", padding: "40px 20px 80px" }}>
        {/* ── Headline ── */}
        <p style={{ fontSize: "11px", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--color-accent)", margin: 0 }}>
          Graded, not vibes
        </p>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.6rem, 4vw, 2.4rem)", lineHeight: 1.15, margin: "10px 0 8px", color: "var(--color-text-primary)" }}>
          The agent&apos;s track record, measured against an answer key it can never see
        </h1>
        <p style={{ fontSize: "14.5px", lineHeight: 1.65, color: "var(--color-text-secondary)", maxWidth: "640px", margin: "0 0 28px" }}>
          Every eval run injects a real fault (or none at all), lets the live Gemini agent diagnose it
          through the Dynatrace toolset, and grades the proposed remediation against the target&apos;s
          hidden answer key. The proposal is rejected at the approval gate, so a graded run can never
          touch the service. Raw counts shown next to every percentage.
        </p>

        {/* ── Stat cards ── */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
          <StatCard
            label="Tool selection"
            value={pct(r.tool_selection_accuracy)}
            counts={`${c.incident_correct}/${c.incident_runs} incident runs`}
            tone="accent"
          />
          <StatCard
            label="False actions"
            value={`${c.false_actions}`}
            counts={`${c.false_actions}/${c.runs} graded runs (${pct(r.false_action_rate)})`}
            tone="green"
          />
          <StatCard
            label="Trap refusals"
            value={`${c.trap_refusals}/${c.trap_runs}`}
            counts="all_clear: correct action is none"
            tone="green"
          />
          <StatCard
            label="Detect → proposal"
            value={lat.median != null ? `${lat.median}s` : "n/a"}
            counts={lat.median != null ? `median of ${lat.n} runs (${lat.min}-${lat.max}s)` : "not captured this run"}
            tone="accent"
          />
        </div>

        {/* ── The trap callout ── */}
        <div
          style={{
            padding: "16px 20px",
            border: "1px solid var(--color-border)",
            borderLeft: "3px solid var(--color-accent)",
            borderRadius: "8px",
            backgroundColor: "var(--color-accent-subtle)",
            marginBottom: "32px",
          }}
        >
          <p style={{ margin: 0, fontSize: "14px", lineHeight: 1.6, color: "var(--color-text-primary)" }}>
            <strong>The scariest agent is one that acts when it shouldn&apos;t.</strong>{" "}
            <span style={{ color: "var(--color-text-secondary)" }}>
              The set includes two decoy incidents where the reflex fix is wrong, and an{" "}
              <code style={{ fontFamily: "var(--font-mono)", fontSize: "12.5px", color: "var(--color-accent)" }}>all_clear</code>{" "}
              trap where the only correct move is to do nothing. In {c.trap_runs}{" "}
              {c.trap_runs === 1 ? "trap run" : "trap runs"}, it refused {c.trap_refusals}{" "}
              {c.trap_refusals === 1 ? "time" : "times"} and proposed zero unauthorized actions.
            </span>
          </p>
        </div>

        {/* ── Per-scenario table ── */}
        <h2 style={{ fontSize: "15px", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-muted)", margin: "0 0 10px" }}>
          Scenarios ({r.scenarios} × {r.trials} {r.trials === 1 ? "trial" : "trials"} = {c.runs} graded runs)
        </h2>
        <div style={{ border: "1px solid var(--color-border)", borderRadius: "10px", overflow: "hidden", marginBottom: "32px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", backgroundColor: "var(--color-surface-1)" }}>
            <tbody>
              {r.per_scenario.map((s) => (
                <ScenarioRow key={s.name} s={s} />
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Method ── */}
        <h2 style={{ fontSize: "15px", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-muted)", margin: "0 0 10px" }}>
          Method
        </h2>
        <ul style={{ margin: "0 0 32px", paddingLeft: "18px", fontSize: "14px", lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
          <li>
            <strong style={{ color: "var(--color-text-primary)" }}>Pre-registered pass criterion:</strong>{" "}
            {r.pass_criterion}. This run: <strong style={{ color: r.passed ? "var(--color-green-text)" : "var(--color-red-text)" }}>{r.passed ? "PASS" : "FAIL"}</strong>.
          </li>
          <li>
            The answer key lives in a test-only route the agent has no tool to reach; the grader
            checks whether the proposed action would actually resolve the fault.
          </li>
          <li>
            Model: <code style={{ fontFamily: "var(--font-mono)", fontSize: "12.5px" }}>{r.model}</code>,
            Dynatrace toolset mode: <code style={{ fontFamily: "var(--font-mono)", fontSize: "12.5px" }}>{r.dynatrace_mode}</code>,
            run {generated} UTC. Graded transcripts are committed under{" "}
            <a href={`${REPO_URL}/tree/main/tests/evals/runs`} target="_blank" rel="noreferrer" style={{ color: "var(--color-accent)" }}>
              tests/evals/runs
            </a>.
          </li>
          <li>
            Reproduce:{" "}
            <code style={{ fontFamily: "var(--font-mono)", fontSize: "12.5px" }}>
              EVAL_TRIALS={r.trials} python -m tests.evals.run_evals
            </code>{" "}
            (the model is nondeterministic; we report observed counts, not guarantees).
          </li>
        </ul>

        {/* ── Queryable in Grail ── */}
        <h2 style={{ fontSize: "15px", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-muted)", margin: "0 0 10px" }}>
          The platform that watches production watches the agent
        </h2>
        <p style={{ fontSize: "14px", lineHeight: 1.65, color: "var(--color-text-secondary)", maxWidth: "640px", margin: "0 0 12px" }}>
          Graded eval runs are exported to the same Dynatrace tenant the agent monitors, alongside the
          audit record of every live approve and reject. The agent&apos;s calibration is one DQL away:
        </p>
        <pre
          style={{
            margin: 0,
            padding: "16px 18px",
            backgroundColor: "var(--color-surface-0)",
            border: "1px solid var(--color-border)",
            borderRadius: "10px",
            fontFamily: "var(--font-mono)",
            fontSize: "12.5px",
            lineHeight: 1.6,
            color: "var(--color-text-primary)",
            overflowX: "auto",
          }}
        >
          {SCORECARD_DQL}
        </pre>
      </main>
    </div>
  );
}
