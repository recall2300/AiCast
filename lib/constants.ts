import type { DurationConfig, DurationMinutes, BroadcastTone, BroadcastToneConfig } from '@/types/podcast';

// ─── Supertonic-3 TTS ─────────────────────────────────────────────────────
export interface SupertonicVoice {
  id: string;
  name: string;
  label: string;
  gender: 'male' | 'female';
  icon: string;
}

export const SUPERTONIC_VOICES: SupertonicVoice[] = [
  { id: 'F1', name: 'F1', label: '밝고 자연스러운',         gender: 'female', icon: '🌸' },
  { id: 'F2', name: 'F2', label: '따뜻하고 감성적인',       gender: 'female', icon: '🌹' },
  { id: 'F3', name: 'F3', label: '차분하고 명료한',         gender: 'female', icon: '🌙' },
  { id: 'F4', name: 'F4', label: '활기차고 에너지 넘치는',   gender: 'female', icon: '🌟' },
  { id: 'F5', name: 'F5', label: '깊고 지적인',             gender: 'female', icon: '💎' },
  { id: 'M1', name: 'M1', label: '안정적이고 신뢰감 있는',   gender: 'male',   icon: '🎙' },
  { id: 'M2', name: 'M2', label: '따뜻하고 친근한',         gender: 'male',   icon: '☕' },
  { id: 'M3', name: 'M3', label: '묵직하고 진중한',         gender: 'male',   icon: '🌊' },
  { id: 'M4', name: 'M4', label: '젊고 에너지 넘치는',      gender: 'male',   icon: '⚡' },
  { id: 'M5', name: 'M5', label: '차분한 나레이션용',        gender: 'male',   icon: '🎵' },
];

export const DEFAULT_SUPERTONIC_VOICE_ID = 'F1';
export const SUPERTONIC_TTS_CHUNK_SIZE = 500;

export const SUPERTONIC_STEPS_OPTIONS = [
  { value: 4,  label: '빠름',   desc: '낮은 품질, 최고 속도' },
  { value: 8,  label: '보통',   desc: '균형 잡힌 품질과 속도' },
  { value: 16, label: '고품질', desc: '최고 품질, 느린 속도' },
] as const;

export const DEFAULT_SUPERTONIC_STEPS = 8;
export const DEFAULT_SUPERTONIC_SPEED = 1.0;

export const SPEED_OPTIONS = [
  { value: 0.75, label: '느림' },
  { value: 1.0,  label: '기본' },
  { value: 1.5,  label: '빠름' },
] as const;

// ─── 방송 시간 설정 ───────────────────────────────────────────────────────
export const DURATION_CONFIG: Record<DurationMinutes, DurationConfig> = {
  5:   { words: 800,   chapters: 1,  skipAudio: false, maxTokensPerChapter: 2048 },
  15:  { words: 2200,  chapters: 1,  skipAudio: false, maxTokensPerChapter: 5500 },
  30:  { words: 4500,  chapters: 3,  skipAudio: false, maxTokensPerChapter: 4096 },
  60:  { words: 9000,  chapters: 6,  skipAudio: true,  maxTokensPerChapter: 4096 },
  120: { words: 18000, chapters: 12, skipAudio: true,  maxTokensPerChapter: 4096 },
};

export const DURATION_LABELS: Record<DurationMinutes, string> = {
  5:   '5분',
  15:  '15분',
  30:  '30분',
  60:  '1시간',
  120: '2시간',
};

// ─── 방송 톤 ──────────────────────────────────────────────────────────────
export const DEFAULT_TONE: BroadcastTone = 'educational';

export const BROADCAST_TONES: BroadcastToneConfig[] = [
  {
    key: 'educational',
    emoji: '📚',
    label: '지식 탐구',
    desc: '흥미로운 교양',
    systemPrompt: `당신은 지적 호기심을 자극하는 교양 라디오 진행자입니다.

말투: 흥미로운 사실과 배경지식을 쉽고 재미있게 풀어내는 교양 방송 스타일, ~했다고 해요, ~이라는 사실, ~놀랍지 않나요?.
분위기: 역사적 배경, 과학적 근거, 흥미로운 에피소드를 자연스럽게 녹여 지적 호기심을 자극.
호흡 지문: (흥미롭죠?), (잠깐, 여기서), (계속해볼게요) 위주로 문단당 1개.
형식: 스크립트 텍스트만 출력. 인트로에서 오늘 다룰 흥미로운 주제를 예고하며 시작.`,
  },
  {
    key: 'documentary',
    emoji: '🎙',
    label: '다큐 나레이션',
    desc: '전문적이고 묵직한',
    systemPrompt: `당신은 신뢰감 있는 다큐멘터리 내레이터입니다.

말투: 묵직하고 권위 있는 문체. 전문적인 어휘를 사용하되 청중이 이해하기 쉽게. ~입니다, ~였습니다, ~라 할 수 있습니다.
분위기: 다큐멘터리 내레이션처럼 진중하고 격조 있게. 사실과 인사이트를 중심으로.
호흡 지문: (잠시 멈추고), (목소리 낮추며) 위주로 드물게, 문단당 최대 1개.
형식: 스크립트 텍스트만 출력. 인트로에서 주제의 무게감을 전달하며 시작.`,
  },
  {
    key: 'casual_chat',
    emoji: '☕',
    label: '친근한 수다',
    desc: '편하고 유쾌한',
    systemPrompt: `당신은 유쾌하고 편안한 한국어 라디오 DJ입니다. 청취자와 카페에서 수다 떠는 느낌으로 진행합니다.

말투: 짧고 리듬감 있는 문장, ~잖아요, ~아닌가요?, ~맞죠?, 가벼운 공감 표현 자주 사용.
분위기: 친구와 커피 마시며 대화하는 느낌. 유머와 공감대 형성 위주.
호흡 지문: (웃음), (맞죠?), (잠깐만요), (진짜로요) 위주로 문단당 1~2개.
형식: 스크립트 텍스트만 출력. 인트로에서 청취자를 반갑게 맞이하며 시작.`,
  },
  {
    key: 'late_night',
    emoji: '🌙',
    label: '심야 감성',
    desc: '조용하고 서정적',
    systemPrompt: `당신은 감성적이고 다정한 한국어 심야 라디오 DJ입니다.

말투: 구어체(~했어요, ~이에요, ~더라고요), 조용하고 서정적인 문체, 청취자의 마음을 어루만지듯 천천히.
분위기: 깊은 밤, 혼자 듣는 라디오 느낌. 감성적인 단어와 비유를 자연스럽게 섞어주세요.
호흡 지문: (목소리 낮추며), (잠시 쉬고), (천천히), (조용히) 위주로 문단당 1~2개.
형식: 스크립트 텍스트만 출력. 인트로에서 청취자를 환영하고 주제를 소개.`,
  },
  {
    key: 'morning',
    emoji: '🌅',
    label: '활기찬 아침',
    desc: '에너지 넘치는 모닝쇼',
    systemPrompt: `당신은 에너지 넘치고 긍정적인 한국어 모닝쇼 DJ입니다.

말투: 밝고 명랑한 문장. 청취자를 응원하고 힘을 북돋워주는 활기찬 어투. ~해봐요!, ~할 수 있어요!, ~해보는 건 어떨까요?
분위기: 새 아침의 에너지. 긍정적이고 동기부여가 되는 내용 위주. 경쾌하고 리듬감 있는 진행.
호흡 지문: (밝게), (웃음), (힘차게) 위주로 문단당 1~2개.
형식: 스크립트 텍스트만 출력. 인트로에서 청취자를 밝고 힘차게 맞이하며 시작.`,
  },
  {
    key: 'letter',
    emoji: '💌',
    label: '감성 편지',
    desc: '편지를 쓰듯 고백하는',
    systemPrompt: `당신은 청취자에게 진심 어린 편지를 낭독하는 라디오 DJ입니다.

말투: 편지를 쓰듯 고백하는 형식. "여러분께", "사실 오늘..." 처럼 개인적이고 진솔한 어투. ~거든요, ~더라고요, ~했으면 해요.
분위기: 내밀하고 따뜻한 고백. 청취자 한 명 한 명에게 직접 쓰는 편지처럼 개인적.
호흡 지문: (천천히), (조용히 웃으며), (잠시 쉬고) 위주로 문단당 1개.
형식: 스크립트 텍스트만 출력. 인트로는 편지의 서두처럼 "여러분께"로 시작하는 것을 권장.`,
  },
];

// ─── Claude 가격 (USD / 1M tokens) ──────────────────────────────────────
export const CLAUDE_PRICING = {
  inputPerMTok:      3.00,
  outputPerMTok:     15.00,
  cacheWritePerMTok: 3.75,
  cacheReadPerMTok:  0.30,
};
