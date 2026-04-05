'use client';

import { useState } from 'react';
import type { ChordToken, SongLineWithId } from '@/types';
import { extractChordsFromLine } from '@/lib/parser/chord-detector';
import { remapChordPositions } from '@/lib/parser/chord-carry';

/** Reconstruye una “fila de acordes” con espacios para editar como en la cifra impresa */
export function chordsToRawLine(chords: ChordToken[], textLen: number): string {
  if (chords.length === 0) return '';
  const end = Math.max(
    textLen,
    ...chords.map((c) => c.position + c.chord.length),
    1
  );
  const buf: string[] = Array(end).fill(' ');
  for (const { position, chord } of chords) {
    for (let i = 0; i < chord.length && position + i < end; i++) {
      buf[position + i] = chord[i]!;
    }
  }
  return buf.join('').replace(/\s+$/u, '');
}

function clampChordPositions(chords: ChordToken[], textLen: number): ChordToken[] {
  if (textLen <= 0) return [];
  return chords.map((c) => ({
    ...c,
    position: Math.min(Math.max(0, c.position), textLen),
  }));
}

interface LineEditRowProps {
  line: SongLineWithId;
  onChange: (patch: { chords?: ChordToken[]; text?: string }) => void;
}

export function LineEditRow({ line, onChange }: LineEditRowProps) {
  const [chordDraft, setChordDraft] = useState(() =>
    chordsToRawLine(line.chords, line.text.length)
  );

  const commitChords = () => {
    const extracted = extractChordsFromLine(chordDraft);
    const canvas = Math.max(chordDraft.length, 1);
    const lyric = line.text.length > 0 ? line.text : ' ';
    const mapped = remapChordPositions(extracted, canvas, lyric);
    onChange({ chords: mapped });
    setChordDraft(chordsToRawLine(mapped, line.text.length));
  };

  return (
    <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-3 space-y-2">
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] block mb-1">
          Acordes
        </label>
        <input
          type="text"
          className="w-full font-mono text-sm px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-base)] text-[var(--chord-color)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          value={chordDraft}
          onChange={(e) => setChordDraft(e.target.value)}
          onBlur={commitChords}
          spellCheck={false}
          autoComplete="off"
        />
      </div>
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] block mb-1">
          Letra
        </label>
        <textarea
          className="w-full text-sm px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] resize-y min-h-[2.75rem]"
          value={line.text}
          onChange={(e) => {
            const text = e.target.value;
            onChange({
              text,
              chords: clampChordPositions(line.chords, text.length),
            });
          }}
          rows={Math.min(8, Math.max(2, line.text.split('\n').length + 1))}
        />
      </div>
    </div>
  );
}
