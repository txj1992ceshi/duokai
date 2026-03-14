@echo off
setlocal enabledelayedexpansion
cd /d %~dp0
echo 正在检测 Windows 环境...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 找不到 Node.js，正在打开下载页面...
    start https://nodejs.org/
    pause
    exit
)
echo ✅ 环境正常，正在安装依赖文件...
cd fingerprint-dashboard && call npm install
echo ✅ 安装完成！
pause
