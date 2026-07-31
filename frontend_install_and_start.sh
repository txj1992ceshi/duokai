#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "❌ 找不到 Node.js，正在打开下载页面..."
  open https://nodejs.org/
  exit 1
fi
(cd duokai-api && npm install)
(cd apps/duokai-web && npm install)
echo "✅ 前台依赖安装完成。浏览器内核由 Duokai 桌面端管理，不下载普通 Playwright Chromium。"
exec ./start.sh
