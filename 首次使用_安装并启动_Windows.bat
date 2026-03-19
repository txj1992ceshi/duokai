@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
echo [CHECK] Verifying Windows environment...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js was not found. Opening the download page...
    start https://nodejs.org/
    pause
    exit /b 1
)
echo [OK] Environment check passed. Installing required dependencies...

echo [1/3] Installing dashboard dependencies...
pushd "fingerprint-dashboard"
call npm.cmd install
if %errorlevel% neq 0 (
    popd
    exit /b %errorlevel%
)

echo [2/3] Installing stealth engine dependencies...
pushd "stealth-engine"
call npm.cmd install
if %errorlevel% neq 0 (
    popd
    popd
    exit /b %errorlevel%
)

echo [3/3] Installing Playwright Chromium (first run may take a few minutes)...
call node_modules\.bin\playwright.cmd install chromium
if %errorlevel% neq 0 (
    popd
    popd
    exit /b %errorlevel%
)

popd
popd

echo [DONE] Installation completed. You can now run 日常启动面板_Windows.bat
pause
