"""Shared fixtures: boot the checkout-api target service for the test session."""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time

import httpx
import pytest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="session")
def target_service():
    port = _free_port()
    url = f"http://127.0.0.1:{port}"
    env = {**os.environ, "PYTHONPATH": REPO_ROOT}
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "autosre.target_service.main:app",
         "--host", "127.0.0.1", "--port", str(port)],
        cwd=REPO_ROOT, env=env,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        for _ in range(50):
            try:
                if httpx.get(f"{url}/healthz", timeout=1).status_code == 200:
                    break
            except Exception:  # noqa: BLE001
                time.sleep(0.2)
        else:
            raise RuntimeError("target service did not start")
        os.environ["TARGET_SERVICE_URL"] = url
        yield url
    finally:
        proc.terminate()
        proc.wait(timeout=10)


@pytest.fixture(autouse=True)
def _reset_target(target_service):
    """Clear any injected fault before each test."""
    httpx.post(f"{target_service}/_admin/inject", json={"fault": "clear"}, timeout=5)
    yield
