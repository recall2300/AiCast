import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: 'AiCast — AI 라디오 팟캐스트 생성기',
  description: '주제를 입력하면 Claude AI가 한국어 라디오 DJ 스크립트를 쓰고, Supertonic-3으로 실감 나는 오디오를 만들어드려요.',
  keywords: ['AI 팟캐스트', '라디오', 'Supertonic', 'Claude AI', '한국어 TTS'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full" suppressHydrationWarning>
      <head>
        {/* FOUC 방지: hydration 전에 테마 클래스를 적용 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('theme');if(s==='dark'){document.documentElement.classList.add('dark');}else if(s==='light'){document.documentElement.setAttribute('data-theme-override','1');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${inter.className} min-h-full`}>
        {children}
      </body>
    </html>
  );
}
