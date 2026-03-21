#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Duokai — 一键启动脚本 (Mac / Linux)
#
# 启动顺序:
#   1. Duokai API                    (localhost:3100)
#   2. Stealth Engine Runtime Server (localhost:3101)
#   3. Next.js 功能前端              (localhost:3001)
#   4. 在 Chrome App Mode 中打开功能前端
# ─────────────────────────────────────────────────────────────────────────────

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$ROOT_DIR/duokai-api"
ENGINE_DIR="$ROOT_DIR/fingerprint-dashboard/stealth-engine"
FRONTEND_DIR="$ROOT_DIR/fingerprint-dashboard"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║          Duokai  —  Starting Up              ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── Step 1: Check Node.js ────────────────────────────────────────────────────
if ! command -v node &> /dev/null; then
  echo "❌ Node.js is not installed. Please install it from https://nodejs.org"
  exit 1
fi

# ── Step 2: Install API dependencies if needed ──────────────────────────────
if [ ! -d "$API_DIR/node_modules/express" ]; then
  echo "📦 Installing duokai-api dependencies..."
  (cd "$API_DIR" && npm install)
fi

# ── Step 3: Install stealth-engine dependencies if needed ───────────────────
if [ ! -d "$ENGINE_DIR/node_modules/playwright" ]; then
  echo "📦 Installing stealth-engine dependencies..."
  (cd "$ENGINE_DIR" && npm install)
  echo "🎭 Installing Playwright browsers (first time only)..."
  (cd "$ENGINE_DIR" && node_modules/.bin/playwright install chromium)
fi

# ── Step 4: Install frontend dependencies if needed ─────────────────────────
if [ ! -d "$FRONTEND_DIR/node_modules/next" ]; then
  echo "📦 Installing frontend dependencies..."
  (cd "$FRONTEND_DIR" && npm install)
fi

# ── Step 5: Start API Server (background) ───────────────────────────────────
echo "🧩 Starting Duokai API on port 3100..."
(cd "$API_DIR" && npm run dev) &
API_PID=$!
echo "   API PID: $API_PID"

# Wait for API to be ready
echo -n "   Waiting for API"
for i in $(seq 1 20); do
  if curl -sf http://127.0.0.1:3100/health > /dev/null 2>&1; then
    echo " ✅"
    break
  fi
  echo -n "."
  sleep 0.5
done

# ── Step 6: Start Runtime Server (background) ───────────────────────────────
echo "🚀 Starting Runtime Server on port 3101..."
(cd "$ENGINE_DIR" && RUNTIME_PORT=3101 DASHBOARD_URL=http://127.0.0.1:3100 node server.js) &
RUNTIME_PID=$!
echo "   Runtime PID: $RUNTIME_PID"

# Wait for runtime server to be ready
echo -n "   Waiting for runtime server"
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:3101/health > /dev/null 2>&1; then
    echo " ✅"
    break
  fi
  echo -n "."
  sleep 0.5
done

# ── Step 7: Start Frontend (background) ─────────────────────────────────────
echo "🖥️  Starting Frontend on port 3001..."
(cd "$FRONTEND_DIR" && PORT=3001 npm run dev) &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"

# Wait for frontend to be ready
echo -n "   Waiting for frontend"
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:3001 > /dev/null 2>&1; then
    echo " ✅"
    break
  fi
  echo -n "."
  sleep 1
done

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  ✅ All services running!                    ║"
echo "║     Frontend:   http://localhost:3001        ║"
echo "║     API:        http://127.0.0.1:3100        ║"
echo "║     Runtime:    http://127.0.0.1:3101        ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── Step 8: Open frontend in Chrome App Mode ────────────────────────────────
if [ -d "/Applications/Google Chrome.app" ]; then
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    --app=http://localhost:3001 \
    --window-size=1400,900 \
    --window-position=0,0 \
    2>/dev/null &
elif command -v open &> /dev/null; then
  open "http://localhost:3001"
fi

echo "Press Ctrl+C to stop all services."
echo ""

# ── Cleanup on exit ──────────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo "Shutting down..."
  kill $API_PID 2>/dev/null
  kill $RUNTIME_PID  2>/dev/null
  kill $FRONTEND_PID 2>/dev/null
  wait
  echo "✅ All services stopped."
}
trap cleanup SIGINT SIGTERM

wait $FRONTEND_PID
