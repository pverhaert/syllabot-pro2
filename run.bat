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
:: STEP 1: Check for Updates
:: ============================================================
echo %BLUE%[1/5] Checking for updates...%RESET%

:: Verify git is available
where git >nul 2>&1
if errorlevel 1 (
    echo %YELLOW%WARNING: Git is not installed. Skipping update check.%RESET%
    echo [%date% %time%] Git not found, skipping update check >> "%LOG_FILE%"
    goto :SkipUpdate
)

:: Verify this is a git repository
git rev-parse --git-dir >nul 2>&1
if errorlevel 1 (
    echo %YELLOW%WARNING: Not a git repository. Skipping update check.%RESET%
    echo [%date% %time%] Not a git repo, skipping update check >> "%LOG_FILE%"
    goto :SkipUpdate
)

:: Fetch latest from remote
echo Fetching latest changes from GitHub...
git fetch origin >nul 2>&1
if errorlevel 1 (
    echo %YELLOW%WARNING: Could not reach GitHub. Continuing with local version.%RESET%
    echo [%date% %time%] Git fetch failed, continuing offline >> "%LOG_FILE%"
    goto :SkipUpdate
)

:: Get the current branch name
for /f "tokens=*" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "CURRENT_BRANCH=%%b"

:: Compare local and remote
for /f "tokens=*" %%a in ('git rev-parse HEAD 2^>nul') do set "LOCAL_HASH=%%a"
for /f "tokens=*" %%a in ('git rev-parse "origin/%CURRENT_BRANCH%" 2^>nul') do set "REMOTE_HASH=%%a"

if "%LOCAL_HASH%"=="%REMOTE_HASH%" (
    echo %GREEN%[OK] Already up-to-date%RESET%
    echo [%date% %time%] Repository is up-to-date >> "%LOG_FILE%"
    goto :SkipUpdate
)

:: Determine relationship using merge-base
for /f "tokens=*" %%a in ('git merge-base HEAD "origin/%CURRENT_BRANCH%" 2^>nul') do set "MERGE_BASE=%%a"

if "%MERGE_BASE%"=="%REMOTE_HASH%" (
    :: merge-base equals remote => local is ahead of remote
    echo %GREEN%[OK] Local repo is ahead of remote. No pull needed.%RESET%
    echo [%date% %time%] Local is ahead of remote, skipping pull >> "%LOG_FILE%"
    goto :SkipUpdate
)

if not "%MERGE_BASE%"=="%LOCAL_HASH%" (
    :: merge-base equals neither => branches have diverged
    echo %YELLOW%WARNING: Local and remote have diverged. Skipping auto-update.%RESET%
    echo %YELLOW%         Run 'git pull' manually to resolve.%RESET%
    echo [%date% %time%] Branches diverged, skipping auto-update >> "%LOG_FILE%"
    goto :SkipUpdate
)

:: merge-base equals local => local is behind remote => pull

echo %YELLOW%Updates available! Pulling latest version...%RESET%

:: Save hash of package.json files before pull to detect dependency changes
set "PKG_CHANGED=0"
for /f "tokens=*" %%a in ('git rev-parse HEAD:package.json 2^>nul') do set "OLD_ROOT_PKG=%%a"
for /f "tokens=*" %%a in ('git rev-parse HEAD:server/package.json 2^>nul') do set "OLD_SERVER_PKG=%%a"
for /f "tokens=*" %%a in ('git rev-parse HEAD:client/package.json 2^>nul') do set "OLD_CLIENT_PKG=%%a"

:: Try to pull (will fail gracefully if there are local changes)
git pull origin "%CURRENT_BRANCH%" 2>&1 | findstr /I "error CONFLICT" >nul 2>&1
if not errorlevel 1 (
    echo %YELLOW%WARNING: Could not pull automatically ^(you may have local changes^).%RESET%
    echo %YELLOW%         Continuing with your current local version.%RESET%
    echo [%date% %time%] Git pull failed due to local changes >> "%LOG_FILE%"
    git merge --abort >nul 2>&1
    goto :SkipUpdate
)

echo %GREEN%[OK] Updated to latest version%RESET%
echo [%date% %time%] Pulled latest version from GitHub >> "%LOG_FILE%"

:: Check if package.json files changed
for /f "tokens=*" %%a in ('git rev-parse HEAD:package.json 2^>nul') do set "NEW_ROOT_PKG=%%a"
for /f "tokens=*" %%a in ('git rev-parse HEAD:server/package.json 2^>nul') do set "NEW_SERVER_PKG=%%a"
for /f "tokens=*" %%a in ('git rev-parse HEAD:client/package.json 2^>nul') do set "NEW_CLIENT_PKG=%%a"

if not "%OLD_ROOT_PKG%"=="%NEW_ROOT_PKG%" set "PKG_CHANGED=1"
if not "%OLD_SERVER_PKG%"=="%NEW_SERVER_PKG%" set "PKG_CHANGED=1"
if not "%OLD_CLIENT_PKG%"=="%NEW_CLIENT_PKG%" set "PKG_CHANGED=1"

if "%PKG_CHANGED%"=="1" (
    echo %YELLOW%Dependencies changed. Installing updates...%RESET%
    echo [%date% %time%] Dependencies changed, running npm install:all >> "%LOG_FILE%"
    call npm run install:all
    echo %GREEN%[OK] Dependencies updated%RESET%
)

:SkipUpdate
echo.

:: ============================================================
:: STEP 2: Verify Working Directory
:: ============================================================
echo %BLUE%[2/5] Checking working directory...%RESET%
if not exist "package.json" goto :WrongDir
echo %GREEN%[OK] Working directory confirmed%RESET%
echo.

:: ============================================================
:: STEP 3: Quick Environment Check
:: ============================================================
echo %BLUE%[3/5] Checking environment...%RESET%

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
:: STEP 4: Check Port Availability
:: ============================================================
echo %BLUE%[4/5] Checking port availability...%RESET%

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
:: STEP 5: Start Application
:: ============================================================
echo %BLUE%[5/5] Starting SyllaBot Pro^2...%RESET%
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
