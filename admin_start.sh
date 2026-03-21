#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Duokai Admin — 一键启动脚本 (Mac / Linux)
#
# 启动顺序:
#   1. Duokai API                    (localhost:3100)
#   2. Stealth Engine Runtime Server (localhost:3101)
#   3. Next.js 管理后台              (localhost:3000)
#   4. 在 Chrome App Mode 中打开管理后台
# ─────────────────────────────────────────────────────────────────────────────

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$ROOT_DIR/duokai-api"
ENGINE_DIR="$ROOT_DIR/fingerprint-dashboard/stealth-engine"
ADMIN_DIR="$ROOT_DIR/duokai-admin"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║        Duokai Admin  —  Starting Up          ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

if ! command -v node &> /dev/null; then
  echo "❌ Node.js is not installed. Please install it from https://nodejs.org"
  exit 1
fi

if [ ! -d "$API_DIR/node_modules/express" ]; then
  echo "📦 Installing duokai-api dependencies..."
  (cd "$API_DIR" && npm install)
fi

if [ ! -d "$ENGINE_DIR/node_modules/playwright" ]; then
  echo "📦 Installing stealth-engine dependencies..."
  (cd "$ENGINE_DIR" && npm install)
  echo "🎭 Installing Playwright browsers (first time only)..."
  (cd "$ENGINE_DIR" && node_modules/.bin/playwright install chromium)
fi

if [ ! -d "$ADMIN_DIR/node_modules/next" ]; then
  echo "📦 Installing admin frontend dependencies..."
  (cd "$ADMIN_DIR" && npm install)
fi

echo "🧩 Starting Duokai API on port 3100..."
(cd "$API_DIR" && npm run dev) &
API_PID=$!
echo "   API PID: $API_PID"

echo -n "   Waiting for API"
for i in $(seq 1 20); do
  if curl -sf http://127.0.0.1:3100/health > /dev/null 2>&1; then
    echo " ✅"
    break
  fi
  echo -n "."
  sleep 0.5
done

echo "🚀 Starting Runtime Server on port 3101..."
(cd "$ENGINE_DIR" && RUNTIME_PORT=3101 DASHBOARD_URL=http://127.0.0.1:3100 node server.js) &
RUNTIME_PID=$!
echo "   Runtime PID: $RUNTIME_PID"

echo -n "   Waiting for runtime server"
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:3101/health > /dev/null 2>&1; then
    echo " ✅"
    break
  fi
  echo -n "."
  sleep 0.5
done

echo "🖥️  Starting Admin on port 3000..."
(cd "$ADMIN_DIR" && PORT=3000 npm run dev) &
ADMIN_PID=$!
echo "   Admin PID: $ADMIN_PID"

echo -n "   Waiting for admin frontend"
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:3000 > /dev/null 2>&1; then
    echo " ✅"
    break
  fi
  echo -n "."
  sleep 1
done

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  ✅ All admin services running!              ║"
echo "║     Admin:      http://localhost:3000        ║"
echo "║     API:        http://127.0.0.1:3100        ║"
echo "║     Runtime:    http://127.0.0.1:3101        ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

if [ -d "/Applications/Google Chrome.app" ]; then
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    --app=http://localhost:3000 \
    --window-size=1400,900 \
    --window-position=0,0 \
    2>/dev/null &
elif command -v open &> /dev/null; then
  open "http://localhost:3000"
fi

echo "Press Ctrl+C to stop all services."
echo ""

cleanup() {
  echo ""
  echo "Shutting down admin services..."
  kill $API_PID 2>/dev/null
  kill $RUNTIME_PID 2>/dev/null
  kill $ADMIN_PID 2>/dev/null
  wait
  echo "✅ All admin services stopped."
}
trap cleanup SIGINT SIGTERM

wait $ADMIN_PID
