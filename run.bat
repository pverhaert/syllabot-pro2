@echo off
setlocal enabledelayedexpansion

:: ============================================================
:: SyllaBot Pro² - Launcher
:: ============================================================
title SyllaBot Pro² - Run

:: Color codes for better UX (requires ANSI support - Windows 10+)
for /F %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"
set "GREEN=%ESC%[32m"
set "YELLOW=%ESC%[33m"
set "RED=%ESC%[31m"
set "BLUE=%ESC%[36m"
set "RESET=%ESC%[0m"

cls
echo.
echo ========================================================
echo         SyllaBot Pro^2 - AI Course Generator
echo ========================================================
echo.

:: Create log file
set LOG_FILE=runtime.log
echo [%date% %time%] Starting SyllaBot Pro2... > "%LOG_FILE%"

:: ============================================================
:: STEP 1: Verify Working Directory
:: ============================================================
echo %BLUE%[1/4] Checking working directory...%RESET%
if not exist "package.json" goto :WrongDir
echo %GREEN%[OK] Working directory confirmed%RESET%
echo.

:: ============================================================
:: STEP 2: Quick Environment Check
:: ============================================================
echo %BLUE%[2/4] Checking environment...%RESET%

:: Check Node
where node >nul 2>&1
if errorlevel 1 (
    echo %RED%ERROR: Node.js is not installed!%RESET%
    echo Please run 'install.bat' first.
    pause
    exit /b 1
)

:: Check .env
if not exist ".env" (
    echo %RED%ERROR: .env file missing!%RESET%
    echo Please run 'install.bat' to set up your environment.
    pause
    exit /b 1
)

:: Check node_modules
if not exist "node_modules" (
    echo %YELLOW%WARNING: node_modules missing!%RESET%
    echo It looks like dependencies are not installed.
    echo Please run 'install.bat' first.
    set /p RUN_INSTALL="Run install.bat now? [Y/N]: "
    if /I "!RUN_INSTALL!" EQU "Y" (
        call install.bat
    ) else (
        exit /b 1
    )
)

echo %GREEN%[OK] Environment looks good%RESET%
echo.

:: ============================================================
:: STEP 3: Check Port Availability
:: ============================================================
echo %BLUE%[3/4] Checking port availability...%RESET%

:: Read ports from .env if they exist
set SERVER_PORT=3210
set CLIENT_PORT=8448

for /f "tokens=1,2 delims==" %%a in ('type .env ^| findstr /B "SERVER_PORT"') do set SERVER_PORT=%%b
for /f "tokens=1,2 delims==" %%a in ('type .env ^| findstr /B "CLIENT_PORT"') do set CLIENT_PORT=%%b

:: Basic port check using netstat
echo Checking port %SERVER_PORT%...
netstat -ano | findstr ":%SERVER_PORT% " >nul 2>&1
if not errorlevel 1 (
    echo %YELLOW%Port %SERVER_PORT% is in use. Killing process...%RESET%
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%SERVER_PORT% "') do (
        if "%%a" NEQ "0" (
            taskkill /F /PID %%a >nul 2>&1
            echo %GREEN%Process %%a killed.%RESET%
            echo [%date% %time%] Killed process %%a on port %SERVER_PORT% >> "%LOG_FILE%"
        )
    )
)

echo Checking port %CLIENT_PORT%...
netstat -ano | findstr ":%CLIENT_PORT% " >nul 2>&1
if not errorlevel 1 (
    echo %YELLOW%Port %CLIENT_PORT% is in use. Killing process...%RESET%
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%CLIENT_PORT% "') do (
        if "%%a" NEQ "0" (
            taskkill /F /PID %%a >nul 2>&1
            echo %GREEN%Process %%a killed.%RESET%
            echo [%date% %time%] Killed process %%a on port %CLIENT_PORT% >> "%LOG_FILE%"
        )
    )
)

echo %GREEN%[OK] Port check complete%RESET%
echo [%date% %time%] Port check completed >> "%LOG_FILE%"
echo.

:: ============================================================
:: STEP 4: Start Application
:: ============================================================
echo %BLUE%[4/4] Starting SyllaBot Pro^2...%RESET%
echo.
echo ========================================================
echo   Application will be available at:
echo   %GREEN%Frontend: http://localhost:%CLIENT_PORT%%RESET%
echo   %GREEN%Backend:  http://localhost:%SERVER_PORT%%RESET%
echo ========================================================
echo.
echo [%date% %time%] Starting application >> "%LOG_FILE%"

:: Start the background browser opener (waits for servers to be fully ready)
echo %BLUE%Waiting for servers to be ready...%RESET%
start /min "" powershell -WindowStyle Hidden -Command "$sPort = %SERVER_PORT%; $cPort = %CLIENT_PORT%; for ($i=0; $i -lt 60; $i++) { $clientReady = netstat -ano | findstr LISTENING | findstr \":$cPort\"; $serverReady = $false; try { $resp = Invoke-WebRequest -Uri \"http://localhost:$sPort/api/config\" -UseBasicParsing -TimeoutSec 2; if ($resp.StatusCode -eq 200) { $serverReady = $true } } catch { $serverReady = $false }; if ($clientReady -and $serverReady) { Start-Sleep -s 3; Start-Process \"http://localhost:$cPort\"; break }; Start-Sleep -s 1 }"

echo.
echo %YELLOW%Press Ctrl+C to stop the application%RESET%
echo.

:: Start the application
call npm run dev

:: If we get here, the app has stopped
echo.
echo [%date% %time%] Application stopped >> "%LOG_FILE%"
echo %YELLOW%SyllaBot Pro^2 has stopped.%RESET%
exit /b 0

:WrongDir
echo %RED%ERROR: package.json not found!%RESET%
echo Please run this script from the SyllaBot_pro_js directory.
echo Current directory: %CD%
echo [%date% %time%] ERROR: Wrong directory >> "%LOG_FILE%"
pause
exit /b 1
