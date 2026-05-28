"""`python -m autosre.server` — boot the Mission-Control SSE backend.

Binds the Cloud Run-provided PORT (default 8080). The app loads `.env` and the
agent at import time, so credentials/mode are already populated.
"""

from __future__ import annotations

import os

import uvicorn


def main() -> None:
    port = int(os.environ.get("PORT", "8080"))
    host = os.environ.get("HOST", "0.0.0.0")
    uvicorn.run("autosre.server.app:app", host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
