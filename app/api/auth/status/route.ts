import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ enabled: !!process.env.ACCESS_PASSWORD });
}
