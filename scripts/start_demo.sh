#!/usr/bin/env bash
# One-command demo launcher: starts the checkout-api target service and the ADK
# web UI, then waits. Open http://127.0.0.1:8000 and chat with the "agent".
#
#   bash scripts/start_demo.sh            # start everything
#   bash scripts/start_demo.sh --inject   # also inject a payment_errors incident
set -euo pipefail
cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
source .venv/bin/activate

echo "==> starting checkout-api on :8081"
python -m autosre.target_service.main >/tmp/autosre_target.log 2>&1 &
TARGET_PID=$!
trap 'echo; echo "stopping…"; kill $TARGET_PID 2>/dev/null || true; pkill -f "adk web" 2>/dev/null || true' EXIT INT TERM
sleep 3

if [[ "${1:-}" == "--inject" ]]; then
  curl -s -X POST localhost:8081/_admin/inject \
       -H 'content-type: application/json' -d '{"fault":"payment_errors"}' >/dev/null
  echo "==> injected incident: payment_errors"
fi

echo "==> starting ADK web UI on http://127.0.0.1:8000  (Ctrl+C to stop)"
adk web autosre/agent --port 8000
