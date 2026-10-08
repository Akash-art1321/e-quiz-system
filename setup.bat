@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo        QuizNest - E-Quiz System Setup Wizard
echo ========================================================
echo.

:: 1. Check Node.js version
echo [1/8] Checking Node.js installation...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please download and install Node.js (v18 or higher) from https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo [OK] Node.js found: %NODE_VER%

:: 2. Check npm
echo.
echo [2/8] Checking npm installation...
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] npm is not installed or not in PATH!
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('npm -v') do set NPM_VER=%%v
echo [OK] npm found: %NPM_VER%

:: 3. Create required directories
echo.
echo [3/8] Creating required project directories...
if not exist "data" mkdir data
if not exist "logs" mkdir logs
if not exist "public" mkdir public
echo [OK] Directories verified.

:: 4. Check / Create .env configuration
echo.
echo [4/8] Checking environment configuration (.env)...
if not exist ".env" (
    echo [.env missing] Generating new .env from .env.example with secure session secret...
    if exist ".env.example" (
        copy .env.example .env >nul
    ) else (
        echo PORT=3000 > .env
        echo NODE_ENV=development >> .env
        echo ADMIN_USERNAME=admin >> .env
        echo ADMIN_PASSWORD=Admin@QuizNest2026! >> .env
        echo DB_PATH=./data/quiznest.db >> .env
    )
    :: Generate secure random 64-char hex secret using node crypto
    for /f "tokens=*" %%s in ('node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"') do set GEN_SECRET=%%s
    node -e "const fs=require('fs'); let c=fs.readFileSync('.env','utf8'); c=c.replace(/SESSION_SECRET=.*/, 'SESSION_SECRET=' + process.argv[1]); fs.writeFileSync('.env', c);" !GEN_SECRET!
    echo [OK] Generated .env file with secure session secret.
) else (
    echo [OK] Existing .env file found.
)

:: 5. Install dependencies
echo.
echo [5/8] Installing project dependencies...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] npm install encountered an error!
    pause
    exit /b 1
)
echo [OK] Dependencies installed successfully.

:: 6. Initialize database and seed initial data
echo.
echo [6/8] Initializing SQLite database and seeding default data...
node src/db/seed.js
if %errorlevel% neq 0 (
    echo [ERROR] Database initialization failed!
    pause
    exit /b 1
)
echo [OK] Database schema initialized and seeded.

:: 7. Run Verification Syntax Check
echo.
echo [7/8] Running self-verification syntax check...
node -c src/server.js
if %errorlevel% neq 0 (
    echo [ERROR] Syntax error detected in server entrypoint!
    pause
    exit /b 1
)
echo [OK] Code syntax verified.

:: 8. Start the application
echo.
echo [8/8] Starting QuizNest Server...
echo ========================================================
echo   QuizNest is now launching on http://localhost:3000
echo   Admin Login:   admin / Admin@QuizNest2026!
echo   Student Login: STU2026001 / Student@QuizNest2026!
echo ========================================================
echo.
echo Press Ctrl+C at any time to stop the server.
echo.

node src/server.js
