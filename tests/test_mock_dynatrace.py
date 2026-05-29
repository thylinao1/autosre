"""Verify the mock Dynatrace MCP server speaks real MCP over stdio and that its
telemetry tracks the live target-service state."""

from __future__ import annotations

import json
import os

import httpx
import pytest
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


async def _call(tool: str, args: dict | None = None) -> dict:
    params = StdioServerParameters(
        command="python", args=["-m", "autosre.mock_dynatrace.server"],
        env={**os.environ, "PYTHONPATH": REPO_ROOT},
    )
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(tool, args or {})
            return json.loads(result.content[0].text)


@pytest.mark.asyncio
async def test_lists_tools(target_service):
    params = StdioServerParameters(
        command="python", args=["-m", "autosre.mock_dynatrace.server"],
        env={**os.environ, "PYTHONPATH": REPO_ROOT},
    )
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            names = {t.name for t in (await session.list_tools()).tools}
    assert {"query-problems", "execute-dql", "get-events-for-kubernetes-cluster"} <= names


@pytest.mark.asyncio
async def test_no_problems_when_healthy(target_service):
    out = await _call("query-problems")
    assert out["total"] == 0


@pytest.mark.asyncio
async def test_surfaces_injected_problem(target_service):
    httpx.post(f"{target_service}/_admin/inject", json={"fault": "payment_errors"})
    out = await _call("query-problems")
    assert out["total"] == 1
    assert out["problems"][0]["impacted_metric"] == "failure_rate"
    assert out["problems"][0]["observed_value"] == 22.0


@pytest.mark.asyncio
async def test_execute_dql_returns_metric(target_service):
    httpx.post(f"{target_service}/_admin/inject", json={"fault": "latency_spike"})
    out = await _call("execute-dql", {"dqlQueryString": "fetch p99 latency for checkout-api"})
    rec = out["records"][0]
    assert rec["metric"] == "p99_latency_ms"
    assert rec["value"] == 4200.0
