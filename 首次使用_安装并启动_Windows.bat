@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d %~dp0
echo [环境自检] 正在检测 Windows 环境...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 找不到 Node.js，正在为您打开下载页面...
    start https://nodejs.org/
    pause
    exit
)
echo ✅ 环境检测通过，正在安装必须的依赖文件 (请保持联网)...
cd "fingerprint-dashboard" && call npm install
echo ✅ 依赖安装完成！您现在可以关闭此窗口并运行「日常启动面板_Windows.bat」了。
pause
