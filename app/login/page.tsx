'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark') {
      setIsDark(true);
    } else if (!stored) {
      setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    if (next) {
      document.documentElement.removeAttribute('data-theme-override');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme-override', '1');
      localStorage.setItem('theme', 'light');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        const raw = searchParams.get('from') ?? '/';
        const from = raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('\\') ? raw : '/';
        router.push(from);
        router.refresh();
      } else {
        setError(data.error ?? '오류가 발생했습니다.');
        setPassword('');
      }
    } catch {
      setError('서버에 연결할 수 없습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: 'var(--bg)' }}
    >
      {/* 테마 토글 */}
      <button
        onClick={toggleTheme}
        className="fixed top-4 right-4 z-50 w-9 h-9 rounded-lg flex items-center justify-center transition-all focus:outline-none"
        style={{ backgroundColor: 'var(--card)', border: '1px solid var(--card-border)', color: 'var(--fg-2)' }}
        title={isDark ? '라이트 모드' : '다크 모드'}
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

      <div className="w-full max-w-sm space-y-8">
        {/* 로고 */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight" style={{ color: 'var(--fg)' }}>
            Ai<span style={{ color: 'var(--accent)' }}>Cast</span>
          </h1>
          <p className="text-sm" style={{ color: 'var(--fg-3)' }}>
            계속하려면 비밀번호를 입력하세요.
          </p>
        </div>

        {/* 폼 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div
            className="rounded-2xl p-6 space-y-4"
            style={{ backgroundColor: 'var(--card)', border: '1px solid var(--card-border)' }}
          >
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              autoFocus
              disabled={loading}
              className="w-full rounded-xl px-4 py-3 text-sm transition-all focus:outline-none disabled:opacity-50"
              style={{
                backgroundColor: 'var(--input)',
                border: '1px solid var(--card-border)',
                color: 'var(--fg)',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
              onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--card-border)'; }}
            />

            {error && (
              <p className="text-sm text-center" style={{ color: 'var(--error-fg)' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="w-full py-3 rounded-xl font-bold text-sm transition-all focus:outline-none"
              style={
                loading || !password.trim()
                  ? { backgroundColor: 'var(--btn-off-bg)', color: 'var(--btn-off-fg)', cursor: 'not-allowed' }
                  : { backgroundColor: 'var(--btn-bg)', color: 'var(--btn-fg)', boxShadow: '0 0 20px var(--accent-glow)' }
              }
            >
              {loading ? '확인 중...' : '입장'}
            </button>
          </div>
        </form>

        <p className="text-center text-xs" style={{ color: 'var(--fg-3)' }}>
          Powered by Claude AI &amp; Supertonic-3
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
