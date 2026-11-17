import { isChord, isChordLine, extractChordsFromLine } from './chord-detector';
import type { ParsedLine } from '@/types';

type RawLineType = 'chord' | 'lyric' | 'blank' | 'section-label' | 'tab';

interface ClassifiedLine {
  type: RawLineType;
  raw: string;
  label?: string;
}

const SECTION_LABEL_REGEX =
  /^\s*\[?(?:intro|verse|estrofa|verso(?:\s+\d+)?|coro(?:\s+\d+)?|chorus(?:\s+\d+)?|puente|bridge|pre[-\s]?coro(?:\s+\d+)?|pre[-\s]?chorus(?:\s+\d+)?|solo|outro|final(?:\s+coral)?|interludio|interlude|inter(?:\s*coral)?|instrumental|tab(?:latura)?(?:\s*:\s*[^\]]*)?|secci[oó]n\s*\d+)\]?\s*:?\s*$/i;

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

/** Comentarios del autor al pegar desde foros / LaCuerda (no son letra). */
function isUserMetaCommentLine(line: string): boolean {
  const t = line.trim();
  if (t.length === 0) return false;
  if (/^este tema\b/i.test(t)) return true;
  if (/^anoten\b/i.test(t)) return true;
  if (/t[ií]tul\w*\s+en\s+portugu/i.test(t)) return true;
  if (/^bueno,\s+ojalá/i.test(t)) return true;
  if (/^la letra la saqué/i.test(t)) return true;
  if (/^y salif keita\b/i.test(t)) return true;
  if (/^paz y gracias/i.test(t)) return true;
  return false;
}

/**
 * Leyenda de digitación: "C: x32010", "Em* : x2200x", "Em(add9) : 075055",
 * "Gb7(#11) : 2x231x", "Am6(9) : 5x4500"
 */
function isChordDiagramLegendLine(line: string): boolean {
  const t = line.trim();
  if (/^ACORDES\s*:?\s*$/i.test(t)) return true;
  if (
    /^[A-G][#b]?(?:m|º|°|maj7?|dim|sus\d?|add\d?)?(?:\/[A-G][#b]?)?\s*:\s*x?\d[\dx]{3,}\s*$/i.test(t)
  )
    return true;

  const m = t.match(/^(.+?)\s*:\s*([0-9xo]+)\s*$/i);
  if (!m) return false;
  const left = m[1].replace(/\s+/g, ' ').trim();
  const right = m[2].trim();
  if (right.length < 3 || !/^[0-9xo]+$/i.test(right)) return false;
  if (!/^[A-G][#b]?/i.test(left)) return false;
  if (left.length > 44) return false;
  if (/\b(de|la|el|los|las|que|por|con|una|cuando|donde)\b/i.test(left)) return false;
  return true;
}

/** CifraClub: línea solo [Primera Parte], [Estribillo], [Pre-Estribillo]… */
const BRACKET_STRUCT_INNER =
  /^(?:(?:primera|segunda|tercera|cuarta|quinta|sexta)\s+parte|(?:pre[-\s]*)?estribillo|estribillo\s*\d*|pre[-\s]*estribillo|corte(?:\s+\d+)?|interludio|m[uú]sica)$/i;

function normalizeBracketInner(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function isBracketStructuralMarkerLine(line: string): boolean {
  const t = line.trim();
  const m = t.match(/^\[(.+)\]\s*$/);
  if (!m) return false;
  const innerRaw = m[1].trim();
  if (/^tab\b/i.test(innerRaw)) return false;

  const compact = innerRaw.replace(/\s/g, '');
  if (compact.length <= 16 && isChord(compact)) return false;

  const innerNorm = normalizeBracketInner(innerRaw);
  return BRACKET_STRUCT_INNER.test(innerNorm);
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
  if (isUserMetaCommentLine(line)) return { type: 'blank', raw: line };
  if (isBracketStructuralMarkerLine(line)) return { type: 'blank', raw: line };
  if (isChordDiagramLegendLine(line)) return { type: 'blank', raw: line };
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
