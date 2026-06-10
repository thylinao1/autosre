# Submission image gallery

Upload-ready assets for the Devpost gallery (all exactly 3:2, all under 1 MB).
Live screenshots are real captures of the deployed app (refreshed 2026-06-10,
post-hardening deploy); composed cards are rendered from the HTML files in
`../` and screenshot at 1800x1200.

## Screenshots (the live app)
- `gallery-01-landing-hero.png` - landing hero ("The on-call engineer that asks first"), eval stats and the agent execution flow visible.
- `gallery-02-demo-idle.png` - Mission Control, standby: healthy board, demo controls, audit trail.
- `gallery-03-approval-gate.png` - the hero moment: the approval gate (gate seal, "Low risk" badge, proposed args, "agent-generated, unverified", confirmation_id). Use this as the primary image.
- `gallery-04-resolved.png` - incident resolved (green), audit trail shows the approval, two-number timer frozen.
- `gallery-05-declined.png` - the deny path: rejected, "Agent stood down - nothing changed", audited as declined.
- `gallery-06-reliability-scorecard.png` - the /reliability page: 25 graded runs, 0 false actions, 5/5 traps refused, per-scenario table.

## Composed cards (rendered from HTML, brand style)
- `gallery-07-dynatrace-notebook.png` - the Dynatrace notebook frame from the demo video (runs 25 / falseActions 0 / correct 25) set in a brand card with the DQL. Source: `../notebook-card.html`.
- `gallery-08-devices.png` - laptop + phone mockup: the approval gate on a laptop, Mission Control on a phone. Source: `../devices-card.html`.
- `security-card.png` - the security posture card: 50-check scorecard counts and the six layered defenses. Source: `../security-card.html`.

## Brand
- `brand-01-logo.png` - primary logo lockup (gate seal + cyan dot + "autosre" wordmark) on dark navy.
- `brand-02-hero.png` - cover/tagline lockup with the stack line (Gemini 3 · Google Cloud Agent Builder · Dynatrace MCP). Good Devpost cover.
- `brand-03-gradient.png` - logo on a cyan/amber gradient background.
- `brand-04-grid.png` - logo mark on the app's grid texture.

Suggested order for Devpost: brand-02-hero (cover), gallery-03-approval-gate,
gallery-05-declined, gallery-04-resolved, gallery-06-reliability-scorecard,
gallery-07-dynatrace-notebook, security-card, gallery-08-devices,
gallery-01-landing-hero.
