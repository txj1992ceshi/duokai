@echo off
setlocal enabledelayedexpansion
cd /d %~dp0
echo [CHECK] Verifying Windows environment...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js was not found. Opening the download page...
    start https://nodejs.org/
    pause
    exit
)
echo [OK] Environment check passed. Installing required dependencies...

echo [1/3] Installing dashboard dependencies...
cd "fingerprint-dashboard" && call npm install
if %errorlevel% neq 0 exit /b %errorlevel%

echo [2/3] Installing stealth engine dependencies...
cd "stealth-engine" && call npm install
if %errorlevel% neq 0 exit /b %errorlevel%

echo [3/3] Installing Playwright Chromium (first run may take a few minutes)...
call node_modules\.bin\playwright install chromium
if %errorlevel% neq 0 exit /b %errorlevel%

echo [DONE] Installation completed. You can now run 日常启动面板_Windows.bat
pause
