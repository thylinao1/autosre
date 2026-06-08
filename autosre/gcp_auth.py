"""Optional Cloud Run service-to-service auth for agent -> checkout-api calls.

When ``TARGET_REQUIRE_AUTH`` is truthy (set it once checkout-api is deployed with
``--no-allow-unauthenticated``), every call the agent makes to the target carries
a Google-signed ID token minted from the Cloud Run metadata server, audience =
the target URL. The target then rejects anonymous callers, so its public
``/_admin/*`` surface can no longer be poked by anyone who finds the URL.

With the flag unset (local dev, tests, and the current public demo) this is a
no-op: ``target_headers`` returns ``{}`` and nothing changes. The token is cached
until shortly before expiry so the hot path stays fast.
"""

from __future__ import annotations

import os
import time

import httpx

_METADATA_IDENTITY = (
    "http://metadata.google.internal/computeMetadata/v1/instance/"
    "service-accounts/default/identity"
)
_cache: dict[str, tuple[str, float]] = {}  # audience -> (token, expires_at)
_TTL_S = 3000  # ID tokens last ~3600s; refresh early.


def require_target_auth() -> bool:
    return os.environ.get("TARGET_REQUIRE_AUTH", "").strip().lower() in (
        "1", "true", "yes", "on"
    )


def _mint(audience: str) -> str | None:
    try:
        resp = httpx.get(
            _METADATA_IDENTITY,
            params={"audience": audience, "format": "full"},
            headers={"Metadata-Flavor": "Google"},
            timeout=5.0,
        )
        if resp.status_code == 200 and resp.text:
            return resp.text.strip()
    except Exception:  # noqa: BLE001 - metadata server absent off Cloud Run
        return None
    return None


def target_headers(target_url: str) -> dict[str, str]:
    """Authorization header for a call to ``target_url`` (empty if auth is off)."""
    if not require_target_auth():
        return {}
    audience = target_url.rstrip("/")
    token, exp = _cache.get(audience, ("", 0.0))
    if not token or time.time() >= exp:
        minted = _mint(audience)
        if minted is None:
            return {}  # fail open to no-header; target may still allow if misconfig
        token = minted
        _cache[audience] = (token, time.time() + _TTL_S)
    return {"Authorization": f"Bearer {token}"}
