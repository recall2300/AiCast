# AiCast 배포 가이드 (미니 PC + ngrok)

> 미니 PC(Windows)를 서버로 사용해 인터넷에 공개하는 전체 절차입니다.

---

## 전체 흐름

```
개발 PC  →  GitHub  →  미니 PC (서버)  →  ngrok  →  인터넷
```

---

## Part A — 개발 PC에서 GitHub에 올리기

### 1. GitHub 레포 생성
[github.com](https://github.com) → New repository → Private 권장 → Create

### 2. 푸시
```powershell
cd C:\Code\AiCast

git remote add origin https://github.com/본인계정/AiCast.git
git push -u origin main
```

> `.env.local`은 `.gitignore`에 포함되어 있어 자동으로 제외됩니다.  
> API 키가 GitHub에 올라가지 않습니다.

---

## Part B — 미니 PC 초기 설정 (최초 1회)

### 1. 필수 프로그램 설치
```powershell
# Git
winget install Git.Git

# Node.js LTS
winget install OpenJS.NodeJS.LTS

# Python 3.11
winget install Python.Python.3.11

# ngrok
winget install --id Ngrok.Ngrok
```

설치 후 **PowerShell 재시작**.

### 2. 레포 클론
```powershell
cd C:\
git clone https://github.com/본인계정/AiCast.git AiCast
cd AiCast
```

### 3. Node.js 의존성 설치
```powershell
npm install
```

### 4. Supertonic 설치
```powershell
pip install "supertonic[serve]"
```

> `supertonic serve` 실행 시 모델 파일이 자동으로 다운로드됩니다 (최초 1회, 수분 소요).

### 5. `.env.local` 생성
```powershell
notepad .env.local
```

아래 내용 입력 후 저장:
```
ANTHROPIC_API_KEY=sk-ant-api03-실제키입력
SUPERTONIC_TTS_URL=http://localhost:7799
ACCESS_PASSWORD=원하는비밀번호
ACCESS_TOKEN=랜덤문자열여기입력
DAILY_GENERATION_LIMIT=10
```

**ACCESS_TOKEN 랜덤 값 생성:**
```powershell
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 40 | % {[char]$_})
```
출력된 값을 복사해서 ACCESS_TOKEN에 붙여넣기.

### 6. 프로덕션 빌드
```powershell
npm run build
```

---

## Part C — ngrok 설정 (최초 1회)

### 1. ngrok 계정 생성
[ngrok.com](https://ngrok.com) → Sign up (무료)

### 2. Authtoken 등록
ngrok 대시보드 → 왼쪽 메뉴 **"Your Authtoken"** → 복사 후:
```powershell
ngrok config add-authtoken 복사한토큰
```

### 3. 무료 고정 도메인 발급
ngrok 대시보드 → 왼쪽 메뉴 **"Domains"** → **"New Domain"**  
예: `your-name.ngrok-free.dev`

---

## Part D — 앱 실행

터미널 3개를 열어 각각 실행합니다.

**터미널 1 — Supertonic TTS 서버:**
```powershell
supertonic serve
```

**터미널 2 — Next.js 앱:**
```powershell
cd C:\AiCast
npm start
```

**터미널 3 — ngrok 터널:**
```powershell
ngrok http --domain=your-name.ngrok-free.dev 3000
```

아래처럼 나오면 정상:
```
Forwarding  https://your-name.ngrok-free.dev -> http://localhost:3000
```

브라우저에서 `https://your-name.ngrok-free.dev` 접속 → 비밀번호 입력 → 사용

---

## Part E — PC 부팅 시 자동 시작 설정

### 1. `start-prod.bat` 파일 생성
`C:\AiCast\start-prod.bat`:
```batch
@echo off
taskkill /F /IM supertonic.exe /T >nul 2>&1
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM ngrok.exe /T >nul 2>&1

start "Supertonic" supertonic serve
timeout /t 8 /nobreak >nul

start "AiCast" cmd /k "cd /d C:\AiCast && npm start"
timeout /t 5 /nobreak >nul

start "ngrok" ngrok http --domain=your-name.ngrok-free.dev 3000

echo.
echo AiCast 실행 중
echo https://your-name.ngrok-free.dev
```

### 2. `autostart.vbs` 파일 생성 (백그라운드 실행용)
`C:\AiCast\autostart.vbs`:
```vbs
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run chr(34) & "C:\AiCast\start-prod.bat" & chr(34), 0
Set WshShell = Nothing
```

### 3. 시작 프로그램에 등록
1. `Win + R` → `shell:startup` 입력 → 폴더 열림
2. `autostart.vbs`의 **바로가기**를 그 폴더에 복사

---

## Part F — 코드 업데이트 루틴

**개발 PC에서:**
```powershell
git add .
git commit -m "변경 내용"
git push
```

**미니 PC에서:**
```powershell
cd C:\AiCast
git pull
npm install       # package.json이 바뀐 경우만
npm run build
# start-prod.bat 재실행
```

---

## 접근 제어 설정 요약

| 환경변수 | 설명 | 예시 |
|---|---|---|
| `ACCESS_PASSWORD` | 사용자 입력 비밀번호 | `mypassword123` |
| `ACCESS_TOKEN` | 세션 쿠키 값 (랜덤 생성) | `k7Qm2nXpR9vL...` |
| `DAILY_GENERATION_LIMIT` | IP당 하루 생성 횟수 제한 | `10` |

> 세 값 모두 `.env.local`에만 존재하며 GitHub에 올라가지 않습니다.  
> `ACCESS_PASSWORD` 미설정 시 인증이 비활성화됩니다 (로컬 개발용).
