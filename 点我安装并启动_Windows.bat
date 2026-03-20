@echo off
setlocal EnableExtensions
title duokai Windows install and launch
cd /d "%~dp0"
call "%~dp0install_and_start_windows.bat"
exit /b %errorlevel%
