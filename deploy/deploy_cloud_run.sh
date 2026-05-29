#!/usr/bin/env bash
# ============================================================================
# deploy/deploy_cloud_run.sh — AutoSRE one-command Cloud Run deploy
# ============================================================================
#
# WHAT THIS SCRIPT DOES (in order):
#   1. Build + deploy  checkout-api   (demo target)          → capture TARGET_URL
#   2. Build + deploy  autosre agent  (python -m autosre.server, Vertex AI)
#                      ALLOWED_ORIGIN="*" as permissive placeholder
#                      → capture AGENT_URL
#   3. Build UI image  via Cloud Build (bakes NEXT_PUBLIC_AGENT_BASE_URL at
#                      build time — required for Next.js NEXT_PUBLIC_ vars)
#      Deploy          autosre-ui to Cloud Run                → capture UI_URL
#   4. Tighten CORS:   update autosre ALLOWED_ORIGIN → UI_URL  (resolves the
#                      circular dep: agent needs UI origin, UI needs agent URL)
#   5. Print the public submission URL (UI_URL).
#
# ONE-COMMAND RUN (after prereqs below):
#   PROJECT_ID=my-project REGION=us-central1 bash deploy/deploy_cloud_run.sh
#
# PREREQS (one-time):
#   gcloud auth login
#   gcloud auth application-default login          # for Vertex ADC on Cloud Run
#   gcloud config set project $PROJECT_ID
#   gcloud services enable \
#     run.googleapis.com \
#     aiplatform.googleapis.com \
#     cloudbuild.googleapis.com \
#     secretmanager.googleapis.com
#
# REQUIRED ENV VARS (no defaults — must be set before running):
#   PROJECT_ID          GCP project id
#   REGION              Cloud Run / Vertex region, e.g. us-central1
#
# OPTIONAL ENV VARS:
#   DYNATRACE_MCP_MODE  mock (default) | remote | stdio
#
# SWITCHING TO REMOTE DYNATRACE MODE:
#   1. Store secrets in Secret Manager (never hardcode or pass on CLI):
#        printf '%s' "$DT_ENVIRONMENT"    | gcloud secrets create dt-environment    --data-file=-
#        printf '%s' "$DT_PLATFORM_TOKEN" | gcloud secrets create dt-platform-token --data-file=-
#   2. Set DYNATRACE_MCP_MODE=remote before running this script.
#   3. Add the --set-secrets flag to the autosre deploy command in step 2:
#        --set-secrets "DT_ENVIRONMENT=dt-environment:latest,DT_PLATFORM_TOKEN=dt-platform-token:latest"
#      (The placeholder comment below marks where to add this.)
#
# ============================================================================

set -euo pipefail

# ── Required var checks ──────────────────────────────────────────────────────
: "${PROJECT_ID:?ERROR: set PROJECT_ID before running}"
: "${REGION:=us-central1}"
: "${DYNATRACE_MCP_MODE:=mock}"
# Reasoning model. Default pro (best for the submission demo); override with
# AUTOSRE_MODEL=gemini-3-flash-preview for a cheaper run. On Vertex there is no
# free-tier rate cap, so either works without backoff.
: "${AUTOSRE_MODEL:=gemini-3-pro-preview}"

IMAGE_TS="$(date +%Y%m%d%H%M%S)"
UI_IMAGE="gcr.io/${PROJECT_ID}/autosre-ui:${IMAGE_TS}"
TARGET_IMAGE="gcr.io/${PROJECT_ID}/checkout-api:${IMAGE_TS}"
AGENT_IMAGE="gcr.io/${PROJECT_ID}/autosre:${IMAGE_TS}"

# ── 1. checkout-api (demo target) ────────────────────────────────────────────
# `gcloud run deploy --source` only honors a root Dockerfile, but our two Python
# services need different Dockerfiles from the same repo root — so we build each
# image via Cloud Build (deploy/cloudbuild.svc.yaml builds an arbitrary -f path)
# then deploy by --image. (Cloud Build respects .gitignore, so .venv/node_modules
# are not uploaded.)
echo "==> [1/4] Building + deploying checkout-api (demo target)"
gcloud builds submit . \
  --config deploy/cloudbuild.svc.yaml \
  --project "${PROJECT_ID}" \
  --substitutions "_DOCKERFILE=deploy/Dockerfile.target,_IMAGE=${TARGET_IMAGE}" \
  --quiet
gcloud run deploy checkout-api \
  --image "${TARGET_IMAGE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --allow-unauthenticated \
  --quiet

TARGET_URL=$(gcloud run services describe checkout-api \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format="value(status.url)")
echo "    checkout-api: ${TARGET_URL}"

# ── 2. autosre agent (python -m autosre.server, Gemini 3 via Vertex AI) ─────
echo "==> [2/4] Building + deploying autosre agent (SSE backend, Vertex AI)"
gcloud builds submit . \
  --config deploy/cloudbuild.svc.yaml \
  --project "${PROJECT_ID}" \
  --substitutions "_DOCKERFILE=deploy/Dockerfile.agent,_IMAGE=${AGENT_IMAGE}" \
  --quiet
gcloud run deploy autosre \
  --image "${AGENT_IMAGE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --allow-unauthenticated \
  --quiet \
  --set-env-vars "\
GOOGLE_GENAI_USE_VERTEXAI=TRUE,\
GOOGLE_CLOUD_PROJECT=${PROJECT_ID},\
GOOGLE_CLOUD_LOCATION=${REGION},\
AUTOSRE_MODEL=${AUTOSRE_MODEL},\
DYNATRACE_MCP_MODE=${DYNATRACE_MCP_MODE},\
TARGET_SERVICE_URL=${TARGET_URL},\
ALLOWED_ORIGIN=*"
# ^ ALLOWED_ORIGIN starts permissive; step 4 tightens it to UI_URL.
# ^ For remote mode add: --set-secrets "DT_ENVIRONMENT=dt-environment:latest,DT_PLATFORM_TOKEN=dt-platform-token:latest"

AGENT_URL=$(gcloud run services describe autosre \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format="value(status.url)")
echo "    autosre agent: ${AGENT_URL}"

# ── 3. Mission-Control UI (Next.js standalone) ───────────────────────────────
# NEXT_PUBLIC_* vars are baked into the JS bundle at Next.js build time, so the
# image must be built with the agent URL as a Docker build-arg. Cloud Build is
# used (rather than `--source`) so we can pass --substitutions.
echo "==> [3/4] Building Mission-Control UI image via Cloud Build"
echo "    baking NEXT_PUBLIC_AGENT_BASE_URL=${AGENT_URL}"
gcloud builds submit web/ \
  --config web/cloudbuild.yaml \
  --project "${PROJECT_ID}" \
  --substitutions "_NEXT_PUBLIC_AGENT_BASE_URL=${AGENT_URL},_IMAGE=${UI_IMAGE}" \
  --quiet

echo "    Deploying autosre-ui to Cloud Run"
gcloud run deploy autosre-ui \
  --image "${UI_IMAGE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --allow-unauthenticated \
  --quiet \
  --set-env-vars "NODE_ENV=production"

UI_URL=$(gcloud run services describe autosre-ui \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format="value(status.url)")
echo "    Mission-Control UI: ${UI_URL}"

# ── 4. Tighten CORS: lock agent ALLOWED_ORIGIN to the actual UI origin ───────
echo "==> [4/4] Locking agent CORS → ${UI_URL}"
gcloud run services update autosre \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --update-env-vars "ALLOWED_ORIGIN=${UI_URL}" \
  --quiet

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo "  AutoSRE deploy complete"
echo "  Public submission URL (open in incognito to verify):"
echo ""
echo "    ${UI_URL}"
echo ""
echo "  Agent endpoint (internal):  ${AGENT_URL}"
echo "  Target endpoint (internal): ${TARGET_URL}"
echo "============================================================"
