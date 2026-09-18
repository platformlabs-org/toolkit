@echo off
REM Build script for AppTrace. Tries MSVC (cl), then clang-cl, then clang.
REM Output: build\AppTrace.exe (statically linked CRT for easy distribution).

setlocal enabledelayedexpansion
set "SRCDIR=%~dp0src"
set "OUTDIR=%~dp0build"
if not exist "%OUTDIR%" mkdir "%OUTDIR%"
set "OUT=%OUTDIR%\AppTrace.exe"

set "SRC=%SRCDIR%\main.cpp"
set "CXXFLAGS=/O2 /std:c++17 /EHsc /MT /nologo /W3 /D_CRT_SECURE_NO_WARNINGS /DNOMINMAX /DWIN32_LEAN_AND_MEAN /DUNICODE /D_UNICODE"
set "LDFLAGS=/link /SUBSYSTEM:CONSOLE advapi32.lib user32.lib shell32.lib ole32.lib runtimeobject.lib shlwapi.lib"

REM --- 0. If cl isn't on PATH, try to locate and source vcvars64.bat ---
where cl >nul 2>nul
if not errorlevel 1 goto :have_compiler
for %%Y in (Community Professional Enterprise BuildTools) do (
  for %%Z in (2022 2019) do (
    if exist "C:\Program Files\Microsoft Visual Studio\%%Z\%%Y\VC\Auxiliary\Build\vcvars64.bat" (
      call "C:\Program Files\Microsoft Visual Studio\%%Z\%%Y\VC\Auxiliary\Build\vcvars64.bat" >nul 2>&1
      goto :have_compiler
    )
    if exist "C:\Program Files (x86)\Microsoft Visual Studio\%%Z\%%Y\VC\Auxiliary\Build\vcvars64.bat" (
      call "C:\Program Files (x86)\Microsoft Visual Studio\%%Z\%%Y\VC\Auxiliary\Build\vcvars64.bat" >nul 2>&1
      goto :have_compiler
    )
  )
)
:have_compiler

REM --- 0.5 Version resource (Explorer Properties -> Details) ---------------
REM Compiled with rc.exe (Windows SDK) or windres (MinGW); skipped with a
REM note when neither exists - version info is cosmetic, never break a build.
set "RESRC=%SRCDIR%\AppTrace.rc"
set "RES="
where rc >nul 2>nul
if not errorlevel 1 (
    rc /nologo /fo "%OUTDIR%\AppTrace.res" "%RESRC%" >nul 2>&1
    if not errorlevel 1 set "RES=%OUTDIR%\AppTrace.res"
)
if not defined RES (
    where windres >nul 2>nul
    if not errorlevel 1 (
        windres "%RESRC%" -O coff -o "%OUTDIR%\AppTrace.res" >nul 2>&1
        if not errorlevel 1 set "RES=%OUTDIR%\AppTrace.res"
    )
)
if not defined RES echo [build] note: rc/windres not found - version info skipped

REM --- 1. Try MSVC cl.exe ---
where cl >nul 2>nul
if %errorlevel%==0 (
    echo [build] using MSVC cl
    cl %CXXFLAGS% "%SRC%" %RES% /Fe:"%OUT%" %LDFLAGS%
    if not errorlevel 1 goto :ok
    goto :fail
)

REM --- 2. Try clang-cl ---
where clang-cl >nul 2>nul
if %errorlevel%==0 (
    echo [build] using clang-cl
    clang-cl %CXXFLAGS% "%SRC%" %RES% /Fe:"%OUT%" %LDFLAGS%
    if not errorlevel 1 goto :ok
    goto :fail
)

REM --- 3. Try clang ---
where clang >nul 2>nul
if %errorlevel%==0 (
    echo [build] using clang
    clang -O2 -std=c++17 -DNOMINMAX -DWIN32_LEAN_AND_MEAN -DUNICODE -D_UNICODE -D_CRT_SECURE_NO_WARNINGS ^
        "%SRC%" %RES% -o "%OUT%" -ladvapi32 -luser32 -lshell32 -lole32 -lruntimeobject -static -static-libgcc -static-libstdc++
    if not errorlevel 1 goto :ok
    goto :fail
)

REM --- 4. Try clang++ (MinGW-flavored) ---
where clang++ >nul 2>nul
if %errorlevel%==0 (
    echo [build] using clang++
    clang++ -O2 -std=c++17 -DNOMINMAX -DWIN32_LEAN_AND_MEAN -DUNICODE -D_UNICODE -D_CRT_SECURE_NO_WARNINGS ^
        "%SRC%" %RES% -o "%OUT%" -ladvapi32 -luser32 -lshell32 -lole32 -lruntimeobject -static -static-libgcc -static-libstdc++
    if not errorlevel 1 goto :ok
    goto :fail
)

REM --- 5. Try g++ (MinGW) ---
where g++ >nul 2>nul
if %errorlevel%==0 (
    echo [build] using g++
    g++ -O2 -std=c++17 -DNOMINMAX -DWIN32_LEAN_AND_MEAN -DUNICODE -D_UNICODE -D_CRT_SECURE_NO_WARNINGS ^
        "%SRC%" %RES% -o "%OUT%" -ladvapi32 -luser32 -lshell32 -lole32 -lruntimeobject -static -static-libgcc -static-libstdc++
    if not errorlevel 1 goto :ok
    goto :fail
)

echo [error] no C++ compiler found. Install one of:
echo   - Visual Studio Build Tools ^(cl.exe^)
echo   - LLVM ^(clang.exe or clang-cl.exe^)
echo   - MinGW-w64 ^(g++.exe^)
exit /b 1

:ok
echo [build] OK -^> %OUT%
exit /b 0

:fail
echo [build] FAILED
exit /b 1
