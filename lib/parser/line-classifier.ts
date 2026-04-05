import { isChordLine, extractChordsFromLine } from './chord-detector';
import type { ParsedLine } from '@/types';

type RawLineType = 'chord' | 'lyric' | 'blank' | 'section-label';

interface ClassifiedLine {
  type: RawLineType;
  raw: string;
  /** Solo para type === 'section-label' */
  label?: string;
}

// Etiquetas de sección en español/portugués/inglés
const SECTION_LABEL_REGEX =
  /^\s*\[?(?:intro|verse|estrofa|verso|coro|chorus|puente|bridge|pre[-\s]?coro|pre[-\s]?chorus|solo|outro|final|interludio|interlude)\]?\s*:?\s*$/i;

function classifyLine(line: string): ClassifiedLine {
  if (line.trim() === '') return { type: 'blank', raw: line };
  if (SECTION_LABEL_REGEX.test(line)) {
    return { type: 'section-label', raw: line, label: line.trim().replace(/[\[\]:]/g, '').trim() };
  }
  if (isChordLine(line)) return { type: 'chord', raw: line };
  return { type: 'lyric', raw: line };
}

/**
 * Algoritmo de dos pasadas:
 * 1. Clasifica cada línea
 * 2. Empareja líneas de acorde con la línea de letra siguiente
 *
 * Una línea de acorde seguida de una línea de letra → ParsedLine con chords + text
 * Una línea de acorde sola (seguida de blank o acorde) → ParsedLine con chords, text=""
 * Una línea de letra sola → ParsedLine con chords=[], text
 */
export function classifyAndPairLines(rawText: string): ParsedLine[] {
  const rawLines = rawText.split('\n');
  const classified = rawLines.map(classifyLine);
  const result: ParsedLine[] = [];

  let i = 0;
  while (i < classified.length) {
    const current = classified[i];

    if (current.type === 'blank' || current.type === 'section-label') {
      i++;
      continue;
    }

    if (current.type === 'chord') {
      const chords = extractChordsFromLine(current.raw);
      const next = classified[i + 1];

      if (next && next.type === 'lyric') {
        result.push({ chords, text: next.raw });
        i += 2;
      } else {
        // Línea de acordes sola (instrumental)
        result.push({ chords, text: '' });
        i++;
      }
      continue;
    }

    if (current.type === 'lyric') {
      result.push({ chords: [], text: current.raw });
      i++;
      continue;
    }

    i++;
  }

  return result;
}

/**
 * Detecta etiquetas de sección y retorna los bloques con sus labels.
 * Separa el contenido en bloques delimitados por labels o líneas vacías.
 */
export interface RawBlock {
  label: string | null;
  rawLines: string[];
}

export function splitIntoBlocks(rawText: string): RawBlock[] {
  const lines = rawText.split('\n');
  const blocks: RawBlock[] = [];
  let currentLabel: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    const classified = classifyLine(line);

    if (classified.type === 'section-label') {
      if (currentLines.some((l) => l.trim())) {
        blocks.push({ label: currentLabel, rawLines: currentLines });
      }
      currentLabel = classified.label ?? null;
      currentLines = [];
      continue;
    }

    if (classified.type === 'blank') {
      if (currentLines.some((l) => l.trim())) {
        // Blank line = nuevo bloque si hay contenido acumulado
        blocks.push({ label: currentLabel, rawLines: currentLines });
        currentLabel = null;
        currentLines = [];
      }
      continue;
    }

    currentLines.push(line);
  }

  if (currentLines.some((l) => l.trim())) {
    blocks.push({ label: currentLabel, rawLines: currentLines });
  }

  return blocks;
}
