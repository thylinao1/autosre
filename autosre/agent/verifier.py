"""Second-opinion verifier — a second, independent Gemini pass that critiques the
proposed remediation BEFORE the human sees it.

This adds a cheap adversarial check between the planner and the operator: a fresh
model, with no stake in the plan, is asked whether the fix is right and what the
single biggest risk is. The critique is surfaced in the approval modal, so the
human decides with a second perspective in hand. Opt-in (AUTOSRE_SECOND_OPINION=1)
because it costs one extra model call per gate; off by default so the demo and
tests are unaffected.
"""

from __future__ import annotations

import os

MODEL = os.environ.get("AUTOSRE_MODEL", "gemini-3-flash-preview")


def enabled() -> bool:
    return os.environ.get("AUTOSRE_SECOND_OPINION", "").strip().lower() in (
        "1", "true", "yes", "on"
    )


async def second_opinion(incident: str, tool: str, args: dict) -> str:
    """One- to two-sentence independent critique of the proposed fix (or "")."""
    if not enabled():
        return ""
    try:
        from google import genai

        client = genai.Client()  # configured from env (Vertex or API key)
        prompt = (
            "You are a senior SRE reviewing another engineer's proposed production "
            "fix. Be skeptical and concise. In ONE or TWO sentences: is this the "
            "right remediation for the incident, and what is the single biggest risk "
            "or a better alternative? Do not restate the proposal.\n\n"
            f"Incident: {incident}\n"
            f"Proposed remediation: {tool}({args})"
        )
        resp = await client.aio.models.generate_content(model=MODEL, contents=prompt)
        return (getattr(resp, "text", "") or "").strip()
    except Exception:  # noqa: BLE001 - a second opinion must never break the run
        return ""
