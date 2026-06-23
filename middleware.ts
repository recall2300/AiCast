import { NextRequest, NextResponse } from 'next/server';

const PUBLIC = ['/login', '/api/auth'];

// Edge Runtime에서 timing attack 방지용 상수 시간 비교
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ACCESS_PASSWORD 미설정 시 인증 비활성화 (로컬 개발 환경)
  if (!process.env.ACCESS_PASSWORD) return NextResponse.next();

  // 공개 경로는 통과
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // 정적 파일 통과
  if (pathname.startsWith('/_next') || pathname === '/favicon.ico') return NextResponse.next();

  const token = request.cookies.get('aicast-auth')?.value ?? '';
  const expected = process.env.ACCESS_TOKEN ?? '';
  if (timingSafeEqual(token, expected)) return NextResponse.next();

  const url = new URL('/login', request.url);
  url.searchParams.set('from', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
