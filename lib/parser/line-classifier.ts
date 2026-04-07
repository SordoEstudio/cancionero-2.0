import { isChordLine, extractChordsFromLine } from './chord-detector';
import type { ParsedLine } from '@/types';

type RawLineType = 'chord' | 'lyric' | 'blank' | 'section-label';

interface ClassifiedLine {
  type: RawLineType;
  raw: string;
  label?: string;
}

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
 * Empareja líneas de acorde con la línea de letra siguiente:
 *
 *   chord + lyric → ParsedLine con chords + text
 *   chord sola    → ParsedLine con chords, text=""
 *   lyric sola    → ParsedLine con chords=[], text
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

// ─── Block splitting ─────────────────────────────────────────────────────────

export interface RawBlock {
  label: string | null;
  rawLines: string[];
}

type SegmentKind = 'instrumental' | 'chord-lyric' | 'lyrics-only';

interface AtomicSegment {
  lines: string[];
  label: string | null;
  doubleBlankBefore: boolean;
  kind: SegmentKind;
}

function segmentKind(lines: string[]): SegmentKind {
  const hasChords = lines.some((l) => isChordLine(l));
  const hasLyrics = lines.some((l) => {
    const t = l.trim();
    return t.length > 0 && !isChordLine(l);
  });
  if (hasChords && hasLyrics) return 'chord-lyric';
  if (hasChords) return 'instrumental';
  return 'lyrics-only';
}

/**
 * Agrupa las líneas del contenido en bloques musicales coherentes.
 *
 * Estrategia en dos fases:
 *   1. Cortar en segmentos atómicos (líneas consecutivas sin blancos).
 *   2. Fusionar segmentos consecutivos del mismo tipo (instrumental,
 *      acorde+letra, solo letra) salvo que haya doble línea en blanco
 *      o etiqueta de sección de por medio.
 */
export function splitIntoBlocks(rawText: string): RawBlock[] {
  const allLines = rawText.split('\n');

  // ── Phase 1: atomic segments ──────────────────────────────────────────────

  const segments: AtomicSegment[] = [];
  let accLines: string[] = [];
  let accLabel: string | null = null;
  let blankRun = 0;
  let pendingDouble = false;

  function flushSeg() {
    if (accLines.length === 0) return;
    segments.push({
      lines: [...accLines],
      label: accLabel,
      doubleBlankBefore: pendingDouble,
      kind: segmentKind(accLines),
    });
    accLines = [];
    accLabel = null;
    pendingDouble = false;
  }

  for (const line of allLines) {
    const cl = classifyLine(line);

    if (cl.type === 'section-label') {
      flushSeg();
      accLabel = cl.label ?? null;
      blankRun = 0;
      continue;
    }

    if (cl.type === 'blank') {
      blankRun++;
      continue;
    }

    // Content line
    if (blankRun > 0 && accLines.length > 0) {
      flushSeg();
      pendingDouble = blankRun >= 2;
    } else if (blankRun >= 2 && accLines.length === 0) {
      pendingDouble = true;
    }

    blankRun = 0;
    accLines.push(line);
  }

  flushSeg();

  // ── Phase 2: merge same-kind consecutive segments ─────────────────────────

  const blocks: RawBlock[] = [];
  let blockLines: string[] = [];
  let blockLabel: string | null = null;
  let blockKind: SegmentKind | null = null;

  function flushBlock() {
    if (blockLines.length === 0) return;
    blocks.push({ label: blockLabel, rawLines: [...blockLines] });
    blockLines = [];
    blockLabel = null;
    blockKind = null;
  }

  for (const seg of segments) {
    const mustSplit =
      seg.doubleBlankBefore ||
      seg.label !== null ||
      (blockKind !== null && seg.kind !== blockKind);

    if (mustSplit) flushBlock();

    if (blockLabel === null && seg.label !== null) {
      blockLabel = seg.label;
    }

    blockLines.push(...seg.lines);
    blockKind = seg.kind;
  }

  flushBlock();
  return blocks;
}
