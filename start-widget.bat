@echo off
setlocal
cd /d "%~dp0"
set "ELECTRON_RUN_AS_NODE="
set "APP_DIR=%CD%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%APP_DIR%\node_modules\electron\dist\electron.exe' -ArgumentList '%APP_DIR%' -WorkingDirectory '%APP_DIR%'"
exit /b
