import { isChordLine, extractChordsFromLine } from './chord-detector';
import type { ParsedLine } from '@/types';

type RawLineType = 'chord' | 'lyric' | 'blank' | 'section-label' | 'tab';

interface ClassifiedLine {
  type: RawLineType;
  raw: string;
  label?: string;
}

const SECTION_LABEL_REGEX =
  /^\s*\[?(?:intro|verse|estrofa|verso|coro|chorus|puente|bridge|pre[-\s]?coro|pre[-\s]?chorus|solo|outro|final|interludio|interlude|tab(?:latura)?(?:\s*:\s*[^\]]*)?)\]?\s*:?\s*$/i;

/**
 * Guitar tablature: a string letter (e/B/G/D/A/E) followed by a long run of
 * dashes, pipe chars, digits and ornaments. Also matches lines that are >=30%
 * dashes and at least 20 chars (catches incomplete or unusual TAB formats).
 */
export function isTabLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 10) return false;
  if (/^[eEBGDA]\s*[-|0-9hpb/\\~x()s\s]{8,}$/.test(t)) return true;
  if (t.length >= 20) {
    const dashes = t.split('').filter((c) => c === '-').length;
    if (dashes / t.length > 0.3) return true;
  }
  return false;
}

/**
 * Lines starting with * are user comments (common in LaCuerda submissions).
 * Also catches common page/site noise that slips through scrapers.
 */
function isNoiseLine(line: string): boolean {
  const t = line.trim();
  if (t.startsWith('*')) return true;
  if (/^https?:\/\//.test(t)) return true;
  return false;
}

/**
 * Prose that introduces or describes the song but isn't lyrics or chords.
 * Common in LaCuerda pasted content: "Aca va una transcripción de..."
 */
function isProseLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 30) return false;
  const words = t.split(/\s+/).length;
  if (words < 6) return false;
  // High ratio of lowercase words with common Spanish prose markers
  if (/\b(?:transcripci[oó]n|versi[oó]n|aqu[ií]|ac[aá]|esta es|les dejo|escuchen|disco|del album)\b/i.test(t)) return true;
  return false;
}

let _inNoiseBlock = false;

function classifyLine(line: string): ClassifiedLine {
  if (line.trim() === '') {
    _inNoiseBlock = false;
    return { type: 'blank', raw: line };
  }
  if (SECTION_LABEL_REGEX.test(line)) {
    _inNoiseBlock = false;
    return { type: 'section-label', raw: line, label: line.trim().replace(/[\[\]:]/g, '').trim() };
  }
  if (isTabLine(line)) {
    _inNoiseBlock = false;
    return { type: 'tab', raw: line };
  }
  if (isNoiseLine(line)) {
    _inNoiseBlock = true;
    return { type: 'blank', raw: line };
  }
  // Continuation of a * comment block (lines after * until blank/chord/tab)
  if (_inNoiseBlock && !isChordLine(line)) {
    return { type: 'blank', raw: line };
  }
  _inNoiseBlock = false;
  if (isChordLine(line)) return { type: 'chord', raw: line };
  if (isProseLine(line)) return { type: 'blank', raw: line };
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
  _inNoiseBlock = false;
  const rawLines = rawText.split('\n');
  const classified = rawLines.map((l) => classifyLine(l));
  const result: ParsedLine[] = [];

  let i = 0;
  while (i < classified.length) {
    const current = classified[i];

    if (current.type === 'blank' || current.type === 'section-label') {
      i++;
      continue;
    }

    if (current.type === 'tab') {
      result.push({ chords: [], text: current.raw });
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

type SegmentKind = 'instrumental' | 'chord-lyric' | 'lyrics-only' | 'tab';

interface AtomicSegment {
  lines: string[];
  label: string | null;
  doubleBlankBefore: boolean;
  kind: SegmentKind;
}

function segmentKind(lines: string[]): SegmentKind {
  const hasTabs = lines.some((l) => isTabLine(l));
  if (hasTabs) return 'tab';

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
  _inNoiseBlock = false;
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
