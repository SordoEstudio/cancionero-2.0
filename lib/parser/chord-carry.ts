import type { ChordToken, ParsedLine } from '@/types';

/** Estado entre bloques/secciones para seguir el último patrón de acordes explícito */
export interface ChordCarryState {
  template: ChordToken[];
  refLen: number;
}

/** Longitud de referencia para escalar posiciones: letra o ancho de la fila de acordes */
export function templateReferenceLength(line: ParsedLine): number {
  const visualEnd =
    line.chords.length === 0
      ? 0
      : Math.max(...line.chords.map((c) => c.position + c.chord.length));
  return Math.max(line.text.length, visualEnd, 1);
}

/**
 * Remapea posiciones de acordes proporcionalmente al largo de la letra destino.
 * Descarta acordes que no caben sin superponerse textualmente.
 */
export function remapChordPositions(
  chords: ChordToken[],
  fromLen: number,
  lyric: string
): ChordToken[] {
  const toLen = lyric.length;
  if (chords.length === 0 || toLen === 0) return [];

  const from = Math.max(fromLen, 1);
  const scaled = chords.map((c) => ({
    chord: c.chord,
    position: Math.min(Math.round((c.position / from) * toLen), Math.max(0, toLen - 1)),
  }));

  scaled.sort((a, b) => a.position - b.position);

  // Keep only chords that fit without textual overlap
  const result: ChordToken[] = [scaled[0]];
  for (let i = 1; i < scaled.length; i++) {
    const prev = result[result.length - 1];
    const minNext = prev.position + prev.chord.length + 1;
    if (minNext <= toLen - 1) {
      result.push({
        chord: scaled[i].chord,
        position: Math.max(scaled[i].position, minNext),
      });
    }
  }

  return result;
}

/**
 * Completa líneas que solo traen letra reutilizando el último patrón de acordes explícito
 * (típico de LaCuerda: una fila de acordes y varias filas de letra debajo).
 * El estado se puede pasar entre bloques para atravesar líneas en blanco que parten secciones.
 */
export function applyChordCarryForward(
  lines: ParsedLine[],
  initialState: ChordCarryState | null
): { lines: ParsedLine[]; state: ChordCarryState | null } {
  let state: ChordCarryState | null = initialState;
  const out: ParsedLine[] = [];

  for (const line of lines) {
    if (line.chords.length > 0) {
      state = {
        template: line.chords.map((c) => ({ ...c })),
        refLen: templateReferenceLength(line),
      };
      out.push(line);
      continue;
    }

    if (line.text.trim() && state) {
      out.push({
        ...line,
        chords: remapChordPositions(state.template, state.refLen, line.text),
      });
      continue;
    }

    out.push(line);
  }

  return { lines: out, state };
}
