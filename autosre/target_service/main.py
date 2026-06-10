"""checkout-api - the demo target service AutoSRE observes and remediates.

It exposes a realistic retail checkout endpoint plus an admin surface to:
  * inject a failure mode (the "incident")
  * apply remediations (scale / rollback / feature-flag toggle)
  * read internal state (consumed by the Dynatrace MCP layer to derive telemetry)

The point of this service is to make the agent's ACT step real and the demo
reproducible: you inject a fault on camera, the agent diagnoses + fixes it, and
recovery is observable.
"""

from __future__ import annotations

import random
import time
from dataclasses import asdict, dataclass, field

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from . import otel

# Auto-docs disabled: the demo target has a fixed admin/internal surface and no
# reason to publish an OpenAPI schema of it publicly.
app = FastAPI(
    title="checkout-api",
    version="2.3.1",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

# A fault encodes what's wrong AND what the single correct remediation is, so the
# end-to-end test can assert the agent reasoned its way to the right action.
FAULTS = {
    "payment_errors": {
        "summary": "Checkout failure rate spiked to 22% after deploy v2.3.1",
        "metric": "failure_rate",
        "bad_value": 22.0,
        "root_cause": "Deploy v2.3.1 enabled feature flag 'new_payment_gateway' "
        "which throws on AMEX cards.",
        "correct_fix": {"action": "toggle_feature_flag",
                        "args": {"name": "new_payment_gateway", "enabled": False}},
        "alt_fix": {"action": "rollback_deployment", "args": {"version": "2.3.0"}},
        # The faulty precondition this incident represents. Re-applied on every
        # injection so a demo can be re-run repeatedly (or after a prior fix)
        # and the agent always has a real bad flag/version to diagnose.
        "precondition": {"version": "2.3.1",
                         "feature_flags": {"new_payment_gateway": True}},
    },
    "latency_spike": {
        "summary": "Checkout p99 latency climbed to 4200ms under load",
        "metric": "p99_latency_ms",
        "bad_value": 4200.0,
        "root_cause": "Traffic surge saturated the 3 running replicas; CPU pinned at 98%.",
        "correct_fix": {"action": "scale_service", "args": {"replicas": 8}},
        "alt_fix": None,
        # Under-provisioned baseline: 3 replicas. Restored on injection so a
        # re-run isn't already "scaled" from a previous remediation.
        "precondition": {"replicas": 3},
    },
    # ── Decoy incidents (the obvious reflex is WRONG) ────────────────────────
    # These exist for the eval harness and prove the diagnosis generalizes beyond
    # a 2-item menu: the agent must read the evidence, not pattern-match the metric.
    "dependency_rollback": {
        # Same SYMPTOM as payment_errors (failure-rate spike) but the flag is
        # already OFF, so the reflex "disable the flag" does nothing - the fix is
        # to roll back the bad deploy. Decoy against toggle_feature_flag.
        "summary": "Checkout failure rate spiked to 18% after deploy v2.3.1 (gateway client regression)",
        "metric": "failure_rate",
        "bad_value": 18.0,
        "root_cause": "Deploy v2.3.1 shipped a payment-gateway CLIENT regression. The "
        "new_payment_gateway flag is already disabled, so toggling it changes nothing; "
        "rolling back to v2.3.0 restores the working client.",
        "correct_fix": {"action": "rollback_deployment", "args": {"version": "2.3.0"}},
        "alt_fix": None,
        "precondition": {"version": "2.3.1", "feature_flags": {"new_payment_gateway": False}},
    },
    "memory_leak": {
        # Same SYMPTOM as latency_spike (high p99) but CPU is NORMAL and pods are
        # OOMKilled - adding replicas does not help (each new pod leaks too); the
        # fix is to roll back. Decoy against scale_service.
        "summary": "Checkout p99 latency climbed to 3800ms; pods OOMKilled and restarting",
        "metric": "p99_latency_ms",
        "bad_value": 3800.0,
        "root_cause": "A memory leak in v2.3.1 drives pods to OOMKill and restart. CPU is "
        "not saturated, so scaling adds more leaking pods; rolling back to v2.3.0 restores "
        "stable memory.",
        "correct_fix": {"action": "rollback_deployment", "args": {"version": "2.3.0"}},
        "alt_fix": None,
        "precondition": {"version": "2.3.1", "replicas": 3},
    },
}


@dataclass
class ServiceState:
    version: str = "2.3.1"
    replicas: int = 3
    feature_flags: dict = field(default_factory=lambda: {"new_payment_gateway": True})
    injected_fault: str | None = None
    remediation_log: list = field(default_factory=list)
    started_at: float = field(default_factory=time.time)


STATE = ServiceState()


def _healthy() -> bool:
    return STATE.injected_fault is None


def current_metrics() -> dict:
    """Telemetry snapshot. Degrades when a fault is active, recovers when fixed."""
    base = {
        "service": "checkout-api",
        "version": STATE.version,
        "replicas": STATE.replicas,
        "failure_rate": round(random.uniform(0.1, 0.6), 2),
        "p99_latency_ms": round(random.uniform(180, 260), 0),
        "requests_per_min": random.randint(900, 1200),
        "cpu_utilization": round(random.uniform(30, 55), 0),
    }
    fault = STATE.injected_fault
    if fault and fault in FAULTS:
        f = FAULTS[fault]
        base[f["metric"]] = f["bad_value"]
        if fault == "latency_spike":
            # Baseline incident is 3 replicas (4200ms / 98% CPU); scaling toward 8
            # replicas linearly relieves latency and CPU back to healthy levels.
            relief = max(0.0, min(1.0, (STATE.replicas - 3) / 5.0))
            base["p99_latency_ms"] = round(4200 - (4200 - 260) * relief)
            base["cpu_utilization"] = round(98 - (98 - 52) * relief)
    return base


# ── Public product surface ────────────────────────────────────────────────
class CheckoutRequest(BaseModel):
    cart_total: float
    card_type: str = "visa"


@app.get("/healthz")
def healthz():
    return {"status": "ok" if _healthy() else "degraded",
            "version": STATE.version, "replicas": STATE.replicas}


@app.post("/checkout")
def checkout(req: CheckoutRequest):
    fault = STATE.injected_fault
    if fault == "payment_errors" and STATE.feature_flags.get("new_payment_gateway"):
        if req.card_type.lower() == "amex" or random.random() < 0.22:
            raise HTTPException(502, "payment gateway error: NEW_GATEWAY_NPE")
    if fault == "latency_spike":
        time.sleep(min(4.2, 4.2 * (1 - min(1.0, STATE.replicas / 8.0))))
    return {"status": "confirmed", "order_id": f"ord_{random.randint(10000, 99999)}"}


# ── Internal surface (consumed by Dynatrace MCP layer) ─────────────────────
# OBSERVABLE symptom fields only. The agent reads this via get_service_health and
# the mock MCP derives the problem card from it, so it MUST NOT leak the answer
# key: root_cause (the prose explanation), correct_fix / alt_fix (the exact
# remediation), or precondition. A real Davis problem surfaces a symptom (a title
# + the impacted metric), never the fix - the agent has to reason its way there.
_OBSERVABLE_FAULT_FIELDS = ("summary", "metric", "bad_value")


@app.get("/_internal/state")
def internal_state():
    snap = asdict(STATE)
    snap["metrics"] = current_metrics()
    snap["healthy"] = _healthy()
    if STATE.injected_fault:
        full = FAULTS[STATE.injected_fault]
        snap["active_fault_detail"] = {
            k: full[k] for k in _OBSERVABLE_FAULT_FIELDS if k in full
        }
    return snap


@app.get("/_internal/answer_key")
def internal_answer_key():
    """TEST-ONLY: the full fault detail incl. correct_fix, for eval scoring.

    Kept on a separate route so it can never reach the agent through
    get_service_health / the mock MCP, which read /_internal/state above.
    """
    if not STATE.injected_fault:
        return {"injected_fault": None}
    return {"injected_fault": STATE.injected_fault, **FAULTS[STATE.injected_fault]}


# ── Admin: inject incidents ────────────────────────────────────────────────
class InjectRequest(BaseModel):
    fault: str  # one of FAULTS, or "clear"


def _apply_precondition(fault: str) -> None:
    """Restore the faulty precondition so each injection is reproducible.

    Without this, a prior remediation (flag off / scaled up) would persist and a
    re-injected incident would have no real root cause for the agent to find.
    """
    for key, value in FAULTS[fault].get("precondition", {}).items():
        if key == "feature_flags":
            STATE.feature_flags.update(value)
        else:
            setattr(STATE, key, value)


@app.post("/_admin/inject")
def inject(req: InjectRequest):
    if req.fault == "clear":
        STATE.injected_fault = None
        return {"injected": None}
    if req.fault not in FAULTS:
        raise HTTPException(400, f"unknown fault; choose from {list(FAULTS)} or 'clear'")
    _apply_precondition(req.fault)
    STATE.injected_fault = req.fault
    return {"injected": req.fault, "summary": FAULTS[req.fault]["summary"]}


# ── Admin: remediation actions the agent calls ─────────────────────────────
def _resolves(action: str, args: dict) -> bool:
    fault = STATE.injected_fault
    if not fault:
        return False
    f = FAULTS[fault]
    for candidate in (f.get("correct_fix"), f.get("alt_fix")):
        if not candidate or candidate["action"] != action:
            continue
        if action == "scale_service":
            # Scaling resolves once we reach at least the required replica count.
            if args.get("replicas", 0) >= candidate["args"]["replicas"]:
                return True
        elif all(args.get(k) == v for k, v in candidate["args"].items()):
            return True
    return False


def _apply(action: str, args: dict) -> dict:
    resolved = _resolves(action, args)
    if resolved:
        STATE.injected_fault = None
    STATE.remediation_log.append({"ts": time.time(), "action": action,
                                  "args": args, "resolved": resolved})
    return {"action": action, "args": args, "resolved_incident": resolved,
            "service_healthy": _healthy(), "metrics": current_metrics()}


class ScaleRequest(BaseModel):
    replicas: int


@app.post("/_admin/scale_service")
def scale_service(req: ScaleRequest):
    if not 1 <= req.replicas <= 50:
        raise HTTPException(400, "replicas must be 1..50")
    STATE.replicas = req.replicas
    return _apply("scale_service", {"replicas": req.replicas})


class RollbackRequest(BaseModel):
    version: str


@app.post("/_admin/rollback_deployment")
def rollback_deployment(req: RollbackRequest):
    STATE.version = req.version
    return _apply("rollback_deployment", {"version": req.version})


class FlagRequest(BaseModel):
    name: str
    enabled: bool


@app.post("/_admin/toggle_feature_flag")
def toggle_feature_flag(req: FlagRequest):
    STATE.feature_flags[req.name] = req.enabled
    return _apply("toggle_feature_flag", {"name": req.name, "enabled": req.enabled})


# Stream real OpenTelemetry (traces + metrics) to Dynatrace when the OTLP env is
# configured. No-op otherwise, so mock/demo mode is completely unaffected.
otel.setup(app, current_metrics)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8081)
