'use client';

import { useEffect, useRef } from 'react';

interface ProgressMessage {
  id: number;
  stage: 'script' | 'audio';
  message: string;
}

interface Props {
  messages: ProgressMessage[];
}

export default function ProgressFeed({ messages }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) return null;

  return (
    <div
      className="rounded-xl p-4 space-y-2 max-h-48 overflow-y-auto"
      style={{ backgroundColor: 'var(--log-bg)', border: '1px solid var(--log-border)' }}
    >
      {messages.map((msg) => (
        <div key={msg.id} className="flex items-start gap-3 text-sm">
          <span
            className={`mt-0.5 flex-shrink-0 w-2 h-2 rounded-full ${
              msg.stage === 'script' ? 'bg-amber-400' : 'bg-sky-400'
            }`}
          />
          <span style={{ color: 'var(--fg-2)' }}>{msg.message}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

export type { ProgressMessage };
