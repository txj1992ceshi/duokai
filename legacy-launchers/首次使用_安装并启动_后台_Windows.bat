@echo off
setlocal EnableExtensions
title duokai admin Windows install and launch
echo [DEPRECATED] 此旧入口已弃用，请改用 “启动入口” 目录中的标准入口。
cd /d "%~dp0"
call "%~dp0..\admin_install_and_start_windows.bat"
exit /b %errorlevel%
