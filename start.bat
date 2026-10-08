@echo off
setlocal

echo ========================================================
echo        Starting QuizNest - E-Quiz System
echo ========================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in PATH!
    echo Please install Node.js or run setup.bat first.
    pause
    exit /b 1
)

if not exist ".env" (
    echo [.env not found] Running initial setup first...
    call setup.bat
    exit /b
)

if not exist "node_modules" (
    echo [Dependencies missing] Running setup.bat...
    call setup.bat
    exit /b
)

echo Starting QuizNest Application...
echo Access at: http://localhost:3000
echo.
node src/server.js
