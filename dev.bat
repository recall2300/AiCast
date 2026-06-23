@echo off
cd /d "%~dp0"

if not exist "supertonic_server\.venv\Scripts\supertonic.exe" (
    echo [Setup] Installing Supertonic...
    call supertonic_server\setup.bat
)

echo [Start] Stopping any existing Supertonic process...
taskkill /F /IM supertonic.exe /T >nul 2>&1

echo [Start] Supertonic TTS server ^(port 7799^)...
start "Supertonic TTS" supertonic_server\start.bat

echo [Start] AiCast dev server ^(http://localhost:3000^)...
npm run dev
