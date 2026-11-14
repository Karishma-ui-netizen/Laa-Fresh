@echo off
setlocal
set "GIT_PATH=%LOCALAPPDATA%\Programs\Git\cmd\git.exe"
if not exist "%GIT_PATH%" set "GIT_PATH=git"

echo =======================================================
echo   Laa Fresh - Auto Push Updates to GitHub
echo =======================================================
echo.
"%GIT_PATH%" add .
"%GIT_PATH%" commit -m "Update: %date% %time%"
echo.
echo Pushing latest code to GitHub (Vercel will auto-deploy)...
"%GIT_PATH%" push origin main
echo.
echo Done! Vercel is now deploying your latest changes.
pause
