import type { ParsedLine } from '@/types';
import {
  applyChordCarryForward,
  remapChordPositions,
  templateReferenceLength,
  type ChordCarryState,
} from './chord-carry';
import { mergeParentheticalChords } from './paren-chords';

/** Toda la sección sin acordes en DB/parser pero con al menos una línea de letra */
function isSectionAllMissingChords(lines: ParsedLine[]): boolean {
  if (!lines.length) return false;
  if (!lines.some((l) => l.text.trim())) return false;
  return lines.every((l) => l.chords.length === 0);
}

/** Repite la progresión línea a línea de la sección anterior (estrofas paralelas en LaCuerda). */
function repeatFromPreviousSection(lines: ParsedLine[], prev: ParsedLine[]): ParsedLine[] {
  if (!prev.length) return lines;
  return lines.map((l, j) => {
    if (!l.text.trim()) return { ...l };
    const tmpl = prev[j % prev.length];
    if (!tmpl.chords.length) return { ...l };
    const refLen = templateReferenceLength(tmpl);
    return {
      ...l,
      chords: remapChordPositions(
        tmpl.chords.map((c) => ({ ...c })),
        refLen,
        l.text
      ),
    };
  });
}

function carryStateFromLastChordLine(lines: ParsedLine[]): ChordCarryState | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (l.chords.length > 0) {
      return {
        template: l.chords.map((c) => ({ ...c })),
        refLen: templateReferenceLength(l),
      };
    }
  }
  return null;
}

/**
 * Inferencia de acordes entre secciones:
 * - Estrofa solo letra → misma progresión que la sección anterior (línea i → línea i mod N).
 * - Si no, carry línea a línea como antes.
 * - Luego fusiona acordes entre paréntesis en la letra.
 */
export function inferChordsInSections<T extends { lines: ParsedLine[] }>(
  sections: T[]
): T[] {
  let carryState: ChordCarryState | null = null;
  let prevSectionLines: ParsedLine[] | null = null;

  return sections.map((sec) => {
    let lines = sec.lines.map((l) => ({
      ...l,
      chords: l.chords.map((c) => ({ ...c })),
    }));

    const allMissing = isSectionAllMissingChords(lines);

    if (allMissing && prevSectionLines?.length) {
      lines = repeatFromPreviousSection(lines, prevSectionLines);
    } else {
      const carried = applyChordCarryForward(lines, carryState);
      lines = carried.lines;
      carryState = carried.state;
    }

    lines = lines.map((l) => mergeParentheticalChords(l));

    const endState = carryStateFromLastChordLine(lines);
    if (endState) carryState = endState;

    prevSectionLines = lines;

    return { ...sec, lines };
  });
}
