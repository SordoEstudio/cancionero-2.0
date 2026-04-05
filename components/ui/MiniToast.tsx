'use client';

import { useEffect } from 'react';
import { AlertTriangle, Check, CircleAlert } from 'lucide-react';
import { ICON_INLINE, ICON_STROKE } from '@/components/ui/icon-tokens';

export type MiniToastKind = 'ok' | 'err' | 'warn';

interface MiniToastProps {
  kind: MiniToastKind;
  /** 1–2 palabras; el detalle va en title si hace falta. */
  text: string;
  title?: string;
  onDismiss: () => void;
  /** ms */
  duration?: number;
}

const icons = {
  ok: Check,
  err: CircleAlert,
  warn: AlertTriangle,
} as const;

export function MiniToast({
  kind,
  text,
  title,
  onDismiss,
  duration = 2400,
}: MiniToastProps) {
  useEffect(() => {
    const t = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(t);
  }, [duration, onDismiss]);

  const Icon = icons[kind];

  return (
    <div
      role="status"
      aria-live="polite"
      title={title}
      className={[
        'fixed bottom-4 right-4 z-[200] flex max-w-[min(18rem,calc(100vw-2rem))] items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur-sm transition-opacity',
        kind === 'ok' &&
          'border-emerald-500/35 bg-emerald-500/10 text-emerald-900 dark:border-emerald-400/25 dark:bg-emerald-500/15 dark:text-emerald-100',
        kind === 'err' &&
          'border-red-500/35 bg-red-500/10 text-red-900 dark:border-red-400/25 dark:bg-red-500/15 dark:text-red-100',
        kind === 'warn' &&
          'border-amber-500/40 bg-amber-500/10 text-amber-950 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-100',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Icon
        size={ICON_INLINE}
        strokeWidth={ICON_STROKE}
        className="shrink-0 opacity-90"
        aria-hidden
      />
      <span className="truncate">{text}</span>
    </div>
  );
}
