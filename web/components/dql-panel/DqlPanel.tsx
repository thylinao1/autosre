"use client";

import type { DqlRecord } from "@/lib/types";

interface DqlPanelProps {
  query: string | null;
  records: DqlRecord[];
  reasoning: string;
}

function JsonValue({ value }: { value: unknown }) {
  if (typeof value === "number") {
    return <span style={{ color: "var(--color-accent)" }}>{value}</span>;
  }
  if (typeof value === "boolean") {
    return <span style={{ color: "var(--color-amber)" }}>{String(value)}</span>;
  }
  if (value === null || value === undefined) {
    return <span style={{ color: "var(--color-text-dim)" }}>null</span>;
  }
  if (typeof value === "object") {
    return <span style={{ color: "var(--color-text-secondary)", fontFamily: "var(--font-mono)" }}>{JSON.stringify(value)}</span>;
  }
  return <span style={{ color: "var(--color-green-text)" }}>&quot;{String(value)}&quot;</span>;
}

export function DqlPanel({ query, records, reasoning }: DqlPanelProps) {
  const hasData = query || records.length > 0 || reasoning;

  if (!hasData) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100%",
          padding: "40px 20px",
          textAlign: "center",
          gap: "12px",
        }}
      >
        <div
          className="animate-idle-breathe"
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "8px",
            border: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "var(--color-surface-0)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="12" cy="5" rx="9" ry="3"/>
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
          </svg>
        </div>
        <p style={{
          fontSize: "12.5px",
          fontFamily: "var(--font-sans)",
          color: "var(--color-text-muted)",
          lineHeight: 1.6,
          letterSpacing: "-0.005em",
        }}>
          The agent&apos;s DQL evidence
          <br />
          shows up here during diagnosis.
        </p>
      </div>
    );
  }

  const columns = records.length > 0
    ? Object.keys(records[0]).filter((k) => k !== "__type")
    : [];

  return (
    <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "14px", overflowY: "auto", maxHeight: "100%" }}>
      {/* Root cause — lead with the plain-English conclusion, not the query syntax */}
      {reasoning && (
        <div>
          <p style={{
            fontSize: "11px",
            fontFamily: "var(--font-sans)",
            letterSpacing: "-0.005em",
            color: "var(--color-text-muted)",
            marginBottom: "7px",
            fontWeight: 600,
          }}>
            Root cause
          </p>
          <div style={{
            borderRadius: "7px",
            border: "1px solid rgba(120,85,240,0.22)",
            backgroundColor: "rgba(120,85,240,0.05)",
            padding: "11px 13px",
          }}>
            <p style={{
              fontSize: "12.5px",
              fontFamily: "var(--font-sans)",
              color: "var(--color-text-primary)",
              lineHeight: 1.6,
              letterSpacing: "-0.005em",
            }}>
              {reasoning}
            </p>
          </div>
        </div>
      )}

      {/* DQL query — the agent's own query, shown as the work behind the finding */}
      {query && (
        <div>
          <p style={{
            fontSize: "11px",
            fontFamily: "var(--font-sans)",
            letterSpacing: "-0.005em",
            color: "var(--color-text-muted)",
            marginBottom: "7px",
            fontWeight: 600,
          }}>
            Query the agent ran
          </p>
          <div style={{
            borderRadius: "7px",
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-surface-1)",
            padding: "10px 12px",
            overflowX: "auto",
          }}>
            <pre style={{
              fontSize: "10.5px",
              fontFamily: "var(--font-mono)",
              color: "var(--color-text-secondary)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              lineHeight: 1.65,
              margin: 0,
            }}>
              <span style={{ color: "var(--color-accent)" }}>fetch</span>
              {" "}
              {query.replace(/^fetch\s+/i, "")}
            </pre>
          </div>
        </div>
      )}

      {/* Records table */}
      {records.length > 0 && (
        <div>
          <p style={{
            fontSize: "11px",
            fontFamily: "var(--font-sans)",
            letterSpacing: "-0.005em",
            color: "var(--color-text-muted)",
            marginBottom: "7px",
            fontWeight: 600,
          }}>
            Evidence · {records.length} record{records.length !== 1 ? "s" : ""}
          </p>
          <div style={{
            borderRadius: "7px",
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-surface-1)",
            overflowX: "auto",
          }}>
            <table style={{ width: "100%", fontSize: "10.5px", fontFamily: "var(--font-mono)", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                  {columns.map((col) => (
                    <th
                      key={col}
                      style={{
                        padding: "7px 10px",
                        textAlign: "left",
                        fontSize: "10px",
                        letterSpacing: "0.01em",
                        color: "var(--color-text-muted)",
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                      }}
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
                    style={{
                      borderBottom: i < records.length - 1 ? "1px solid var(--color-border-subtle)" : "none",
                      transition: "background-color var(--duration-fast) ease",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "var(--color-surface-2)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "transparent"; }}
                  >
                    {columns.map((col) => (
                      <td key={col} style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>
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
    </div>
  );
}
