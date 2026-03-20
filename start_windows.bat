@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist "fingerprint-dashboard\node_modules" (
    echo [ERROR] Dashboard dependencies were not found.
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

echo [START] Launching duokai on Windows...
echo [1/3] Starting runtime terminal...
start "duokai-runtime" cmd /k "cd /d \"%~dp0fingerprint-dashboard\stealth-engine\" && node server.js"

echo [2/3] Starting dashboard terminal...
start "duokai-dashboard" cmd /k "cd /d \"%~dp0fingerprint-dashboard\" && npm.cmd run dev"

echo [3/3] Opening dashboard in browser...
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 6; Start-Process 'http://localhost:3000'"

echo ------------------------------------------------
echo [DONE] duokai start command sent.
echo [INFO] Two terminal windows should open:
echo        - duokai-runtime
echo        - duokai-dashboard
echo [INFO] If the page opens too early, refresh the browser once.
echo ------------------------------------------------
timeout /t 3 >nul
exit /b 0
