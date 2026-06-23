import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { password } = (await req.json()) as { password?: string };

  if (!process.env.ACCESS_PASSWORD || !process.env.ACCESS_TOKEN) {
    return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
  }

  if (password !== process.env.ACCESS_PASSWORD) {
    return NextResponse.json({ error: '비밀번호가 틀렸습니다.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('aicast-auth', process.env.ACCESS_TOKEN, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 30, // 30일
    path: '/',
  });
  return res;
}
