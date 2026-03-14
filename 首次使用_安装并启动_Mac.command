#!/bin/bash
cd "$(dirname "$0")"
echo "正在检测 Mac 环境..."
if ! command -v node &> /dev/null; then
    echo "❌ 找不到 Node.js，请先前往 https://nodejs.org/ 下载安装。"
    open https://nodejs.org/
    exit
fi
cd fingerprint-dashboard && npm install --quiet
cd .. && ./start.sh
