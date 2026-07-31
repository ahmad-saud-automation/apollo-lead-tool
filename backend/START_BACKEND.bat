@echo off
REM Developer launcher: same app, but reloads when a file changes.
REM To just USE the app, double-click start-app.bat in the folder ABOVE this one.
REM That one opens the browser for you.
setlocal
cd /d "%~dp0"

set "PY=C:\ClaudeDeps\docpipeline-venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"

echo Dev mode, auto-reload, on http://127.0.0.1:8000
"%PY%" -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
pause
endlocal
