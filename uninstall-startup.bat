@echo off
setlocal
set "APP_NAME=BroadcastOverlayWidget"
set "RUNNER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\%APP_NAME%.vbs"

if exist "%RUNNER%" del "%RUNNER%"

echo Removed startup launcher:
echo %RUNNER%
pause
