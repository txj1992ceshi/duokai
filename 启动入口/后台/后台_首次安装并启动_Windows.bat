@echo off
setlocal EnableExtensions
title Duokai 后台 - 首次安装并启动
cd /d "%~dp0"
call "%~dp0..\..\admin_install_and_start_windows.bat"
exit /b %errorlevel%
