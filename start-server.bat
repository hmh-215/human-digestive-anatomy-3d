@echo off
chcp 65001 > nul
title 3D Human Digestive Anatomy - Web Server
cd /d "%~dp0"
echo ===========================================================
echo       3D HUMAN DIGESTIVE SYSTEM ANATOMY WEB APP
echo       Port mặc định: 8085
echo ===========================================================
echo.
powershell -ExecutionPolicy Bypass -NoProfile -File "server.ps1"
if %errorlevel% neq 0 (
    echo.
    echo [!] Khoi chay bang PowerShell khong thanh cong, dang thu bang Python tren cong 8085...
    python -m http.server 8085
)
pause
