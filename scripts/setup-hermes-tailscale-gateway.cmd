@echo off
setlocal EnableExtensions

rem One-click launcher for the portable PowerShell host installer.
rem The PowerShell script safely requests UAC elevation for Install/Uninstall
rem and returns the elevated installer's real exit code.
rem For advanced options, invoke install-hermes-mobile-gateway.ps1 directly.

set "SCRIPT=%~dp0install-hermes-mobile-gateway.ps1"
if not exist "%SCRIPT%" (
  echo ERROR: install-hermes-mobile-gateway.ps1 was not found beside this launcher.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
set "EXITCODE=%ERRORLEVEL%"
if not "%EXITCODE%"=="0" (
  echo.
  echo Hermes Mobile host setup did not complete. Review the PowerShell window above.
  pause
)
exit /b %EXITCODE%
