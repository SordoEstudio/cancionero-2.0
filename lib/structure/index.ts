import type { SectionType } from '@/types';
import type { RawBlock } from '@/lib/parser/line-classifier';

// Etiquetas explícitas mapeadas a SectionType
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

/** Hash de contenido de un bloque para detectar repeticiones */
function blockHash(block: RawBlock): string {
  return block.rawLines
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean)
    .join('|');
}

/**
 * Detecta el SectionType de un bloque usando:
 * 1. Etiqueta explícita (la más confiable)
 * 2. Heurísticas por posición y repetición
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

  // 2. Heurísticas posicionales
  if (!allBlocks) return 'unknown';

  const hashes = allBlocks.map(blockHash);
  const currentHash = hashes[index];
  const occurrences = hashes.filter((h) => h === currentHash).length;

  // Primero bloque corto sin acordes → intro
  if (index === 0 && block.rawLines.length <= 4) return 'intro';

  // Último bloque → outro
  if (index === totalBlocks - 1 && occurrences === 1) return 'outro';

  // Bloque más repetido → chorus
  const maxOccurrences = Math.max(...hashes.map((h) => hashes.filter((x) => x === h).length));
  if (occurrences === maxOccurrences && occurrences > 1) return 'chorus';

  // Bloque único al final → bridge
  if (occurrences === 1 && index > totalBlocks * 0.6) return 'bridge';

  // Por defecto → verse
  return 'verse';
}

/**
 * Versión completa con contexto de todos los bloques.
 * Usada para detectar chorus/bridge con heurísticas de repetición.
 */
export function detectAllSectionTypes(blocks: RawBlock[]): SectionType[] {
  return blocks.map((block, idx) =>
    detectSectionType(block, idx, blocks.length, blocks)
  );
}
