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

# Read-only Dynatrace tools the agent is allowed to use. These are the EXACT
# tool names the real Dynatrace MCP gateway exposes (kebab-case), so the same
# filter + agent work against the hosted tenant and the bundled mock. Keeping it
# explicit means a misconfigured real tenant can't expose write tools to the agent.
DYNATRACE_TOOL_FILTER = [
    "query-problems",
    "get-problem-by-id",
    "execute-dql",
    "get-events-for-kubernetes-cluster",
    "get-vulnerabilities",
]


def build_dynatrace_toolset() -> McpToolset:
    mode = os.environ.get("DYNATRACE_MCP_MODE", "mock").lower()

    if mode == "mock":
        return McpToolset(
            connection_params=StdioConnectionParams(
                server_params=StdioServerParameters(
                    command=sys.executable,
                    args=["-m", "autosre.mock_dynatrace.server"],
                    env=dict(os.environ),
                ),
            ),
            tool_filter=DYNATRACE_TOOL_FILTER,
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
            tool_filter=DYNATRACE_TOOL_FILTER,
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
            tool_filter=DYNATRACE_TOOL_FILTER,
        )

    raise ValueError(
        f"DYNATRACE_MCP_MODE={mode!r} is invalid; use 'mock', 'stdio', or 'remote'."
    )
