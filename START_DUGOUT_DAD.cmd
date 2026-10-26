@echo off
title Dugout Dad
cd /d "%~dp0"
echo.
echo  Dugout Dad - starting the local app server...
echo  Leave this window open while you use the app. Close it to stop.
echo.
if not exist "dist\index.html" (
  echo  The built app folder "dist" is missing. Run "npm install" and "npm run build" first.
  pause
  exit /b 1
)
where node >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:4173
  node server.cjs
  goto :eof
)
where py >nul 2>nul
if %errorlevel%==0 (
  echo  Node.js not found, using Python instead.
  start "" http://localhost:4173
  cd dist
  py -m http.server 4173 --bind 127.0.0.1
  goto :eof
)
where python >nul 2>nul
if %errorlevel%==0 (
  echo  Node.js not found, using Python instead.
  start "" http://localhost:4173
  cd dist
  python -m http.server 4173 --bind 127.0.0.1
  goto :eof
)
echo  Neither Node.js nor Python was found.
echo  Install Node.js (LTS) from https://nodejs.org and run this file again.
pause
