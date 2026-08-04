@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist "duokai-api\node_modules" (
    echo [ERROR] API dependencies were not found. Run install_windows.bat first.
    pause
    exit /b 1
)
if not exist "duokai-admin\node_modules" (
    echo [ERROR] Admin dependencies were not found. Run install_windows.bat first.
    pause
    exit /b 1
)

echo [1/2] Starting API terminal...
start "duokai-api" cmd /k "cd /d \"%~dp0duokai-api\" && npm.cmd run dev"
echo [2/2] Starting admin terminal...
start "duokai-admin" cmd /k "cd /d \"%~dp0duokai-admin\" && set PORT=3000 && npm.cmd run dev"
echo [INFO] Browser tasks use control-plane -^> Duokai desktop agent -^> CloakBrowser.
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 8; Start-Process 'http://localhost:3000'"
timeout /t 3 >nul
exit /b 0
