@echo off
setlocal EnableExtensions
title Duokai 后台 - 日常启动
cd /d "%~dp0"
call "%~dp0..\..\admin_start_windows.bat"
exit /b %errorlevel%
