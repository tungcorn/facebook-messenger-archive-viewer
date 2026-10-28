@echo off
chcp 65001 > nul
echo =======================================================
echo    FACEBOOK MESSENGER ARCHIVE EXPLORER
echo =======================================================
echo.
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Python is not installed or not in PATH!
    echo Opening index.html directly in browser...
    start "" "%~dp0index.html"
    pause
    exit /b
)

python "%~dp0viewer.py" %*
pause
