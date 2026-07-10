#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

export NODE_ENV="${NODE_ENV:-development}"
export HOSTNAME="${HOST:-0.0.0.0}"
export PORT="${PORT:-3000}"

if [ ! -d node_modules ]; then
  echo "[dev] node_modules가 없어 npm ci를 실행합니다."
  npm ci
fi

echo "[dev] 강원랜드 홀덤 React 앱을 빌드한 뒤 개발 서버를 실행합니다."
echo "[dev] Local:   http://localhost:${PORT}"
echo "[dev] Network: http://${HOSTNAME}:${PORT}"

exec npm run dev
