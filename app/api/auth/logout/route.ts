import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // 인증이 활성화된 경우에만 토큰 확인 (쿠키 삭제는 항상 수행)
  if (process.env.ACCESS_TOKEN) {
    const token = req.cookies.get('aicast-auth')?.value;
    if (!token) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete('aicast-auth');
  return res;
}
