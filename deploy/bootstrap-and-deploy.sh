#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_IP="${SERVER_IP:-$(hostname -I | awk '{print $1}')}"
PUBLIC_SCHEME="${PUBLIC_SCHEME:-http}"
PUBLIC_HOST="${PUBLIC_HOST:-$SERVER_IP}"
EXTRA_CORS_ORIGINS="${EXTRA_CORS_ORIGINS:-}"

API_DIR="$ROOT_DIR/duokai-api"
ADMIN_DIR="$ROOT_DIR/duokai-admin"
FRONTEND_DIR="$ROOT_DIR/fingerprint-dashboard"
RUNTIME_DIR="$FRONTEND_DIR/stealth-engine"
ECOSYSTEM_FILE="$ROOT_DIR/deploy/ecosystem.config.cjs"

PUBLIC_BASE="${PUBLIC_SCHEME}://${PUBLIC_HOST}"
API_BASE="$PUBLIC_BASE"
ADMIN_BASE="${PUBLIC_SCHEME}://${PUBLIC_HOST}:3000"
APP_BASE="${PUBLIC_SCHEME}://${PUBLIC_HOST}:3001"
FILE_REPOSITORY_ROOT="${DUOKAI_FILE_REPOSITORY_ROOT:-/srv/duokai/files}"

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1"
}

wait_for_http() {
  local url="$1"
  local attempts="${2:-20}"
  local delay="${3:-2}"

  for ((i = 1; i <= attempts; i++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$delay"
  done

  return 1
}

ensure_line() {
  local file="$1"
  local key="$2"
  local value="$3"

  touch "$file"
  if grep -q "^${key}=" "$file"; then
    sed -i.bak "s#^${key}=.*#${key}=${value}#g" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

ensure_admin_env() {
  local file="$ADMIN_DIR/.env.local"
  log "Ensuring admin env"
  ensure_line "$file" "NEXT_PUBLIC_DUOKAI_API_BASE" "$API_BASE"
  ensure_line "$file" "NEXT_PUBLIC_ADMIN_BASE_PATH" "/admin"
  ensure_line "$file" "ADMIN_BASE_PATH" "/admin"
}

ensure_frontend_env() {
  local file="$FRONTEND_DIR/.env.local"
  log "Ensuring frontend env"
  ensure_line "$file" "NEXT_PUBLIC_DUOKAI_API_BASE" "$API_BASE"
  ensure_line "$file" "NEXT_PUBLIC_RUNTIME_EXECUTION_MODE" "control-plane"
}

ensure_api_env() {
  local file="$API_DIR/.env.local"
  log "Ensuring API env"
  ensure_line "$file" "RUNTIME_URL" "http://127.0.0.1:3101"
  ensure_line "$file" "DUOKAI_FILE_REPOSITORY_ROOT" "$FILE_REPOSITORY_ROOT"
  local cors_origins="${PUBLIC_BASE},${ADMIN_BASE},${APP_BASE},http://127.0.0.1:3000,http://127.0.0.1:3001"
  if [[ -n "$EXTRA_CORS_ORIGINS" ]]; then
    cors_origins="${cors_origins},${EXTRA_CORS_ORIGINS}"
  fi
  ensure_line "$file" "CORS_ORIGINS" "$cors_origins"
}

ensure_file_repository_root() {
  log "Ensuring file repository root"
  mkdir -p "$FILE_REPOSITORY_ROOT"
}

install_dependencies() {
  log "Installing API dependencies"
  (cd "$API_DIR" && npm install)

  log "Installing admin dependencies"
  (cd "$ADMIN_DIR" && npm install)

  log "Installing frontend dependencies"
  (cd "$FRONTEND_DIR" && npm install)

  log "Installing runtime dependencies"
  (cd "$RUNTIME_DIR" && npm install)

  log "Installing Playwright Chromium"
  (cd "$RUNTIME_DIR" && npx playwright install chromium)
}

build_apps() {
  log "Building API"
  (cd "$API_DIR" && npm run build)

  log "Building admin"
  (cd "$ADMIN_DIR" && npx next build --webpack)

  log "Building frontend"
  (cd "$FRONTEND_DIR" && npx next build --webpack)
}

restart_pm2() {
  log "Restarting PM2 services"
  export DASHBOARD_URL="$PUBLIC_BASE"
  if pm2 describe duokai-api >/dev/null 2>&1; then
    (cd "$ROOT_DIR" && pm2 startOrRestart "$ECOSYSTEM_FILE" --update-env)
  else
    (cd "$ROOT_DIR" && pm2 start "$ECOSYSTEM_FILE")
  fi
  pm2 save
}

health_check() {
  log "Health checks"
  wait_for_http http://localhost:3100/health
  curl -fsS http://localhost:3100/health
  echo
  wait_for_http http://127.0.0.1:3101/health
  curl -fsS http://127.0.0.1:3101/health
  echo
  wait_for_http http://127.0.0.1:3000
  wait_for_http http://127.0.0.1:3001
  curl -I -fsS http://127.0.0.1:3000 >/dev/null
  curl -I -fsS http://127.0.0.1:3001 >/dev/null
  pm2 status
}

main() {
  log "Deploy root: $ROOT_DIR"
  log "Detected server IP: $SERVER_IP"
  log "Public base: $PUBLIC_BASE"

  ensure_admin_env
  ensure_frontend_env
  ensure_api_env
  ensure_file_repository_root
  install_dependencies
  build_apps
  restart_pm2
  health_check

  log "Bootstrap and deploy completed"
}

main "$@"
