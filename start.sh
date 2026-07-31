#!/bin/bash
# Duokai Web local launcher (Mac / Linux)
# Browser execution is not hosted by this script. Start/stop tasks are delivered
# through the control plane to a registered Duokai desktop agent using CloakBrowser.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$ROOT_DIR/duokai-api"
FRONTEND_DIR="$ROOT_DIR/apps/duokai-web"

kill_if_listening() {
  local port="$1"
  local pids
  pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "🧹 Releasing port $port (PID: $pids)"
    kill $pids 2>/dev/null || true
    sleep 0.5
  fi
}

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js is not installed. Please install it from https://nodejs.org"
  exit 1
fi

kill_if_listening 3001
kill_if_listening 3100

if [ ! -d "$API_DIR/node_modules/express" ]; then
  echo "📦 Installing duokai-api dependencies..."
  (cd "$API_DIR" && npm install)
fi
if [ ! -f "$API_DIR/dist/server.js" ]; then
  echo "🔧 Building duokai-api..."
  (cd "$API_DIR" && npm run build)
fi
if [ ! -d "$FRONTEND_DIR/node_modules/next" ]; then
  echo "📦 Installing frontend dependencies..."
  (cd "$FRONTEND_DIR" && npm install)
fi

echo "🧩 Starting Duokai API on port 3100..."
(cd "$API_DIR" && npm run start) &
API_PID=$!

echo "🖥️  Starting Duokai Web on port 3001..."
(cd "$FRONTEND_DIR" && PORT=3001 npm run dev) &
FRONTEND_PID=$!

cleanup() {
  echo "Shutting down web services..."
  kill "$API_PID" "$FRONTEND_PID" 2>/dev/null || true
  wait || true
}
trap cleanup SIGINT SIGTERM EXIT

for _ in $(seq 1 30); do
  if curl -sf http://127.0.0.1:3100/health >/dev/null 2>&1 && curl -sf http://127.0.0.1:3001 >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "✅ Web services running"
echo "   Frontend: http://localhost:3001"
echo "   API:      http://127.0.0.1:3100"
echo "   Browser runtime: control-plane → Duokai desktop agent → CloakBrowser"

if [ -d "/Applications/Google Chrome.app" ]; then
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --app=http://localhost:3001 --window-size=1400,900 --window-position=0,0 2>/dev/null &
elif command -v open >/dev/null 2>&1; then
  open "http://localhost:3001"
fi

wait "$FRONTEND_PID"
