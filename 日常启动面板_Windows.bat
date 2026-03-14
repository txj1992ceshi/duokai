@echo off
setlocal enabledelayedexpansion
cd /d %~dp0

if not exist "fingerprint-dashboard\node_modules" (
    echo ❌ 检到到您似乎是第一次运行，请先执行「首次使用_安装并启动_Windows.bat」
    pause
    exit
)

echo 🚀 正在唤醒服务端 (后台进程)...
start "Fingerprint-Server" /d "fingerprint-dashboard" /min cmd /c "npm run dev"

echo ⏳ 正在等待服务端开门 (智能探测 3000 端口)...
:check_port
netstat -ano | findstr :3000 | findstr LISTENING >nul
if %errorlevel% neq 0 (
    echo | set /p="."
    timeout /t 1 /nobreak >nul
    goto check_port
)

echo.
echo ✅ 服务端已就绪！正在寻找 Chrome 启动程序模式...

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
echo ✅ 启动成功！
echo [提示] 面板已弹出，请不要关闭后台运行的黑色 Node 窗口。
echo ------------------------------------------------
timeout /t 5
exit
