@echo off
setlocal

:: ================= BASIC SETTINGS =================
:: Install target directory (C:\ops layout: tools+services live under C:\ops)
set "INSTALL_DIR=C:\ops\AutoSign"

:: Service EXE path after install
set "SERVICE_EXE=%INSTALL_DIR%\AutoSignService.exe"

:: Windows service name (must match ServiceName in C#)
set "SERVICE_NAME=AutoSignService"

:: Script directory (source dir where this script and EXEs live)
set "SCRIPT_DIR=%~dp0"

:: Non-interactive mode switches: install.cmd /install | /uninstall
:: (used by automation; assumes the shell is already elevated)
set "MODE=%~1"

:: ================= ELEVATE TO ADMIN IF NEEDED (interactive only) ==========
if /I "%MODE%"=="/install" goto :MODE_CHECK_DONE
if /I "%MODE%"=="/uninstall" goto :MODE_CHECK_DONE
net session >nul 2>&1
if %errorlevel%==0 goto :MODE_CHECK_DONE

echo.
echo [INFO] This script must be run as Administrator. Requesting UAC elevation...
powershell -Command "Start-Process '%~f0' -Verb RunAs"
goto :EOF

:: ================= RESOLVE MODE =================
:MODE_CHECK_DONE
if /I "%MODE%"=="/uninstall" goto UNINSTALL
if /I not "%MODE%"=="/install" goto INTERACTIVE
:: /install with an existing service = upgrade: refresh files only
sc query "%SERVICE_NAME%" >nul 2>&1
if errorlevel 1 goto INSTALL
goto REFRESH_FILES

:INTERACTIVE

echo.
echo ================================================
echo   AutoSign Install / Uninstall Script
echo   Source dir  : %SCRIPT_DIR%
echo   Target dir  : %INSTALL_DIR%
echo   Service name: %SERVICE_NAME%
echo   Service EXE : %SERVICE_EXE%
echo.
echo   Usage: install.cmd [/install ^| /uninstall]
echo          (no argument = interactive mode)
echo ================================================
echo.

:: ================= VERIFY SOURCE FILES =================
if not exist "%SCRIPT_DIR%AutoSignService.exe" (
    echo [ERROR] AutoSignService.exe not found in source directory:
    echo         %SCRIPT_DIR%AutoSignService.exe
    echo Please copy AutoSignService.exe into this folder and try again.
    goto END
)

if not exist "%SCRIPT_DIR%AutoSign.exe" (
    echo [WARNING] AutoSign.exe not found in source directory:
    echo          %SCRIPT_DIR%AutoSign.exe
    echo Make sure you copy the Agent EXE here as well if you need it.
    echo.
)

:: ================= CHECK IF SERVICE ALREADY EXISTS =================
sc query "%SERVICE_NAME%" >nul 2>&1
if %errorlevel%==0 (
    goto SERVICE_EXISTS
) else (
    goto SERVICE_NOT_EXISTS
)

:: ---------- Service already exists ----------
:SERVICE_EXISTS
echo [INFO] Service already exists: %SERVICE_NAME%
echo.
set "CHOICE="
set /p CHOICE=Do you want to UNINSTALL this service and delete %INSTALL_DIR% ? (Y/N):
if /I "%CHOICE%"=="Y" (
    goto UNINSTALL
) else (
    echo.
    echo [INFO] Operation cancelled.
    goto END
)

:: ---------- Service does NOT exist ----------
:SERVICE_NOT_EXISTS
echo [INFO] Service not found: %SERVICE_NAME%
echo.
set "CHOICE="
set /p CHOICE=Do you want to INSTALL this service and copy files to %INSTALL_DIR% ? (Y/N):
if /I "%CHOICE%"=="Y" (
    goto INSTALL
) else (
    echo.
    echo [INFO] Operation cancelled.
    goto END
)

:: ================= REFRESH (upgrade files in place) =================
:REFRESH_FILES
echo [INFO] Service already exists - refreshing files (service keeps running old EXE until restarted).
call :COPY_FILES || goto END
sc stop "%SERVICE_NAME%" >nul 2>&1
timeout /T 3 /NOBREAK >nul
sc start "%SERVICE_NAME%" >nul 2>&1
echo [INFO] Service restarted with refreshed files.
goto END

:: ================= INSTALL LOGIC =================
:INSTALL
echo.
echo ---------- Installing AutoSign ----------

if not exist "%INSTALL_DIR%" (
    echo [INFO] Creating directory %INSTALL_DIR% ...
    mkdir "%INSTALL_DIR%"
    if not %errorlevel%==0 (
        echo [ERROR] Failed to create directory %INSTALL_DIR%. Check permissions.
        goto END
    )
)

call :COPY_FILES || goto END

:: Create the Windows service
echo [INFO] Creating service %SERVICE_NAME% ...
sc create "%SERVICE_NAME%" binPath= "\"%SERVICE_EXE%\"" start= auto DisplayName= "AutoSign Service" >nul
if not %errorlevel%==0 (
    echo [ERROR] Failed to create service. Name may already be in use or you lack permissions.
    goto END
)

echo [INFO] Service created successfully.

if /I "%MODE%"=="/install" (
    echo [INFO] Starting service...
    sc start "%SERVICE_NAME%"
    goto END
)

echo.
set "CHOICE="
set /p CHOICE=Do you want to START the service now? (Y/N):
if /I "%CHOICE%"=="Y" (
    echo [INFO] Starting service...
    sc start "%SERVICE_NAME%"
    if %errorlevel%==0 (
        echo [INFO] Service started successfully.
    ) else (
        echo [WARNING] Service failed to start. Check Services.msc or Event Viewer for details.
    )
) else (
    echo [INFO] You can start the service later via Services.msc or "sc start %SERVICE_NAME%".
)

goto END

:: ================= UNINSTALL LOGIC =================
:UNINSTALL
echo.
echo ---------- Uninstalling AutoSign ----------

:: If service is running, stop it first
sc query "%SERVICE_NAME%" | find /I "RUNNING" >nul
if %errorlevel%==0 (
    echo [INFO] Service is running, attempting to stop...
    sc stop "%SERVICE_NAME%" >nul
    echo [INFO] Waiting for service to stop...
    timeout /T 5 /NOBREAK >nul
) else (
    echo [INFO] Service is not in RUNNING state.
)

:: Delete the service
echo [INFO] Deleting service %SERVICE_NAME% ...
sc delete "%SERVICE_NAME%" >nul
if not %errorlevel%==0 (
    echo [ERROR] Failed to delete service. Please check permissions.
    goto END
)

echo [INFO] Service deleted.

:: Delete install directory
if exist "%INSTALL_DIR%" (
    echo [INFO] Deleting directory %INSTALL_DIR% ...
    rmdir /S /Q "%INSTALL_DIR%"
    if not %errorlevel%==0 (
        echo [WARNING] Failed to delete directory. Please remove it manually if needed.
    ) else (
        echo [INFO] Directory deleted.
    )
) else (
    echo [INFO] Directory %INSTALL_DIR% does not exist. Nothing to delete.
)

goto END

:: ================= COPY FILES SUBROUTINE =================
:COPY_FILES
if /I "%SCRIPT_DIR%"=="%INSTALL_DIR%\" (
    echo [INFO] Source dir is the install dir itself - skipping copy.
    exit /b 0
)
echo [INFO] Copying all files from "%SCRIPT_DIR%" to "%INSTALL_DIR%" ...
xcopy "%SCRIPT_DIR%*.*" "%INSTALL_DIR%\" /E /I /Y >nul
if not %errorlevel%==0 (
    echo [ERROR] File copy failed. Please check source files and permissions.
    exit /b 1
)
if not exist "%SERVICE_EXE%" (
    echo [ERROR] Service EXE not found at:
    echo         %SERVICE_EXE%
    exit /b 1
)
exit /b 0

:: ================= END =================
:END
if /I "%MODE%"=="/install" goto END_SILENT
if /I "%MODE%"=="/uninstall" goto END_SILENT
echo.
echo ----------------------------------------
echo Operation finished. Press any key to exit...
echo ----------------------------------------
pause >nul

:END_SILENT
endlocal
exit /b
