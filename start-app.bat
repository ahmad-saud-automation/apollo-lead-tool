@echo off
setlocal
cd /d "%~dp0backend"

rem prefer the shared ClaudeDeps venv, else whatever python is on PATH
set "PY=C:\ClaudeDeps\docpipeline-venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"

rem make sure the web deps are there (quiet, only installs if missing)
"%PY%" -c "import fastapi, uvicorn" 2>nul || "%PY%" -m pip install fastapi uvicorn
"%PY%" -c "import requests" 2>nul || "%PY%" -m pip install requests

echo.
echo   Apollo Enricher
echo   opening http://127.0.0.1:8000
echo   (close this window to stop the app)
echo.

start "" http://127.0.0.1:8000
"%PY%" -m uvicorn app:app --host 127.0.0.1 --port 8000

endlocal
