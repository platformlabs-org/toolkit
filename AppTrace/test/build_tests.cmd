@echo off
for %%Y in (Community Professional Enterprise BuildTools) do (
  for %%Z in (2022 2019) do (
    if exist "C:\Program Files\Microsoft Visual Studio\%%Z\%%Y\VC\Auxiliary\Build\vcvars64.bat" (
      call "C:\Program Files\Microsoft Visual Studio\%%Z\%%Y\VC\Auxiliary\Build\vcvars64.bat" >nul 2>&1
      goto :build
    )
    if exist "C:\Program Files (x86)\Microsoft Visual Studio\%%Z\%%Y\VC\Auxiliary\Build\vcvars64.bat" (
      call "C:\Program Files (x86)\Microsoft Visual Studio\%%Z\%%Y\VC\Auxiliary\Build\vcvars64.bat" >nul 2>&1
      goto :build
    )
  )
)
:build
cd /d "%~dp0.."
cl /O2 /std:c++17 /EHsc /MT /nologo /W3 /D_CRT_SECURE_NO_WARNINGS /DNOMINMAX /DWIN32_LEAN_AND_MEAN /DUNICODE /D_UNICODE ^
   test\test_core.cpp /Fe:test\test_core.exe /link /SUBSYSTEM:CONSOLE user32.lib
