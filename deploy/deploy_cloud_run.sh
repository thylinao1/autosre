#!/usr/bin/env bash
# Deploy AutoSRE + the demo target service to Google Cloud Run.
#
# Prereqs (one-time):
#   gcloud auth login
#   gcloud config set project YOUR_PROJECT_ID
#   gcloud services enable run.googleapis.com aiplatform.googleapis.com cloudbuild.googleapis.com
#
# Required env before running:
#   PROJECT_ID, REGION (e.g. us-central1)
#   DT_ENVIRONMENT   (e.g. https://abc12345.apps.dynatrace.com)
#   DT_PLATFORM_TOKEN (scopes: mcp-gateway:servers:invoke, :read, storage:*:read)
set -euo pipefail

: "${PROJECT_ID:?set PROJECT_ID}"
: "${REGION:=us-central1}"
: "${DT_ENVIRONMENT:?set DT_ENVIRONMENT}"
: "${DT_PLATFORM_TOKEN:?set DT_PLATFORM_TOKEN}"

echo "==> Deploying checkout-api (demo target)"
gcloud run deploy checkout-api \
  --source . --region "$REGION" --project "$PROJECT_ID" \
  --dockerfile deploy/Dockerfile.target --allow-unauthenticated --quiet

TARGET_URL=$(gcloud run services describe checkout-api \
  --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)')
echo "    target: $TARGET_URL"

echo "==> Deploying autosre agent (Gemini 3 via Vertex AI)"
gcloud run deploy autosre \
  --source . --region "$REGION" --project "$PROJECT_ID" \
  --dockerfile deploy/Dockerfile.agent --allow-unauthenticated --quiet \
  --set-env-vars "GOOGLE_GENAI_USE_VERTEXAI=TRUE,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GOOGLE_CLOUD_LOCATION=$REGION,AUTOSRE_MODEL=gemini-3-pro,DYNATRACE_MCP_MODE=remote,DT_ENVIRONMENT=$DT_ENVIRONMENT,DT_PLATFORM_TOKEN=$DT_PLATFORM_TOKEN,TARGET_SERVICE_URL=$TARGET_URL"

AGENT_URL=$(gcloud run services describe autosre \
  --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)')
echo "==> Done. Agent: $AGENT_URL   Target: $TARGET_URL"
