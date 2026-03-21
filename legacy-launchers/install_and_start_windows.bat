@echo off
setlocal EnableExtensions
echo [DEPRECATED] 此旧入口已弃用，请改用 “启动入口” 目录中的标准入口。
cd /d "%~dp0"
call "%~dp0..\install_windows.bat"
if %errorlevel% neq 0 exit /b %errorlevel%
call "%~dp0..\start_windows.bat"
exit /b %errorlevel%
