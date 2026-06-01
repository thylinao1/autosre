"""Builds the Dynatrace MCP toolset for the AutoSRE agent.

One switch (DYNATRACE_MCP_MODE) selects where observability data comes from:

  mock   -> bundled offline mock server (python -m autosre.mock_dynatrace.server)
  stdio  -> official npx @dynatrace-oss/dynatrace-mcp-server, run locally
  remote -> your Dynatrace tenant's hosted remote MCP gateway (HTTP + Bearer)

The agent code above this layer never changes — the tool names are identical
across all three modes (query-problems, execute-dql, get-events-for-kubernetes-cluster,
...), matching the real Dynatrace MCP gateway's tool surface exactly.
"""

from __future__ import annotations

import os
import sys

from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import (
    StdioConnectionParams,
    StreamableHTTPConnectionParams,
)
from mcp import StdioServerParameters

# Read-only Dynatrace tools the agent is allowed to use. The bundled mock server
# registers Gemini-safe underscore names: hyphens are not valid Gemini
# function-call identifiers, so a hyphenated MCP tool name round-trips through the
# model as an underscore and then fails ADK dispatch ("Tool 'query_problems' not
# found"). The real Dynatrace gateway exposes kebab-case names, so remote/stdio
# against the real gateway needs a name-normalization layer before it works with
# Gemini (tracked separately; the offline mock path is what the demo uses).
# Keeping the filter explicit means a misconfigured tenant can't expose write
# tools to the agent.
_MOCK_TOOL_FILTER = [
    "query_problems",
    "get_problem_by_id",
    "execute_dql",
    "get_events_for_kubernetes_cluster",
    "get_vulnerabilities",
]
_REAL_TOOL_FILTER = [
    "query-problems",
    "get-problem-by-id",
    "execute-dql",
    "get-events-for-kubernetes-cluster",
    "get-vulnerabilities",
]


def build_dynatrace_toolset() -> McpToolset:
    mode = os.environ.get("DYNATRACE_MCP_MODE", "mock").lower()
    # The bundled mock uses underscore names; the real gateway uses kebab-case.
    filt = _MOCK_TOOL_FILTER if mode == "mock" else _REAL_TOOL_FILTER

    if mode == "mock":
        return McpToolset(
            connection_params=StdioConnectionParams(
                server_params=StdioServerParameters(
                    command=sys.executable,
                    args=["-m", "autosre.mock_dynatrace.server"],
                    env=dict(os.environ),
                ),
            ),
            tool_filter=filt,
        )

    if mode == "stdio":
        env = dict(os.environ)
        # The official server reads DT_ENVIRONMENT (+ optional DT_PLATFORM_TOKEN).
        return McpToolset(
            connection_params=StdioConnectionParams(
                server_params=StdioServerParameters(
                    command="npx",
                    args=["-y", "@dynatrace-oss/dynatrace-mcp-server"],
                    env=env,
                ),
            ),
            tool_filter=filt,
        )

    if mode == "remote":
        environment = os.environ["DT_ENVIRONMENT"].rstrip("/")
        token = os.environ["DT_PLATFORM_TOKEN"]
        # Hosted gateway endpoint per Dynatrace docs.
        url = f"{environment}/platform-reserved/mcp-gateway/v0.1/servers/dynatrace-mcp/mcp"
        return McpToolset(
            connection_params=StreamableHTTPConnectionParams(
                url=url,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
            ),
            tool_filter=filt,
        )

    raise ValueError(
        f"DYNATRACE_MCP_MODE={mode!r} is invalid; use 'mock', 'stdio', or 'remote'."
    )
