"""Live end-to-end test of the full Gemini agent loop.

Skipped unless a Gemini key is configured (GOOGLE_API_KEY, or Vertex AI via
GOOGLE_GENAI_USE_VERTEXAI=TRUE). When active, it injects a real incident and
asserts the agent diagnoses + remediates it with auto-approval, ending healthy.
"""

from __future__ import annotations

import os

import httpx
import pytest

_HAS_KEY = bool(os.environ.get("GOOGLE_API_KEY")) or \
    os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "").upper() == "TRUE"

pytestmark = pytest.mark.skipif(not _HAS_KEY, reason="no Gemini credentials configured")


@pytest.mark.asyncio
async def test_agent_remediates_payment_incident(target_service):
    httpx.post(f"{target_service}/_admin/inject", json={"fault": "payment_errors"})

    # Import after env (TARGET_SERVICE_URL) is set by the fixture.
    from autosre.run_agent import main as run_main

    try:
        await run_main(auto_approve=True)
    except Exception as err:  # noqa: BLE001
        # Free-tier Gemini can 503/exhaust mid-run after backoff. That's an
        # upstream availability blip, not an agent defect — the deterministic
        # SSE/loop tests already guarantee the contract. Skip rather than fail.
        msg = str(err)
        if any(s in msg for s in ("503", "UNAVAILABLE", "RESOURCE_EXHAUSTED")):
            pytest.skip(f"Gemini free-tier unavailable mid-run: {msg[:120]}")
        raise

    state = httpx.get(f"{target_service}/_internal/state").json()
    assert state["healthy"] is True, "agent failed to resolve the incident"
    assert any(e["resolved"] for e in state["remediation_log"]), "no resolving action taken"
