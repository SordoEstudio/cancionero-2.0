'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpToLine, Pause, Play } from 'lucide-react';
import { Slider } from '@/components/ui/Slider';
import { ICON_INLINE, ICON_STROKE, lucideDecorative } from '@/components/ui/icon-tokens';
import { IconButton } from '@/components/ui/IconButton';

export const SCROLL_SPEED_MIN = 10; // px/s
export const SCROLL_SPEED_MAX = 120;
export const SCROLL_SPEED_DEFAULT = 40;

function sliderToSpeed(v: number): number {
  const normalized = (v - SCROLL_SPEED_MIN) / (SCROLL_SPEED_MAX - SCROLL_SPEED_MIN);
  return Math.round(
    SCROLL_SPEED_MIN + normalized * normalized * (SCROLL_SPEED_MAX - SCROLL_SPEED_MIN)
  );
}

function speedToSlider(speed: number): number {
  const normalized = Math.sqrt(
    (speed - SCROLL_SPEED_MIN) / (SCROLL_SPEED_MAX - SCROLL_SPEED_MIN)
  );
  return Math.round(
    SCROLL_SPEED_MIN + normalized * (SCROLL_SPEED_MAX - SCROLL_SPEED_MIN)
  );
}

interface ScrollControlProps {
  speed?: number;
  onSpeedChange?: (speed: number) => void;
  /** Al iniciar scroll automático (p. ej. ocultar panel y ganar espacio de lectura). */
  onScrollSessionStart?: () => void;
}

export function ScrollControl({
  speed: controlledSpeed,
  onSpeedChange,
  onScrollSessionStart,
}: ScrollControlProps) {
  const [playing, setPlaying] = useState(false);
  const [internalSpeed, setInternalSpeed] = useState(SCROLL_SPEED_DEFAULT);
  const controlled =
    controlledSpeed !== undefined && onSpeedChange !== undefined;
  const speed = controlled ? controlledSpeed : internalSpeed;
  const setSpeed = controlled ? onSpeedChange : setInternalSpeed;

  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);
  const accRef = useRef<number>(0);
  const speedRef = useRef<number>(speed);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  const step = useCallback((ts: number) => {
    const delta = (ts - lastTsRef.current) / 1000;
    lastTsRef.current = ts;
    accRef.current += delta * speedRef.current;

    const px = Math.floor(accRef.current);
    if (px >= 1) {
      window.scrollBy({ top: px, behavior: 'instant' as ScrollBehavior });
      accRef.current -= px;
    }

    rafRef.current = requestAnimationFrame(step);
  }, []);

  const pause = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setPlaying(false);
  }, []);

  const play = useCallback(() => {
    onScrollSessionStart?.();
    lastTsRef.current = performance.now();
    accRef.current = 0;
    rafRef.current = requestAnimationFrame(step);
    setPlaying(true);
  }, [step, onScrollSessionStart]);

  const reset = useCallback(() => {
    pause();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [pause]);

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  const playIcon = lucideDecorative(ICON_INLINE);

  return (
    <div className="flex flex-col gap-3 p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)]">
      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        Scroll automático
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={playing ? pause : play}
          title={playing ? 'Pausar scroll' : 'Iniciar scroll'}
          aria-label={playing ? 'Pausar scroll automático' : 'Iniciar scroll automático'}
          className={[
            'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
            playing
              ? 'bg-[var(--danger)] text-white hover:opacity-90'
              : 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]',
          ].join(' ')}
        >
          {playing ? (
            <Pause {...playIcon} />
          ) : (
            <Play {...playIcon} className={`${playIcon.className ?? ''} pl-0.5`} />
          )}
        </button>

        <IconButton
          label="Volver arriba"
          onClick={reset}
          className="border border-[var(--border)] bg-[var(--bg-elevated)] hover:bg-[var(--border)]"
        >
          <ArrowUpToLine {...lucideDecorative(ICON_INLINE)} />
        </IconButton>
      </div>

      <Slider
        label="Velocidad"
        min={SCROLL_SPEED_MIN}
        max={SCROLL_SPEED_MAX}
        value={speedToSlider(speed)}
        onChange={(v) => setSpeed(sliderToSpeed(v))}
        formatValue={(v) => `${sliderToSpeed(v)} px/s`}
      />
    </div>
  );
}
