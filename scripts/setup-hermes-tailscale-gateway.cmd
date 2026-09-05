@echo off
setlocal EnableExtensions

title Hermes Mobile - Secure Tailscale Gateway Setup
set "HERMES_HOME=C:\Users\PC\AppData\Local\hermes\profiles\hermes-mobile-app"
set "HERMES_EXE=C:\Users\PC\AppData\Local\hermes\hermes-agent\venv\Scripts\hermes.exe"

if not exist "%HERMES_EXE%" (
  echo ERROR: Hermes executable was not found:
  echo %HERMES_EXE%
  pause
  exit /b 1
)

net session >nul 2>&1
if not "%errorlevel%"=="0" (
  echo.
  echo This setup needs an Administrator Command Prompt to add a firewall rule
  echo restricted to your private Tailscale network.
  echo.
  echo Right-click this file and choose "Run as administrator", then try again.
  pause
  exit /b 1
)

echo.
echo =============================================================
echo  Hermes Mobile: trusted-Tailscale gateway setup
echo =============================================================
echo.
echo This only allows TCP 9119 from Tailscale's private 100.64.0.0/10 range.
echo It does NOT expose Hermes to the public internet.
echo.

netsh advfirewall firewall delete rule name="Hermes Mobile Tailscale Gateway" >nul 2>&1
netsh advfirewall firewall add rule name="Hermes Mobile Tailscale Gateway" dir=in action=allow protocol=TCP localport=9119 remoteip=100.64.0.0/10 profile=any >nul
if errorlevel 1 (
  echo ERROR: Could not add the Tailscale-scoped Windows Firewall rule.
  pause
  exit /b 1
)

echo Firewall rule added: TCP 9119, Tailscale addresses only.
echo.
echo Hermes will now ask you to choose authentication:
echo   1. Press Enter to select Username ^& password.
echo   2. Choose a username ^(Enter accepts admin^).
echo   3. Type and confirm a strong password. It is hidden and never printed.
echo.
echo Hermes Desktop will briefly reconnect while its loopback-only server is replaced.
echo Keep this window open after setup; it is the Hermes server process.
echo.
pause

"%HERMES_EXE%" serve --stop
timeout /t 2 /nobreak >nul
"%HERMES_EXE%" serve --host 0.0.0.0 --port 9119 --no-open

echo.
echo Hermes stopped unexpectedly. Review the error above.
pause
