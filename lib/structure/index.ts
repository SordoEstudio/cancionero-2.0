import type { SectionType } from '@/types';
import type { RawBlock } from '@/lib/parser/line-classifier';
import { isTabLine } from '@/lib/parser/line-classifier';
import { isChordLine } from '@/lib/parser/chord-detector';

const LABEL_MAP: Record<string, SectionType> = {
  intro: 'intro',
  introducción: 'intro',
  interludio: 'intro',
  interlude: 'intro',
  estrofa: 'verse',
  verso: 'verse',
  verse: 'verse',
  'pre-coro': 'pre-chorus',
  'pre coro': 'pre-chorus',
  'pre-chorus': 'pre-chorus',
  precoro: 'pre-chorus',
  coro: 'chorus',
  chorus: 'chorus',
  estribillo: 'chorus',
  refrán: 'chorus',
  puente: 'bridge',
  bridge: 'bridge',
  solo: 'solo',
  outro: 'outro',
  final: 'outro',
  fin: 'outro',
  tab: 'tab',
  tablatura: 'tab',
};

/**
 * Hash basado en texto completo (letra + acordes) para detectar bloques idénticos.
 */
function blockHash(block: RawBlock): string {
  return block.rawLines
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean)
    .join('|');
}

/**
 * Hash basado solo en la progresión de acordes (ignora letra).
 * Permite detectar que dos versos con diferente letra pero misma armonía
 * son el mismo tipo de sección.
 */
function chordHash(block: RawBlock): string {
  return block.rawLines
    .filter((l) => isChordLine(l))
    .map((l) => l.trim().replace(/\s+/g, ' ').toLowerCase())
    .join('|');
}

function isInstrumentalBlock(block: RawBlock): boolean {
  return block.rawLines.every((l) => {
    const t = l.trim();
    return t === '' || isChordLine(t);
  });
}

/**
 * Detecta el SectionType de un bloque usando:
 *   1. Etiqueta explícita
 *   2. Contenido instrumental (solo acordes, sin letra)
 *   3. Heurísticas de repetición y posición
 */
export function detectSectionType(
  block: RawBlock,
  index: number,
  totalBlocks: number,
  allBlocks?: RawBlock[]
): SectionType {
  // 1. Etiqueta explícita
  if (block.label) {
    const normalized = block.label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    for (const [key, type] of Object.entries(LABEL_MAP)) {
      if (normalized.includes(key)) return type;
    }
  }

  // 2. Tablature: lines that look like guitar TAB
  if (block.rawLines.some((l) => isTabLine(l))) return 'tab';

  // 3. Instrumental: solo líneas de acordes, ninguna letra
  if (isInstrumentalBlock(block)) {
    if (index === 0) return 'intro';
    if (index === totalBlocks - 1) return 'outro';
    return 'solo';
  }

  // 3. Heurísticas con contexto
  if (!allBlocks) return 'verse';

  // Exact text match — identical blocks (same lyrics AND chords)
  const textHashes = allBlocks.map(blockHash);
  const currentTextHash = textHashes[index];
  const textOccurrences = textHashes.filter((h) => h === currentTextHash).length;

  // Chord-only match — same harmonic progression, different lyrics
  const cHashes = allBlocks.map(chordHash);
  const currentCHash = cHashes[index];
  const chordOccurrences = currentCHash ? cHashes.filter((h) => h === currentCHash).length : 0;

  // Blocks with no chords at all (lyrics-only) — don't use chord hash
  const hasChords = currentCHash.length > 0;

  // Último bloque con letra/acordes únicos → outro
  if (index === totalBlocks - 1 && textOccurrences === 1 && chordOccurrences <= 1) return 'outro';

  // Exact text repeated → chorus (strongest signal)
  if (textOccurrences > 1) {
    const maxTextOcc = Math.max(...textHashes.map((h) => textHashes.filter((x) => x === h).length));
    if (textOccurrences === maxTextOcc) return 'chorus';
  }

  // Same chord progression appears multiple times → same section type
  if (hasChords && chordOccurrences > 1) {
    const chordOccCounts = cHashes.filter(Boolean).map((h) => cHashes.filter((x) => x === h).length);
    const maxChordOcc = Math.max(...chordOccCounts);
    if (chordOccurrences === maxChordOcc && chordOccurrences > 1) {
      const uniqueChordHashes = new Set(cHashes.filter(Boolean));
      if (uniqueChordHashes.size > 1) return 'chorus';
    }
  }

  // Among chord-lyric blocks with unique progressions:
  if (hasChords && chordOccurrences === 1) {
    const chordBlocks = allBlocks
      .map((b, i) => ({ b, i, ch: cHashes[i] }))
      .filter((x) => x.ch.length > 0);

    // When we have 2+ chord-lyric blocks with DIFFERENT progressions, the 2nd is likely chorus
    // (standard structure: verse → chorus → lyrics-only repeat)
    if (chordBlocks.length >= 2) {
      const uniqueProgressions = new Set(chordBlocks.map((x) => x.ch));
      if (uniqueProgressions.size >= 2) {
        const myPos = chordBlocks.findIndex((x) => x.i === index);
        // Second chord-lyric block (index 1+) with different chords → chorus
        if (myPos >= 1) return 'chorus';
      }

      // Shorter-than-median block → likely chorus
      const lineCountsSorted = chordBlocks
        .map((x) => x.b.rawLines.filter((l) => l.trim()).length)
        .sort((a, b) => a - b);
      const myLines = block.rawLines.filter((l) => l.trim()).length;
      const median = lineCountsSorted[Math.floor(lineCountsSorted.length / 2)];
      if (index > 0 && myLines < median) return 'chorus';
    }

    // Unique progression in the second half → bridge
    if (index > totalBlocks * 0.5) return 'bridge';
  }

  return 'verse';
}

/**
 * Detecta tipos de todas las secciones con contexto completo.
 */
export function detectAllSectionTypes(blocks: RawBlock[]): SectionType[] {
  return blocks.map((block, idx) =>
    detectSectionType(block, idx, blocks.length, blocks)
  );
}
