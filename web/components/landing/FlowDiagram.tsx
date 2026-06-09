"use client";

import { useEffect, useRef, useState } from "react";

/* AutoSRE - Agent Flow Diagram
   Dynatrace -> DETECT -> DIAGNOSE -> APPROVE (human gate) -> ACT -> VERIFY.
   Bigger canvas, a looping execution sweep that lights each phase in order, a
   data pulse that travels the pipeline, and hover-to-focus on every node.
   Honors prefers-reduced-motion (static, fully-lit, no loop). */

interface Node {
  id: string;
  x: number;
  y: number;
  label: string;
  sublabel: string;
  color: string; // solid accent for this phase
  isGate?: boolean;
}

const NODES: Node[] = [
  { id: "dynatrace", x: 90,  y: 142, label: "Dynatrace", sublabel: "MCP",           color: "#00d4f0" },
  { id: "detect",    x: 286, y: 142, label: "Detect",    sublabel: "query_problems", color: "#00d4f0" },
  { id: "diagnose",  x: 482, y: 142, label: "Diagnose",  sublabel: "execute_dql",    color: "#8b5cf6" },
  { id: "gate",      x: 678, y: 142, label: "Approve",   sublabel: "human gate",     color: "#f2a832", isGate: true },
  { id: "act",       x: 874, y: 142, label: "Act",       sublabel: "remediate",      color: "#f2a832" },
  { id: "verify",    x: 1070,y: 142, label: "Verify",    sublabel: "health-check",   color: "#20cc80" },
];

interface Edge {
  from: number;
  to: number;
  label: string;
  dashed?: boolean;
}

const EDGES: Edge[] = [
  { from: 0, to: 1, label: "Problems" },
  { from: 1, to: 2, label: "DQL" },
  { from: 2, to: 3, label: "" },
  { from: 3, to: 4, label: "Approved", dashed: true },
  { from: 4, to: 5, label: "" },
];

const R = 52;
const W = 1160;
const H = 286;

function edgePath(a: Node, b: Node): string {
  const x1 = a.x + R;
  const x2 = b.x - R;
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${a.y} C ${mx} ${a.y} ${mx} ${b.y} ${x2} ${b.y}`;
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function FlowDiagram() {
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const [reduced, setReduced] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      setReduced(true);
      setActive(NODES.length - 1);
      return;
    }
    let i = 0;
    const tick = () => {
      i = i >= NODES.length - 1 ? 0 : i + 1;
      setActive(i);
      // Linger on the final VERIFY beat, and on the reset, before sweeping again.
      timer.current = window.setTimeout(tick, i === NODES.length - 1 ? 1700 : i === 0 ? 900 : 1000);
    };
    timer.current = window.setTimeout(tick, 1100);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  // The focused node is whatever you hover; otherwise the current sweep head.
  const focus = hovered ?? active;
  const pipelineY = NODES[0].y;
  const pulsePath = `M ${NODES[0].x} ${pipelineY} L ${NODES[NODES.length - 1].x} ${pipelineY}`;

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "1120px",
        margin: "0 auto",
        borderRadius: "18px",
        border: "1px solid var(--color-border)",
        backgroundColor: "var(--color-surface-0)",
        padding: "clamp(18px, 2.4vw, 30px) clamp(16px, 2.2vw, 30px) clamp(14px, 2vw, 24px)",
        boxShadow: "0 0 80px rgba(0,212,240,0.05), inset 0 1px 0 rgba(255,255,255,0.04)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
        <span
          style={{
            fontSize: "12px",
            fontFamily: "var(--font-sans)",
            letterSpacing: "-0.005em",
            color: "var(--color-text-secondary)",
            fontWeight: 600,
          }}
        >
          Agent execution flow
        </span>
        <div style={{ flex: 1, height: "1px", backgroundColor: "var(--color-border-subtle)" }} />
        <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--color-accent)", letterSpacing: "0.04em" }}>
          checkout-api
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
        role="img"
        aria-label="Agent flow: Dynatrace to Detect, Diagnose, Approve (human gate), Act, then Verify."
      >
        <defs>
          <pattern id="diag-grid" width="44" height="44" patternUnits="userSpaceOnUse">
            <path d="M 44 0 L 0 0 0 44" fill="none" stroke="rgba(255,255,255,0.022)" strokeWidth="0.5" />
          </pattern>
          <filter id="soft-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width={W} height={H} fill="url(#diag-grid)" />

        {/* Edges */}
        {EDGES.map((e) => {
          const a = NODES[e.from];
          const b = NODES[e.to];
          const d = edgePath(a, b);
          const charged = active > e.from; // the sweep has passed this edge's source
          const tint = b.color;
          const midX = (a.x + R + (b.x - R)) / 2;
          return (
            <g key={`${e.from}-${e.to}`}>
              {/* base rail */}
              <path d={d} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1.5"
                strokeDasharray={e.dashed ? "6 5" : undefined} />
              {/* charged overlay - draws in when the sweep reaches it */}
              <path
                d={d}
                fill="none"
                stroke={tint}
                strokeWidth={e.dashed ? "1.75" : "2.25"}
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray={e.dashed ? "6 5" : 100}
                style={{
                  strokeDashoffset: e.dashed ? 0 : charged ? 0 : 100,
                  opacity: charged ? 0.9 : 0,
                  filter: charged ? `drop-shadow(0 0 5px ${hexA(tint, 0.55)})` : "none",
                  transition: "stroke-dashoffset 0.6s var(--ease-out-quint), opacity 0.5s ease",
                }}
              />
              <polygon
                points={`${b.x - R},${b.y} ${b.x - R - 7},${b.y - 5} ${b.x - R - 7},${b.y + 5}`}
                fill={charged ? tint : "rgba(255,255,255,0.18)"}
                style={{ transition: "fill 0.4s ease" }}
              />
              {e.label && (
                <text x={midX} y={a.y - 16} textAnchor="middle"
                  fill={charged ? hexA(tint, 0.8) : "rgba(255,255,255,0.28)"}
                  fontSize="10.5" fontFamily="var(--font-mono)" letterSpacing="0.05em"
                  style={{ transition: "fill 0.4s ease" }}>
                  {e.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Traveling data pulse - continuous flow along the pipeline */}
        {!reduced && (
          <circle r="4.5" fill="#cfeffd" opacity="0">
            <animateMotion dur="3.8s" repeatCount="indefinite" path={pulsePath} keyPoints="0;1" keyTimes="0;1" calcMode="linear" />
            <animate attributeName="opacity" dur="3.8s" repeatCount="indefinite"
              values="0;0.9;0.9;0" keyTimes="0;0.08;0.9;1" />
            <animate attributeName="r" dur="3.8s" repeatCount="indefinite" values="3;5;3" keyTimes="0;0.5;1" />
          </circle>
        )}

        {/* Nodes */}
        {NODES.map((node, i) => {
          const reached = i <= active;
          const isFocus = i === focus;
          const tint = node.color;
          const ringOpacity = isFocus ? 0.9 : reached ? 0.5 : 0.18;
          const fillBase = reached ? hexA(tint, isFocus ? 0.16 : 0.09) : "rgba(255,255,255,0.015)";
          const labelColor = reached ? "rgba(239,242,250,0.96)" : "rgba(239,242,250,0.4)";
          const subColor = isFocus ? hexA(tint, 0.95) : reached ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.22)";
          return (
            <g
              key={node.id}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{
                cursor: "pointer",
                transformBox: "fill-box",
                transformOrigin: "center",
                transform: isFocus ? "scale(1.07)" : "scale(1)",
                transition: "transform 0.4s var(--ease-out-quint)",
              }}
            >
              {/* hit area */}
              <circle cx={node.x} cy={node.y} r={R + 14} fill="transparent" />

              {/* focus pulse ring */}
              {isFocus && !reduced && (
                <circle cx={node.x} cy={node.y} r={R + 4} fill="none" stroke={tint} strokeWidth="1.5" opacity="0.5">
                  <animate attributeName="r" dur="1.8s" repeatCount="indefinite" values={`${R + 2};${R + 12};${R + 2}`} />
                  <animate attributeName="opacity" dur="1.8s" repeatCount="indefinite" values="0.55;0;0.55" />
                </circle>
              )}

              {/* outer ring */}
              <circle cx={node.x} cy={node.y} r={R + 8} fill="none" stroke={tint} strokeWidth="0.75"
                opacity={ringOpacity * 0.45} style={{ transition: "opacity 0.4s ease" }} />

              {/* main disc */}
              <circle
                cx={node.x} cy={node.y} r={R}
                fill={fillBase}
                stroke={tint}
                strokeWidth={node.isGate ? 1.75 : 1.25}
                style={{
                  opacity: reached ? 1 : 0.55,
                  filter: isFocus ? `drop-shadow(0 0 16px ${hexA(tint, 0.55)})` : reached ? `drop-shadow(0 0 8px ${hexA(tint, 0.28)})` : "none",
                  transition: "all 0.45s var(--ease-out-quint)",
                }}
              />

              {/* center core */}
              <circle cx={node.x} cy={node.y - 2} r={isFocus ? 5 : 4} fill={tint}
                style={{ opacity: reached ? 0.95 : 0.4, transition: "all 0.4s ease" }} />

              <text x={node.x} y={node.y - 12} textAnchor="middle" fill={labelColor}
                fontSize={node.isGate ? 11.5 : 11} fontWeight={node.isGate ? 700 : 600}
                fontFamily="var(--font-mono)" letterSpacing="0.1em"
                style={{ transition: "fill 0.4s ease" }}>
                {node.label}
              </text>

              <text x={node.x} y={node.y + 22} textAnchor="middle" fill={subColor}
                fontSize="9.5" fontFamily="var(--font-mono)" letterSpacing="0.04em"
                style={{ transition: "fill 0.4s ease" }}>
                {node.sublabel}
              </text>

              {/* Gate badge - sits below the circle so it never collides with it */}
              {node.isGate && (
                <>
                  <rect x={node.x - 32} y={node.y + R + 12} width={64} height={19} rx={6}
                    fill={hexA(tint, 0.16)} stroke={hexA(tint, 0.45)} strokeWidth="1" />
                  <text x={node.x} y={node.y + R + 25} textAnchor="middle" fill={hexA(tint, 0.95)}
                    fontSize="10" fontWeight="600" fontFamily="var(--font-sans)" letterSpacing="-0.005em">
                    You decide
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
