"""Optional OpenTelemetry export to Dynatrace (Phase 2: real telemetry).

When ``OTEL_EXPORTER_OTLP_ENDPOINT`` is set, checkout-api streams real traces and
metrics to the Dynatrace tenant over OTLP/HTTP, so an injected fault becomes a
real anomaly the agent can query with real DQL. With it unset this is a no-op and
the service runs exactly as before, so nothing breaks without Dynatrace creds.

The OpenTelemetry imports live inside ``setup`` so the module imports cleanly even
when the OTel packages are not installed (e.g. local dev / mock mode).

Env (read automatically by the OTLP exporters):
  OTEL_EXPORTER_OTLP_ENDPOINT = https://<env-id>.live.dynatrace.com/api/v2/otlp
  OTEL_EXPORTER_OTLP_HEADERS  = Authorization=Api-Token dt0c01....
  OTEL_EXPORTER_OTLP_PROTOCOL = http/protobuf
Token scopes: openTelemetryTrace.ingest, metrics.ingest, logs.ingest.
"""

from __future__ import annotations

import os
from collections.abc import Callable
from typing import Any


def otel_enabled() -> bool:
    """True when an OTLP endpoint is configured (i.e. real Dynatrace ingest)."""
    return bool(os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip())


def setup(app: Any, metrics_provider: Callable[[], dict]) -> bool:
    """Wire OTLP traces + metrics if configured. Returns True if enabled.

    ``metrics_provider`` returns the live, fault-aware metrics dict (checkout-api's
    ``current_metrics``), read on every metric export so an injected fault shows up
    as a real anomaly in Grail.
    """
    if not otel_enabled():
        return False

    from opentelemetry import metrics as otel_metrics
    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.metrics import CallbackOptions, Observation
    from opentelemetry.sdk.metrics import MeterProvider
    from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    resource = Resource.create(
        {
            "service.name": os.environ.get("OTEL_SERVICE_NAME", "checkout-api"),
            "service.version": os.environ.get("OTEL_SERVICE_VERSION", "2.3.1"),
        }
    )

    # Traces: auto-instrument FastAPI so every request becomes a real span in Grail.
    tracer_provider = TracerProvider(resource=resource)
    tracer_provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(tracer_provider)
    FastAPIInstrumentor.instrument_app(app)

    # Metrics: observable gauges read the live (fault-aware) metrics on each export,
    # so failure_rate / latency / cpu reflect a real incident the agent can query.
    reader = PeriodicExportingMetricReader(
        OTLPMetricExporter(), export_interval_millis=15000
    )
    meter_provider = MeterProvider(resource=resource, metric_readers=[reader])
    otel_metrics.set_meter_provider(meter_provider)
    meter = meter_provider.get_meter("checkout-api")

    def _gauge(name: str, key: str, unit: str) -> None:
        def _callback(_options: CallbackOptions):
            value = metrics_provider().get(key)
            return [Observation(float(value))] if value is not None else []

        meter.create_observable_gauge(name, callbacks=[_callback], unit=unit)

    _gauge("checkout.failure_rate", "failure_rate", "percent")
    _gauge("checkout.p99_latency", "p99_latency_ms", "ms")
    _gauge("checkout.cpu_utilization", "cpu_utilization", "percent")
    _gauge("checkout.requests_per_min", "requests_per_min", "{request}")
    return True
