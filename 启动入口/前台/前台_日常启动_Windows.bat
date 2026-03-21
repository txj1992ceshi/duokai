@echo off
setlocal EnableExtensions
title Duokai 前台 - 日常启动
cd /d "%~dp0"
call "%~dp0..\..\start_windows.bat"
exit /b %errorlevel%
