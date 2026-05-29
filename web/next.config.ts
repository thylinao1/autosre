import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone output bundles a minimal self-contained server (server.js) that
  // the web/Dockerfile copies into the Cloud Run container and runs directly.
  // Required for containerised Next.js deployments on Cloud Run.
  output: "standalone",
};

export default nextConfig;
