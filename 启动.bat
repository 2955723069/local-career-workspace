@echo off
REM Job-search workspace - Windows one-click launcher.
REM Content is intentionally ASCII-only: cmd.exe mangles non-ASCII text
REM under most code pages. All Chinese output lives in the PowerShell script.
setlocal
cd /d "%~dp0"

where powershell >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Windows PowerShell not found.
  echo Please open a terminal in this folder and run: npm install ^&^& npm run dev
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-windows.ps1"
set EXITCODE=%ERRORLEVEL%

if not "%EXITCODE%"=="0" (
  echo.
  echo [ERROR] Launcher exited with code %EXITCODE%.
  pause
)

endlocal & exit /b %EXITCODE%
