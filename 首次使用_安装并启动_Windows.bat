@echo off
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
cd ..
echo 🚀 启动中...
start "" "http://localhost:3000"
call npm run dev --prefix fingerprint-dashboard
pause
