#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/var/www/duokai}"
BRANCH="${BRANCH:-main}"
EXPECTED_SHA="${EXPECTED_SHA:-}"

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1"
}

if [[ ! -d "$ROOT_DIR/.git" ]]; then
  echo "Git repository not found: $ROOT_DIR" >&2
  exit 1
fi

cd "$ROOT_DIR"

if [[ ! "$EXPECTED_SHA" =~ ^[a-f0-9]{40}$ ]]; then
  echo "EXPECTED_SHA must be an exact lowercase 40-character Git SHA" >&2
  exit 1
fi

log "Fetching exact deployment candidate from origin/$BRANCH"
git fetch origin "$BRANCH"
REMOTE_SHA="$(git rev-parse "origin/$BRANCH")"
if [[ "$REMOTE_SHA" != "$EXPECTED_SHA" ]]; then
  echo "origin/$BRANCH moved: expected $EXPECTED_SHA, received $REMOTE_SHA" >&2
  exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" != "$BRANCH" ]]; then
  log "Switching branch from $CURRENT_BRANCH to $BRANCH"
  git checkout "$BRANCH"
fi

log "Fast-forwarding to authorized commit $EXPECTED_SHA"
git pull --ff-only origin "$BRANCH"
DEPLOYED_SHA="$(git rev-parse HEAD)"
if [[ "$DEPLOYED_SHA" != "$EXPECTED_SHA" ]]; then
  echo "Deployment checkout mismatch: expected $EXPECTED_SHA, received $DEPLOYED_SHA" >&2
  exit 1
fi

log "Running deploy/bootstrap-and-deploy.sh for $DEPLOYED_SHA"
bash deploy/bootstrap-and-deploy.sh

log "Deployment finished"
