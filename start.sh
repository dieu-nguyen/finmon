#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"
VENV_DIR="$BACKEND_DIR/.venv"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need docker
need python3
need npm

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "Missing required command: docker compose" >&2
  exit 1
fi

echo "==> Starting MySQL"
"${COMPOSE[@]}" up -d mysql

echo "==> Waiting for MySQL"
for _ in $(seq 1 60); do
  if docker exec finmon-mysql mysqladmin ping -h 127.0.0.1 -ufinmon -pfinmon --silent >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! docker exec finmon-mysql mysqladmin ping -h 127.0.0.1 -ufinmon -pfinmon --silent >/dev/null 2>&1; then
  echo "MySQL did not become ready" >&2
  exit 1
fi

if [[ ! -x "$VENV_DIR/bin/python" ]]; then
  echo "==> Creating backend virtualenv"
  python3 -m venv "$VENV_DIR"
fi
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

echo "==> Installing backend"
python -m pip install -q -U pip
python -m pip install -q -e "$BACKEND_DIR[vnstock]"

echo "==> Running migrations"
(
  cd "$BACKEND_DIR"
  alembic upgrade head
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
  if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

echo "==> Starting API at http://${BACKEND_HOST}:${BACKEND_PORT}"
(
  cd "$BACKEND_DIR"
  exec uvicorn app.main:app --reload --host "$BACKEND_HOST" --port "$BACKEND_PORT"
) &
BACKEND_PID=$!

echo "==> Starting web at http://localhost:${FRONTEND_PORT}"
(
  cd "$FRONTEND_DIR"
  exec npm run dev -- --host --port "$FRONTEND_PORT"
) &
FRONTEND_PID=$!

echo
echo "finmon is running."
echo "  UI:  http://localhost:${FRONTEND_PORT}"
echo "  API: http://${BACKEND_HOST}:${BACKEND_PORT}"
echo "Press Ctrl+C to stop."
echo

wait "$BACKEND_PID" "$FRONTEND_PID"
