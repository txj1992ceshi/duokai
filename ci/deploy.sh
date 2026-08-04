#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "[CI] Standalone Playwright runtime deployment has been retired."
echo "[CI] Deploying API, admin and frontend only. Browser tasks are delivered"
echo "[CI] through the control plane to registered Duokai desktop agents using CloakBrowser."

exec "$ROOT/deploy/bootstrap-and-deploy.sh"
