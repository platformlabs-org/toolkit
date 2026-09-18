@echo off
setlocal

:: ============ Basic settings ============
set "SERVICE_NAME=AutoSignService"
set "AGENT_EXE=AutoSign.exe"

:: ============ Admin check & UAC auto-elevation ============
net session >nul 2>&1
if %errorlevel%==0 goto :ADMIN_OK

echo.
echo [INFO] This script requires Administrator privileges.
echo       Requesting elevation...
powershell -Command "Start-Process '%~f0' -Verb RunAs"
goto :EOF

:ADMIN_OK
cls
echo ===========================================
echo         AutoSign Smart Control Script
echo ===========================================
echo.

:: ============ Query service state ============
set "STATE_CODE="
for /f "tokens=3 delims= " %%i in ('sc query "%SERVICE_NAME%" ^| find "STATE"') do set STATE_CODE=%%i

if "%STATE_CODE%"=="" (
    echo [ERROR] Service "%SERVICE_NAME%" not found.
    echo Please run install.cmd first.
    goto END
)

:: Map numeric state code to a readable name
:: Common values: 1 = STOPPED, 4 = RUNNING
set "STATE_NAME=UNKNOWN"
if "%STATE_CODE%"=="1" set "STATE_NAME=STOPPED"
if "%STATE_CODE%"=="4" set "STATE_NAME=RUNNING"

echo [INFO] Current service state: %STATE_CODE% (%STATE_NAME%)
echo.

:: =====================================================================
:: If RUNNING → assume user wants to PAUSE (stop service + kill agent)
:: =====================================================================
if /I "%STATE_NAME%"=="RUNNING" (
    echo [ACTION] Service is RUNNING.
    echo          Expected user action: PAUSE TASK.
    echo.
    goto DO_PAUSE
)

:: =====================================================================
:: If STOPPED → assume user wants to RESUME (start service)
:: =====================================================================
if /I "%STATE_NAME%"=="STOPPED" (
    echo [ACTION] Service is STOPPED.
    echo          Expected user action: RESUME TASK.
    echo.
    goto DO_RESUME
)

:: Other / transitional states (START_PENDING, STOP_PENDING, etc.)
echo [WARN] Service is in transitional or unknown state: %STATE_CODE% (%STATE_NAME%)
echo Please wait a moment and try again.
goto END


:: ====================== PAUSE LOGIC ======================
:DO_PAUSE
echo [INFO] Stopping service "%SERVICE_NAME%" ...
sc stop "%SERVICE_NAME%" >nul 2>&1

echo [INFO] Killing Agent process "%AGENT_EXE%" ...
taskkill /F /IM "%AGENT_EXE%" >nul 2>&1

echo.
echo [RESULT] AutoSign has been PAUSED.
goto END


:: ====================== RESUME LOGIC ======================
:DO_RESUME
echo [INFO] Starting service "%SERVICE_NAME%" ...
sc start "%SERVICE_NAME%" >nul 2>&1

if %errorlevel%==0 (
    echo.
    echo [RESULT] AutoSign is now RUNNING.
) else (
    echo.
    echo [ERROR] Failed to start service.
    echo        Please ensure AutoSign is properly installed and not in transition.
)

goto END


:END
echo.
echo Press any key to exit...
pause >nul

endlocal
exit /b
