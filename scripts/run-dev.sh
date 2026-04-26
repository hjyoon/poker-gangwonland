#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

export NODE_ENV="${NODE_ENV:-development}"
export HOSTNAME="${HOST:-0.0.0.0}"
export PORT="${PORT:-3000}"

NEXT_DEV_LOCK=".next/dev/lock"
if [ -f "$NEXT_DEV_LOCK" ]; then
  LOCK_PID="$(node -e "try { const fs = require('fs'); const lock = JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); if (lock.pid) process.stdout.write(String(lock.pid)); } catch {}" "$NEXT_DEV_LOCK")"
  if [ -n "$LOCK_PID" ] && ! kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "[dev] 이전 Next 개발 서버 잠금 파일을 정리합니다."
    rm -f "$NEXT_DEV_LOCK"
  fi
fi

if [ ! -d node_modules ]; then
  echo "[dev] node_modules가 없어 npm ci를 실행합니다."
  npm ci
fi

echo "[dev] 강원랜드 홀덤 개발 서버를 실행합니다."
echo "[dev] Local:   http://localhost:${PORT}"
echo "[dev] Network: http://${HOSTNAME}:${PORT}"

exec npm run dev
