@echo off
setlocal
set "APP_NAME=BroadcastOverlayWidget"
set "APP_DIR=%~dp0"
set "RUNNER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\%APP_NAME%.vbs"

(
  echo Set shell = CreateObject^("WScript.Shell"^)
  echo shell.Run chr^(34^) ^& "%APP_DIR%start-widget.bat" ^& chr^(34^), 0, False
) > "%RUNNER%"

echo Installed startup launcher:
echo %RUNNER%
pause
