@echo off
chcp 65001 >nul
echo ========================================
echo   AiCast 서버 시작
echo ========================================

:: 기존 프로세스 정리
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM ngrok.exe /T >nul 2>&1
:: supertonic은 Python 프로세스로 실행됨
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":7799"') do taskkill /F /PID %%a >nul 2>&1

echo.
echo [1/3] Supertonic TTS 서버 시작 중...
start "Supertonic TTS" cmd /k "supertonic serve"
timeout /t 10 /nobreak >nul

echo [2/3] AiCast (Next.js) 시작 중...
start "AiCast" cmd /k "cd /d C:\AiCast && npm start"
timeout /t 5 /nobreak >nul

echo [3/3] ngrok 터널 시작 중...
start "ngrok" ngrok http --domain=handcart-nectar-reemerge.ngrok-free.dev 3000

echo.
echo ========================================
echo   완료! 브라우저에서 접속:
echo   https://handcart-nectar-reemerge.ngrok-free.dev
echo ========================================
