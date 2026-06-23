import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import {
  DURATION_CONFIG,
  SUPERTONIC_TTS_CHUNK_SIZE,
  DEFAULT_SUPERTONIC_VOICE_ID,
  DEFAULT_SUPERTONIC_STEPS,
  DEFAULT_SUPERTONIC_SPEED,
  CLAUDE_PRICING,
  DEFAULT_TONE,
  SUPERTONIC_VOICES,
  SUPERTONIC_STEPS_OPTIONS,
  SPEED_OPTIONS,
  BROADCAST_TONES,
} from '@/lib/constants';
import { generateSingleScript, generateOutline, generateChapter, addUsage, zeroUsage } from '@/lib/claude';
import { chunkText, synthesizeChunksSupertonic } from '@/lib/supertonic-tts';
import type { PodcastRequest, TokenUsage } from '@/types/podcast';

export const runtime = 'nodejs';
export const maxDuration = 300;

// ─── 입력값 검증 ──────────────────────────────────────────────────────────────
const VALID_STEPS = new Set<number>(SUPERTONIC_STEPS_OPTIONS.map((o) => o.value));
const VALID_SPEEDS = new Set<number>(SPEED_OPTIONS.map((o) => o.value));
const VALID_TONES = new Set<string>(BROADCAST_TONES.map((o) => o.key));
const VALID_VOICE_IDS = new Set<string>(SUPERTONIC_VOICES.map((v) => v.id));

function validateRequest(body: PodcastRequest): string | null {
  const { topic, directScript, steps, speed, tone, voiceId } = body;
  if (!directScript && !topic?.trim()) return '주제를 입력해주세요.';
  if (topic && topic.length > 2000) return '주제는 2000자 이하여야 합니다.';
  if (directScript && directScript.length > 50000) return '스크립트는 50,000자 이하여야 합니다.';
  if (steps !== undefined && !VALID_STEPS.has(steps)) return '유효하지 않은 steps 값입니다.';
  if (speed !== undefined && !VALID_SPEEDS.has(speed)) return '유효하지 않은 speed 값입니다.';
  if (tone && !VALID_TONES.has(tone)) return '유효하지 않은 방송 톤입니다.';
  if (voiceId && !VALID_VOICE_IDS.has(voiceId)) return '유효하지 않은 보이스 ID입니다.';
  return null;
}

// ─── 에러 메시지 정제 (API 키·경로 등 민감 정보 제거) ────────────────────────
function sanitizeError(message: string): string {
  return message
    .replace(/sk-ant-[A-Za-z0-9\-]+/g, '[REDACTED]')      // Anthropic API key
    .replace(/(?:\/home|\/root|\/var|\/etc|C:\\)[^\s,'"]+/gi, '[PATH]') // 파일 경로
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]')       // IP 주소
    .replace(/\bat\s+\S+:\d+:\d+/g, '')                    // 스택 트레이스 프레임
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 300);
}

// ─── 인증 확인 (Node.js crypto — timing-safe) ─────────────────────────────────
function tokenEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

// ─── Rate limiting (IP당 일일 생성 횟수) ─────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; date: string }>();

const RATE_LIMIT_MAP_MAX = 5000;

// 매 시간 이전 날짜 항목 정리 (메모리 누수 방지)
setInterval(() => {
  const today = new Date().toISOString().slice(0, 10);
  for (const [key, entry] of rateLimitMap.entries()) {
    if (entry.date !== today) rateLimitMap.delete(key);
  }
  if (rateLimitMap.size > RATE_LIMIT_MAP_MAX) {
    console.warn(`[AiCast] Rate limit map 크기 이상: ${rateLimitMap.size} — DDoS 가능성`);
    rateLimitMap.clear();
  }
}, 60 * 60 * 1000).unref();

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const limit = parseInt(process.env.DAILY_GENERATION_LIMIT ?? '0');
  if (limit <= 0) return { allowed: true, remaining: Infinity }; // 미설정 시 무제한

  const today = new Date().toISOString().slice(0, 10);
  const entry = rateLimitMap.get(ip);

  if (!entry || entry.date !== today) {
    if (rateLimitMap.size >= RATE_LIMIT_MAP_MAX) rateLimitMap.clear();
    rateLimitMap.set(ip, { count: 1, date: today });
    return { allowed: true, remaining: limit - 1 };
  }
  if (entry.count >= limit) return { allowed: false, remaining: 0 };
  entry.count++;
  return { allowed: true, remaining: limit - entry.count };
}

function calcCost(usage: TokenUsage): number {
  const { inputPerMTok, outputPerMTok, cacheWritePerMTok, cacheReadPerMTok } = CLAUDE_PRICING;
  return (
    (usage.inputTokens * inputPerMTok +
      usage.outputTokens * outputPerMTok +
      usage.cacheCreationTokens * cacheWritePerMTok +
      usage.cacheReadTokens * cacheReadPerMTok) /
    1_000_000
  );
}

function fmtTokenLog(label: string, usage: TokenUsage, total: TokenUsage): string {
  const parts: string[] = [];
  parts.push(`입력 ${usage.inputTokens.toLocaleString()}`);
  parts.push(`출력 ${usage.outputTokens.toLocaleString()}`);
  if (usage.cacheReadTokens > 0) parts.push(`캐시절감 ${usage.cacheReadTokens.toLocaleString()}`);
  const cost = calcCost(usage);
  const totalCost = calcCost(total);
  return `[${label}] ${parts.join(' / ')} — $${cost.toFixed(4)} (누적 $${totalCost.toFixed(4)})`;
}

export async function POST(req: NextRequest): Promise<Response> {
  // CSRF: Origin 헤더가 있는 경우 Host와 일치 여부 확인
  const origin = req.headers.get('origin');
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      const host = req.headers.get('host') ?? '';
      if (originHost !== host) {
        return new Response(JSON.stringify({ error: '잘못된 요청 출처입니다.' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch {
      return new Response(JSON.stringify({ error: '잘못된 Origin 헤더입니다.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // 인증 이중 확인 (미들웨어 외 route 레벨 방어)
  if (process.env.ACCESS_PASSWORD) {
    const token = req.cookies.get('aicast-auth')?.value ?? '';
    const expected = process.env.ACCESS_TOKEN ?? '';
    if (!tokenEqual(token, expected)) {
      return new Response(JSON.stringify({ error: '인증이 필요합니다.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // Rate limit 체크
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown';
  const { allowed, remaining } = checkRateLimit(ip);
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: `일일 생성 한도에 도달했습니다. 내일 다시 시도해주세요.` }),
      { status: 429, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const body = (await req.json()) as PodcastRequest;
  const {
    topic = '',
    durationMin,
    voiceId,
    steps = DEFAULT_SUPERTONIC_STEPS,
    speed = DEFAULT_SUPERTONIC_SPEED,
    tone = DEFAULT_TONE,
    directScript,
  } = body;

  const validationError = validateRequest(body);
  if (validationError) {
    return new Response(JSON.stringify({ error: validationError }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const config = DURATION_CONFIG[durationMin];
  if (!config) {
    return new Response(JSON.stringify({ error: '유효하지 않은 방송 시간입니다.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  const { signal } = req;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: object) => {
        if (signal.aborted) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      let totalUsage: TokenUsage = zeroUsage();

      const sendTokens = (label: string, usage: TokenUsage, promptPreview?: string) => {
        totalUsage = addUsage(totalUsage, usage);
        send('tokens', {
          label,
          usage,
          totalUsage,
          logLine: fmtTokenLog(label, usage, totalUsage),
          promptPreview: promptPreview ?? '',
          estimatedCostUsd: calcCost(usage),
          totalCostUsd: calcCost(totalUsage),
        });
      };

      try {
        // ─── 스크립트 생성 ───────────────────────────────────────────────
        let fullScript = '';

        if (directScript) {
          fullScript = directScript;
          send('progress', { stage: 'script', message: '📝 직접 입력한 스크립트를 사용합니다.', chapter: 1, totalChapters: 1 });
        } else if (config.chapters === 1) {
          send('progress', { stage: 'script', message: '✍️ 라디오 DJ 스크립트를 작성하고 있어요...', chapter: 1, totalChapters: 1 });
          const result = await generateSingleScript(topic, config.words, tone, { signal });
          fullScript = result.text;
          sendTokens('스크립트', result.usage, result.promptPreview);
        } else {
          send('progress', { stage: 'script', message: '📋 방송 개요를 구성하고 있어요...', chapter: 0, totalChapters: config.chapters });
          const outlineResult = await generateOutline(topic, config.chapters, tone, { signal });
          sendTokens('개요', outlineResult.usage, outlineResult.promptPreview);

          const { chapters: outline } = outlineResult;
          const chapterTexts: string[] = [];

          for (let i = 0; i < config.chapters; i++) {
            if (signal.aborted) break;
            send('progress', {
              stage: 'script',
              message: `✍️ 챕터 ${i + 1}/${config.chapters} 작성 중: ${outline[i]?.title ?? ''}`,
              chapter: i + 1,
              totalChapters: config.chapters,
            });
            const result = await generateChapter(topic, outline, i, chapterTexts, config.words, tone, { signal });
            chapterTexts.push(result.text);
            sendTokens(`챕터 ${i + 1}/${config.chapters}`, result.usage, result.promptPreview);
          }
          fullScript = chapterTexts.join('\n\n');
        }

        const wordCount = fullScript.trim().split(/\s+/).length;
        send('script', { text: fullScript, wordCount, chapters: config.chapters });

        // ─── 오디오 생성 ─────────────────────────────────────────────────
        if (config.skipAudio && !directScript) {
          send('done', { success: true, durationMin, scriptWordCount: wordCount, audioSkipped: true, totalUsage, totalCostUsd: calcCost(totalUsage) });
          controller.close();
          return;
        }

        const resolvedVoiceId = voiceId || DEFAULT_SUPERTONIC_VOICE_ID;
        const chunks = chunkText(fullScript, SUPERTONIC_TTS_CHUNK_SIZE);

        // 총 글자 수 기준 추정 (로컬 CPU, steps=8 기준 약 100자당 2초)
        const totalChars = chunks.reduce((sum, c) => sum + c.length, 0);
        const estimatedSec = Math.ceil(totalChars / 100 * 2 * (steps / 8));
        const estMin = Math.floor(estimatedSec / 60);
        const estSec = estimatedSec % 60;
        const estimatedLabel = estMin > 0
          ? `약 ${estMin}분 ${estSec > 0 ? estSec + '초' : ''}`
          : `약 ${estimatedSec}초`;

        send('progress', {
          stage: 'audio',
          message: `🎙️ Supertonic-3 합성 시작 — ${chunks.length}개 청크 · 예상 ${estimatedLabel}`,
          chunk: 0, totalChunks: chunks.length,
        });

        const audioBuffer = await synthesizeChunksSupertonic(
          chunks,
          resolvedVoiceId,
          steps,
          speed,
          (current, total) => {
            send('progress', {
              stage: 'audio',
              message: `🎙️ 합성 중... (${current}/${total} 청크)`,
              chunk: current, totalChunks: total,
            });
          }
        );

        send('audio', {
          base64: audioBuffer.toString('base64'),
          mimeType: 'audio/wav',
          sizeBytes: audioBuffer.length,
        });

        send('done', {
          success: true,
          durationMin,
          scriptWordCount: wordCount,
          audioSkipped: false,
          totalUsage,
          totalCostUsd: calcCost(totalUsage),
        });
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
        console.error('[AiCast] 생성 오류:', raw);
        send('error', { message: sanitizeError(raw), code: 'GENERATION_FAILED' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
