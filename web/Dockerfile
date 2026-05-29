# Mission-Control UI — Next.js standalone container for Cloud Run.
#
# NEXT_PUBLIC_AGENT_BASE_URL is a build-time variable (baked into the JS bundle
# by Next.js because it is a NEXT_PUBLIC_ prefix variable). It MUST be supplied
# as --build-arg when building this image so the UI points at the live agent origin.
#
# Example build (deploy script handles this automatically):
#   docker build \
#     --build-arg NEXT_PUBLIC_AGENT_BASE_URL=https://autosre-xxxx.run.app \
#     -t autosre-ui .
#
# next.config.ts sets output:'standalone', which produces a self-contained
# .next/standalone directory with an embedded Node.js server (server.js).

# ── Stage 1: dependencies ────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ── Stage 2: builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Receive the agent origin at build time so Next.js bakes it into the bundle.
ARG NEXT_PUBLIC_AGENT_BASE_URL
ENV NEXT_PUBLIC_AGENT_BASE_URL=${NEXT_PUBLIC_AGENT_BASE_URL}

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── Stage 3: runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# standalone output includes node_modules it needs; copy the three artefacts.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Cloud Run sets PORT; server.js (Next.js standalone) respects it.
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
