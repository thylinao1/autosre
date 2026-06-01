"""Builds the Dynatrace MCP toolset for the AutoSRE agent.

One switch (DYNATRACE_MCP_MODE) selects where observability data comes from:

  mock   -> bundled offline mock server (python -m autosre.mock_dynatrace.server)
  stdio  -> official npx @dynatrace-oss/dynatrace-mcp-server, run locally
  remote -> your Dynatrace tenant's hosted remote MCP gateway (HTTP + Bearer)

Both the bundled mock and the official server (verified against
@dynatrace-oss/dynatrace-mcp-server v1.8.6) expose snake_case tool names, which
are valid Gemini function-call identifiers, so no name normalization is needed.
The two surfaces are NOT identical, though: the mock mirrors a Davis-problem
workflow (query_problems / get_problem_by_id), while the real server is
DQL-first (list_problems / execute_dql / get_kubernetes_events). The agent
instruction is mode-aware (see agent.py) so each path drives the tools it has.
Only read-only tools are exposed in every mode; the filter is the guardrail.
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

# Read-only Dynatrace tools the agent is allowed to use. The filter is an explicit
# allow-list so a misconfigured tenant can never expose write tools (send_email,
# send_slack_message, create_workflow_*, send_event, reset_grail_budget, ...) to
# the agent — only observability reads pass through.
#
# Mock names mirror a Davis-problem workflow. Real names are the actual surface of
# @dynatrace-oss/dynatrace-mcp-server v1.8.6 (verified by listing tools over MCP):
# it has no get_problem_by_id, calls the events tool get_kubernetes_events, and
# names the vulnerability tool list_vulnerabilities. All are snake_case already,
# so they pass straight through to Gemini with no normalization.
_MOCK_TOOL_FILTER = [
    "query_problems",
    "get_problem_by_id",
    "execute_dql",
    "get_events_for_kubernetes_cluster",
    "get_vulnerabilities",
]
_REAL_TOOL_FILTER = [
    "list_problems",
    "execute_dql",
    "get_kubernetes_events",
    "list_vulnerabilities",
]


def build_dynatrace_toolset() -> McpToolset:
    mode = os.environ.get("DYNATRACE_MCP_MODE", "mock").lower()
    # Mock and the real v1.8.6 server both expose snake_case names (see the module
    # docstring); the two surfaces differ in WHICH tools they have, not in casing.
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
