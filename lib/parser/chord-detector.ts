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
const MINOR_RE = /^[A-G][#b]?m(?!aj)/;

interface ChordInfo {
  root: string;
  isMinor: boolean;
  full: string;
}

function parseChordInfo(chord: string): ChordInfo | null {
  const base = chord.split('/')[0];
  const m = ROOT_RE.exec(base);
  if (!m) return null;
  return { root: m[1], isMinor: MINOR_RE.test(base), full: base };
}

const SEMITONES: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3,
  E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8,
  A: 9, 'A#': 10, Bb: 10, B: 11,
};

function semitone(root: string): number {
  return SEMITONES[root] ?? -1;
}

/**
 * Detecta la tonalidad principal usando heurísticas armónicas:
 *  1. Frecuencia de raíz (peso base)
 *  2. Bonus por posición: primer acorde de la canción y primer acorde de cada sección
 *  3. Bonus por cadencia V→I (intervalo de 5ta justa ascendente)
 *  4. Penalización si la raíz solo aparece como acorde menor pero la key sería mayor
 */
export function detectMainKey(chordLines: string[]): string | null {
  const allChords: ChordInfo[] = [];
  const sectionFirsts: ChordInfo[] = [];
  let isNewSection = true;

  for (const line of chordLines) {
    const extracted = extractChordsFromLine(line);
    if (extracted.length === 0) {
      isNewSection = true;
      continue;
    }
    for (const { chord } of extracted) {
      const info = parseChordInfo(chord);
      if (info) {
        allChords.push(info);
        if (isNewSection) {
          sectionFirsts.push(info);
          isNewSection = false;
        }
      }
    }
  }

  if (allChords.length === 0) return null;

  // Frequency score
  const scores: Record<string, number> = {};
  for (const c of allChords) {
    scores[c.root] = (scores[c.root] ?? 0) + 1;
  }

  // Bonus: first chord of the song
  const first = allChords[0];
  scores[first.root] = (scores[first.root] ?? 0) + 3;

  // Bonus: first chord of each section
  for (const sf of sectionFirsts) {
    scores[sf.root] = (scores[sf.root] ?? 0) + 2;
  }

  // Bonus: V→I cadence detection
  for (let i = 1; i < allChords.length; i++) {
    const prev = semitone(allChords[i - 1].root);
    const curr = semitone(allChords[i].root);
    if (prev >= 0 && curr >= 0) {
      const interval = ((curr - prev) + 12) % 12;
      if (interval === 5) {
        scores[allChords[i].root] = (scores[allChords[i].root] ?? 0) + 2;
      }
    }
  }

  // Penalty: root only ever appears as minor chord → less likely to be a major key
  const rootAppearances: Record<string, { major: number; minor: number }> = {};
  for (const c of allChords) {
    if (!rootAppearances[c.root]) rootAppearances[c.root] = { major: 0, minor: 0 };
    if (c.isMinor) rootAppearances[c.root].minor++;
    else rootAppearances[c.root].major++;
  }

  for (const [root, app] of Object.entries(rootAppearances)) {
    if (app.major === 0 && app.minor > 0) {
      scores[root] = (scores[root] ?? 0) * 0.6;
    }
  }

  const entries = Object.entries(scores);
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}
