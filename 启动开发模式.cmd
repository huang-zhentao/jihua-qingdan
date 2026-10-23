@echo off
cd /d "%~dp0"
title Calendar dev

if not exist node_modules (
  echo [1/2] Installing dependencies, please wait...
  call npm install
  if errorlevel 1 (
    echo.
    echo Install failed. Try setting ELECTRON_MIRROR first.
    pause
    exit /b 1
  )
)

echo [2/2] Starting dev mode with --noSandbox ...
call npm run dev
echo.
echo Dev server stopped.
pause