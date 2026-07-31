@echo off
setlocal EnableExtensions
cd /d "%~dp0"
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js was not found. Opening the download page...
    start https://nodejs.org/
    pause
    exit /b 1
)

echo [1/3] Installing API dependencies...
pushd "duokai-api"
call npm.cmd install
if %errorlevel% neq 0 (popd & exit /b %errorlevel%)
popd

echo [2/3] Installing admin frontend dependencies...
pushd "duokai-admin"
call npm.cmd install
if %errorlevel% neq 0 (popd & exit /b %errorlevel%)
popd

echo [3/3] Installing web frontend dependencies...
pushd "apps\duokai-web"
call npm.cmd install
if %errorlevel% neq 0 (popd & exit /b %errorlevel%)
popd

echo [DONE] Installation completed. Ordinary Playwright Chromium is not installed.
pause
exit /b 0
