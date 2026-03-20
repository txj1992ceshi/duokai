@echo off
setlocal EnableExtensions
cd /d "%~dp0"
call "%~dp0launcher_windows.bat"
exit /b %errorlevel%
