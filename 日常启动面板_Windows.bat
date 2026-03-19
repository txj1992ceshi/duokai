@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

if not exist "fingerprint-dashboard\node_modules" (
    echo [ERROR] Dependencies were not found. Run 首次使用_安装并启动_Windows.bat first.
    pause
    exit /b 1
)

if not exist "fingerprint-dashboard\stealth-engine\node_modules" (
    echo [ERROR] Stealth engine dependencies were not found. Run 首次使用_安装并启动_Windows.bat first.
    pause
    exit /b 1
)

echo [START] Launching services...

echo [1/2] Starting runtime server on port 3001...
start "Fingerprint-Runtime" /min cmd /c "cd /d \"%~dp0fingerprint-dashboard\stealth-engine\" && node server.js"

:check_runtime
netstat -ano | findstr :3001 | findstr LISTENING >nul
if %errorlevel% neq 0 (
    echo | set /p="."
    timeout /t 1 /nobreak >nul
    goto check_runtime
)
echo. [OK] Runtime is ready.

echo [2/2] Starting dashboard on port 3000...
start "Fingerprint-Dashboard" /min cmd /c "cd /d \"%~dp0fingerprint-dashboard\" && npm.cmd run dev"

:check_dashboard
netstat -ano | findstr :3000 | findstr LISTENING >nul
if %errorlevel% neq 0 (
    echo | set /p="."
    timeout /t 1 /nobreak >nul
    goto check_dashboard
)
echo. [OK] Dashboard is ready.

echo.
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
echo [INFO] The UI window should be visible now.
echo ------------------------------------------------
timeout /t 5
exit /b 0
