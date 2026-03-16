@echo off
title 指纹浏览器控制面板 - Windows版
cd /d "%~dp0"

echo 正在检测环境...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 检测到您的电脑没有安装 Node.js!
    echo 正在为您打开下载页面，请安装后再次运行此脚本...
    start https://nodejs.org/
    pause
    exit
)

echo ✅ 环境检测完成，正在安装/检查依赖 (可能需要1-2分钟)...
cd fingerprint-dashboard
call npm install --quiet

echo 🚀 正在启动面板...
start "" http://localhost:3000
npm run dev
pause
