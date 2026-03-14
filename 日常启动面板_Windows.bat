@echo off
cd /d %~dp0
echo 🚀 正在检查运行环境...

if not exist "fingerprint-dashboard\node_modules" (
    echo ❌ 检到到您似乎是第一次运行，请先执行「首次使用_安装并启动_Windows.bat」
    pause
    exit
)

echo 🚀 正在极速后台唤醒服务端...
echo 请稍等 5-8 秒，面板会自动弹出...

:: 启动后台服务
start /b cmd /c "cd fingerprint-dashboard && npm run dev"

:: 等待 5 秒给 Next.js 编译时间
timeout /t 5 /nobreak >nul

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

echo ✅ 启动指令已发送。如果网页还是打不开，请手动刷新(F5)一下。
pause
