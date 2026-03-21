@echo off
setlocal EnableExtensions
cd /d "%~dp0"
call "%~dp0install_windows.bat"
if %errorlevel% neq 0 exit /b %errorlevel%
call "%~dp0admin_start_windows.bat"
exit /b %errorlevel%
