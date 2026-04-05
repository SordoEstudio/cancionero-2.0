'use client';

import { Brackets, LayoutList, Music2, Type } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ViewMode } from '@/types';
import { ICON_TOOLBAR, ICON_STROKE } from '@/components/ui/icon-tokens';

const MODES: {
  value: ViewMode;
  title: string;
  Icon: LucideIcon;
}[] = [
  {
    value: 'default',
    title: 'Normal — acordes arriba, letra abajo',
    Icon: LayoutList,
  },
  {
    value: 'inline',
    title: 'Inline — acordes [C] en la línea de letra',
    Icon: Brackets,
  },
  {
    value: 'chords-only',
    title: 'Solo acordes',
    Icon: Music2,
  },
  {
    value: 'lyrics-only',
    title: 'Solo letra',
    Icon: Type,
  },
];

interface ViewModeSwitchProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewModeSwitch({ value, onChange }: ViewModeSwitchProps) {
  return (
    <div className="flex flex-col gap-2 p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)]">
      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        Visualización
      </p>
      <div className="flex flex-row gap-1.5">
        {MODES.map(({ value: v, title, Icon }) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            title={title}
            aria-label={title}
            aria-pressed={value === v}
            className={[
              'flex h-9 min-w-0 flex-1 items-center justify-center rounded-lg transition-colors',
              value === v
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--border)] hover:text-[var(--text-primary)]',
            ].join(' ')}
          >
            <Icon
              size={ICON_TOOLBAR}
              strokeWidth={ICON_STROKE}
              aria-hidden
              className="shrink-0"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
