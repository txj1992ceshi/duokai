#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
ENGINE_DIR="$ROOT/fingerprint-dashboard/stealth-engine"
HOME_DIR="${HOME:-/root}"
DATA_DIR="$HOME_DIR/.antigravity-browser"

echo "[CI] Ensure data dir"
mkdir -p "$DATA_DIR"
chown $(whoami) "$DATA_DIR" || true

echo "[CI] 1) Run SQLite migration"
node "$ENGINE_DIR/tools/migrate-to-sqlite.js"

echo "[CI] 2) Inject secrets (RUNTIME_KEY, REDIS_URL) - from env"
if [ -z "${RUNTIME_KEY:-}" ]; then
  echo "RUNTIME_KEY not set in env - abort"
  exit 1
fi

# Persist runtime key into SQLite settings table (safe for runtime)
DB="$DATA_DIR/duokai.db"
node -e "const Database=require('better-sqlite3');const db=new Database('$DB'); db.prepare(\"INSERT OR REPLACE INTO settings(k,v) VALUES ('runtimeApiKey', ?)\").run(JSON.stringify(process.env.RUNTIME_KEY)); console.log('Wrote runtimeApiKey');" || true

# Write REDIS_URL into env file for systemd or process manager
if [ ! -z "${REDIS_URL:-}" ]; then
  echo "REDIS_URL=$REDIS_URL" > "$DATA_DIR/runtime.env"
fi

echo "[CI] 3) Set permissions"
chmod 600 "$DATA_DIR"/*.json || true
chmod 600 "$DB" || true

echo "[CI] 4) Install deps and build"
cd "$ENGINE_DIR"
npm ci

echo "[CI] 5) Start service with systemd user unit (or pm2)"
# Option A: install systemd unit for user
UNIT_PATH="$HOME_DIR/.config/systemd/user/duokai-runtime.service"
mkdir -p "$(dirname "$UNIT_PATH")"
cat > "$UNIT_PATH" <<EOF
[Unit]
Description=Duokai Stealth Runtime
After=network.target

[Service]
Type=simple
EnvironmentFile=%h/.antigravity-browser/runtime.env
WorkingDirectory=$ENGINE_DIR
ExecStart=/usr/bin/env RUNTIME_PORT=3001 RUNTIME_KEY=$RUNTIME_KEY node $ENGINE_DIR/server.js
Restart=on-failure
RestartSec=5
StandardOutput=append:$DATA_DIR/runtime.log
StandardError=append:$DATA_DIR/runtime.err

[Install]
WantedBy=default.target
EOF

# enable & start
systemctl --user daemon-reload || true
systemctl --user enable --now duokai-runtime.service || true

echo "[CI] Done. Service should be running (systemctl --user status duokai-runtime.service)"
