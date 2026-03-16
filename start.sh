#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# AntigravityCore — 一键启动脚本 (Mac / Linux)
#
# 启动顺序:
#   1. Stealth Engine Runtime Server  (localhost:3001)
#   2. Next.js 管理面板              (localhost:3000)
#   3. 在 Chrome App Mode 中打开面板
# ─────────────────────────────────────────────────────────────────────────────

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENGINE_DIR="$ROOT_DIR/fingerprint-dashboard/stealth-engine"
DASHBOARD_DIR="$ROOT_DIR/fingerprint-dashboard"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║     AntigravityCore  —  Starting Up          ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── Step 1: Check Node.js ────────────────────────────────────────────────────
if ! command -v node &> /dev/null; then
  echo "❌ Node.js is not installed. Please install it from https://nodejs.org"
  exit 1
fi

# ── Step 2: Install stealth-engine dependencies if needed ───────────────────
if [ ! -d "$ENGINE_DIR/node_modules/playwright" ]; then
  echo "📦 Installing stealth-engine dependencies..."
  (cd "$ENGINE_DIR" && npm install)
  echo "🎭 Installing Playwright browsers (first time only)..."
  (cd "$ENGINE_DIR" && node_modules/.bin/playwright install chromium)
fi

# ── Step 3: Install dashboard dependencies if needed ────────────────────────
if [ ! -d "$DASHBOARD_DIR/node_modules/next" ]; then
  echo "📦 Installing dashboard dependencies..."
  (cd "$DASHBOARD_DIR" && npm install)
fi

# ── Step 4: Start Runtime Server (background) ───────────────────────────────
echo "🚀 Starting Runtime Server on port 3001..."
node "$ENGINE_DIR/server.js" &
RUNTIME_PID=$!
echo "   Runtime PID: $RUNTIME_PID"

# Wait for runtime server to be ready
echo -n "   Waiting for runtime server"
for i in $(seq 1 20); do
  if curl -sf http://127.0.0.1:3001/health > /dev/null 2>&1; then
    echo " ✅"
    break
  fi
  echo -n "."
  sleep 0.5
done

# ── Step 5: Start Dashboard (background) ────────────────────────────────────
echo "🖥️  Starting Dashboard on port 3000..."
(cd "$DASHBOARD_DIR" && npm run dev) &
DASHBOARD_PID=$!
echo "   Dashboard PID: $DASHBOARD_PID"

# Wait for dashboard to be ready
echo -n "   Waiting for dashboard"
for i in $(seq 1 30); do
  if curl -sf http://localhost:3000 > /dev/null 2>&1; then
    echo " ✅"
    break
  fi
  echo -n "."
  sleep 1
done

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  ✅ All services running!                    ║"
echo "║     Dashboard:  http://localhost:3000        ║"
echo "║     Runtime:    http://127.0.0.1:3001        ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── Step 6: Open dashboard in Chrome App Mode ───────────────────────────────
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

# ── Cleanup on exit ──────────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo "Shutting down..."
  kill $RUNTIME_PID  2>/dev/null
  kill $DASHBOARD_PID 2>/dev/null
  wait
  echo "✅ All services stopped."
}
trap cleanup SIGINT SIGTERM

wait $DASHBOARD_PID
