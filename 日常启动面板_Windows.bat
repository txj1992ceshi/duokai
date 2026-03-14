@echo off
setlocal enabledelayedexpansion
cd /d %~dp0
echo 🚀 正在检查运行环境...

if not exist "fingerprint-dashboard\node_modules" (
    echo ❌ 检到到您似乎是第一次运行，请先执行「首次使用_安装并启动_Windows.bat」
    pause
    exit
)

echo 🚀 正在后台启动服务端进程...
echo [注意] 将会弹出一个黑色的 Node.js 窗口，请不要关闭它！
echo.

:: 在新窗口启动服务端，这样可以看到报错信息
start "Fingerprint-Server" /d "fingerprint-dashboard" cmd /c "npm run dev"

echo ⏳ 正在等待服务端初始化 (10秒)...
echo 如果这是您关机后的第一次启动，可能需要更长时间。
timeout /t 10 /nobreak >nul

:: 智能搜索 Chrome 路径 (增加用户目录搜索)
set "CHROME_BIN="
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set "CHROME_BIN=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not defined CHROME_BIN if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set "CHROME_BIN=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not defined CHROME_BIN if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME_BIN=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

if defined CHROME_BIN (
    echo ✅ 已找到 Chrome，正在以「程序模式」启动...
    start "" "!CHROME_BIN!" --app=http://localhost:3000 --window-size=1280,800
) else (
    echo ⚠️ 未找到 Chrome 安装路径，将使用默认浏览器打开...
    start http://localhost:3000
)

echo.
echo ✅ 全部启动指令已发送。
echo 如果页面依然显示拒绝连接，请查看弹出的黑色窗口是否有报错，或在 5 秒后手动刷新(F5)。
echo.
pause
