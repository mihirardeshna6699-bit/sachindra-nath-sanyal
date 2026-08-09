@echo off
REM Serves this folder over HTTP so the browser will load ES modules.
REM Nothing is installed and nothing in the project is modified.
cd /d "%~dp0"

echo.
echo   Sachindra Nath Sanyal - The Time Tunnel
echo   =======================================
echo.

where python >nul 2>nul
if %errorlevel%==0 (
  echo   Serving on http://localhost:8000/
  echo   Press Ctrl+C to stop.
  echo.
  start "" "http://localhost:8000/"
  python -m http.server 8000
  goto :eof
)

where node >nul 2>nul
if %errorlevel%==0 (
  echo   Python not found - using Node instead.
  echo   Serving on http://localhost:8000/
  echo   Press Ctrl+C to stop.
  echo.
  start "" "http://localhost:8000/"
  node serve.js 8000
  goto :eof
)

echo   Neither Python nor Node was found on this computer.
echo.
echo   Install either one, or serve this folder with any static web server
echo   and open the address it prints.
echo.
pause
