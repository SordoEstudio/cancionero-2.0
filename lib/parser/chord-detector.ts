/**
 * Detecta si un token es un acorde musical.
 * Soporta: Am, F#m7, Bb, C/G, Gsus4, Ddim, Eaug, Cmaj7, D7/F#, etc.
 */

// Regex principal: raíz + modificador + bajo opcional
const CHORD_REGEX =
  /^[A-G][#b]?(m|maj|min|sus|dim|aug|add)?[0-9]*(\/[A-G][#b]?)?$/;

export function isChord(token: string): boolean {
  return CHORD_REGEX.test(token.trim());
}

/**
 * Determina si una línea completa es una "línea de acordes".
 * Criterio: ≥70% de los tokens no vacíos son acordes Y longitud ≤ 80 chars.
 */
export function isChordLine(line: string): boolean {
  if (line.length > 80) return false;
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const chordCount = tokens.filter(isChord).length;
  return chordCount / tokens.length >= 0.7;
}

/**
 * Extrae acordes con sus posiciones en caracteres desde una línea de acordes.
 * Input:  "Am     F    C    G"
 * Output: [{position:0, chord:"Am"}, {position:7, chord:"F"}, ...]
 */
export function extractChordsFromLine(
  chordLine: string
): Array<{ position: number; chord: string }> {
  const result: Array<{ position: number; chord: string }> = [];
  const regex = /([A-G][#b]?(m|maj|min|sus|dim|aug|add)?[0-9]*(\/[A-G][#b]?)?)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(chordLine)) !== null) {
    result.push({ position: match.index, chord: match[0] });
  }

  return result;
}

/** Detecta el acorde principal de una canción (el más frecuente) */
export function detectMainKey(
  chordLines: string[]
): string | null {
  const counts: Record<string, number> = {};
  for (const line of chordLines) {
    const chords = extractChordsFromLine(line);
    for (const { chord } of chords) {
      // Normalizar a raíz: "Am7" → "Am", "C/G" → "C"
      const root = chord.split('/')[0].replace(/[0-9]+(sus|maj|min|dim|aug|add)?[0-9]*/g, '');
      counts[root] = (counts[root] ?? 0) + 1;
    }
  }

  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}
