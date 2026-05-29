"use client";

/* AutoSRE — Agent Flow Diagram
   Shows: Dynatrace → DETECT → DIAGNOSE → APPROVE (human gate) → ACT → VERIFY
   Dark circles with light borders, glowing nodes, curved SVG edges, mono labels.
*/

interface Node {
  id: string;
  x: number;
  y: number;
  label: string;
  sublabel?: string;
  color: string;
  glow: string;
  border: string;
  isGate?: boolean;
}

interface Edge {
  from: string;
  to: string;
  label?: string;
  curved?: "up" | "down" | "none";
  dashed?: boolean;
}

const NODES: Node[] = [
  {
    id: "dynatrace",
    x: 60,
    y: 160,
    label: "Dynatrace",
    sublabel: "MCP",
    color: "rgba(0,212,240,0.08)",
    glow: "0 0 24px rgba(0,212,240,0.45)",
    border: "rgba(0,212,240,0.7)",
  },
  {
    id: "detect",
    x: 200,
    y: 160,
    label: "DETECT",
    sublabel: "query-problems",
    color: "rgba(0,212,240,0.06)",
    glow: "0 0 18px rgba(0,212,240,0.3)",
    border: "rgba(0,212,240,0.4)",
  },
  {
    id: "diagnose",
    x: 340,
    y: 160,
    label: "DIAGNOSE",
    sublabel: "execute-dql",
    color: "rgba(139,92,246,0.08)",
    glow: "0 0 18px rgba(139,92,246,0.3)",
    border: "rgba(139,92,246,0.45)",
  },
  {
    id: "gate",
    x: 480,
    y: 160,
    label: "APPROVE",
    sublabel: "human gate",
    color: "rgba(242,168,50,0.08)",
    glow: "0 0 22px rgba(242,168,50,0.4)",
    border: "rgba(242,168,50,0.6)",
    isGate: true,
  },
  {
    id: "act",
    x: 620,
    y: 160,
    label: "ACT",
    sublabel: "remediate",
    color: "rgba(242,168,50,0.06)",
    glow: "0 0 18px rgba(242,168,50,0.25)",
    border: "rgba(242,168,50,0.35)",
  },
  {
    id: "verify",
    x: 760,
    y: 160,
    label: "VERIFY",
    sublabel: "health-check",
    color: "rgba(32,204,128,0.06)",
    glow: "0 0 18px rgba(32,204,128,0.28)",
    border: "rgba(32,204,128,0.45)",
  },
];

const R = 42; // node radius

function getNodeById(id: string): Node {
  return NODES.find((n) => n.id === id)!;
}

function CurvedEdge({
  from,
  to,
  label,
  dashed,
}: {
  from: string;
  to: string;
  label?: string;
  dashed?: boolean;
}) {
  const a = getNodeById(from);
  const b = getNodeById(to);

  const x1 = a.x + R;
  const y1 = a.y;
  const x2 = b.x - R;
  const y2 = b.y;
  const mx = (x1 + x2) / 2;

  const path = `M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;

  const midX = mx;
  const midY = (y1 + y2) / 2 - 12;

  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke={dashed ? "rgba(242,168,50,0.5)" : "rgba(255,255,255,0.12)"}
        strokeWidth={dashed ? "1" : "1.5"}
        strokeDasharray={dashed ? "5 4" : undefined}
        className={dashed ? "dash-flow-animate" : undefined}
        style={dashed ? { strokeDashoffset: 0 } : undefined}
      />
      {/* Arrow head */}
      <polygon
        points={`${x2},${y2} ${x2 - 6},${y2 - 4} ${x2 - 6},${y2 + 4}`}
        fill={dashed ? "rgba(242,168,50,0.5)" : "rgba(255,255,255,0.18)"}
      />
      {label && (
        <text
          x={midX}
          y={midY}
          textAnchor="middle"
          fill="rgba(255,255,255,0.22)"
          fontSize="9"
          fontFamily="var(--font-mono)"
          letterSpacing="0.06em"
        >
          {label}
        </text>
      )}
    </g>
  );
}

function DiagramNode({ node }: { node: Node }) {
  const isGate = node.isGate ?? false;

  return (
    <g>
      {/* Outer glow ring */}
      <circle
        cx={node.x}
        cy={node.y}
        r={R + 8}
        fill="none"
        stroke={node.border}
        strokeWidth="0.5"
        opacity="0.25"
      />

      {/* Main circle */}
      <circle
        cx={node.x}
        cy={node.y}
        r={R}
        fill={node.color}
        stroke={node.border}
        strokeWidth={isGate ? "1.5" : "1"}
        style={{
          filter: `drop-shadow(${node.glow})`,
        }}
      />

      {/* Inner detail — small center dot */}
      <circle
        cx={node.x}
        cy={node.y}
        r={4}
        fill={node.border}
        opacity="0.7"
      />

      {/* Label */}
      <text
        x={node.x}
        y={node.y - 10}
        textAnchor="middle"
        fill="rgba(239,242,250,0.9)"
        fontSize={isGate ? "10" : "9.5"}
        fontWeight={isGate ? "700" : "600"}
        fontFamily="var(--font-mono)"
        letterSpacing="0.12em"
      >
        {node.label}
      </text>

      {/* Sublabel */}
      {node.sublabel && (
        <text
          x={node.x}
          y={node.y + 20}
          textAnchor="middle"
          fill="rgba(255,255,255,0.3)"
          fontSize="8"
          fontFamily="var(--font-mono)"
          letterSpacing="0.06em"
        >
          {node.sublabel}
        </text>
      )}

      {/* Gate indicator */}
      {isGate && (
        <rect
          x={node.x - 16}
          y={node.y + 30}
          width={32}
          height={12}
          rx={3}
          fill="rgba(242,168,50,0.12)"
          stroke="rgba(242,168,50,0.35)"
          strokeWidth="0.75"
        />
      )}
      {isGate && (
        <text
          x={node.x}
          y={node.y + 39}
          textAnchor="middle"
          fill="rgba(242,168,50,0.8)"
          fontSize="7"
          fontFamily="var(--font-mono)"
          letterSpacing="0.08em"
        >
          YOU DECIDE
        </text>
      )}
    </g>
  );
}

export function FlowDiagram() {
  const W = 840;
  const H = 260;

  const edges: Edge[] = [
    { from: "dynatrace", to: "detect", label: "problems" },
    { from: "detect", to: "diagnose", label: "DQL" },
    { from: "diagnose", to: "gate" },
    { from: "gate", to: "act", dashed: true, label: "approved" },
    { from: "act", to: "verify" },
  ];

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "880px",
        margin: "0 auto",
        borderRadius: "16px",
        border: "1px solid var(--color-border)",
        backgroundColor: "var(--color-surface-0)",
        padding: "16px",
        boxShadow: "0 0 60px rgba(0,212,240,0.04), inset 0 1px 0 rgba(255,255,255,0.04)",
        overflow: "hidden",
      }}
    >
      {/* Mini header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        marginBottom: "4px",
      }}>
        <span style={{
          fontSize: "9px",
          fontFamily: "var(--font-mono)",
          textTransform: "uppercase",
          letterSpacing: "0.18em",
          color: "var(--color-text-dim)",
          fontWeight: 500,
        }}>
          Agent Execution Flow
        </span>
        <div style={{ flex: 1, height: "1px", backgroundColor: "var(--color-border-subtle)" }} />
        <span style={{
          fontSize: "9px",
          fontFamily: "var(--font-mono)",
          color: "var(--color-accent)",
          letterSpacing: "0.06em",
        }}>
          checkout-api
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
        aria-hidden="true"
      >
        {/* Subtle grid */}
        <defs>
          <pattern id="diag-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#diag-grid)" />

        {/* Edges first (behind nodes) */}
        {edges.map((e) => (
          <CurvedEdge
            key={`${e.from}-${e.to}`}
            from={e.from}
            to={e.to}
            label={e.label}
            dashed={e.dashed}
          />
        ))}

        {/* Nodes */}
        {NODES.map((node) => (
          <DiagramNode key={node.id} node={node} />
        ))}
      </svg>
    </div>
  );
}
