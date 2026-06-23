# AiCast

Claude AI로 한국어 라디오 DJ 스크립트를 생성하고, Supertonic-3으로 자연스러운 음성을 합성하는 웹 앱입니다.

## 기술 스택

| 역할 | 기술 |
|------|------|
| 프레임워크 | Next.js 16 (App Router) |
| 스크립트 생성 | Claude Sonnet 4.6 (Anthropic) |
| 음성 합성 | Supertonic-3 (Supertone Inc., 로컬 CPU) |
| 스타일 | Tailwind CSS |

## 기능

- **AI 생성 모드**: 주제 + 방송 톤 + 방송 시간 설정 → Claude가 라디오 DJ 스크립트 작성 → 음성 합성
- **직접 입력 모드**: 스크립트를 붙여넣으면 Claude 없이 바로 음성 합성
- **10가지 보이스**: 여성 F1–F5, 남성 M1–M5
- **품질 조절**: steps(4/8/16) 및 속도(0.5–2.0x) 설정
- **6가지 방송 톤**: 심야 감성, 친근한 수다, 지식 탐구, 다큐 나레이션, 감성 편지, 활기찬 아침

## 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경변수 설정

```bash
cp .env.local.example .env.local
```

`.env.local`에 Anthropic API 키를 입력합니다:

```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

### 3. 실행 (원클릭)

```bat
dev.bat
```

- Supertonic-3 TTS 서버가 새 창에서 자동 시작됩니다 (port 7799)
- 최초 실행 시 모델 ~400MB 자동 다운로드
- Next.js 앱은 http://localhost:3000 에서 실행됩니다

### 수동 실행

```bat
# 터미널 1: TTS 서버
supertonic_server\start.bat

# 터미널 2: Next.js 앱
npm run dev
```

### Supertonic 최초 설치

```bat
supertonic_server\setup.bat
```

## 프로젝트 구조

```
AiCast/
├── app/
│   ├── layout.tsx
│   ├── page.tsx              # 메인 UI
│   └── api/podcast/route.ts  # SSE 스트리밍 API
├── lib/
│   ├── claude.ts             # Claude 스크립트 생성
│   ├── supertonic-tts.ts     # Supertonic-3 TTS 클라이언트
│   └── constants.ts          # 설정 상수
├── components/
│   ├── AudioPlayer.tsx
│   ├── DurationSelector.tsx
│   └── ProgressFeed.tsx
├── types/podcast.ts
├── supertonic_server/
│   ├── setup.bat             # 최초 설치
│   └── start.bat             # 서버 시작
└── dev.bat                   # 원클릭 실행
```

## 테스트

```bash
npm test
```

단위 테스트: `lib/supertonic-tts.ts`의 `chunkText`, `cleanText` 함수 및 WAV 병합 로직을 검증합니다.
