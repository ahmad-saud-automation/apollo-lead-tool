@echo off
REM Starts the Apollo Lead Tool backend on http://127.0.0.1:8000
REM (docs/UI for testing the API at http://127.0.0.1:8000/docs)
cd /d "%~dp0"
python -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
pause
