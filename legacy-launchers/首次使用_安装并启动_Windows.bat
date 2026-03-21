@echo off
setlocal EnableExtensions
echo [DEPRECATED] 此旧入口已弃用，请改用 “启动入口” 目录中的标准入口。
cd /d "%~dp0"
call "%~dp0..\frontend_install_and_start_windows.bat"
exit /b %errorlevel%
