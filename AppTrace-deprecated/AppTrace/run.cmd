@echo off
setlocal enabledelayedexpansion

::====================
set "socketport="
::====================

set "destPath=%USERPROFILE%\Desktop\AppTrace"
set "countFilePath=%destPath%\Count.txt"
set "messageFilePath=%destPath%\AppList.txt"
set "resultFilePath=%destPath%\result.txt"
set "scriptPath=%destPath%\run.cmd"
set "APPTracePath=%destPath%\AppTrace.exe"
set "runOnceKeyPath=HKCU\Software\Microsoft\Windows\CurrentVersion\RunOnce"

cd /d "%destPath%"



for %%p in (
    standby-timeout-ac
    standby-timeout-dc
    hibernate-timeout-ac
    hibernate-timeout-dc
    monitor-timeout-ac
    monitor-timeout-dc
) do (
    powercfg /change "%%p" 0
)

if not exist "%countFilePath%" (
    echo 0 > "%countFilePath%"
    reg add "%runOnceKeyPath%" /v AutoRestartScript /t REG_SZ /d "cmd.exe /c \"%scriptPath%\"" /f
    echo Ready for testing ! Please wait for reboot...
    timeout /t 5 /nobreak
    shutdown /r /f /t 0
    exit /b
)

set /p count=<"%countFilePath%"
set /a count+=1
echo !count!>"%countFilePath%"

for /f "tokens=1,* delims=:" %%a in ('findstr /n "^" "%messageFilePath%"') do (
    if "%%a"=="%count%" (
        set "message=%%b"
        echo The following APP's startup time will be tested.
        echo !message!
        timeout /t 20 /nobreak
        goto :continue
    )
)

:continue

if not defined message (
    echo Test finished, Existing...
    "\\VM-SERVER\lnvpe-share\TOOL\AutoCharge.exe" %socketport% 1
    timeout /t 5 /nobreak
    exit /b 1
)

"\\VM-SERVER\lnvpe-share\TOOL\AutoCharge.exe" %socketport% 0

timeout /t 10 /nobreak

for %%F in (!message!) do set "fileName=%%~nxF"

echo ================================================== >> "%resultFilePath%"
echo Executing: !message! >> "%resultFilePath%"
echo ================================================== >> "%resultFilePath%"

start /b "" cmd /c ""%APPTracePath%" !message! >> "%resultFilePath%" 2>>&1"
echo Wait for testing end...
timeout /t 100 /nobreak

taskkill /im "%fileName%" /im "EXCEL.EXE" /im "POWERPNT.EXE" /im "ML_Scenario.exe"

timeout /t 10 /nobreak

::============= DC Battery Check - Auto Charge =============
"\\VM-SERVER\lnvpe-share\TOOL\AutoCharge.exe" %socketport%
::==========================================================

reg add "%runOnceKeyPath%" /v AutoRestartScript /t REG_SZ /d "cmd.exe /c \"%scriptPath%\"" /f
echo PC is about to REBOOT...
shutdown /r /f /t 0