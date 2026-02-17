@echo off
setlocal enabledelayedexpansion

:: ============================================================ 
:: SyllaBot Pro² - Installation Script
:: ============================================================ 
title SyllaBot Pro² - Installer

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
echo         SyllaBot Pro^2 - Installation Setup
echo ========================================================
echo.

:: Create log file
set LOG_FILE=install.log
echo [%date% %time%] Starting SyllaBot Pro2 Installation... > "%LOG_FILE%"

:: ============================================================ 
:: STEP 1: Verify Working Directory
:: ============================================================ 
echo %BLUE%[1/5] Checking working directory...%RESET%
if not exist "package.json" goto :WrongDir
echo %GREEN%[OK] Working directory confirmed%RESET%
echo.

:: ============================================================ 
:: STEP 2: Check Node.js Installation
:: ============================================================ 
echo %BLUE%[2/5] Checking Node.js installation...%RESET%
where node >nul 2>&1
if errorlevel 1 goto :NodeMissing

where npm >nul 2>&1
if errorlevel 1 goto :NpmMissing

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo %GREEN%[OK] Node.js %NODE_VERSION% found%RESET%
echo [%date% %time%] Node.js %NODE_VERSION% detected >> "%LOG_FILE%"
echo.

:: ============================================================ 
:: STEP 3: Check Pandoc Installation
:: ============================================================ 
echo %BLUE%[3/5] Checking Pandoc installation...%RESET%
where pandoc >nul 2>&1
if errorlevel 1 goto :PandocMissing

echo %GREEN%[OK] Pandoc is installed%RESET%
echo [%date% %time%] Pandoc detected >> "%LOG_FILE%"
goto :Step4

:PandocMissing
echo %YELLOW%WARNING: Pandoc is not installed!%RESET%
echo Pandoc is required for exporting courses to DOCX format.
echo.

:: Check if Chocolatey is available
where choco >nul 2>&1
if errorlevel 1 goto :ManualPandoc

echo Found Chocolatey package manager.
set /p INSTALL_PANDOC="Install Pandoc automatically using Chocolatey? [Y/N]: "
if /I "!INSTALL_PANDOC!" EQU "Y" (
    echo Installing Pandoc...
    choco install pandoc -y
    if errorlevel 1 (
        echo %RED%Failed to install Pandoc%RESET%
        echo [%date% %time%] Pandoc installation failed >> "%LOG_FILE%"
    ) else (
        echo %GREEN%[OK] Pandoc installed successfully%RESET%
        echo [%date% %time%] Pandoc installed via Chocolatey >> "%LOG_FILE%"
    )
)
goto :Step4

:ManualPandoc
echo Chocolatey package manager not found.
echo.

echo %YELLOW%To install Pandoc manually:%RESET%
echo 1. Visit: https://pandoc.org/installing.html
echo 2. Download and install Pandoc for Windows
echo 3. Restart this script
echo.
set /p CONTINUE="Continue without Pandoc? (DOCX export will not work) [Y/N]: "
if /I "!CONTINUE!" NEQ "Y" (
    echo [%date% %time%] User chose not to continue without Pandoc >> "%LOG_FILE%"
    exit /b 0
)

:: ============================================================ 
:: STEP 4: Check Environment File
:: ============================================================ 
:Step4
echo.
echo %BLUE%[4/5] Checking environment configuration...%RESET%
if exist ".env" goto :EnvExists

echo %YELLOW%WARNING: .env file not found!%RESET%
if exist ".env.example" goto :CreateEnv

echo %RED%ERROR: Neither .env nor .env.example found!%RESET%
echo [%date% %time%] ERROR: No env files found >> "%LOG_FILE%"
pause
exit /b 1

:CreateEnv
echo Found .env.example file.
set "CREATE_ENV=Y"
set /p CREATE_ENV="Create .env file from .env.example? [Y/n]: "
if /I "!CREATE_ENV!" NEQ "Y" goto :EnvDeclined

copy ".env.example" ".env" >nul
echo %GREEN%[OK] Created .env file%RESET%
echo.
echo ========================================================
echo %YELLOW%IMPORTANT: You need to add your API keys to .env%RESET%
echo ========================================================
echo.

echo %YELLOW%REQUIRED API Key^:%RESET%
echo   GEMINI_API_KEY
echo   Get it from^: https^://aistudio.google.com/apikey
echo.

echo %YELLOW%OPTIONAL API Keys (for additional models/features)^:%RESET%
echo   OPENROUTER_API_KEY - https^://openrouter.ai/keys
echo   GROQ_API_KEY       - https^://console.groq.com/keys
echo   CEREBRAS_API_KEY   - https^://cloud.cerebras.ai/
echo   TAVILY_API_KEY     - https^://tavily.com/
echo.

echo The .env file will now open in Notepad.
echo Replace the placeholder values with your actual API keys.
echo.
echo After you have saved and closed Notepad,
pause
notepad ".env"
echo [%date% %time%] Created .env from example >> "%LOG_FILE%"
goto :EnvExists

:EnvDeclined
echo %RED%Cannot continue without .env file!%RESET%
echo [%date% %time%] User declined .env creation >> "%LOG_FILE%"
pause
exit /b 1

:EnvExists
echo %GREEN%[OK] Environment file found%RESET%
echo [%date% %time%] Environment file exists >> "%LOG_FILE%"
echo.

:: ============================================================ 
:: STEP 5: Check and Install/Update Dependencies
:: ============================================================ 
echo %BLUE%[5/5] Checking dependencies...%RESET%
echo This may take a few minutes on first run...
echo.

:: Root dependencies
if exist "node_modules" goto :CheckRootUpdate
echo %YELLOW%Installing root dependencies...%RESET%
call npm install
if errorlevel 1 goto :InstallFail
echo %GREEN%[OK] Root dependencies installed%RESET%
echo [%date% %time%] Root dependencies installed >> "%LOG_FILE%"
goto :ServerDeps

:CheckRootUpdate
echo %GREEN%[OK] Root dependencies found%RESET%
:: Check if package.json is newer than node_modules
for %%i in (package.json) do set PKG_DATE=%%~ti
for %%i in (node_modules) do set NM_DATE=%%~ti
if "!PKG_DATE!" GTR "!NM_DATE!" (
    echo %YELLOW%package.json is newer than node_modules%RESET%
    set /p UPDATE_ROOT="Update root dependencies? [Y/N]: "
    if /I "!UPDATE_ROOT!" EQU "Y" (
        echo Updating root dependencies...
        call npm install
        echo [%date% %time%] Root dependencies updated >> "%LOG_FILE%"
    )
)

:ServerDeps
echo.
:: Server dependencies
if exist "server\node_modules" goto :CheckServerUpdate
echo %YELLOW%Installing server dependencies...%RESET%
cd server
call npm install
if errorlevel 1 (
    cd ..
    goto :InstallFail
)
cd ..
echo %GREEN%[OK] Server dependencies installed%RESET%
echo [%date% %time%] Server dependencies installed >> "%LOG_FILE%"
goto :ClientDeps

:CheckServerUpdate
echo %GREEN%[OK] Server dependencies found%RESET%
:: Check if package.json is newer
for %%i in (server\package.json) do set SPKG_DATE=%%~ti
for %%i in (server\node_modules) do set SNM_DATE=%%~ti
if "!SPKG_DATE!" GTR "!SNM_DATE!" (
    echo %YELLOW%server/package.json is newer than node_modules%RESET%
    set /p UPDATE_SERVER="Update server dependencies? [Y/N]: "
    if /I "!UPDATE_SERVER!" EQU "Y" (
        echo Updating server dependencies...
        cd server
        call npm install
        cd ..
        echo [%date% %time%] Server dependencies updated >> "%LOG_FILE%"
    )
)

:ClientDeps
echo.
:: Client dependencies
if exist "client\node_modules" goto :CheckClientUpdate
echo %YELLOW%Installing client dependencies...%RESET%
cd client
call npm install
if errorlevel 1 (
    cd ..
    goto :InstallFail
)
cd ..
echo %GREEN%[OK] Client dependencies installed%RESET%
echo [%date% %time%] Client dependencies installed >> "%LOG_FILE%"
goto :Finish

:CheckClientUpdate
echo %GREEN%[OK] Client dependencies found%RESET%
:: Check if package.json is newer
for %%i in (client\package.json) do set CPKG_DATE=%%~ti
for %%i in (client\node_modules) do set CNM_DATE=%%~ti
if "!CPKG_DATE!" GTR "!CNM_DATE!" (
    echo %YELLOW%client/package.json is newer than node_modules%RESET%
    set /p UPDATE_CLIENT="Update client dependencies? [Y/N]: "
    if /I "!UPDATE_CLIENT!" EQU "Y" (
        echo Updating client dependencies...
        cd client
        call npm install
        cd ..
        echo [%date% %time%] Client dependencies updated >> "%LOG_FILE%"
    )
)

:Finish
echo.

echo %GREEN%========================================================%RESET%
echo %GREEN%       Installation / Update Complete!                  %RESET%
echo %GREEN%========================================================%RESET%
echo.

echo You can now run the application using 'run.bat'.
echo.

echo [%date% %time%] Installation completed >> "%LOG_FILE%"
pause
exit /b 0

:WrongDir
echo %RED%ERROR: package.json not found!%RESET%
echo Please run this script from the SyllaBot_pro_js directory.
echo Current directory: %CD%

echo [%date% %time%] ERROR: Wrong directory >> "%LOG_FILE%"
pause
exit /b 1

:NodeMissing
echo %RED%ERROR: Node.js is not installed!%RESET%
echo.

echo Please install Node.js from: https://nodejs.org/
echo After installation, restart this script.

echo [%date% %time%] ERROR: Node.js not found >> "%LOG_FILE%"
pause
exit /b 1

:NpmMissing
echo %RED%ERROR: npm is not installed!%RESET%

echo [%date% %time%] ERROR: npm not found >> "%LOG_FILE%"
pause
exit /b 1

:InstallFail
echo %RED%Failed to install dependencies%RESET%

echo [%date% %time%] ERROR: npm install failed >> "%LOG_FILE%"
pause
exit /b 1
