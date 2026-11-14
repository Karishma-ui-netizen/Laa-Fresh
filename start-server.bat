@echo off
title Laa Fresh Web Server
echo Starting Laa Fresh Stock & Storage Manager...
start http://localhost:8080/
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
