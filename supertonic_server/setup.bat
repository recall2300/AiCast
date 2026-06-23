@echo off
cd /d "%~dp0"

echo [1/2] Creating Python venv...
python -m venv .venv
if errorlevel 1 (echo Python not found. Install Python 3.9+ first. & pause & exit /b 1)

echo [2/2] Installing supertonic...
.venv\Scripts\pip install --upgrade pip -q
.venv\Scripts\pip install "supertonic[serve]"
if errorlevel 1 (echo Install failed. & pause & exit /b 1)

echo.
echo Setup complete! Model (~400MB) will download on first server start.
pause
