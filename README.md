# AiCast

Claude AI로 한국어 라디오 DJ 스크립트를 생성하고, Supertonic-3으로 자연스러운 음성을 합성하는 웹 앱입니다.

## 기술 스택

| 역할 | 기술 |
|---|---|
| 프레임워크 | Next.js 16 (App Router) |
| 스크립트 생성 | Claude Sonnet 4.6 (Anthropic) |
| 음성 합성 | Supertonic-3 (Supertone Inc., 로컬 CPU) |
| 스타일 | Tailwind CSS v4 + CSS 변수 테마 |

## 주요 기능

- **AI 생성 모드** — 주제 + 방송 톤 + 방송 시간 설정 → Claude가 라디오 DJ 스크립트 작성 → 음성 합성
- **직접 입력 모드** — 스크립트를 붙여넣으면 Claude 없이 바로 음성 합성
- **10가지 보이스** — 여성 F1–F5, 남성 M1–M5
- **합성 품질 조절** — steps 4(빠름) / 8(보통) / 16(고품질)
- **재생 속도** — 느림(0.75x) / 기본(1.0x) / 빠름(1.5x)
- **6가지 방송 톤** — 지식 탐구, 다큐 나레이션, 친근한 수다, 심야 감성, 활기찬 아침, 감성 편지
- **라이트/다크 모드** — 시스템 설정 자동 감지, 우측 상단 수동 토글
- **접근 제어** — 비밀번호 로그인 + IP당 일일 생성 횟수 제한 (선택)

---

## 로컬 개발

### 1. Supertonic-3 설치

```powershell
pip install "supertonic[serve]"
```

### 2. 의존성 설치

```powershell
npm install
```

### 3. 환경변수 설정

```powershell
cp .env.local.example .env.local
```

`.env.local` 편집:

```env
ANTHROPIC_API_KEY=sk-ant-api03-실제키입력
SUPERTONIC_TTS_URL=http://localhost:7788
```

접근 제어는 로컬 개발 시 설정 불필요 (`ACCESS_PASSWORD` 미설정 → 인증 비활성화).

### 4. 실행

```powershell
# 터미널 1: TTS 서버
supertonic serve

# 터미널 2: Next.js 앱
npm run dev
```

앱: http://localhost:3000

### 5. 테스트

```powershell
npm test
```

---

## 프로젝트 구조

```
AiCast/
├── app/
│   ├── layout.tsx                  # 루트 레이아웃 + 테마 FOUC 방지
│   ├── page.tsx                    # 메인 UI
│   ├── globals.css                 # CSS 변수 테마 시스템
│   ├── login/page.tsx              # 로그인 페이지
│   └── api/
│       ├── podcast/route.ts        # SSE 스트리밍 + Rate limiting
│       └── auth/
│           ├── login/route.ts      # 비밀번호 검증 + 쿠키 발급
│           ├── logout/route.ts     # 쿠키 삭제
│           └── status/route.ts     # 인증 활성화 여부
├── components/
│   ├── AudioPlayer.tsx             # 커스텀 오디오 플레이어
│   ├── DurationSelector.tsx        # 방송 시간 선택
│   └── ProgressFeed.tsx            # 진행 상황 표시
├── lib/
│   ├── claude.ts                   # Claude 스크립트 생성
│   ├── supertonic-tts.ts           # Supertonic-3 TTS 클라이언트
│   └── constants.ts                # 설정 상수 (보이스, 톤, 시간 등)
├── middleware.ts                   # 인증 미들웨어
├── types/podcast.ts                # TypeScript 타입 정의
├── DEPLOY.md                       # 미니 PC 배포 가이드 (WSL2 + ngrok)
└── dev.bat                         # 원클릭 개발 실행 (Windows)
```

---

## 환경변수

| 변수 | 필수 | 설명 |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Anthropic API 키 |
| `SUPERTONIC_TTS_URL` | | Supertonic 서버 주소 (기본값: `http://localhost:7788`) |
| `ACCESS_PASSWORD` | | 공개 배포 시 접속 비밀번호. 미설정 시 인증 비활성화 |
| `ACCESS_TOKEN` | | 세션 쿠키 값 (랜덤 문자열). `ACCESS_PASSWORD`와 함께 설정 |
| `DAILY_GENERATION_LIMIT` | | IP당 하루 최대 생성 횟수. 미설정 시 무제한 |

---

## 방송 시간별 전략

| 시간 | 목표 단어 수 | 챕터 | 오디오 |
|---|---|---|---|
| 5분 | 800 | 1 | ✅ |
| 15분 | 2,200 | 1 | ✅ |
| 30분 | 4,500 | 3 | ✅ |
| 1시간 | 9,000 | 6 | ❌ 스크립트만 |
| 2시간 | 18,000 | 12 | ❌ 스크립트만 |

---

## 배포 (미니 PC + WSL2 + ngrok)

외부 공개 배포 절차는 [DEPLOY.md](DEPLOY.md)를 참조하세요.

**구성 요약:**
- Windows 미니 PC에 WSL2(Ubuntu) 설치
- Ubuntu 안에서 systemd 서비스로 Supertonic / AiCast / ngrok 상시 실행
- Task Scheduler + 자동 로그인으로 부팅 시 WSL 자동 시작
- SSH(포트 2222)로 원격 관리 — RDP 불필요
- 외부 접속: `https://your-name.ngrok-free.dev`
