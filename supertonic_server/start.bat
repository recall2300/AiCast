@echo off
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8

if not exist ".venv\Scripts\supertonic.exe" (
    echo Supertonic not installed. Run setup.bat first.
    pause
    exit /b 1
)

echo Supertonic-3 TTS server starting on port 7799...
echo Press Ctrl+C to stop.
echo.
.venv\Scripts\supertonic.exe serve --host 127.0.0.1 --port 7799
