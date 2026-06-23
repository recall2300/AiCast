import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function passwordEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as unknown;
  const password = body && typeof body === 'object' && 'password' in body
    ? (body as { password: unknown }).password
    : undefined;

  if (!process.env.ACCESS_PASSWORD || !process.env.ACCESS_TOKEN) {
    return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
  }

  if (typeof password !== 'string' || !password.trim()) {
    return NextResponse.json({ error: '비밀번호를 입력해주세요.' }, { status: 400 });
  }

  if (!passwordEqual(password, process.env.ACCESS_PASSWORD)) {
    return NextResponse.json({ error: '비밀번호가 틀렸습니다.' }, { status: 401 });
  }

  // HTTPS 환경 (production 또는 ngrok) 에서는 secure 활성화
  const isSecure = process.env.NODE_ENV === 'production' || process.env.FORCE_HTTPS === 'true';

  const res = NextResponse.json({ ok: true });
  res.cookies.set('aicast-auth', process.env.ACCESS_TOKEN, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7, // 7일 (30일 → 단축)
    path: '/',
  });
  return res;
}
