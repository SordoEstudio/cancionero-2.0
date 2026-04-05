import type { ChordToken, ParsedLine } from '@/types';
import { extractChordsFromLine } from './chord-detector';

/**
 * Añade acordes escritos entre paréntesis al lado de la letra, p. ej. (Bm A G F#).
 * Las posiciones son índices en el string de letra completo (después de '(').
 */
export function mergeParentheticalChords(line: ParsedLine): ParsedLine {
  const text = line.text;
  const regex = /\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  const additions: ChordToken[] = [];

  while ((m = regex.exec(text)) !== null) {
    const inner = m[1] ?? '';
    const base = m.index + 1;
    for (const { position, chord } of extractChordsFromLine(inner)) {
      additions.push({ chord, position: base + position });
    }
  }

  if (additions.length === 0) return line;

  const merged = [...line.chords, ...additions].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return a.chord.localeCompare(b.chord);
  });

  return { ...line, chords: merged };
}
