'use client';

import type { ChordToken, ViewMode } from '@/types';
import { transposeChord } from '@/lib/transpose';

interface ChordLineProps {
  chords: ChordToken[];
  text: string;
  /** Semitonos aplicados al dibujar acordes (tono − cejilla: cada traste baja 1 semitono en pantalla). */
  transposeSteps: number;
  viewMode: ViewMode;
  useFlats?: boolean;
}

/** Construye el string de la línea de acordes con espacios alineados */
function buildChordString(chords: ChordToken[], textLen: number, steps: number, useFlats: boolean): string {
  if (chords.length === 0) return '';

  const maxPos = chords.reduce(
    (max, { position, chord }) => Math.max(max, position + transposeChord(chord, steps, useFlats).length + 1),
    textLen
  );

  let result = ' '.repeat(Math.max(maxPos, 1));

  // Insertar de derecha a izquierda para no solapar
  const sorted = [...chords].sort((a, b) => b.position - a.position);
  for (const { position, chord } of sorted) {
    const transposed = transposeChord(chord, steps, useFlats);
    result = result.slice(0, position) + transposed + result.slice(position + transposed.length);
  }

  return result.trimEnd();
}

export function ChordLine({ chords, text, transposeSteps, viewMode, useFlats = false }: ChordLineProps) {
  if (viewMode === 'lyrics-only') {
    if (!text) return null;
    return <div className="lyric-line">{text}</div>;
  }

  if (viewMode === 'chords-only') {
    if (chords.length === 0) return null;
    const chordStr = buildChordString(chords, text.length, transposeSteps, useFlats);
    return <div className="chord-line">{chordStr}</div>;
  }

  if (viewMode === 'inline') {
    return (
      <div className="lyric-line">
        <InlineText chords={chords} text={text} steps={transposeSteps} useFlats={useFlats} />
      </div>
    );
  }

  // Modo default: acordes arriba, letra abajo
  const chordStr = buildChordString(chords, text.length, transposeSteps, useFlats);

  return (
    <div className="mb-0.5">
      {chordStr && <div className="chord-line">{chordStr}</div>}
      {text && <div className="lyric-line">{text}</div>}
      {!chordStr && !text && <div className="h-3" />}
    </div>
  );
}

/** Render inline con acordes en azul y letra en gris */
function InlineText({
  chords,
  text,
  steps,
  useFlats,
}: {
  chords: ChordToken[];
  text: string;
  steps: number;
  useFlats: boolean;
}) {
  const sorted = [...chords].sort((a, b) => a.position - b.position);
  const parts: { type: 'chord' | 'text'; content: string }[] = [];
  let lastPos = 0;

  for (const { position, chord } of sorted) {
    if (position > lastPos) {
      parts.push({ type: 'text', content: text.slice(lastPos, position) });
    }
    parts.push({ type: 'chord', content: `[${transposeChord(chord, steps, useFlats)}]` });
    lastPos = position;
  }
  if (lastPos < text.length) {
    parts.push({ type: 'text', content: text.slice(lastPos) });
  }

  return (
    <>
      {parts.map((p, i) =>
        p.type === 'chord' ? (
          <span key={i} className="text-[var(--chord-color)] font-semibold">
            {p.content}
          </span>
        ) : (
          <span key={i}>{p.content}</span>
        )
      )}
    </>
  );
}
