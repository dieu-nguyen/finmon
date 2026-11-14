#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"
VENV_DIR="$BACKEND_DIR/.venv"
MODE="${1:-all}"

BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
QC_BACKEND_PORT="${QC_BACKEND_PORT:-8010}"
QC_FRONTEND_PORT="${QC_FRONTEND_PORT:-5174}"
QC_BASE_URL="${QC_BASE_URL:-http://127.0.0.1:${QC_FRONTEND_PORT}}"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need python3
need npm

if [[ ! -x "$VENV_DIR/bin/python" ]]; then
  echo "==> Creating backend virtualenv"
  python3 -m venv "$VENV_DIR"
fi
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

echo "==> Installing backend"
python -m pip install -q -U pip
python -m pip install -q -e "$BACKEND_DIR"

if [[ ! -d "$FRONTEND_DIR/node_modules/@playwright/test" ]]; then
  echo "==> Installing frontend and Playwright"
  (
    cd "$FRONTEND_DIR"
    npm install
  )
fi

QC_DATABASE_URL="$(
  python - <<'PY'
import os
from pathlib import Path

env = {}
path = Path("backend/.env")
if path.exists():
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key] = value.strip().strip('"').strip("'")
raw = os.environ.get("DATABASE_URL") or env.get("DATABASE_URL") or "mysql+pymysql://finmon:finmon@127.0.0.1:3306/finmon"
base = raw.rsplit("/", 1)[0]
print(f"{base}/finmon_qc")
PY
)"

export DATABASE_URL="$QC_DATABASE_URL"
export FINMON_TESTING=1
export DNSE_API_KEY="${DNSE_API_KEY:-qc}"
export DNSE_API_SECRET="${DNSE_API_SECRET:-qc}"
export FRONTEND_ORIGIN="http://127.0.0.1:${QC_FRONTEND_PORT}"
export VITE_API_PROXY="http://${BACKEND_HOST}:${QC_BACKEND_PORT}"
export FRONTEND_PORT="$QC_FRONTEND_PORT"
export QC_BASE_URL
export QC_EXTERNAL_SERVERS=1

echo "==> Seeding QC database"
(
  cd "$BACKEND_DIR"
  python -m qc.seed
)

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "==> Installing frontend"
  (
    cd "$FRONTEND_DIR"
    npm install
  )
fi

BACKEND_PID=""
FRONTEND_PID=""
cleanup() {
  if [[ -n "${FRONTEND_PID:-}" ]] && kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${BACKEND_PID:-}" ]] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

echo "==> Starting QC API at http://${BACKEND_HOST}:${QC_BACKEND_PORT}"
(
  cd "$BACKEND_DIR"
  exec uvicorn app.main:app --host "$BACKEND_HOST" --port "$QC_BACKEND_PORT"
) &
BACKEND_PID=$!

echo "==> Starting QC web at ${QC_BASE_URL}"
(
  cd "$FRONTEND_DIR"
  exec npm run dev -- --host --port "$QC_FRONTEND_PORT"
) &
FRONTEND_PID=$!

python - <<PY
import sys
import time
import urllib.request

targets = [
    "http://${BACKEND_HOST}:${QC_BACKEND_PORT}/api/health",
    "${QC_BASE_URL}",
]
last = None
for target in targets:
    for _ in range(60):
        try:
            urllib.request.urlopen(target, timeout=2).read()
            break
        except Exception as exc:
            last = exc
            time.sleep(1)
    else:
        print(f"QC server did not become ready: {target}: {last}", file=sys.stderr)
        sys.exit(1)
print("QC servers ready")
PY

if [[ "$MODE" == "--serve" ]]; then
  echo "QC stack is up at ${QC_BASE_URL}"
  wait "$BACKEND_PID" "$FRONTEND_PID"
  exit 0
fi

echo "==> Running Playwright QC"
(
  cd "$FRONTEND_DIR"
  npx playwright install chromium
  npx playwright test
)
