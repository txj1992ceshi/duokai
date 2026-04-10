#!/usr/bin/env bash

set -euo pipefail

APP_DIR="${APP_DIR:-}"
APP_PORT="${APP_PORT:-}"
APP_HOST="${APP_HOST:-0.0.0.0}"
APP_LABEL="${APP_LABEL:-next-app}"

if [[ -z "$APP_DIR" || -z "$APP_PORT" ]]; then
  echo "APP_DIR and APP_PORT are required" >&2
  exit 1
fi

cd "$APP_DIR"

if ! npm exec -- next --version >/dev/null 2>&1; then
  echo "[$APP_LABEL] Installing dependencies..."
  npm install
fi

if [[ ! -f .next/BUILD_ID ]]; then
  echo "[$APP_LABEL] Missing production build, running next build..."
  npm exec -- next build --webpack
fi

exec npm exec -- next start --hostname "$APP_HOST" --port "$APP_PORT"
