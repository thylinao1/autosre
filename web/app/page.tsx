import Link from "next/link";
import Image from "next/image";
import { FlowDiagram } from "@/components/landing/FlowDiagram";
import { NavLinks } from "@/components/landing/NavLinks";
import { ScrollReveal } from "@/components/landing/ScrollReveal";
import { ScrollProgress } from "@/components/landing/ScrollProgress";
import { CountUp } from "@/components/landing/CountUp";
import { REPO_URL } from "@/lib/api";

/* ── Landing page - AutoSRE
   Server Component - no event handlers here.
   All interactivity is delegated to Client Components (NavLinks, FlowDiagram).
   ──────────────────────────────────────────────────────── */

export default function LandingPage() {
  return (
    <>
      <ScrollProgress />
      <ScrollReveal />
      <SiteNav />
      <main>
        <HeroSection />
        <ReceiptsStrip />
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
      {/* Wordmark - left */}
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

      {/* Center nav links - Client Component (uses Link + CSS hover).
          Display is controlled by the `hidden md:flex` utilities (hidden under
          768px so the links can't collide with the wordmark/GitHub pill on
          mobile); an inline `display` here would override `.hidden` and force
          them visible, so it is intentionally omitted. */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
        }}
        className="hidden md:flex"
      >
        <NavLinks />
      </div>

      {/* GitHub pill - right */}
      <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
        <a
          href={REPO_URL}
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
        padding:
          "clamp(56px, 8vw, 96px) clamp(20px, 5vw, 64px) clamp(48px, 7vw, 88px)",
        overflow: "hidden",
      }}
    >
      {/* One quiet light source, anchored behind the product panel */}
      <div
        aria-hidden="true"
        className="hero-aurora"
        style={{
          top: "-12%",
          right: "-6%",
          width: "min(700px, 70vw)",
          height: "min(540px, 60vw)",
          background:
            "radial-gradient(ellipse at center, rgba(0,212,240,0.09) 0%, transparent 70%)",
          animation: "aurora-drift-a 30s ease-in-out infinite",
          zIndex: 0,
        }}
      />

      <div
        className="hero-grid"
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: "1200px",
          margin: "0 auto",
        }}
      >
        {/* The claim */}
        <div style={{ minWidth: 0 }}>
          <h1
            id="hero-heading"
            className="hero-rise"
            style={{
              fontSize: "clamp(2.4rem, 4.4vw, 3.8rem)",
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              lineHeight: 1.06,
              letterSpacing: "-0.04em",
              color: "var(--color-text-primary)",
              marginBottom: "clamp(18px, 2.5vw, 26px)",
              textWrap: "balance",
              ["--hero-i" as string]: 0,
            } as React.CSSProperties}
          >
            The on-call engineer that{" "}
            <span style={{ color: "var(--color-accent)" }}>asks first.</span>
          </h1>

          <p
            className="hero-rise"
            style={{
              fontSize: "clamp(1rem, 1.6vw, 1.125rem)",
              fontFamily: "var(--font-sans)",
              color: "var(--color-text-secondary)",
              lineHeight: 1.7,
              maxWidth: "46ch",
              marginBottom: "clamp(28px, 4vw, 40px)",
              fontWeight: 400,
              textWrap: "pretty",
              ["--hero-i" as string]: 1,
            } as React.CSSProperties}
          >
            Detects incidents through Dynatrace. Diagnoses root cause with
            Gemini 3. Proposes one precise fix, and waits for your approval.
          </p>

          <div
            className="hero-rise"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              flexWrap: "wrap",
              ["--hero-i" as string]: 2,
            } as React.CSSProperties}
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
              Open Mission Control
            </Link>

            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="pill-btn-secondary"
            >
              View the code
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

        {/* The product, as it actually runs */}
        <div
          className="hero-rise"
          style={{ minWidth: 0, ["--hero-i" as string]: 2 } as React.CSSProperties}
        >
          <div
            style={{
              borderRadius: "14px",
              border: "1px solid var(--color-border)",
              overflow: "hidden",
              backgroundColor: "var(--color-surface-0)",
              boxShadow:
                "0 0 0 1px rgba(0,212,240,0.07), 0 24px 80px rgba(0,0,0,0.55)",
            }}
          >
            <Image
              src="/mission-control.png"
              alt="AutoSRE Mission Control after an approved fix: resolved incident card, the agent timeline with tool calls and reasoning, and the DQL evidence panel."
              width={1440}
              height={900}
              priority
              style={{ width: "100%", height: "auto", display: "block" }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════
   RECEIPTS
   ════════════════════════════════════════ */
function ReceiptsStrip() {
  const facts: { value: string; label: string; href?: string }[] = [
    {
      value: "0/25",
      label: "false actions across graded eval runs",
      href: "/reliability",
    },
    { value: "5/5", label: "no-action traps refused by the agent" },
    { value: "13.3s", label: "median detect to proposed fix, n=25" },
  ];
  return (
    <section
      aria-label="Measured results"
      style={{
        borderTop: "1px solid var(--color-border-subtle)",
        borderBottom: "1px solid var(--color-border-subtle)",
        padding: "clamp(18px, 2.5vw, 26px) clamp(20px, 5vw, 64px)",
      }}
    >
      <div
        className="receipts-grid"
        style={{ maxWidth: "1200px", margin: "0 auto" }}
      >
        {facts.map((f) => {
          const inner = (
            <>
              <span
                style={{
                  fontSize: "1.5rem",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                }}
              >
                {f.value}
              </span>
              <span
                style={{
                  fontSize: "12.5px",
                  fontFamily: "var(--font-sans)",
                  color: "var(--color-text-secondary)",
                  lineHeight: 1.5,
                }}
              >
                {f.label}
              </span>
            </>
          );
          const cellStyle: React.CSSProperties = {
            display: "flex",
            alignItems: "baseline",
            gap: "12px",
            minWidth: 0,
          };
          return f.href ? (
            <Link
              key={f.value}
              href={f.href}
              style={{ ...cellStyle, textDecoration: "none" }}
              title="See the full reliability scorecard"
            >
              {inner}
            </Link>
          ) : (
            <div key={f.value} style={cellStyle}>
              {inner}
            </div>
          );
        })}
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
      data-reveal
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
  return (
    <section
      id="problem"
      style={{
        padding:
          "clamp(60px, 8vw, 100px) clamp(20px, 5vw, 64px)",
        borderTop: "1px solid var(--color-border-subtle)",
      }}
    >
      <div
        className="problem-grid"
        style={{ maxWidth: "1100px", margin: "0 auto" }}
      >
        {/* Dominant: the cost of manual triage */}
        <div data-reveal>
          <p className="section-eyebrow" style={{ marginBottom: "16px" }}>
            The problem
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
              maxWidth: "52ch",
              marginBottom: "clamp(28px, 4vw, 44px)",
            }}
          >
            Every minute of downtime costs revenue and trust. But triaging
            an alert from scratch is slow, manual work, even for experienced
            engineers.
          </p>

          <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
            <span
              style={{
                fontSize: "clamp(3.2rem, 7vw, 5.2rem)",
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                lineHeight: 1,
                letterSpacing: "-0.045em",
                color: "var(--color-text-primary)",
              }}
            >
              <CountUp value="30+" />
            </span>
            <span
              style={{
                fontSize: "1.25rem",
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-muted)",
              }}
            >
              min
            </span>
          </div>
          <p
            style={{
              fontSize: "0.9375rem",
              fontFamily: "var(--font-sans)",
              color: "var(--color-text-secondary)",
              lineHeight: 1.65,
              maxWidth: "46ch",
              marginTop: "10px",
            }}
          >
            Average time to resolve a P1 by hand. Engineers wake up, find
            the alert, read dashboards, form a hypothesis, then fix.
          </p>
        </div>

        {/* Supporting facts, stacked */}
        <div className="problem-side">
          {[
            {
              stat: "3 AM",
              label: "When it always happens",
              detail:
                "Incidents don't respect business hours. On-call rotations burn out your best engineers.",
            },
            {
              stat: "~70%",
              label: "Incidents with known fix patterns",
              detail:
                "Feature flag rollback, replica scale-up, deployment rollback. AutoSRE already knows these playbooks.",
            },
          ].map((p, i) => (
            <div
              key={p.label}
              data-reveal
              style={{
                paddingTop: i > 0 ? "24px" : 0,
                borderTop: i > 0 ? "1px solid var(--color-border-subtle)" : "none",
                marginTop: i > 0 ? "24px" : 0,
                ["--reveal-i" as string]: i + 1,
              } as React.CSSProperties}
            >
              <div
                style={{
                  fontSize: "clamp(1.6rem, 3vw, 2.2rem)",
                  fontFamily: "var(--font-display)",
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  color: "var(--color-text-primary)",
                  lineHeight: 1,
                  marginBottom: "8px",
                }}
              >
                {p.stat}
              </div>
              <div
                style={{
                  fontSize: "0.875rem",
                  fontFamily: "var(--font-sans)",
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                  marginBottom: "6px",
                }}
              >
                {p.label}
              </div>
              <p
                style={{
                  fontSize: "0.8125rem",
                  fontFamily: "var(--font-sans)",
                  color: "var(--color-text-secondary)",
                  lineHeight: 1.65,
                }}
              >
                {p.detail}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
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
      title: "Detect",
      body: "The agent calls the Dynatrace MCP server's query_problems tool. It fetches active AVAILABILITY and PERFORMANCE incidents affecting checkout-api in real time.",
      badge: "query_problems",
    },
    {
      phase: "02",
      phaseColor: "var(--color-diagnose)",
      phaseBorder: "rgba(139,92,246,0.25)",
      title: "Diagnose",
      body: "AutoSRE formulates a DQL query and calls execute_dql to pull exact error-rate metrics, latency histograms, and log samples that led to the incident.",
      badge: "execute_dql",
    },
    {
      phase: "03",
      phaseColor: "var(--color-amber)",
      phaseBorder: "rgba(242,168,50,0.3)",
      title: "Wait for your approval",
      body: "The agent surfaces its proposed remediation (a feature flag toggle, replica scale, or rollback) in an approval modal. Nothing moves until you decide.",
      badge: "require_confirmation",
    },
    {
      phase: "04",
      phaseColor: "var(--color-green)",
      phaseBorder: "rgba(32,204,128,0.22)",
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
        <h2
          data-reveal
          style={{
            fontSize: "clamp(1.8rem, 3.5vw, 3rem)",
            fontFamily: "var(--font-display)",
            fontWeight: 750,
            lineHeight: 1.1,
            letterSpacing: "-0.035em",
            color: "var(--color-text-primary)",
            marginBottom: "clamp(36px, 5vw, 56px)",
            maxWidth: "520px",
          }}
        >
          Four phases. One human gate.
        </h2>

        <ol
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            maxWidth: "760px",
          }}
        >
          {steps.map((s, i) => (
            <li
              key={s.title}
              data-reveal
              style={{
                display: "grid",
                gridTemplateColumns: "40px 1fr",
                gap: "18px",
                paddingBottom: i < steps.length - 1 ? "clamp(26px, 4vw, 40px)" : 0,
                ["--reveal-i" as string]: i,
              } as React.CSSProperties}
            >
              <div
                aria-hidden="true"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    width: "34px",
                    height: "34px",
                    borderRadius: "50%",
                    border: `1px solid ${s.phaseBorder}`,
                    backgroundColor: "var(--color-surface-0)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "11px",
                    fontFamily: "var(--font-mono)",
                    fontWeight: 700,
                    color: s.phaseColor,
                    flexShrink: 0,
                  }}
                >
                  {s.phase}
                </span>
                {i < steps.length - 1 && (
                  <span
                    style={{
                      width: "1px",
                      flex: 1,
                      marginTop: "8px",
                      background: `linear-gradient(to bottom, ${s.phaseBorder}, var(--color-border-subtle))`,
                    }}
                  />
                )}
              </div>

              <div style={{ minWidth: 0, paddingTop: "5px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    flexWrap: "wrap",
                    marginBottom: "8px",
                  }}
                >
                  <h3
                    style={{
                      fontSize: "1.125rem",
                      fontFamily: "var(--font-display)",
                      fontWeight: 700,
                      color: "var(--color-text-primary)",
                      letterSpacing: "-0.02em",
                      lineHeight: 1.25,
                    }}
                  >
                    {s.title}
                  </h3>
                  <code
                    style={{
                      fontSize: "10px",
                      fontFamily: "var(--font-mono)",
                      color: s.phaseColor,
                      letterSpacing: "0.05em",
                      padding: "2px 7px",
                      borderRadius: "5px",
                      border: `1px solid ${s.phaseBorder}`,
                      backgroundColor: "rgba(0,0,0,0.3)",
                    }}
                  >
                    {s.badge}
                  </code>
                </div>
                <p
                  style={{
                    fontSize: "0.875rem",
                    fontFamily: "var(--font-sans)",
                    color: "var(--color-text-secondary)",
                    lineHeight: 1.7,
                    maxWidth: "58ch",
                  }}
                >
                  {s.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
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
      note: "query_problems + execute_dql",
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
          data-reveal
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
          data-reveal
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
              className="arch-row"
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
                  fontSize: "12px",
                  fontFamily: "var(--font-sans)",
                  color: "var(--color-text-secondary)",
                  letterSpacing: "-0.005em",
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
            "radial-gradient(ellipse at center bottom, rgba(0,212,240,0.08) 0%, transparent 65%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <div data-reveal style={{ position: "relative", zIndex: 1 }}>
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
            textWrap: "balance",
          }}
        >
          See an incident resolved{" "}
          <span style={{ color: "var(--color-accent)" }}>in seconds.</span>
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
          · Google Cloud Rapid Agent Hackathon 2026
        </span>
      </div>

      <a
        href={REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="footer-gh-link"
      >
        {REPO_URL.replace(/^https?:\/\//, "")} →
      </a>
    </footer>
  );
}
