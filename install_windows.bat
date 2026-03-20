@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo [CHECK] Verifying Windows environment...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js was not found. Opening the download page...
    start https://nodejs.org/
    pause
    exit /b 1
)

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

echo [3/3] Installing Playwright Chromium...
call node_modules\.bin\playwright.cmd install chromium
if %errorlevel% neq 0 (
    popd
    popd
    exit /b %errorlevel%
)

popd
popd

echo [DONE] Installation completed successfully.
pause
exit /b 0
