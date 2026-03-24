#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/var/www/duokai}"
BRANCH="${BRANCH:-main}"

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1"
}

if [[ ! -d "$ROOT_DIR/.git" ]]; then
  echo "Git repository not found: $ROOT_DIR" >&2
  exit 1
fi

cd "$ROOT_DIR"

log "Fetching latest code from origin/$BRANCH"
git fetch origin "$BRANCH"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" != "$BRANCH" ]]; then
  log "Switching branch from $CURRENT_BRANCH to $BRANCH"
  git checkout "$BRANCH"
fi

log "Pulling latest commit"
git pull --ff-only origin "$BRANCH"

log "Running deploy/bootstrap-and-deploy.sh"
bash deploy/bootstrap-and-deploy.sh

log "Deployment finished"
