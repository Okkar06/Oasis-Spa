@echo off
REM ============================================
REM Oasis Spa Application Launcher (Windows)
REM ============================================

echo ====================================
echo Oasis Spa Application Launcher
echo ====================================
echo.

REM Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js from: https://nodejs.org/
    pause
    exit /b 1
)
echo [OK] Node.js found:
call node -v

REM Check npm
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm is not installed!
    pause
    exit /b 1
)
echo [OK] npm found:
call npm -v
echo.

REM Check .env file
if not exist "server\.env" (
    echo [WARNING] Server .env file not found!
    echo Please create server\.env with your database configuration.
    echo See README.md for details.
    echo.
    echo Press any key to continue anyway or Ctrl+C to exit...
    pause >nul
)

REM Install server dependencies
echo.
echo ====================================
echo Installing Server Dependencies
echo ====================================
if not exist "server\node_modules" (
    echo Installing server dependencies...
    cd server
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to change to server directory
        pause
        exit /b 1
    )
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to install server dependencies
        cd ..
        pause
        exit /b 1
    )
    cd ..
    echo [OK] Server dependencies installed
) else (
    echo [OK] Server dependencies already installed
)
echo.

REM Install client dependencies
echo ====================================
echo Installing Client Dependencies
echo ====================================
if not exist "client\node_modules" (
    echo Installing client dependencies...
    cd client
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to change to client directory
        pause
        exit /b 1
    )
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to install client dependencies
        cd ..
        pause
        exit /b 1
    )
    cd ..
    echo [OK] Client dependencies installed
) else (
    echo [OK] Client dependencies already installed
)
echo.

REM Start the application
echo ====================================
echo Starting Application
echo ====================================
echo.
echo Starting backend server...
start "Oasis Spa Backend" cmd /k "cd /d %~dp0server && npm run dev"

echo Waiting for backend to initialize...
timeout /t 3 /nobreak >nul

echo Starting frontend application...
start "Oasis Spa Frontend" cmd /k "cd /d %~dp0client && npm run dev"

echo.
echo ====================================
echo Application Started!
echo ====================================
echo.
echo Backend Server:  http://localhost:5000
echo Frontend App:    http://localhost:5173
echo.
echo Open your browser and go to: http://localhost:5173
echo.
echo Two terminal windows have been opened:
echo   1. Backend Server (server)
echo   2. Frontend Application (client)
echo.
echo Close those windows to stop the application.
echo.
pause
