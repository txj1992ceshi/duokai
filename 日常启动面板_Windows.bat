@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d %~dp0

if not exist "fingerprint-dashboard\node_modules" (
    echo ❌ 检到到您似乎是第一次运行，请先执行「首次使用_安装并启动_Windows.bat」
    pause
    exit
)

echo 🚀 启动中... 正在唤醒后台服务端...

:: Step 4: 启动 Runtime Server (3001 端口)
echo ⏳ 正在启动浏览器 Runtime 服务 (3001)...
start "Fingerprint-Runtime" /d "fingerprint-dashboard\stealth-engine" /min node server.js

:: 等待 3001 端口就绪
:check_runtime
netstat -ano | findstr :3001 | findstr LISTENING >nul
if %errorlevel% neq 0 (
    echo | set /p="."
    timeout /t 1 /nobreak >nul
    goto check_runtime
)
echo. ✅ Runtime 就绪

:: Step 5: 启动 Dashboard (3000 端口)
echo ⏳ 正在启动管理面板 (3000)...
start "Fingerprint-Dashboard" /d "fingerprint-dashboard" /min cmd /c "npm run dev"

:: 等待 3000 端口就绪
:check_dashboard
netstat -ano | findstr :3000 | findstr LISTENING >nul
if %errorlevel% neq 0 (
    echo | set /p="."
    timeout /t 1 /nobreak >nul
    goto check_dashboard
)
echo. ✅ 面板已开门

echo.
echo ✅ 服务端已就绪！正在以程序模式启动 UI 界面...

set "CHROME_BIN="
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set "CHROME_BIN=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not defined CHROME_BIN if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set "CHROME_BIN=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not defined CHROME_BIN if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME_BIN=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

if defined CHROME_BIN (
    start "" "!CHROME_BIN!" --app=http://localhost:3000 --window-size=1280,800
) else (
    start http://localhost:3000
)

echo ------------------------------------------------
echo ✅ 全部启动成功！请尽情使用。
echo [提示] 窗口已弹出，后台窗口已自动隐藏至任务栏。
echo ------------------------------------------------
timeout /t 5
exit
