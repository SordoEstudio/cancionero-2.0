/**
 * Detecta si un token es un acorde musical.
 *
 * Soporta: Am, F#m7, Bb, C/G, Gsus4, Ddim, Eaug, Cmaj7, D7/F#,
 *          D(add9), Asus4(add9), Bm7b5/A, Cmaj9, F#7sus4, G13,
 *          Am7(b5), C#dim7, Eb6/9, Dmaj7#11, etc.
 */

/**
 * Regex para un acorde completo:
 *
 *   ROOT          [A-G][#b]?
 *   QUALITY       m|min|maj|M|sus|dim|aug|°|+|Δ  (optional)
 *   EXTENSIONS    digits, #, b, parens, add/sus/maj/no text  (optional, up to ~20 chars)
 *   SLASH-PART    /[A-G][#b]?  OR  /[0-9]+  (for things like Eb6/9)  (optional)
 */
const CHORD_RE =
  /^[A-G][#b]?(?:m|min|maj|M|sus|dim|aug|°|\+|Δ)?[0-9#b()addsumajnoMÆ]{0,20}(?:\/(?:[A-G][#b]?|[0-9]+))?$/;

export function isChord(token: string): boolean {
  const t = token.trim();
  if (t.length === 0 || t.length > 30) return false;
  return CHORD_RE.test(t);
}

/**
 * Determina si una línea completa es una "línea de acordes".
 * Criterio: >=60% de los tokens no vacíos son acordes, línea <=120 chars,
 * y al menos un token es un acorde.
 */
export function isChordLine(line: string): boolean {
  if (line.length > 120) return false;
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const chordCount = tokens.filter(isChord).length;
  if (chordCount === 0) return false;
  return chordCount / tokens.length >= 0.6;
}

/**
 * Extrae acordes con posiciones en caracteres.
 *
 * Captura: ROOT + QUALITY? + EXTENSIONS? + SLASH?
 * Luego valida cada match con isChord() para descartar falsos positivos.
 */
const EXTRACT_RE =
  /[A-G][#b]?(?:m|min|maj|M|sus|dim|aug|°|\+|Δ)?[0-9#b()addsumajnoMÆ]{0,20}(?:\/(?:[A-G][#b]?|[0-9]+))?/g;

export function extractChordsFromLine(
  chordLine: string
): Array<{ position: number; chord: string }> {
  const result: Array<{ position: number; chord: string }> = [];
  let match: RegExpExecArray | null;

  EXTRACT_RE.lastIndex = 0;
  while ((match = EXTRACT_RE.exec(chordLine)) !== null) {
    if (isChord(match[0])) {
      result.push({ position: match.index, chord: match[0] });
    }
  }

  return result;
}

const ROOT_RE = /^([A-G][#b]?)/;

/** Detecta el acorde principal de una canción (raíz más frecuente). */
export function detectMainKey(chordLines: string[]): string | null {
  const counts: Record<string, number> = {};
  for (const line of chordLines) {
    const chords = extractChordsFromLine(line);
    for (const { chord } of chords) {
      const base = chord.split('/')[0];
      const m = ROOT_RE.exec(base);
      if (m) {
        counts[m[1]] = (counts[m[1]] ?? 0) + 1;
      }
    }
  }

  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}
