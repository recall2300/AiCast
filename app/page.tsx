'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DurationSelector from '@/components/DurationSelector';
import ProgressFeed, { type ProgressMessage } from '@/components/ProgressFeed';
import AudioPlayer from '@/components/AudioPlayer';
import type { DurationMinutes, TokenUsage, BroadcastTone } from '@/types/podcast';
import {
  DURATION_CONFIG,
  SUPERTONIC_VOICES,
  SUPERTONIC_STEPS_OPTIONS,
  SPEED_OPTIONS,
  DEFAULT_SUPERTONIC_VOICE_ID,
  DEFAULT_SUPERTONIC_STEPS,
  DEFAULT_SUPERTONIC_SPEED,
  BROADCAST_TONES,
  DEFAULT_TONE,
} from '@/lib/constants';

type AppStatus = 'idle' | 'generating' | 'done' | 'error';
type InputMode = 'ai' | 'direct';


interface TokenLogEntry {
  id: number;
  logLine: string;
  promptPreview?: string;
  isSummary?: boolean;
}

function parseSSEChunk(
  raw: string,
  handlers: {
    onProgress: (data: object) => void;
    onTokens:   (data: object) => void;
    onScript:   (data: object) => void;
    onAudio:    (data: object) => void;
    onDone:     (data: object) => void;
    onError:    (data: object) => void;
  }
) {
  const lines = raw.split('\n');
  let currentEvent = '';
  let currentData  = '';
  for (const line of lines) {
    if (line.startsWith('event: '))      { currentEvent = line.slice(7).trim(); }
    else if (line.startsWith('data: '))  { currentData = currentData ? currentData + '\n' + line.slice(6).trim() : line.slice(6).trim(); }
    else if (line === '' && currentEvent && currentData) {
      try {
        const parsed = JSON.parse(currentData);
        switch (currentEvent) {
          case 'progress': handlers.onProgress(parsed); break;
          case 'tokens':   handlers.onTokens(parsed);   break;
          case 'script':   handlers.onScript(parsed);   break;
          case 'audio':    handlers.onAudio(parsed);    break;
          case 'done':     handlers.onDone(parsed);     break;
          case 'error':    handlers.onError(parsed);    break;
        }
      } catch { /* ignore */ }
      currentEvent = '';
      currentData  = '';
    }
  }
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '? KB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const FEMALE_VOICES = SUPERTONIC_VOICES.filter((v) => v.gender === 'female');
const MALE_VOICES   = SUPERTONIC_VOICES.filter((v) => v.gender === 'male');

export default function HomePage() {
  const router = useRouter();

  // ─── 테마 ────────────────────────────────────────────────────────────────
  const [isDark, setIsDark] = useState(false);
  const [authEnabled, setAuthEnabled] = useState(false);

  useEffect(() => {
    // 인증 활성화 여부 확인 (로그아웃 버튼 표시 여부)
    fetch('/api/auth/status')
      .then((r) => { if (r.ok) return r.json(); throw new Error(`HTTP ${r.status}`); })
      .then((d: { enabled: boolean }) => setAuthEnabled(d.enabled))
      .catch((err) => console.warn('[AiCast] 인증 상태 확인 실패:', err));
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark') {
      setIsDark(true);
    } else if (stored === 'light') {
      setIsDark(false);
    } else {
      setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem('theme')) setIsDark(e.matches);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const toggleTheme = useCallback(() => {
    const next = !isDark;
    const root = document.documentElement;
    setIsDark(next);
    if (next) {
      root.classList.add('dark');
      root.removeAttribute('data-theme-override');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme-override', '1');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  // ─── 입력 상태 ───────────────────────────────────────────────────────────
  const [inputMode,    setInputMode]    = useState<InputMode>('ai');
  const [topic,        setTopic]        = useState('');
  const [directScript, setDirectScript] = useState('');
  const [duration,     setDuration]     = useState<DurationMinutes>(5);
  const [tone,         setTone]         = useState<BroadcastTone>(DEFAULT_TONE);

  // ─── 음성 상태 ───────────────────────────────────────────────────────────
  const [voiceId, setVoiceId] = useState(DEFAULT_SUPERTONIC_VOICE_ID);
  const [steps,   setSteps]   = useState(DEFAULT_SUPERTONIC_STEPS);
  const [speed,   setSpeed]   = useState(DEFAULT_SUPERTONIC_SPEED);

  // ─── 앱 상태 ─────────────────────────────────────────────────────────────
  const [appStatus,    setAppStatus]    = useState<AppStatus>('idle');
  const [progressMsgs, setProgressMsgs] = useState<ProgressMessage[]>([]);
  const [tokenLogs,    setTokenLogs]    = useState<TokenLogEntry[]>([]);
  const [totalUsage,   setTotalUsage]   = useState<TokenUsage | null>(null);
  const [totalCostUsd, setTotalCostUsd] = useState(0);
  const [scriptText,   setScriptText]   = useState<string | null>(null);
  const [audioUrl,     setAudioUrl]     = useState<string | null>(null);
  const [audioSkipped, setAudioSkipped] = useState(false);
  const [errorMsg,     setErrorMsg]     = useState<string | null>(null);
  const [wordCount,    setWordCount]    = useState(0);
  const prevAudioUrlRef = useRef<string | null>(null);
  const msgIdCounterRef = useRef(0);

  useEffect(() => {
    return () => {
      if (prevAudioUrlRef.current) {
        URL.revokeObjectURL(prevAudioUrlRef.current);
        prevAudioUrlRef.current = null;
      }
    };
  }, []);

  const addProgress = useCallback((stage: 'script' | 'audio', message: string) => {
    setProgressMsgs((prev) => [...prev, { id: ++msgIdCounterRef.current, stage, message }]);
  }, []);

  const addTokenLog = useCallback((logLine: string, promptPreview = '', isSummary = false) => {
    setTokenLogs((prev) => [...prev, { id: ++msgIdCounterRef.current, logLine, promptPreview, isSummary }]);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (inputMode === 'ai' && !topic.trim()) return;
    if (inputMode === 'direct' && !directScript.trim()) return;

    if (prevAudioUrlRef.current) {
      URL.revokeObjectURL(prevAudioUrlRef.current);
      prevAudioUrlRef.current = null;
    }
    setAppStatus('generating');
    setProgressMsgs([]);
    setTokenLogs([]);
    setTotalUsage(null);
    setTotalCostUsd(0);
    setScriptText(null);
    setAudioUrl(null);
    setAudioSkipped(false);
    setErrorMsg(null);
    setWordCount(0);

    try {
      const response = await fetch('/api/podcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic:        inputMode === 'direct' ? '' : topic,
          durationMin:  duration,
          voiceId,
          steps,
          speed,
          tone,
          directScript: inputMode === 'direct' ? directScript : undefined,
        }),
      });

      if (!response.ok || !response.body) throw new Error(`서버 오류: ${response.status}`);

      const reader  = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          buffer += decoder.decode();
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const block of events) {
          if (!block.trim()) continue;
          parseSSEChunk(block + '\n\n', {
            onProgress: (data) => {
              const d = data as { stage: 'script' | 'audio'; message: string };
              addProgress(d.stage, d.message);
            },
            onTokens: (data) => {
              const d = data as { logLine: string; promptPreview?: string; totalUsage: TokenUsage; totalCostUsd: number };
              addTokenLog(d.logLine, d.promptPreview ?? '');
              setTotalUsage(d.totalUsage);
              setTotalCostUsd(d.totalCostUsd);
            },
            onScript: (data) => {
              const d = data as { text: string; wordCount: number };
              setScriptText(d.text);
              setWordCount(d.wordCount);
            },
            onAudio: (data) => {
              const d = data as { base64: string; mimeType: string; sizeBytes: number };
              const bytes = Uint8Array.from(atob(d.base64), (c) => c.charCodeAt(0));
              const blob  = new Blob([bytes], { type: d.mimeType });
              const url   = URL.createObjectURL(blob);
              prevAudioUrlRef.current = url;
              setAudioUrl(url);
              addProgress('audio', `완성 — ${formatBytes(d.sizeBytes)}`);
            },
            onDone: (data) => {
              const d = data as { audioSkipped?: boolean; totalUsage: TokenUsage; totalCostUsd: number };
              setAudioSkipped(d.audioSkipped ?? false);
              setTotalUsage(d.totalUsage);
              setTotalCostUsd(d.totalCostUsd);
              const u = d.totalUsage;
              addTokenLog(
                `최종 합계: 입력 ${u.inputTokens.toLocaleString()} / 출력 ${u.outputTokens.toLocaleString()}${u.cacheReadTokens > 0 ? ` / 캐시절감 ${u.cacheReadTokens.toLocaleString()}` : ''} tok — 총 $${d.totalCostUsd.toFixed(4)}`,
                '', true,
              );
              setAppStatus('done');
            },
            onError: (data) => {
              const d = data as { message: string };
              setErrorMsg(d.message);
              setAppStatus('error');
            },
          });
        }
      }
      setAppStatus((prev) => (prev === 'generating' ? 'done' : prev));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
      setAppStatus('error');
    }
  }, [topic, directScript, inputMode, duration, voiceId, steps, speed, tone, addProgress, addTokenLog]);

  const isGenerating = appStatus === 'generating';
  const isDirectMode = inputMode === 'direct';
  const config       = DURATION_CONFIG[duration];
  const canGenerate  = isDirectMode ? !!directScript.trim() : !!topic.trim();

  return (
    <main className="min-h-screen px-4 py-8 md:py-12" style={{ backgroundColor: 'var(--bg)' }}>

      {/* ── 우측 상단 버튼들 ──────────────────────────────────────────────── */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
        {/* 로그아웃 버튼 (인증 활성화 시만 표시) */}
        {authEnabled && (
          <button
            onClick={async () => {
              try {
                await fetch('/api/auth/logout', { method: 'POST' });
              } catch (err) {
                console.warn('[AiCast] 로그아웃 요청 실패:', err);
              }
              router.push('/login');
            }}
            className="h-9 px-3 rounded-lg text-xs font-medium transition-all focus:outline-none"
            style={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--card-border)',
              color: 'var(--fg-3)',
            }}
            title="로그아웃"
          >
            로그아웃
          </button>
        )}
        {/* 테마 토글 */}
        <button
          onClick={toggleTheme}
          className="w-9 h-9 rounded-lg flex items-center justify-center transition-all focus:outline-none"
          style={{
            backgroundColor: 'var(--card)',
            border: '1px solid var(--card-border)',
            color: 'var(--fg-2)',
          }}
          title={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
        >
          {isDark ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>
      </div>

      <div className="max-w-2xl mx-auto space-y-6">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <header className="text-center space-y-3 pt-2">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight" style={{ color: 'var(--fg)' }}>
            Ai<span style={{ color: 'var(--accent)' }}>Cast</span>
          </h1>
          <p className="text-sm md:text-base max-w-md mx-auto" style={{ color: 'var(--fg-2)' }}>
            주제를 입력하면 Claude가 라디오 DJ 스크립트를 작성하고,
            <br className="hidden md:block" />
            Supertonic-3으로 자연스러운 한국어 오디오를 합성합니다.
          </p>
        </header>

        {/* ── 섹션 A: 스크립트 생성 설정 ───────────────────────────────── */}
        <section
          className="rounded-2xl p-6 space-y-5"
          style={{ backgroundColor: 'var(--card)', border: '1px solid var(--sec-a-border)' }}
        >
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--sec-a)' }} />
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--sec-a)' }}>
              스크립트 생성 설정 (Claude)
            </span>
          </div>

          {/* Input mode toggle */}
          <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--card-border)' }}>
            {([
              { key: 'ai',     label: 'AI 생성' },
              { key: 'direct', label: '직접 입력' },
            ] as { key: InputMode; label: string }[]).map(({ key, label }) => {
              const sel = inputMode === key;
              return (
                <button
                  key={key}
                  onClick={() => !isGenerating && setInputMode(key)}
                  disabled={isGenerating}
                  className="flex-1 py-2.5 text-sm font-medium transition-all focus:outline-none disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: sel ? 'var(--sel-d)' : 'var(--card)',
                    color: sel ? 'var(--accent)' : 'var(--fg-3)',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Topic */}
          {!isDirectMode && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--fg-3)' }}>
                방송 주제
              </label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="예: 첫사랑의 기억, 달빛 아래 서울 야경, 커피 한 잔의 여유..."
                rows={3}
                disabled={isGenerating}
                className="w-full rounded-xl px-4 py-3 text-sm transition-all focus:outline-none disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--input)',
                  border: '1px solid var(--card-border)',
                  color: 'var(--fg)',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--card-border)'; }}
              />
            </div>
          )}

          {/* Direct script */}
          {isDirectMode && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--fg-3)' }}>
                  스크립트 직접 입력
                </label>
                {directScript && (
                  <span className="text-xs" style={{ color: 'var(--fg-3)' }}>
                    {directScript.trim().split(/\s+/).length.toLocaleString()}단어
                  </span>
                )}
              </div>
              <textarea
                value={directScript}
                onChange={(e) => setDirectScript(e.target.value)}
                placeholder="여기에 스크립트를 붙여넣으세요. 음성 합성만 진행됩니다."
                rows={10}
                disabled={isGenerating}
                className="w-full rounded-xl px-4 py-3 text-sm font-mono leading-relaxed transition-all focus:outline-none disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--input)',
                  border: '1px solid var(--card-border)',
                  color: 'var(--fg)',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--card-border)'; }}
              />
              <p className="text-xs" style={{ color: 'var(--fg-3)' }}>Claude 없이 바로 음성 합성 — 토큰 비용 없음</p>
            </div>
          )}

          {/* Tone */}
          {!isDirectMode && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--fg-3)' }}>
                방송 톤
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {BROADCAST_TONES.map((t) => {
                  const sel = tone === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => !isGenerating && setTone(t.key)}
                      disabled={isGenerating}
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none"
                      style={{
                        backgroundColor: sel ? 'var(--sel-d)' : 'var(--input)',
                        border: `1px solid ${sel ? 'var(--sel-d-border)' : 'var(--card-border)'}`,
                        boxShadow: sel ? '0 0 12px var(--sel-d-glow)' : 'none',
                      }}
                    >
                      <span className="text-lg leading-none flex-shrink-0">{t.emoji}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold leading-tight" style={{ color: sel ? 'var(--accent)' : 'var(--fg)' }}>
                          {t.label}
                        </p>
                        <p className="text-[10px] leading-tight mt-0.5 truncate" style={{ color: 'var(--fg-3)' }}>
                          {t.desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Duration */}
          {!isDirectMode && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--fg-3)' }}>
                방송 시간
              </label>
              <DurationSelector value={duration} onChange={setDuration} disabled={isGenerating} />
              {config && (
                <p className="text-xs" style={{ color: 'var(--fg-3)' }}>
                  목표 {config.words.toLocaleString()}단어
                  {config.chapters > 1 && ` · ${config.chapters}개 챕터`}
                  {config.skipAudio && ' · 스크립트 전용 (오디오 생략)'}
                </p>
              )}
            </div>
          )}
        </section>

        {/* ── 섹션 B: 음성 설정 ────────────────────────────────────────── */}
        <section
          className="rounded-2xl p-6 space-y-5"
          style={{ backgroundColor: 'var(--card)', border: '1px solid var(--sec-b-border)' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--sec-b)' }} />
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--sec-b)' }}>
                음성 설정 (Supertonic-3)
              </span>
            </div>
            <span
              className="text-[10px] px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'var(--sel-b)', color: 'var(--sec-b)' }}
              title="사용자 PC의 CPU로 로컬 합성 — 인터넷 불필요, CPU 성능에 따라 속도 차이"
            >
              로컬 CPU
            </span>
          </div>

          {/* Voice — 여성 */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--fg-3)' }}>
              여성 보이스
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {FEMALE_VOICES.map((v) => (
                <VoiceButton key={v.id} voice={v} selected={voiceId === v.id} onSelect={setVoiceId} disabled={isGenerating} />
              ))}
            </div>
          </div>

          {/* Voice — 남성 */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--fg-3)' }}>
              남성 보이스
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {MALE_VOICES.map((v) => (
                <VoiceButton key={v.id} voice={v} selected={voiceId === v.id} onSelect={setVoiceId} disabled={isGenerating} />
              ))}
            </div>
          </div>

          {/* Steps (합성 품질) */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--fg-3)' }}>
              합성 품질
            </label>
            <div className="flex gap-2">
              {SUPERTONIC_STEPS_OPTIONS.map((opt) => {
                const sel = steps === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => !isGenerating && setSteps(opt.value)}
                    disabled={isGenerating}
                    title={opt.desc}
                    className="flex-1 py-2 rounded-xl text-sm font-medium transition-all focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: sel ? 'var(--sel-b)' : 'var(--input)',
                      border: `1px solid ${sel ? 'var(--sel-b-border)' : 'var(--card-border)'}`,
                      color: sel ? 'var(--sec-b)' : 'var(--fg-3)',
                    }}
                  >
                    <span className="block text-xs font-semibold">{opt.label}</span>
                    <span className="block text-[10px] mt-0.5" style={{ color: 'var(--fg-3)' }}>steps={opt.value}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Speed (재생 속도) */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--fg-3)' }}>
              재생 속도
            </label>
            <div className="flex gap-2">
              {SPEED_OPTIONS.map((opt) => {
                const sel = speed === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => !isGenerating && setSpeed(opt.value)}
                    disabled={isGenerating}
                    className="flex-1 py-2 rounded-xl text-sm font-medium transition-all focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: sel ? 'var(--sel-b)' : 'var(--input)',
                      border: `1px solid ${sel ? 'var(--sel-b-border)' : 'var(--card-border)'}`,
                      color: sel ? 'var(--sec-b)' : 'var(--fg-3)',
                    }}
                  >
                    <span className="block text-xs font-semibold">{opt.label}</span>
                    <span className="block text-[10px] mt-0.5" style={{ color: 'var(--fg-3)' }}>{opt.value}x</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── 생성 버튼 ─────────────────────────────────────────────────── */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !canGenerate}
          className="w-full py-4 rounded-2xl font-bold text-base transition-all duration-200 focus:outline-none"
          style={
            isGenerating || !canGenerate
              ? { backgroundColor: 'var(--btn-off-bg)', color: 'var(--btn-off-fg)', cursor: 'not-allowed' }
              : { backgroundColor: 'var(--btn-bg)', color: 'var(--btn-fg)', boxShadow: '0 0 28px var(--accent-glow)' }
          }
        >
          {isGenerating ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {isDirectMode ? '음성 합성 중...' : '방송 준비 중...'}
            </span>
          ) : isDirectMode ? '음성 합성 시작' : '방송 시작'}
        </button>

        {/* ── Progress ──────────────────────────────────────────────────── */}
        {progressMsgs.length > 0 && <ProgressFeed messages={progressMsgs} />}

        {/* ── Token log ─────────────────────────────────────────────────── */}
        {tokenLogs.length > 0 && (
          <div
            className="rounded-xl p-4 space-y-1.5"
            style={{ backgroundColor: 'var(--log-bg)', border: '1px solid var(--log-border)' }}
          >
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--fg-3)' }}>
              Claude 토큰 사용 로그
            </p>
            {tokenLogs.map((log) => (
              <div key={log.id} className="space-y-0.5">
                <p
                  className="text-xs font-mono leading-relaxed"
                  style={{ color: log.isSummary ? 'var(--log-summary)' : 'var(--fg-3)' }}
                >
                  {log.logLine}
                </p>
                {log.promptPreview && (
                  <details className="pl-3" style={{ borderLeft: '2px solid var(--log-border)' }}>
                    <summary
                      className="text-[10px] font-mono cursor-pointer select-none leading-relaxed"
                      style={{ color: 'var(--fg-3)', listStyle: 'none' }}
                    >
                      ↳ {log.promptPreview.split('\n')[0].slice(0, 80)}
                      {log.promptPreview.length > 80 ? '…' : ''}
                    </summary>
                    <pre
                      className="text-[10px] font-mono whitespace-pre-wrap mt-1 max-h-48 overflow-y-auto leading-relaxed"
                      style={{ color: 'var(--fg-3)' }}
                    >
                      {log.promptPreview}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Error ─────────────────────────────────────────────────────── */}
        {appStatus === 'error' && errorMsg && (
          <div
            className="rounded-xl p-4 text-sm"
            style={{
              backgroundColor: 'var(--error-bg)',
              border: '1px solid var(--error-border)',
              color: 'var(--error-fg)',
            }}
          >
            <span className="font-semibold">오류 발생: </span>{errorMsg}
          </div>
        )}

        {/* ── Audio Player ──────────────────────────────────────────────── */}
        {audioUrl && (
          <div className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--fg-3)' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--accent)' }} />
              오디오 플레이어
            </h2>
            <AudioPlayer src={audioUrl} topic={topic} />
          </div>
        )}

        {/* ── Audio skipped ─────────────────────────────────────────────── */}
        {appStatus === 'done' && audioSkipped && (
          <div
            className="rounded-xl p-4 text-sm flex items-start gap-3"
            style={{ backgroundColor: 'var(--sel-d)', border: '1px solid var(--card-border)', color: 'var(--fg-2)' }}
          >
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} style={{ color: 'var(--accent)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>1시간 이상 방송은 스크립트만 생성됩니다. 아래 스크립트를 복사하거나 TXT로 다운로드하세요.</span>
          </div>
        )}

        {/* ── Script ────────────────────────────────────────────────────── */}
        {scriptText && (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--fg-3)' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                생성된 스크립트
                {wordCount > 0 && (
                  <span className="font-normal normal-case tracking-normal" style={{ color: 'var(--fg-3)' }}>
                    ({wordCount.toLocaleString()}단어)
                  </span>
                )}
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => navigator.clipboard.writeText(scriptText)}
                  className="text-xs px-2 py-1 rounded transition-colors focus:outline-none"
                  style={{ color: 'var(--fg-2)', border: '1px solid var(--card-border)' }}
                >
                  복사
                </button>
                <button
                  onClick={() => {
                    const blob = new Blob([scriptText], { type: 'text/plain;charset=utf-8' });
                    const url  = URL.createObjectURL(blob);
                    try {
                      const a    = document.createElement('a');
                      a.href     = url;
                      a.download = `aicast-${topic.slice(0, 20).replace(/\s+/g, '-') || 'script'}.txt`;
                      a.click();
                    } finally {
                      URL.revokeObjectURL(url);
                    }
                  }}
                  className="text-xs px-2 py-1 rounded transition-colors focus:outline-none"
                  style={{ color: 'var(--fg-2)', border: '1px solid var(--card-border)' }}
                >
                  TXT 다운로드
                </button>
              </div>
            </div>
            <textarea
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              rows={14}
              className="w-full rounded-xl px-4 py-4 text-sm font-mono leading-relaxed transition-all focus:outline-none"
              style={{ backgroundColor: 'var(--input)', border: '1px solid var(--card-border)', color: 'var(--fg)' }}
              spellCheck={false}
            />
            <p className="text-xs" style={{ color: 'var(--fg-3)' }}>스크립트를 직접 편집할 수 있어요.</p>
          </div>
        )}

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <footer className="text-center text-xs pb-4" style={{ color: 'var(--fg-3)' }}>
          Powered by Claude AI &amp; Supertonic-3 · AiCast
          {totalUsage && (
            <span className="ml-2">· 총 ${ totalCostUsd.toFixed(4) }</span>
          )}
        </footer>
      </div>
    </main>
  );
}

// ─── VoiceButton 컴포넌트 ────────────────────────────────────────────────────
function VoiceButton({
  voice,
  selected,
  onSelect,
  disabled,
}: {
  voice: { id: string; name: string; label: string; icon: string };
  selected: boolean;
  onSelect: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onSelect(voice.id)}
      disabled={disabled}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none"
      style={{
        backgroundColor: selected ? 'var(--sel-b)' : 'var(--input)',
        border: `1px solid ${selected ? 'var(--sel-b-border)' : 'var(--card-border)'}`,
      }}
    >
      <span
        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-base"
        style={{ backgroundColor: selected ? 'var(--sel-b)' : 'var(--card)' }}
      >
        {voice.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold" style={{ color: selected ? 'var(--sec-b)' : 'var(--fg)' }}>
          {voice.name}
        </p>
        <p className="text-[10px] truncate" style={{ color: 'var(--fg-3)' }}>
          {voice.label}
        </p>
      </div>
      {selected && (
        <svg className="w-3.5 h-3.5 ml-auto flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" style={{ color: 'var(--sec-b)' }}>
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      )}
    </button>
  );
}
