#!/bin/bash
# Duokai Admin local launcher (Mac / Linux)
# Browser tasks are executed only by registered desktop agents through the control plane.

set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$ROOT_DIR/duokai-api"
ADMIN_DIR="$ROOT_DIR/duokai-admin"

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js is not installed. Please install it from https://nodejs.org"
  exit 1
fi
if [ ! -d "$API_DIR/node_modules/express" ]; then (cd "$API_DIR" && npm install); fi
if [ ! -d "$ADMIN_DIR/node_modules/next" ]; then (cd "$ADMIN_DIR" && npm install); fi

echo "🧩 Starting Duokai API on port 3100..."
(cd "$API_DIR" && npm run dev) &
API_PID=$!
echo "🖥️  Starting Admin on port 3000..."
(cd "$ADMIN_DIR" && PORT=3000 npm run dev) &
ADMIN_PID=$!

cleanup() {
  echo "Shutting down admin services..."
  kill "$API_PID" "$ADMIN_PID" 2>/dev/null || true
  wait || true
}
trap cleanup SIGINT SIGTERM EXIT

for _ in $(seq 1 30); do
  if curl -sf http://127.0.0.1:3100/health >/dev/null 2>&1 && curl -sf http://127.0.0.1:3000 >/dev/null 2>&1; then break; fi
  sleep 1
done

echo "✅ Admin services running"
echo "   Admin: http://localhost:3000"
echo "   API:   http://127.0.0.1:3100"
echo "   Browser runtime: control-plane → Duokai desktop agent → CloakBrowser"

if [ -d "/Applications/Google Chrome.app" ]; then
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --app=http://localhost:3000 --window-size=1400,900 --window-position=0,0 2>/dev/null &
elif command -v open >/dev/null 2>&1; then
  open "http://localhost:3000"
fi
wait "$ADMIN_PID"
