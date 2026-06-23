export type DurationMinutes = 5 | 15 | 30 | 60 | 120;
export type BroadcastTone =
  | 'late_night'
  | 'casual_chat'
  | 'educational'
  | 'documentary'
  | 'letter'
  | 'morning';

export interface PodcastRequest {
  topic: string;
  durationMin: DurationMinutes;
  voiceId: string;
  steps: number;
  speed: number;
  tone: BroadcastTone;
  directScript?: string;
}

export interface SSEProgressEvent {
  stage: 'script' | 'audio';
  message: string;
  chapter?: number;
  totalChapters?: number;
  chunk?: number;
  totalChunks?: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface SSETokensEvent {
  label: string;
  usage: TokenUsage;
  totalUsage: TokenUsage;
  estimatedCostUsd: number;
}

export interface SSEScriptEvent {
  text: string;
  wordCount: number;
  chapters: number;
}

export interface SSEAudioEvent {
  base64: string;
  mimeType: 'audio/wav';
  sizeBytes: number;
}

export interface SSEDoneEvent {
  success: boolean;
  durationMin: DurationMinutes;
  scriptWordCount: number;
  audioSkipped?: boolean;
  totalUsage: TokenUsage;
  totalCostUsd: number;
}

export interface SSEErrorEvent {
  message: string;
  code?: string;
}

export interface OutlineChapter {
  index: number;
  title: string;
  summary: string;
}

export interface DurationConfig {
  words: number;
  chapters: number;
  skipAudio: boolean;
  maxTokensPerChapter: number;
}

export interface GenerationResult {
  text: string;
  usage: TokenUsage;
  promptPreview: string;
}

export interface OutlineResult {
  chapters: OutlineChapter[];
  usage: TokenUsage;
  promptPreview: string;
}

export interface BroadcastToneConfig {
  key: BroadcastTone;
  emoji: string;
  label: string;
  desc: string;
  systemPrompt: string;
}
