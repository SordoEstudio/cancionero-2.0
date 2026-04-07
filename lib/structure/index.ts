import type { SectionType } from '@/types';
import type { RawBlock } from '@/lib/parser/line-classifier';
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
};

function blockHash(block: RawBlock): string {
  return block.rawLines
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean)
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

  // 2. Instrumental: solo líneas de acordes, ninguna letra
  if (isInstrumentalBlock(block)) {
    if (index === 0) return 'intro';
    if (index === totalBlocks - 1) return 'outro';
    return 'solo';
  }

  // 3. Heurísticas con contexto
  if (!allBlocks) return 'verse';

  const hashes = allBlocks.map(blockHash);
  const currentHash = hashes[index];
  const occurrences = hashes.filter((h) => h === currentHash).length;

  // Último bloque único → outro
  if (index === totalBlocks - 1 && occurrences === 1) return 'outro';

  // Bloque más repetido (si aparece >1 vez) → chorus
  const maxOcc = Math.max(
    ...hashes.map((h) => hashes.filter((x) => x === h).length)
  );
  if (occurrences === maxOcc && occurrences > 1) return 'chorus';

  // Bloque único en la zona final → bridge
  if (occurrences === 1 && index > totalBlocks * 0.6) return 'bridge';

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
