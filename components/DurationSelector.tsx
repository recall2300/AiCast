'use client';

import type { DurationMinutes } from '@/types/podcast';
import { DURATION_LABELS } from '@/lib/constants';

const DURATIONS: DurationMinutes[] = [5, 15, 30, 60, 120];

interface Props {
  value: DurationMinutes | null;
  onChange: (value: DurationMinutes) => void;
  disabled?: boolean;
}

export default function DurationSelector({ value, onChange, disabled }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {DURATIONS.map((dur) => {
        const isSelected = dur === value;
        return (
          <button
            key={dur}
            onClick={() => !disabled && onChange(dur)}
            disabled={disabled}
            className="relative px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            style={
              isSelected
                ? {
                    backgroundColor: 'var(--btn-bg)',
                    border: '1px solid var(--btn-bg)',
                    color: 'var(--btn-fg)',
                    boxShadow: '0 0 16px var(--accent-glow)',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.5 : 1,
                  }
                : {
                    backgroundColor: 'var(--input)',
                    border: '1px solid var(--card-border)',
                    color: 'var(--fg-2)',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.5 : 1,
                  }
            }
          >
            {DURATION_LABELS[dur]}
            {dur >= 60 && (
              <span
                className="absolute -top-1.5 -right-1 text-[9px] px-1 rounded-full leading-4"
                style={{ backgroundColor: 'var(--card-border)', color: 'var(--fg-3)' }}
              >
                스크립트
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
