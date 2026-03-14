@echo off
cd /d %~dp0
echo 🚀 正在极速启动指纹浏览器...

set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
if exist %CHROME_PATH% (
    start "" %CHROME_PATH% --app=http://localhost:3000 --window-size=1280,800
) else (
    set CHROME_PATH_X86="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
    if exist %CHROME_PATH_X86% (
        start "" %CHROME_PATH_X86% --app=http://localhost:3000 --window-size=1280,800
    ) else (
        start "" "http://localhost:3000"
    )
)

cd fingerprint-dashboard
call npm run dev
pause
