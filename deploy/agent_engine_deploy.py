"""Register the AutoSRE ADK agent on Vertex AI Agent Engine (Agent Platform).

This makes the "deployed on Vertex AI Agent Engine" claim literally true: it wraps
the same `root_agent` the Cloud Run service runs in an ADK `AdkApp` and creates a
managed Agent Engine resource for it. The Mission-Control SSE + human-approval
orchestration still runs on Cloud Run (it owns the pause/resume bridge and the
demo-target proxy); Agent Engine hosts the *reasoning runtime*.

Run (after `gcloud auth application-default login`):
    GOOGLE_CLOUD_PROJECT=my-proj \
    GOOGLE_CLOUD_LOCATION=us-central1 \
    AGENT_ENGINE_STAGING_BUCKET=gs://my-proj-agent-engine \
    python -m deploy.agent_engine_deploy

It prints the Agent Engine resource name — paste that into SUBMISSION.md as proof.
Idempotent-ish: pass AGENT_ENGINE_UPDATE=<resource_name> to update in place.

Note: keep the requirements list in sync with requirements.txt. The exact
agent-engines API surface evolves; if an import moves, check the current
google-cloud-aiplatform / google-adk docs (Context7: "vertexai agent engines").
"""

from __future__ import annotations

import os
import sys


def main() -> int:
    project = os.environ.get("GOOGLE_CLOUD_PROJECT")
    location = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")
    bucket = os.environ.get("AGENT_ENGINE_STAGING_BUCKET")
    if not project or not bucket:
        print(
            "ERROR: set GOOGLE_CLOUD_PROJECT and AGENT_ENGINE_STAGING_BUCKET "
            "(gs://...) before running.",
            file=sys.stderr,
        )
        return 2

    import vertexai
    from vertexai import agent_engines
    from vertexai.preview.reasoning_engines import AdkApp

    # Agent Engine reasons via Vertex; force Vertex routing for the wrapped agent.
    os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "TRUE")
    from autosre.agent.agent import root_agent  # imported after env is set

    vertexai.init(project=project, location=location, staging_bucket=bucket)

    app = AdkApp(agent=root_agent, enable_tracing=True)
    requirements = [
        "google-adk",
        "google-cloud-aiplatform[agent_engines]",
        "google-genai",
        "httpx",
        "mcp",
    ]

    existing = os.environ.get("AGENT_ENGINE_UPDATE")
    if existing:
        print(f"Updating existing Agent Engine: {existing}")
        remote = agent_engines.update(
            resource_name=existing, agent_engine=app, requirements=requirements
        )
    else:
        print("Creating a new Agent Engine for AutoSRE...")
        remote = agent_engines.create(
            agent_engine=app,
            requirements=requirements,
            display_name="autosre",
            description="Autonomous SRE agent (detect/diagnose/propose/gate/act/verify).",
        )

    print("\n✅ Registered on Vertex AI Agent Engine:")
    print(f"   {remote.resource_name}")
    print("\nPaste the resource name into SUBMISSION.md as Agent Engine proof.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
