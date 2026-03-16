#!/bin/bash
cd "$(dirname "$0")"
echo ""
echo "════════════════════════════════════════"
echo "  AntigravityCore — 首次安装向导"
echo "════════════════════════════════════════"
echo ""

# 检测 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 找不到 Node.js，正在打开下载页面..."
    open https://nodejs.org/
    exit 1
fi
echo "✅ Node.js $(node -v) 已就绪"

# 安装 dashboard 依赖
echo ""
echo "📦 正在安装管理面板依赖..."
cd fingerprint-dashboard && npm install --quiet
cd ..

# 安装 stealth-engine 依赖
echo ""
echo "📦 正在安装 Stealth Engine 依赖..."
cd fingerprint-dashboard/stealth-engine && npm install --quiet
cd ../..

# 安装 Playwright 浏览器内核（仅首次需要，约 150MB）
echo ""
echo "🎭 正在下载 Playwright Chromium 内核（首次约需 1-5 分钟）..."
cd fingerprint-dashboard/stealth-engine
node_modules/.bin/playwright install chromium
cd ../..

echo ""
echo "════════════════════════════════════════"
echo "  ✅ 安装完成！正在启动..."
echo "════════════════════════════════════════"
echo ""

./start.sh
