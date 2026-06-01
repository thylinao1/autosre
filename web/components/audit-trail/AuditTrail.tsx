"use client";

import { useEffect, useState } from "react";
import { getLedger, type LedgerEntry } from "@/lib/api";

const DECISION_COLOR: Record<string, string> = {
  approved: "var(--color-green)",
  rejected: "var(--color-red-text)",
  none: "var(--color-text-dim)",
};

const DECISION_LABEL: Record<string, string> = {
  approved: "Approved",
  rejected: "Rejected",
  none: "No action",
};

function relTime(ts: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

/**
 * The audit trail: an append-only record of every sweep's decision. When the
 * agent service has Dynatrace ingest configured, each approval is also written
 * back to the tenant as a log — surfaced here with a "Dynatrace" badge.
 */
export function AuditTrail({ refreshKey }: { refreshKey?: string | number }) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [writeback, setWriteback] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      getLedger(8)
        .then((r) => {
          if (cancelled) return;
          setEntries(r.entries);
          setWriteback(r.dynatrace_writeback);
          setLoaded(true);
        })
        .catch(() => {
          if (!cancelled) setLoaded(true);
        });
    };
    load();
    // Poll: the agent records the entry on real completion, which lags the UI's
    // optimistic "resolved" by the model's ACT+VERIFY time. Polling catches it.
    const id = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refreshKey]);

  // Nothing recorded yet → don't take up space.
  if (loaded && entries.length === 0) return null;

  return (
    <div style={{ border: "1px solid var(--color-border-subtle)", borderRadius: "8px", overflow: "hidden" }}>
      <div
        className="panel-header"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}
      >
        <span>Audit trail</span>
        {writeback && (
          <span
            title="Every approval is written back to the Dynatrace tenant as a log — auditable on Dynatrace's own timeline."
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "9px",
              fontFamily: "var(--font-mono)",
              padding: "1px 6px",
              borderRadius: "3px",
              color: "var(--color-accent)",
              backgroundColor: "var(--color-accent-dim)",
              border: "1px solid rgba(0,212,240,0.2)",
              letterSpacing: "0.02em",
            }}
          >
            ✓ Dynatrace
          </span>
        )}
      </div>
      <div>
        {entries.map((e, i) => (
          <div
            key={`${e.run_id}-${i}`}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "9px",
              padding: "8px 12px",
              borderBottom: i < entries.length - 1 ? "1px solid var(--color-border-subtle)" : "none",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                marginTop: "5px",
                flexShrink: 0,
                backgroundColor: DECISION_COLOR[e.decision] ?? "var(--color-text-dim)",
                boxShadow: e.decision === "approved" ? "0 0 6px var(--color-green-glow)" : "none",
              }}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: "11.5px",
                  fontFamily: "var(--font-sans)",
                  color: "var(--color-text-secondary)",
                  letterSpacing: "-0.005em",
                  lineHeight: 1.4,
                }}
              >
                <span style={{ color: DECISION_COLOR[e.decision], fontWeight: 600 }}>
                  {DECISION_LABEL[e.decision] ?? e.decision}
                </span>
                {e.action?.tool && (
                  <>
                    {" · "}
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>
                      {e.action.tool}
                    </span>
                  </>
                )}
              </div>
              <div
                style={{
                  fontSize: "9.5px",
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-text-dim)",
                  letterSpacing: "0.02em",
                  marginTop: "2px",
                }}
              >
                {e.operator} · {e.outcome} · {relTime(e.ts)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
