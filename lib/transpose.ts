import type { ChordToken, ParsedSong, ParsedSection, ParsedLine } from '@/types';

// Escala cromática — siempre en sostenidos internamente
const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Mapa de bemoles → sostenidos para normalización interna
const FLAT_TO_SHARP: Record<string, string> = {
  Db: 'C#', Eb: 'D#', Fb: 'E', Gb: 'F#', Ab: 'G#', Bb: 'A#', Cb: 'B',
};

// Mapa de sostenidos → bemoles para display cuando se prefieren bemoles
const SHARP_TO_FLAT: Record<string, string> = {
  'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb',
};

/** Detecta si una canción usa bemoles por convención */
export function preferFlats(song: ParsedSong): boolean {
  let flats = 0;
  let sharps = 0;
  for (const section of song.sections) {
    for (const line of section.lines) {
      for (const { chord } of line.chords) {
        if (chord.includes('b') && /[A-G]b/.test(chord)) flats++;
        if (chord.includes('#')) sharps++;
      }
    }
  }
  return flats > sharps;
}

/** Normaliza una nota raíz a sostenido */
function normalizeRoot(root: string): string {
  return FLAT_TO_SHARP[root] ?? root;
}

/** Transpone una nota raíz N semitonos */
function transposeRoot(root: string, steps: number, useFlats: boolean): string {
  const normalized = normalizeRoot(root);
  const idx = CHROMATIC.indexOf(normalized);
  if (idx === -1) return root; // nota desconocida, devolver sin cambio
  const newIdx = ((idx + steps) % 12 + 12) % 12;
  const result = CHROMATIC[newIdx];
  return useFlats ? (SHARP_TO_FLAT[result] ?? result) : result;
}

/**
 * Transpone un símbolo de acorde completo.
 * Soporta: Am, F#m7, Bbsus4, C/G, D#dim, Eb/Bb, etc.
 */
export function transposeChord(chord: string, steps: number, useFlats = false): string {
  if (steps === 0) return chord;

  // Regex: raíz ([A-G][#b]?) + modificador + bajo opcional (/[A-G][#b]?)
  const match = chord.match(/^([A-G][#b]?)(.*?)(\/([A-G][#b]?))?$/);
  if (!match) return chord;

  const [, root, modifier, , bassNote] = match;
  const newRoot = transposeRoot(root, steps, useFlats);
  const newBass = bassNote ? '/' + transposeRoot(bassNote, steps, useFlats) : '';

  return newRoot + modifier + newBass;
}

/** Transpone un array de ChordTokens */
export function transposeLine(chords: ChordToken[], steps: number, useFlats = false): ChordToken[] {
  if (steps === 0) return chords;
  return chords.map(({ position, chord }) => ({
    position,
    chord: transposeChord(chord, steps, useFlats),
  }));
}

/** Transpone una canción completa (retorna nueva instancia, no muta) */
export function transposeSong(song: ParsedSong, steps: number): ParsedSong {
  if (steps === 0) return song;
  const useFlats = preferFlats(song);

  const sections: ParsedSection[] = song.sections.map((section) => ({
    ...section,
    lines: section.lines.map((line): ParsedLine => ({
      ...line,
      chords: transposeLine(line.chords, steps, useFlats),
    })),
  }));

  const originalKey = song.originalKey
    ? transposeChord(song.originalKey, steps, useFlats)
    : null;

  return { ...song, sections, originalKey };
}

/**
 * Calcula el tono de concierto dado el tono de toque y el cejillo.
 * Ej: tono D con capo 2 → concierto E
 */
export function concertKey(playingKey: string, capo: number): string {
  return transposeChord(playingKey, capo, false);
}

/** Lista de tonos para el selector de tono (cromática completa) */
export const ALL_KEYS = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
  'Db', 'Eb', 'Gb', 'Ab', 'Bb',
];
