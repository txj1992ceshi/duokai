#!/bin/bash
cd "$(dirname "$0")"
echo ""
echo "════════════════════════════════════════"
echo "  Duokai 前台 — 首次安装向导"
echo "════════════════════════════════════════"
echo ""

if ! command -v node &> /dev/null; then
    echo "❌ 找不到 Node.js，正在打开下载页面..."
    open https://nodejs.org/
    exit 1
fi
echo "✅ Node.js $(node -v) 已就绪"

echo ""
echo "📦 正在安装 Duokai API 依赖..."
cd duokai-api && npm install --quiet
cd ..

echo ""
echo "📦 正在安装 Duokai Web 前端依赖..."
cd apps/duokai-web && npm install --quiet
cd ..

echo ""
echo "📦 正在安装 Stealth Engine 依赖..."
cd fingerprint-dashboard/stealth-engine && npm install --quiet
cd ../..

echo ""
echo "🎭 正在下载 Playwright Chromium 内核（首次约需 1-5 分钟）..."
cd fingerprint-dashboard/stealth-engine
node_modules/.bin/playwright install chromium
cd ../..

echo ""
echo "════════════════════════════════════════"
echo "  ✅ 前台安装完成！正在启动..."
echo "════════════════════════════════════════"
echo ""

./start.sh
