@echo off
title duokai Windows install and launch
cd /d "%~dp0"

call "首次使用_安装并启动_Windows.bat"
if %errorlevel% neq 0 exit /b %errorlevel%

call "日常启动面板_Windows.bat"
exit /b %errorlevel%
