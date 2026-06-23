import Anthropic from '@anthropic-ai/sdk';
import { BROADCAST_TONES, DEFAULT_TONE } from './constants';
import type { OutlineChapter, GenerationResult, OutlineResult, TokenUsage, BroadcastTone } from '@/types/podcast';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = 'claude-sonnet-4-6';

export function zeroUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };
}

function extractUsage(usage: Anthropic.Usage): TokenUsage {
  const u = usage as unknown as Record<string, number>;
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
  };
}

function getToneSystemPrompt(tone: BroadcastTone): string {
  return (
    BROADCAST_TONES.find((t) => t.key === tone)?.systemPrompt ??
    BROADCAST_TONES.find((t) => t.key === DEFAULT_TONE)!.systemPrompt
  );
}

function buildSinglePrompt(topic: string, targetWords: number): string {
  return `주제: "${topic}"

위 주제로 한국어 라디오 팟캐스트 스크립트를 작성해주세요.
목표 분량: 약 ${targetWords}단어

구성:
- 인트로: 청취자를 환영하고 오늘 주제 소개 (약 ${Math.round(targetWords * 0.15)}단어)
- 본문: 주제를 깊이 있고 감성적으로 풀어내기 (약 ${Math.round(targetWords * 0.7)}단어)
- 아웃트로: 마무리 인사와 따뜻한 작별 인사 (약 ${Math.round(targetWords * 0.15)}단어)

스크립트만 출력하세요.`;
}

function buildOutlinePrompt(topic: string, chapters: number): string {
  return `주제: "${topic}"

이 주제로 ${chapters}개 챕터로 구성된 라디오 팟캐스트 개요를 JSON으로 작성하세요.
각 챕터는 서로 자연스럽게 이어지도록 구성하세요.

반드시 다음 JSON 형식으로만 응답하세요:
{"chapters": [{"index": 0, "title": "챕터 제목", "summary": "이 챕터에서 다룰 내용 2-3문장 요약"}]}`;
}

function buildChapterPrompt(
  topic: string,
  outline: OutlineChapter[],
  chapterIndex: number,
  previousChapters: string[],
  wordsPerChapter: number
): string {
  const isFirst = chapterIndex === 0;
  const isLast = chapterIndex === outline.length - 1;
  const chapterInfo = outline[chapterIndex];

  const prevContext =
    previousChapters.length > 0
      ? `\n\n이전 챕터 마지막 부분 (연결을 위한 참고):\n"...${previousChapters[previousChapters.length - 1].slice(-300)}"`
      : '';

  return `전체 주제: "${topic}"
현재 챕터 ${chapterIndex + 1}/${outline.length}: ${chapterInfo.title}
이 챕터 내용: ${chapterInfo.summary}${prevContext}

${isFirst ? '인트로를 포함해 청취자를 환영하며 시작하세요.' : '이전 내용과 자연스럽게 이어지도록 시작하세요.'}
${isLast ? '마지막 챕터이므로 따뜻한 마무리 인사로 끝내세요.' : '다음 챕터로 자연스럽게 넘어갈 수 있는 끝맺음으로 마무리하세요.'}
목표 분량: 약 ${wordsPerChapter}단어

스크립트만 출력하세요.`;
}

export async function generateSingleScript(
  topic: string,
  targetWords: number,
  tone: BroadcastTone,
  options?: { signal?: AbortSignal }
): Promise<GenerationResult> {
  const userPrompt = buildSinglePrompt(topic, targetWords);
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: Math.min(8096, Math.ceil(targetWords * 3)),
    system: [
      {
        type: 'text',
        text: getToneSystemPrompt(tone),
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  }, { signal: options?.signal });

  let fullText = '';
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      fullText += event.delta.text;
    }
  }
  const finalMsg = await stream.finalMessage();
  return {
    text: fullText,
    usage: extractUsage(finalMsg.usage),
    promptPreview: `[방송톤: ${BROADCAST_TONES.find((t) => t.key === tone)?.label ?? tone}]\n\n${userPrompt}`,
  };
}

export async function generateOutline(
  topic: string,
  chapters: number,
  tone: BroadcastTone,
  options?: { signal?: AbortSignal }
): Promise<OutlineResult> {
  const userPrompt = buildOutlinePrompt(topic, chapters);
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: getToneSystemPrompt(tone),
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  }, { signal: options?.signal });

  const rawText =
    response.content.find((b) => b.type === 'text')?.text ?? '{"chapters":[]}';
  const usage = extractUsage(response.usage);
  const promptPreview = userPrompt.slice(0, 160).replace(/\n/g, ' ');

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { chapters: generateFallbackOutline(topic, chapters), usage, promptPreview };

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return { chapters: parsed.chapters as OutlineChapter[], usage, promptPreview };
  } catch {
    return { chapters: generateFallbackOutline(topic, chapters), usage, promptPreview };
  }
}

function generateFallbackOutline(topic: string, chapters: number): OutlineChapter[] {
  const titles = ['도입', '탐구', '이야기', '깊이', '감성', '마무리'];
  return Array.from({ length: chapters }, (_, i) => ({
    index: i,
    title: titles[i % titles.length] || `챕터 ${i + 1}`,
    summary: `${topic}에 대한 ${i + 1}번째 이야기를 나눠봅니다.`,
  }));
}

export async function generateChapter(
  topic: string,
  outline: OutlineChapter[],
  chapterIndex: number,
  previousChapters: string[],
  totalWords: number,
  tone: BroadcastTone,
  options?: { signal?: AbortSignal }
): Promise<GenerationResult> {
  const wordsPerChapter = Math.ceil(totalWords / outline.length);

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: Math.min(8096, Math.ceil(wordsPerChapter * 3)),
    system: [
      {
        type: 'text',
        text: getToneSystemPrompt(tone),
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: buildChapterPrompt(topic, outline, chapterIndex, previousChapters, wordsPerChapter),
      },
    ],
  }, { signal: options?.signal });

  let chapterText = '';
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      chapterText += event.delta.text;
    }
  }

  const userPrompt = buildChapterPrompt(topic, outline, chapterIndex, previousChapters, wordsPerChapter);
  const finalMsg = await stream.finalMessage();
  return {
    text: chapterText,
    usage: extractUsage(finalMsg.usage),
    promptPreview: `[방송톤: ${BROADCAST_TONES.find((t) => t.key === tone)?.label ?? tone}]\n\n${userPrompt}`,
  };
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  };
}
