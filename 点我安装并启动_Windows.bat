@echo off
title duokai Windows launcher
cd /d "%~dp0"

echo [CHECK] Verifying environment...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js was not found.
    echo Opening the download page...
    start https://nodejs.org/
    pause
    exit
)

echo [OK] Environment check passed. Installing dashboard dependencies...
cd fingerprint-dashboard
call npm install --quiet
if %errorlevel% neq 0 exit /b %errorlevel%

echo [START] Opening dashboard...
start "" http://localhost:3000
npm run dev
pause
