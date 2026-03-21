@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist "duokai-api\node_modules" (
    echo [ERROR] API dependencies were not found.
    echo [INFO] Run install_windows.bat first.
    pause
    exit /b 1
)

if not exist "duokai-admin\node_modules" (
    echo [ERROR] Admin frontend dependencies were not found.
    echo [INFO] Run install_windows.bat first.
    pause
    exit /b 1
)

if not exist "fingerprint-dashboard\stealth-engine\node_modules" (
    echo [ERROR] Stealth engine dependencies were not found.
    echo [INFO] Run install_windows.bat first.
    pause
    exit /b 1
)

echo [START] Launching Duokai Admin on Windows...
echo [1/3] Starting API terminal...
start "duokai-api" cmd /k "cd /d \"%~dp0duokai-api\" && npm.cmd run dev"

echo [2/3] Starting runtime terminal...
start "duokai-runtime" cmd /k "cd /d \"%~dp0fingerprint-dashboard\stealth-engine\" && set RUNTIME_PORT=3101 && set DASHBOARD_URL=http://127.0.0.1:3100 && node server.js"

echo [3/3] Starting admin terminal...
start "duokai-admin" cmd /k "cd /d \"%~dp0duokai-admin\" && set PORT=3000 && npm.cmd run dev"

echo [OPEN] Opening admin in browser...
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 8; Start-Process 'http://localhost:3000'"

echo ------------------------------------------------
echo [DONE] admin start command sent.
echo [INFO] Three terminal windows should open:
echo        - duokai-api
echo        - duokai-runtime
echo        - duokai-admin
echo [INFO] If the page opens too early, refresh the browser once.
echo ------------------------------------------------
timeout /t 3 >nul
exit /b 0
