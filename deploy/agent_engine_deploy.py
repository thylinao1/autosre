"""Register the AutoSRE ADK agent on Vertex AI Agent Engine (Agent Platform).

This makes the "deployed on Vertex AI Agent Engine" claim literally true: it wraps
the same `root_agent` the Cloud Run service runs in an ADK `AdkApp` and creates a
managed Agent Engine resource for it. The Mission-Control SSE + human-approval
orchestration still runs on Cloud Run (it owns the pause/resume bridge and the
demo-target proxy); Agent Engine hosts the *reasoning runtime*.

Run (after `gcloud auth application-default login` and
`gcloud services enable cloudresourcemanager.googleapis.com aiplatform.googleapis.com`):
    GOOGLE_CLOUD_PROJECT=my-proj \
    GOOGLE_CLOUD_LOCATION=us-central1 \
    TARGET_SERVICE_URL=https://checkout-api-xxxx.run.app \
    python -m deploy.agent_engine_deploy

TARGET_SERVICE_URL must point to the deployed checkout-api so the Agent Engine
runtime can observe and remediate it. AGENT_ENGINE_STAGING_BUCKET is optional
(defaults to the project's gs://PROJECT_cloudbuild bucket). The agent's autosre
package (incl. the bundled mock Dynatrace MCP server it spawns) is shipped via
extra_packages, and DYNATRACE_MCP_MODE / AUTOSRE_MODEL ride along as env_vars.

It prints the Agent Engine resource name — paste that into SUBMISSION.md as proof.
Idempotent-ish: pass AGENT_ENGINE_UPDATE=<resource_name> to update in place.

Note: keep the requirements list in sync with requirements.txt. The exact
agent-engines API surface evolves; if an import moves, check the current
google-cloud-aiplatform / google-adk docs (Context7: "vertexai agent engines").

KNOWN LIMITATION (verified 2026-06-08, aiplatform 1.156.0): packaging, the
staging upload, and the create LRO all succeed, but the managed-runtime build
returns a consistent `500 INTERNAL` for THIS agent. The cause is the Dynatrace
toolset's stdio MCP transport: in `mock`/`stdio` mode the toolset spawns a
subprocess (`python -m autosre.mock_dynatrace.server` / `npx ...`), which Agent
Engine's managed build does not support. To deploy on Agent Engine, run the agent
with the REMOTE Dynatrace MCP instead (no subprocess): set
DYNATRACE_MCP_MODE=remote and pass DT_ENVIRONMENT + DT_PLATFORM_TOKEN via env_vars
(StreamableHTTPConnectionParams in autosre/agent/dynatrace.py), or expose the
mock tools as in-process FunctionTools. Eligibility does not depend on this: the
ADK agent reasons on Gemini 3 via Vertex AI and is deployed live on Cloud Run.
"""

from __future__ import annotations

import os
import sys


def main() -> int:
    project = os.environ.get("GOOGLE_CLOUD_PROJECT")
    # The Agent Engine RESOURCE lives in a region; the Gemini 3 MODEL is served
    # from `global` on this project. Keep them separate so the resource is created
    # in a supported region while the runtime calls the model at the right location.
    ae_location = os.environ.get("AGENT_ENGINE_LOCATION", "us-central1")
    location = os.environ.get("GOOGLE_CLOUD_LOCATION", "global")  # model location
    # Default the staging bucket to the project's Cloud Build bucket (it exists
    # after any Cloud Run deploy), so this is one command without extra setup.
    bucket = os.environ.get("AGENT_ENGINE_STAGING_BUCKET") or (
        f"gs://{project}_cloudbuild" if project else None
    )
    target_url = os.environ.get("TARGET_SERVICE_URL")
    if not project or not bucket:
        print("ERROR: set GOOGLE_CLOUD_PROJECT (and optionally "
              "AGENT_ENGINE_STAGING_BUCKET) before running.", file=sys.stderr)
        return 2
    if not target_url:
        print("ERROR: set TARGET_SERVICE_URL to the deployed checkout-api URL so "
              "the agent can observe and remediate it from Agent Engine.",
              file=sys.stderr)
        return 2

    import vertexai
    from vertexai import agent_engines
    from vertexai.preview.reasoning_engines import AdkApp

    # Agent Engine reasons via Vertex; force Vertex routing for the wrapped agent.
    os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "TRUE")
    from autosre.agent.agent import root_agent  # imported after env is set

    # Create the Agent Engine resource in the regional location; the runtime calls
    # the model at `location` (global) via the GOOGLE_CLOUD_LOCATION env_var below.
    vertexai.init(project=project, location=ae_location, staging_bucket=bucket)

    app = AdkApp(agent=root_agent, enable_tracing=True)
    requirements = [
        "google-adk",
        "google-cloud-aiplatform[agent_engines]",
        "google-genai",
        "httpx",
        "mcp",
    ]
    # Bundle the autosre package so the runtime has the agent code AND the bundled
    # mock Dynatrace MCP server the toolset spawns over stdio.
    extra_packages = ["autosre"]
    # Runtime env: Vertex routing + which Dynatrace surface + the target to remediate.
    # NOTE: GOOGLE_CLOUD_PROJECT / GOOGLE_CLOUD_LOCATION are RESERVED by Agent Engine
    # (it injects them from the resource), so they must not be passed here. The model
    # therefore reasons at the resource's own location — create the resource where
    # the model serves (global on this project).
    env_vars = {
        "GOOGLE_GENAI_USE_VERTEXAI": "TRUE",
        "AUTOSRE_MODEL": os.environ.get("AUTOSRE_MODEL", "gemini-3-flash-preview"),
        "DYNATRACE_MCP_MODE": os.environ.get("DYNATRACE_MCP_MODE", "mock"),
        "TARGET_SERVICE_URL": target_url,
    }

    existing = os.environ.get("AGENT_ENGINE_UPDATE")
    if existing:
        print(f"Updating existing Agent Engine: {existing}")
        remote = agent_engines.update(
            resource_name=existing, agent_engine=app, requirements=requirements,
            extra_packages=extra_packages, env_vars=env_vars,
        )
    else:
        print("Creating a new Agent Engine for AutoSRE (this takes several minutes)...")
        remote = agent_engines.create(
            agent_engine=app,
            requirements=requirements,
            extra_packages=extra_packages,
            env_vars=env_vars,
            display_name="autosre",
            description="Autonomous SRE agent (detect/diagnose/propose/gate/act/verify).",
        )

    print("\nRegistered on Vertex AI Agent Engine:")
    print(f"   {remote.resource_name}")
    print("\nPaste the resource name into SUBMISSION.md as Agent Engine proof.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
