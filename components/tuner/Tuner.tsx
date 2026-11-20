'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, X } from 'lucide-react';
import { ICON_STROKE } from '@/components/ui/icon-tokens';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_NAMES_ES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];

function detectPitch(buf: Float32Array, sampleRate: number): number | null {
  const SIZE = buf.length;
  let sum = 0;
  for (let i = 0; i < SIZE; i++) sum += buf[i] * buf[i];
  if (Math.sqrt(sum / SIZE) < 0.01) return null;

  // Lag range: 60 Hz (bass guitar) to 1200 Hz (high harmonics)
  const lagMin = Math.max(2, Math.floor(sampleRate / 1200));
  const lagMax = Math.min(SIZE - 2, Math.ceil(sampleRate / 60));
  const scanLen = SIZE - lagMax;
  if (scanLen < 1) return null;

  const corrs = new Float32Array(lagMax - lagMin + 1);
  for (let i = 0; i < corrs.length; i++) {
    const lag = lagMin + i;
    let c = 0;
    for (let j = 0; j < scanLen; j++) c += buf[j] * buf[j + lag];
    corrs[i] = c;
  }

  // Find first local minimum index
  let minIdx = 0;
  while (minIdx < corrs.length - 1 && corrs[minIdx] > corrs[minIdx + 1]) minIdx++;

  // Find max after minimum
  let bestIdx = minIdx;
  for (let i = minIdx + 1; i < corrs.length; i++) {
    if (corrs[i] > corrs[bestIdx]) bestIdx = i;
  }
  if (corrs[bestIdx] <= 0) return null;

  // Parabolic interpolation for sub-sample accuracy
  const y1 = bestIdx > 0 ? corrs[bestIdx - 1]! : corrs[bestIdx]!;
  const y2 = corrs[bestIdx]!;
  const y3 = bestIdx < corrs.length - 1 ? corrs[bestIdx + 1]! : corrs[bestIdx]!;
  const denom = 2 * y2 - y1 - y3;
  const shift = denom !== 0 ? (y3 - y1) / (2 * denom) : 0;
  const refinedLag = lagMin + bestIdx + shift;

  return sampleRate / refinedLag;
}

function freqToNote(freq: number): { note: string; nameEs: string; octave: number; cents: number } {
  const midi = 12 * Math.log2(freq / 440) + 69;
  const rounded = Math.round(midi);
  const cents = Math.round((midi - rounded) * 100);
  const semitone = ((rounded % 12) + 12) % 12;
  const octave = Math.floor(rounded / 12) - 1;
  return {
    note: NOTE_NAMES[semitone]!,
    nameEs: NOTE_NAMES_ES[semitone]!,
    octave,
    cents,
  };
}

interface NoteState {
  note: string;
  nameEs: string;
  octave: number;
  cents: number;
  freq: number;
}

interface TunerProps {
  onClose: () => void;
}

export function Tuner({ onClose }: TunerProps) {
  const [noteState, setNoteState] = useState<NoteState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const stopAudio = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    analyserRef.current = null;
    if (ctxRef.current) { ctxRef.current.close().catch(() => {}); ctxRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    setListening(false);
  }, []);

  const startAudio = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      const ctx = new AudioContext();
      ctxRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      analyserRef.current = analyser;

      ctx.createMediaStreamSource(stream).connect(analyser);
      setListening(true);

      const buf = new Float32Array(analyser.fftSize);
      let lastTick = 0;

      const tick = (t: number) => {
        rafRef.current = requestAnimationFrame(tick);
        if (t - lastTick < 80) return; // ~12 fps
        lastTick = t;
        analyserRef.current?.getFloatTimeDomainData(buf);
        const freq = detectPitch(buf, ctx.sampleRate);
        if (freq !== null && freq > 50 && freq < 2000) {
          const info = freqToNote(freq);
          setNoteState({ ...info, freq });
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      const name = e instanceof Error ? e.name : '';
      setError(
        name === 'NotAllowedError' || name === 'PermissionDeniedError'
          ? 'Permiso de micrófono denegado'
          : 'No se pudo acceder al micrófono'
      );
    }
  }, []);

  useEffect(() => {
    startAudio();
    return () => stopAudio();
  }, [startAudio, stopAudio]);

  const cents = noteState?.cents ?? 0;
  const inTune = Math.abs(cents) <= 5;
  const close = Math.abs(cents) <= 15;
  const needleColor = inTune ? 'bg-green-500' : close ? 'bg-amber-400' : 'bg-red-500';
  const noteColor = inTune ? 'text-green-500' : close ? 'text-amber-400' : 'text-[var(--text-primary)]';
  // needle position: 0% = -50 cents, 50% = 0 cents, 100% = +50 cents
  const needlePct = Math.min(100, Math.max(0, (Math.max(-50, Math.min(50, cents)) + 50)));

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mic size={16} strokeWidth={ICON_STROKE} className="text-[var(--text-muted)]" aria-hidden />
          <span className="text-sm font-semibold text-[var(--text-primary)]">Afinador</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar afinador"
          className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-colors"
        >
          <X size={16} strokeWidth={ICON_STROKE} aria-hidden />
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-3 text-xs text-red-500">
          {error}
        </div>
      ) : (
        <>
          {/* Note display */}
          <div className="flex flex-col items-center gap-1 py-2">
            {noteState ? (
              <>
                <div className={`text-6xl font-bold tabular-nums leading-none transition-colors ${noteColor}`}>
                  {noteState.note}
                  <span className="ml-1 text-2xl font-semibold text-[var(--text-muted)]">
                    {noteState.octave}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  {noteState.nameEs} · {noteState.freq.toFixed(1)} Hz
                </p>
              </>
            ) : (
              <div className="text-4xl font-bold text-[var(--text-muted)]">—</div>
            )}
          </div>

          {/* Cents needle */}
          <div className="flex flex-col gap-1.5">
            <div className="relative h-6 rounded-full bg-[var(--bg-elevated)]">
              {/* center marker */}
              <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[var(--border)]" />
              {/* needle */}
              <div
                className={`absolute top-1 h-4 w-2 -translate-x-1/2 rounded-full transition-all duration-100 ${noteState ? needleColor : 'bg-[var(--border)]'}`}
                style={{ left: `${needlePct}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-[var(--text-muted)] tabular-nums">
              <span>-50</span>
              <span>-25</span>
              <span>0</span>
              <span>+25</span>
              <span>+50</span>
            </div>
            <p className={`text-center text-xs font-medium tabular-nums ${noteState ? (inTune ? 'text-green-500' : 'text-[var(--text-secondary)]') : 'text-[var(--text-muted)]'}`}>
              {noteState
                ? inTune
                  ? '✓ Afinado'
                  : `${cents > 0 ? '+' : ''}${cents} cents`
                : 'Esperando señal…'}
            </p>
          </div>

          {/* Status */}
          {listening && (
            <p className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
              Escuchando micrófono
            </p>
          )}
        </>
      )}
    </div>
  );
}
