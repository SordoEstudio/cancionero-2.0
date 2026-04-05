'use client';

import { Minus, Plus, RotateCcw } from 'lucide-react';
import { ALL_KEYS, transposeChord } from '@/lib/transpose';
import { ICON_INLINE, ICON_STROKE, lucideDecorative } from '@/components/ui/icon-tokens';

const CAPO_OPTIONS = Array.from({ length: 13 }, (_, i) => i);

interface ToneSelectorProps {
  originalKey: string | null;
  transposeSteps: number;
  capo: number;
  /** Alineado con la notación de acordes (bemoles vs sostenidos). */
  useFlats?: boolean;
  onTransposeChange: (steps: number) => void;
  onCapoChange: (capo: number) => void;
}

export function ToneSelector({
  originalKey,
  transposeSteps,
  capo,
  useFlats = false,
  onTransposeChange,
  onCapoChange,
}: ToneSelectorProps) {
  /** Tonalidad que querés que suene (selector de tono). */
  const playingKey = originalKey
    ? transposeChord(originalKey, transposeSteps, useFlats)
    : null;

  /** Acordes en pantalla: un semitono más grave por cada traste de cejilla. */
  const displayedKey =
    originalKey && capo > 0
      ? transposeChord(originalKey, transposeSteps - capo, useFlats)
      : playingKey;

  return (
    <div className="flex flex-col gap-3 p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)]">
      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        Tono
      </p>

      {/* Selector de tono */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onTransposeChange(transposeSteps - 1)}
          title="Bajar un semitono"
          aria-label="Bajar un semitono"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-primary)] transition-colors hover:bg-[var(--border)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <Minus {...lucideDecorative(ICON_INLINE)} />
        </button>

        <select
          value={playingKey ?? ''}
          onChange={(e) => {
            if (!originalKey || !e.target.value) return;
            const targetIdx = ALL_KEYS.indexOf(e.target.value);
            const currentIdx = ALL_KEYS.indexOf(
              transposeChord(originalKey, transposeSteps, useFlats)
            );
            if (targetIdx !== -1 && currentIdx !== -1) {
              onTransposeChange(transposeSteps + (targetIdx - currentIdx));
            }
          }}
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-2 py-1 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        >
          {originalKey ? (
            ALL_KEYS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))
          ) : (
            <option value="">Sin tonalidad</option>
          )}
        </select>

        <button
          type="button"
          onClick={() => onTransposeChange(transposeSteps + 1)}
          title="Subir un semitono"
          aria-label="Subir un semitono"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-primary)] transition-colors hover:bg-[var(--border)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <Plus {...lucideDecorative(ICON_INLINE)} />
        </button>

        {transposeSteps !== 0 && (
          <button
            type="button"
            onClick={() => onTransposeChange(0)}
            title="Volver al tono original"
            aria-label="Volver al tono original de la canción"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-[var(--text-muted)] transition-colors hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <RotateCcw size={ICON_INLINE} strokeWidth={ICON_STROKE} aria-hidden className="shrink-0" />
          </button>
        )}
      </div>

      {/* Cejilla: cada traste baja un semitono los acordes mostrados; al tocar con cejilla suena el tono elegido arriba. */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="capo-select"
          className="text-xs text-[var(--text-secondary)] font-medium"
        >
          Cejilla (traste)
        </label>
        <select
          id="capo-select"
          value={capo}
          onChange={(e) => onCapoChange(Number(e.target.value))}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-2 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        >
          {CAPO_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n === 0 ? 'Sin cejilla' : `Traste ${n}`}
            </option>
          ))}
        </select>
      </div>

      {playingKey && capo > 0 && displayedKey && (
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          Acordes en pantalla:{' '}
          <span className="font-semibold text-[var(--chord-color)]">{displayedKey}</span>
          . Con cejilla en {capo} suena como{' '}
          <span className="font-semibold text-[var(--chord-color)]">{playingKey}</span>.
        </p>
      )}
    </div>
  );
}
