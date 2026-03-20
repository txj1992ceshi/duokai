@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
set "LOG_DIR=%~dp0logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>&1
set "RUNTIME_LOG=%LOG_DIR%\runtime.log"
set "DASHBOARD_LOG=%LOG_DIR%\dashboard.log"

if not exist "fingerprint-dashboard\node_modules" (
    echo [ERROR] Dependencies were not found. Run install_windows.bat first.
    pause
    exit /b 1
)

if not exist "fingerprint-dashboard\stealth-engine\node_modules" (
    echo [ERROR] Stealth engine dependencies were not found. Run install_windows.bat first.
    pause
    exit /b 1
)

echo [START] Launching services...
echo [1/2] Starting runtime server on port 3001...
del /q "%RUNTIME_LOG%" >nul 2>&1
start "Fingerprint-Runtime" /min cmd /c "cd /d \"%~dp0fingerprint-dashboard\stealth-engine\" && node server.js > \"%RUNTIME_LOG%\" 2>&1"
set /a RUNTIME_WAIT=0

:check_runtime
netstat -ano | findstr :3001 | findstr LISTENING >nul
if not errorlevel 1 goto runtime_ready
set /a RUNTIME_WAIT+=1
if !RUNTIME_WAIT! geq 45 (
    echo.
    echo [ERROR] Runtime did not become ready within 45 seconds.
    echo [INFO] Runtime log: %RUNTIME_LOG%
    if exist "%RUNTIME_LOG%" type "%RUNTIME_LOG%"
    pause
    exit /b 1
)
if %errorlevel% neq 0 (
    <nul set /p "=."
    timeout /t 1 /nobreak >nul
    goto check_runtime
)

:runtime_ready
echo.
echo [OK] Runtime is ready.

echo [2/2] Starting dashboard on port 3000...
del /q "%DASHBOARD_LOG%" >nul 2>&1
start "Fingerprint-Dashboard" /min cmd /c "cd /d \"%~dp0fingerprint-dashboard\" && npm.cmd run dev > \"%DASHBOARD_LOG%\" 2>&1"
set /a DASHBOARD_WAIT=0

:check_dashboard
netstat -ano | findstr :3000 | findstr LISTENING >nul
if not errorlevel 1 goto dashboard_ready
set /a DASHBOARD_WAIT+=1
if !DASHBOARD_WAIT! geq 60 (
    echo.
    echo [ERROR] Dashboard did not become ready within 60 seconds.
    echo [INFO] Dashboard log: %DASHBOARD_LOG%
    if exist "%DASHBOARD_LOG%" type "%DASHBOARD_LOG%"
    pause
    exit /b 1
)
if %errorlevel% neq 0 (
    <nul set /p "=."
    timeout /t 1 /nobreak >nul
    goto check_dashboard
)

:dashboard_ready
echo.
echo [OK] Dashboard is ready.
echo [OK] Services are ready. Opening the UI...

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
echo [DONE] Startup completed successfully.
echo ------------------------------------------------
timeout /t 5 >nul
exit /b 0
