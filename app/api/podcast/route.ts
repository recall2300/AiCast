import { NextRequest } from 'next/server';
import {
  DURATION_CONFIG,
  SUPERTONIC_TTS_CHUNK_SIZE,
  DEFAULT_SUPERTONIC_VOICE_ID,
  DEFAULT_SUPERTONIC_STEPS,
  DEFAULT_SUPERTONIC_SPEED,
  CLAUDE_PRICING,
  DEFAULT_TONE,
} from '@/lib/constants';
import { generateSingleScript, generateOutline, generateChapter, addUsage, zeroUsage } from '@/lib/claude';
import { chunkText, synthesizeChunksSupertonic } from '@/lib/supertonic-tts';
import type { PodcastRequest, TokenUsage } from '@/types/podcast';

export const runtime = 'nodejs';
export const maxDuration = 300;

// ─── Rate limiting (IP당 일일 생성 횟수) ─────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; date: string }>();

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const limit = parseInt(process.env.DAILY_GENERATION_LIMIT ?? '0');
  if (limit <= 0) return { allowed: true, remaining: Infinity }; // 미설정 시 무제한

  const today = new Date().toISOString().slice(0, 10);
  const entry = rateLimitMap.get(ip);

  if (!entry || entry.date !== today) {
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
  return `[${label}] ${parts.join(' / ')} tok — $${cost.toFixed(4)} (누적 $${totalCost.toFixed(4)})`;
}

export async function POST(req: NextRequest): Promise<Response> {
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
    topic,
    durationMin,
    voiceId,
    steps = DEFAULT_SUPERTONIC_STEPS,
    speed = DEFAULT_SUPERTONIC_SPEED,
    tone = DEFAULT_TONE,
    directScript,
  } = body;

  if (!directScript && !topic?.trim()) {
    return new Response(JSON.stringify({ error: '주제를 입력해주세요.' }), {
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

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: object) => {
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
          const result = await generateSingleScript(topic, config.words, tone);
          fullScript = result.text;
          sendTokens('스크립트', result.usage, result.promptPreview);
        } else {
          send('progress', { stage: 'script', message: '📋 방송 개요를 구성하고 있어요...', chapter: 0, totalChapters: config.chapters });
          const outlineResult = await generateOutline(topic, config.chapters, tone);
          sendTokens('개요', outlineResult.usage, outlineResult.promptPreview);

          const { chapters: outline } = outlineResult;
          const chapterTexts: string[] = [];

          for (let i = 0; i < config.chapters; i++) {
            send('progress', {
              stage: 'script',
              message: `✍️ 챕터 ${i + 1}/${config.chapters} 작성 중: ${outline[i]?.title ?? ''}`,
              chapter: i + 1,
              totalChapters: config.chapters,
            });
            const result = await generateChapter(topic, outline, i, chapterTexts, config.words, tone);
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
        const message = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
        send('error', { message, code: 'GENERATION_FAILED' });
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
