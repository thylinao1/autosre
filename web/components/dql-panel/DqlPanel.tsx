"use client";

import type { DqlRecord } from "@/lib/types";

interface DqlPanelProps {
  query: string | null;
  records: DqlRecord[];
  reasoning: string;
}

function JsonValue({ value }: { value: unknown }) {
  if (typeof value === "number") {
    return <span className="text-[var(--color-accent)]">{value}</span>;
  }
  if (typeof value === "boolean") {
    return <span className="text-[var(--color-amber)]">{String(value)}</span>;
  }
  if (value === null || value === undefined) {
    return <span className="text-[var(--color-text-dim)]">null</span>;
  }
  return <span className="text-[var(--color-green-text)]">&quot;{String(value)}&quot;</span>;
}

export function DqlPanel({ query, records, reasoning }: DqlPanelProps) {
  const hasData = query || records.length > 0 || reasoning;

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="w-8 h-8 rounded border border-[var(--color-border)] flex items-center justify-center mb-3">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5">
            <ellipse cx="12" cy="5" rx="9" ry="3"/>
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
          </svg>
        </div>
        <p className="text-[11px] font-mono text-[var(--color-text-muted)]">
          DQL evidence will appear during DIAGNOSE
        </p>
      </div>
    );
  }

  // Get column keys from records
  const columns = records.length > 0
    ? Object.keys(records[0]).filter((k) => k !== "__type")
    : [];

  return (
    <div className="p-4 space-y-4 overflow-y-auto max-h-full">
      {/* DQL Query */}
      {query && (
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--color-text-muted)] mb-2">
            DQL Query
          </p>
          <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface-1)] p-3 overflow-x-auto">
            <pre className="text-[11px] font-mono text-[var(--color-text-secondary)] whitespace-pre-wrap break-all leading-relaxed">
              <span className="text-[var(--color-accent)]">fetch</span>
              {" "}
              {query.replace(/^fetch\s+/i, "")}
            </pre>
          </div>
        </div>
      )}

      {/* Records table */}
      {records.length > 0 && (
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--color-text-muted)] mb-2">
            Evidence — {records.length} record{records.length !== 1 ? "s" : ""}
          </p>
          <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface-1)] overflow-x-auto">
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="border-b border-[var(--color-border-subtle)]">
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-[var(--color-border-subtle)] last:border-0 hover:bg-[var(--color-surface-2)] transition-colors"
                  >
                    {columns.map((col) => (
                      <td key={col} className="px-3 py-2 whitespace-nowrap">
                        <JsonValue value={row[col]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Agent reasoning */}
      {reasoning && (
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--color-text-muted)] mb-2">
            Agent Reasoning
          </p>
          <div className="rounded border border-[rgba(128,96,240,0.25)] bg-[rgba(128,96,240,0.06)] p-3">
            <p className="text-xs font-mono text-[var(--color-text-secondary)] leading-relaxed italic">
              {reasoning}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
