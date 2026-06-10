import type { NextConfig } from "next";

// Content-Security-Policy for the Mission Control UI.
//
// This is a static marketing + demo surface: it renders no user-generated HTML
// (no dangerouslySetInnerHTML anywhere), and the Google fonts are self-hosted by
// next/font at build time, so no external font/script origins are needed. The one
// cross-origin call the app makes at runtime is the SSE stream + fetch to the
// AutoSRE agent, which lives on a Cloud Run *.run.app host; connect-src allows
// that (and the agent origin baked in at build time) without coupling to one URL.
//
// 'unsafe-inline' is kept for script/style because Next injects its own inline
// bootstrap/hydration script and inline styles, and the page is statically
// prerendered (a nonce-based CSP would force dynamic rendering and break the
// long-cache the demo relies on). frame-ancestors/object-src/base-uri/form-action
// are still locked down, which closes clickjacking and base-tag injection.
const agentOrigin = (process.env.NEXT_PUBLIC_AGENT_BASE_URL || "").replace(/\/$/, "");
const connectSrc = ["'self'", "https://*.run.app", agentOrigin].filter(Boolean).join(" ");

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src ${connectSrc}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // standalone output bundles a minimal self-contained server (server.js) that
  // the web/Dockerfile copies into the Cloud Run container and runs directly.
  // Required for containerised Next.js deployments on Cloud Run.
  output: "standalone",
  // Drop the framework-version banner (x-powered-by: Next.js) - no need to
  // advertise the stack to a scanner.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
