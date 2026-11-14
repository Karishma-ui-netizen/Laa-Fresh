@echo off
setlocal
cd /d "%~dp0"
set "GIT_PATH=%LOCALAPPDATA%\Programs\Git\cmd\git.exe"
if not exist "%GIT_PATH%" set "GIT_PATH=git"

echo =======================================================
echo   Laa Fresh - Auto Push Updates to GitHub
echo =======================================================
echo.
"%GIT_PATH%" add .
"%GIT_PATH%" commit -m "Update: %date% %time%" >nul 2>nul
echo Pushing latest code to https://github.com/Karishma-ui-netizen/Laa-Fresh.git ...
echo.
"%GIT_PATH%" push -u origin main
echo.
echo =======================================================
if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] Code successfully pushed to GitHub!
    echo Vercel will now automatically deploy your site.
) else (
    echo [NOTE] If prompted for a password, note that GitHub requires a Personal Access Token:
    echo 1. Go to github.com -^> Settings -^> Developer Settings -^> Personal Access Tokens
    echo 2. Generate a classic token with 'repo' scope
    echo 3. Paste the token when prompted for Password
)
echo =======================================================
echo.
pause
