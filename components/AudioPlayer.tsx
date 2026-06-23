'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface Props {
  src: string;
  topic: string;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function AudioPlayer({ src, topic }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration);
    const onEnded = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('loadedmetadata', onDurationChange);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('loadedmetadata', onDurationChange);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
  }, [isPlaying]);

  const seekTo = useCallback(
    (clientX: number) => {
      const bar = progressRef.current;
      const audio = audioRef.current;
      if (!bar || !audio || !duration) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      audio.currentTime = ratio * duration;
      setCurrentTime(ratio * duration);
    },
    [duration]
  );

  const onProgressClick = (e: React.MouseEvent) => seekTo(e.clientX);
  const onProgressMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    seekTo(e.clientX);
  };

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => seekTo(e.clientX);
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, seekTo]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const filename = `aicast-${topic.slice(0, 20).replace(/\s+/g, '-')}.wav`;

  return (
    <div
      className="rounded-2xl p-5 space-y-4"
      style={{ backgroundColor: 'var(--card)', border: '1px solid var(--card-border)' }}
    >
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />

      {/* Waveform + Title */}
      <div className="flex items-center gap-4">
        <div className="flex items-end gap-[3px] h-8 flex-shrink-0">
          {[0.4, 0.7, 1, 0.6, 0.9, 0.5, 0.8, 0.3, 0.75, 0.45].map((h, i) => (
            <div
              key={i}
              className="w-1 rounded-full transition-all"
              style={{
                height: `${h * 100}%`,
                backgroundColor: isPlaying ? 'var(--accent)' : 'var(--card-border)',
                animation: isPlaying ? `blink ${0.6 + i * 0.07}s ease-in-out infinite alternate` : 'none',
              }}
            />
          ))}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--fg)' }}>{topic || 'AI 라디오 팟캐스트'}</p>
          <p className="text-xs" style={{ color: 'var(--fg-3)' }}>AI 라디오 팟캐스트</p>
        </div>
      </div>

      {/* Progress bar */}
      <div
        ref={progressRef}
        className="relative h-1.5 rounded-full cursor-pointer group"
        style={{ backgroundColor: 'var(--input)' }}
        onClick={onProgressClick}
        onMouseDown={onProgressMouseDown}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-100"
          style={{
            width: `${progress}%`,
            background: 'linear-gradient(to right, var(--accent), #FCD34D)',
          }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            backgroundColor: 'var(--accent)',
            boxShadow: '0 0 8px var(--accent-glow)',
            left: `calc(${progress}% - 6px)`,
          }}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        <button
          onClick={togglePlay}
          className="w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-95 flex-shrink-0"
          style={{
            backgroundColor: 'var(--accent)',
            boxShadow: '0 0 20px var(--accent-glow)',
          }}
          aria-label={isPlaying ? '일시정지' : '재생'}
        >
          {isPlaying ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--btn-fg)' }}>
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg className="w-4 h-4 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--btn-fg)' }}>
              <path d="M8 5.14v13.72a1 1 0 001.5.86l11-6.86a1 1 0 000-1.72l-11-6.86A1 1 0 008 5.14z" />
            </svg>
          )}
        </button>

        <span className="text-xs tabular-nums flex-1" style={{ color: 'var(--fg-2)' }}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <a
          href={src}
          download={filename}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{
            backgroundColor: 'var(--input)',
            border: '1px solid var(--card-border)',
            color: 'var(--fg-2)',
          }}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          WAV 다운로드
        </a>
      </div>
    </div>
  );
}
