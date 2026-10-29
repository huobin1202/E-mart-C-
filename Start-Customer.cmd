@echo off
setlocal
cd /d "%~dp0Staff-E-commerce-main\customer-app"
if errorlevel 1 goto failed
where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo Node.js is required. Install Node.js and try again.
  goto failed
)
if not exist "node_modules\expo\package.json" (
  call npm.cmd ci
  if errorlevel 1 goto failed
)
call npm.cmd run start:tunnel
if errorlevel 1 goto failed
exit /b 0
:failed
echo Failed to start the customer app. See the error above.
pause
exit /b 1
