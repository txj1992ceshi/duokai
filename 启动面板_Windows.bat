@echo off

cd /d "%~dp0"

cd fingerprint-dashboard

start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://localhost:3000 --window-size=1280,800

npm run dev
