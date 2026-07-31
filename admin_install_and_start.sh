#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "❌ 找不到 Node.js，正在打开下载页面..."
  open https://nodejs.org/
  exit 1
fi
(cd duokai-api && npm install)
(cd duokai-admin && npm install)
echo "✅ 后台依赖安装完成。浏览器任务由控制面下发给 Duokai 桌面代理。"
exec ./admin_start.sh
