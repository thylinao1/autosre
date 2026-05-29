import Link from "next/link";
import { FlowDiagram } from "@/components/landing/FlowDiagram";
import { NavLinks } from "@/components/landing/NavLinks";

/* ── Landing page — AutoSRE
   Server Component — no event handlers here.
   All interactivity is delegated to Client Components (NavLinks, FlowDiagram).
   ──────────────────────────────────────────────────────── */

export default function LandingPage() {
  return (
    <>
      <SiteNav />
      <main>
        <HeroSection />
        <DiagramSection />
        <ProblemSection />
        <HowItWorksSection />
        <ArchitectureSection />
        <FooterCTA />
      </main>
      <SiteFooter />
    </>
  );
}

/* ════════════════════════════════════════
   NAV
   ════════════════════════════════════════ */
function SiteNav() {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        height: "60px",
        display: "flex",
        alignItems: "center",
        padding: "0 clamp(20px, 5vw, 64px)",
        backgroundColor: "rgba(6,9,15,0.88)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid var(--color-border-subtle)",
      }}
    >
      {/* Wordmark — left */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
        <span
          aria-hidden="true"
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            backgroundColor: "var(--color-accent)",
            boxShadow: "0 0 10px var(--color-accent-glow), 0 0 20px rgba(0,212,240,0.2)",
            flexShrink: 0,
            display: "inline-block",
            animation: "status-blink 3s ease-in-out infinite",
          }}
        />
        <span
          style={{
            fontSize: "1rem",
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
            color: "var(--color-text-primary)",
            letterSpacing: "-0.02em",
          }}
        >
          autosre
        </span>
      </div>

      {/* Center nav links — Client Component (uses Link + CSS hover) */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
        }}
        className="hidden md:flex"
      >
        <NavLinks />
      </div>

      {/* GitHub pill — right */}
      <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
        <a
          href="https://github.com/thylinao1/autosre"
          target="_blank"
          rel="noopener noreferrer"
          className="pill-btn-outline"
        >
          GitHub
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="7" y1="17" x2="17" y2="7"/>
            <polyline points="7 7 17 7 17 17"/>
          </svg>
        </a>
      </div>
    </header>
  );
}

/* ════════════════════════════════════════
   HERO
   ════════════════════════════════════════ */
function HeroSection() {
  return (
    <section
      aria-labelledby="hero-heading"
      style={{
        position: "relative",
        textAlign: "center",
        padding:
          "clamp(80px, 14vw, 160px) clamp(20px, 5vw, 64px) clamp(60px, 10vw, 120px)",
        overflow: "hidden",
      }}
    >
      {/* Radial glow behind hero */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "-10%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(900px, 100%)",
          height: "600px",
          background:
            "radial-gradient(ellipse at center top, rgba(0,212,240,0.12) 0%, rgba(139,92,246,0.06) 40%, transparent 70%)",
          pointerEvents: "none",
          zIndex: 0,
          animation: "hero-glow-pulse 5s ease-in-out infinite",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: "900px",
          margin: "0 auto",
        }}
      >
        {/* Eyebrow badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "5px 14px",
            borderRadius: "9999px",
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-surface-1)",
            marginBottom: "clamp(24px, 4vw, 40px)",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: "5px",
              height: "5px",
              borderRadius: "50%",
              backgroundColor: "var(--color-accent)",
              boxShadow: "0 0 6px var(--color-accent-glow)",
              flexShrink: 0,
              animation: "status-blink 2s ease-in-out infinite",
              display: "inline-block",
            }}
          />
          <span
            style={{
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              color: "var(--color-text-muted)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Google Cloud Hackathon · ADK + Dynatrace MCP
          </span>
        </div>

        {/* Headline */}
        <h1
          id="hero-heading"
          style={{
            fontSize: "var(--text-hero)",
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: "-0.04em",
            color: "var(--color-text-primary)",
            marginBottom: "clamp(20px, 3vw, 32px)",
          }}
        >
          Your on-call agent that{" "}
          <span className="text-gradient">never touches production</span>
          {" "}without your say-so.
        </h1>

        {/* Subhead */}
        <p
          style={{
            fontSize: "clamp(1rem, 1.8vw, 1.2rem)",
            fontFamily: "var(--font-sans)",
            color: "var(--color-text-secondary)",
            lineHeight: 1.7,
            maxWidth: "60ch",
            margin: "0 auto clamp(36px, 5vw, 56px)",
            fontWeight: 400,
          }}
        >
          AutoSRE is an autonomous incident-response agent. It detects anomalies
          from Dynatrace, runs DQL queries to diagnose root cause, proposes a
          precise remediation — then waits for your approval before acting.
          MTTR collapses from 30+ minutes to seconds.
        </p>

        {/* CTA row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <Link href="/demo" className="pill-btn-primary">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Try the Live Demo
          </Link>

          <a
            href="https://github.com/thylinao1/autosre"
            target="_blank"
            rel="noopener noreferrer"
            className="pill-btn-secondary"
          >
            View Code on GitHub
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="7" y1="17" x2="17" y2="7" />
              <polyline points="7 7 17 7 17 17" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════
   FLOW DIAGRAM
   ════════════════════════════════════════ */
function DiagramSection() {
  return (
    <section
      style={{
        padding:
          "0 clamp(20px, 5vw, 64px) clamp(60px, 10vw, 100px)",
      }}
    >
      <FlowDiagram />
    </section>
  );
}

/* ════════════════════════════════════════
   PROBLEM
   ════════════════════════════════════════ */
function ProblemSection() {
  const problems = [
    {
      stat: "30+",
      unit: "min",
      label: "Average MTTR for P1 incidents",
      detail:
        "Engineers wake up, find the alert, reproduce the issue, read dashboards, form a hypothesis.",
    },
    {
      stat: "3 AM",
      unit: "",
      label: "When it always happens",
      detail:
        "Incidents don't respect business hours. On-call rotations burn out your best engineers.",
    },
    {
      stat: "~70%",
      unit: "",
      label: "Incidents with known fix patterns",
      detail:
        "Feature flag rollback, replica scale-up, deployment rollback — AutoSRE already knows these playbooks.",
    },
  ];

  return (
    <section
      id="problem"
      style={{
        padding:
          "clamp(60px, 8vw, 100px) clamp(20px, 5vw, 64px)",
        borderTop: "1px solid var(--color-border-subtle)",
      }}
    >
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <div
          style={{
            marginBottom: "clamp(40px, 6vw, 64px)",
            maxWidth: "560px",
          }}
        >
          <p
            className="section-eyebrow"
            style={{ marginBottom: "16px" }}
          >
            The Problem
          </p>
          <h2
            style={{
              fontSize: "clamp(1.8rem, 3.5vw, 3rem)",
              fontFamily: "var(--font-display)",
              fontWeight: 750,
              lineHeight: 1.1,
              letterSpacing: "-0.035em",
              color: "var(--color-text-primary)",
              marginBottom: "18px",
            }}
          >
            Production fires are expensive and exhausting.
          </h2>
          <p
            style={{
              fontSize: "1rem",
              fontFamily: "var(--font-sans)",
              color: "var(--color-text-secondary)",
              lineHeight: 1.7,
            }}
          >
            Every minute of downtime costs revenue and trust. But triaging
            an alert from scratch is slow, manual work — even for experienced
            engineers.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "20px",
          }}
        >
          {problems.map((p) => (
            <StatCard key={p.label} {...p} />
          ))}
        </div>
      </div>
    </section>
  );
}

function StatCard({
  stat,
  unit,
  label,
  detail,
}: {
  stat: string;
  unit: string;
  label: string;
  detail: string;
}) {
  return (
    <div
      style={{
        borderRadius: "12px",
        border: "1px solid var(--color-border-subtle)",
        backgroundColor: "var(--color-surface-0)",
        padding: "clamp(20px, 3vw, 28px)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: "80px",
          height: "80px",
          background:
            "radial-gradient(ellipse at top right, rgba(0,212,240,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative" }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "4px",
            marginBottom: "10px",
          }}
        >
          <span
            style={{
              fontSize: "clamp(2rem, 4vw, 3rem)",
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: "-0.04em",
              color: "var(--color-text-primary)",
            }}
          >
            {stat}
          </span>
          {unit && (
            <span
              style={{
                fontSize: "1rem",
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-muted)",
              }}
            >
              {unit}
            </span>
          )}
        </div>

        <p
          style={{
            fontSize: "0.9375rem",
            fontFamily: "var(--font-sans)",
            fontWeight: 600,
            color: "var(--color-text-secondary)",
            marginBottom: "8px",
            letterSpacing: "-0.01em",
          }}
        >
          {label}
        </p>

        <p
          style={{
            fontSize: "0.8125rem",
            fontFamily: "var(--font-sans)",
            color: "var(--color-text-muted)",
            lineHeight: 1.65,
          }}
        >
          {detail}
        </p>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   HOW IT WORKS
   ════════════════════════════════════════ */
function HowItWorksSection() {
  const steps = [
    {
      phase: "01",
      phaseColor: "var(--color-accent)",
      phaseBorder: "rgba(0,212,240,0.25)",
      phaseBg: "rgba(0,212,240,0.06)",
      title: "Detect",
      body: "The agent calls the Dynatrace MCP server's query-problems tool. It fetches active AVAILABILITY and PERFORMANCE incidents affecting checkout-api in real time.",
      badge: "query-problems",
    },
    {
      phase: "02",
      phaseColor: "var(--color-diagnose)",
      phaseBorder: "rgba(139,92,246,0.25)",
      phaseBg: "rgba(139,92,246,0.06)",
      title: "Diagnose",
      body: "AutoSRE formulates a DQL query and calls execute-dql to pull exact error-rate metrics, latency histograms, and log samples that led to the incident.",
      badge: "execute-dql",
    },
    {
      phase: "03",
      phaseColor: "var(--color-amber)",
      phaseBorder: "rgba(242,168,50,0.3)",
      phaseBg: "rgba(242,168,50,0.06)",
      title: "Wait for your approval",
      body: "The agent surfaces its proposed remediation — feature flag toggle, replica scale, or rollback — in an approval modal. Nothing moves until you decide.",
      badge: "require_confirmation",
    },
    {
      phase: "04",
      phaseColor: "var(--color-green)",
      phaseBorder: "rgba(32,204,128,0.22)",
      phaseBg: "rgba(32,204,128,0.04)",
      title: "Act & Verify",
      body: "Approved? The remediation executes. The agent health-checks the service until it's green, then emits a structured incident report with a full audit trail.",
      badge: "health-check",
    },
  ];

  return (
    <section
      id="how-it-works"
      style={{
        padding:
          "clamp(60px, 8vw, 100px) clamp(20px, 5vw, 64px)",
        borderTop: "1px solid var(--color-border-subtle)",
      }}
    >
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <div
          style={{ marginBottom: "clamp(40px, 6vw, 64px)", maxWidth: "520px" }}
        >
          <p
            className="section-eyebrow"
            style={{ marginBottom: "16px" }}
          >
            How it works
          </p>
          <h2
            style={{
              fontSize: "clamp(1.8rem, 3.5vw, 3rem)",
              fontFamily: "var(--font-display)",
              fontWeight: 750,
              lineHeight: 1.1,
              letterSpacing: "-0.035em",
              color: "var(--color-text-primary)",
            }}
          >
            Four phases. One human gate.
          </h2>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
            gap: "20px",
          }}
        >
          {steps.map((s) => (
            <StepCard key={s.phase} {...s} />
          ))}
        </div>
      </div>
    </section>
  );
}

function StepCard({
  phase,
  phaseColor,
  phaseBorder,
  phaseBg,
  title,
  body,
  badge,
}: {
  phase: string;
  phaseColor: string;
  phaseBorder: string;
  phaseBg: string;
  title: string;
  body: string;
  badge: string;
}) {
  return (
    <article
      style={{
        borderRadius: "12px",
        border: `1px solid ${phaseBorder}`,
        backgroundColor: phaseBg,
        padding: "clamp(18px, 2.5vw, 24px)",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      <div
        style={{
          width: "36px",
          height: "36px",
          borderRadius: "9px",
          border: `1px solid ${phaseBorder}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
            fontWeight: 700,
            color: phaseColor,
            letterSpacing: "0.06em",
          }}
        >
          {phase}
        </span>
      </div>

      <h3
        style={{
          fontSize: "1.0625rem",
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          color: "var(--color-text-primary)",
          letterSpacing: "-0.02em",
          lineHeight: 1.25,
        }}
      >
        {title}
      </h3>

      <p
        style={{
          fontSize: "0.8125rem",
          fontFamily: "var(--font-sans)",
          color: "var(--color-text-secondary)",
          lineHeight: 1.7,
          flex: 1,
        }}
      >
        {body}
      </p>

      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "3px 8px",
          borderRadius: "5px",
          border: `1px solid ${phaseBorder}`,
          backgroundColor: "rgba(0,0,0,0.3)",
          alignSelf: "flex-start",
        }}
      >
        <span
          style={{
            fontSize: "9px",
            fontFamily: "var(--font-mono)",
            color: phaseColor,
            letterSpacing: "0.06em",
          }}
        >
          {badge}
        </span>
      </div>
    </article>
  );
}

/* ════════════════════════════════════════
   ARCHITECTURE
   ════════════════════════════════════════ */
function ArchitectureSection() {
  const stack = [
    {
      label: "Agent Framework",
      value: "Google ADK (Python)",
      note: "Multi-step reasoning loop",
    },
    {
      label: "Model",
      value: "Gemini 3 Flash",
      note: "Via Vertex AI",
    },
    {
      label: "Observability",
      value: "Dynatrace MCP Server",
      note: "query-problems + execute-dql",
    },
    {
      label: "Human Gate",
      value: "require_confirmation",
      note: "ADK built-in approval primitive",
    },
    {
      label: "Frontend",
      value: "Next.js 16 App Router",
      note: "SSE streaming · Tailwind v4",
    },
    {
      label: "Deploy target",
      value: "GCP Cloud Run",
      note: "Containerised, stateless",
    },
  ];

  return (
    <section
      id="architecture"
      style={{
        padding:
          "clamp(60px, 8vw, 100px) clamp(20px, 5vw, 64px)",
        borderTop: "1px solid var(--color-border-subtle)",
      }}
    >
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <div
          style={{
            marginBottom: "clamp(40px, 5vw, 56px)",
            maxWidth: "480px",
          }}
        >
          <p
            className="section-eyebrow"
            style={{ marginBottom: "16px" }}
          >
            Architecture
          </p>
          <h2
            style={{
              fontSize: "clamp(1.8rem, 3.5vw, 3rem)",
              fontFamily: "var(--font-display)",
              fontWeight: 750,
              lineHeight: 1.1,
              letterSpacing: "-0.035em",
              color: "var(--color-text-primary)",
            }}
          >
            Built on the full Google Cloud AI stack.
          </h2>
        </div>

        <div
          style={{
            borderRadius: "12px",
            border: "1px solid var(--color-border-subtle)",
            backgroundColor: "var(--color-surface-0)",
            overflow: "hidden",
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.01) 1px, transparent 1px)",
            backgroundSize: "100% 3px",
          }}
        >
          {stack.map((row, i) => (
            <div
              key={row.label}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1.5fr 1fr",
                gap: "16px",
                padding:
                  "clamp(14px, 2vw, 18px) clamp(18px, 3vw, 28px)",
                borderBottom:
                  i < stack.length - 1
                    ? "1px solid var(--color-border-subtle)"
                    : "none",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontSize: "11px",
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-text-dim)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  fontWeight: 500,
                }}
              >
                {row.label}
              </span>
              <span
                style={{
                  fontSize: "0.9375rem",
                  fontFamily: "var(--font-sans)",
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                  letterSpacing: "-0.01em",
                }}
              >
                {row.value}
              </span>
              <span
                style={{
                  fontSize: "12px",
                  fontFamily: "var(--font-sans)",
                  color: "var(--color-text-muted)",
                }}
              >
                {row.note}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════
   FOOTER CTA
   ════════════════════════════════════════ */
function FooterCTA() {
  return (
    <section
      style={{
        padding:
          "clamp(60px, 8vw, 100px) clamp(20px, 5vw, 64px)",
        borderTop: "1px solid var(--color-border-subtle)",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          bottom: "-20%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "600px",
          height: "400px",
          background:
            "radial-gradient(ellipse at center bottom, rgba(139,92,246,0.1) 0%, transparent 65%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <div style={{ position: "relative", zIndex: 1 }}>
        <h2
          style={{
            fontSize: "clamp(1.8rem, 4vw, 3.5rem)",
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: "-0.04em",
            color: "var(--color-text-primary)",
            maxWidth: "700px",
            margin: "0 auto 18px",
          }}
        >
          See an incident resolved{" "}
          <span className="text-gradient">in seconds.</span>
        </h2>

        <p
          style={{
            fontSize: "1rem",
            fontFamily: "var(--font-sans)",
            color: "var(--color-text-secondary)",
            maxWidth: "50ch",
            margin: "0 auto clamp(28px, 4vw, 44px)",
            lineHeight: 1.7,
          }}
        >
          No setup. No cloud account. Fire a synthetic payment-error
          incident, watch the agent diagnose it, approve the fix, and
          see the service flip healthy.
        </p>

        <Link
          href="/demo"
          className="pill-btn-primary"
          style={{ fontSize: "14px", padding: "16px 40px" }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          Open Mission Control
        </Link>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════
   SITE FOOTER
   ════════════════════════════════════════ */
function SiteFooter() {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--color-border-subtle)",
        padding: "24px clamp(20px, 5vw, 64px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          aria-hidden="true"
          style={{
            width: "5px",
            height: "5px",
            borderRadius: "50%",
            backgroundColor: "var(--color-accent)",
            boxShadow: "0 0 6px var(--color-accent-glow)",
            flexShrink: 0,
            display: "inline-block",
          }}
        />
        <span
          style={{
            fontSize: "13px",
            fontFamily: "var(--font-mono)",
            color: "var(--color-text-dim)",
            letterSpacing: "-0.01em",
          }}
        >
          autosre
        </span>
        <span
          style={{
            fontSize: "12px",
            fontFamily: "var(--font-sans)",
            color: "var(--color-text-dim)",
          }}
        >
          · Google Cloud Rapid Agent Hackathon 2025
        </span>
      </div>

      <a
        href="https://github.com/thylinao1/autosre"
        target="_blank"
        rel="noopener noreferrer"
        className="footer-gh-link"
      >
        github.com/thylinao1/autosre →
      </a>
    </footer>
  );
}
