#!/bin/bash
cd "$(dirname "$0")"
echo "正在检测环境..."
if ! command -v node &> /dev/null; then
    echo "❌ 检测到您的电脑没有安装 Node.js，正在为您打开下载页面..."
    open https://nodejs.org/
    exit
fi

echo "✅ 环境检测完成，正在安装必须的依赖..."
cd fingerprint-dashboard && npm install --quiet
cd .. && ./start.sh
