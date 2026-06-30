@echo off
title Your Career Buddy — Bosket's Tech Ventures
cd /d "%~dp0"

:: Check if electron binary exists
if not exist "node_modules\electron\dist\electron.exe" (
    echo [ERROR] Electron not found. Run: npm install
    pause
    exit /b 1
)

:: Kill any existing instance
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr "ESTABLISHED" ^| findstr ":3000 "') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo Starting Your Career Buddy...
start "" "node_modules\electron\dist\electron.exe" .
