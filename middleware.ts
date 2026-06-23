import { NextRequest, NextResponse } from 'next/server';

const PUBLIC = ['/login', '/api/auth'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ACCESS_PASSWORD 미설정 시 인증 비활성화 (로컬 개발 환경)
  if (!process.env.ACCESS_PASSWORD) return NextResponse.next();

  // 공개 경로는 통과
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // 정적 파일 통과
  if (pathname.startsWith('/_next') || pathname === '/favicon.ico') return NextResponse.next();

  const token = request.cookies.get('aicast-auth')?.value;
  if (token && token === process.env.ACCESS_TOKEN) return NextResponse.next();

  const url = new URL('/login', request.url);
  url.searchParams.set('from', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
