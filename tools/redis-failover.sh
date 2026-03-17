#!/usr/bin/env bash
# tools/redis-failover.sh
# Usage: ./tools/redis-failover.sh redis-master-host user
set -euo pipefail
MASTER=${1:-redis-master.example.com}
SSH_USER=${2:-ubuntu}
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"

echo "[+] Stopping redis on master: $MASTER"
ssh $SSH_OPTS ${SSH_USER}@${MASTER} "sudo systemctl stop redis || sudo pkill -f redis-server || true"

echo "[+] Sleeping 20s to allow failover..."
sleep 20

echo "[+] Checking redis status on master and sentinels..."
ssh $SSH_OPTS ${SSH_USER}@${MASTER} "sudo systemctl status redis || echo 'redis stopped'"

echo "[+] Waiting another 40s for clients to hit the cluster..."
sleep 40

echo "[+] Starting redis on master: $MASTER"
ssh $SSH_OPTS ${SSH_USER}@${MASTER} "sudo systemctl start redis || true"

echo "[+] Done. Please inspect application logs and Redis sentinel state."
