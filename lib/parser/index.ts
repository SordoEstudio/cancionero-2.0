import { classifyAndPairLines, splitIntoBlocks } from './line-classifier';
import { inferChordsInSections } from './chord-inference';
import { detectMainKey } from './chord-detector';
import { detectAllSectionTypes } from '@/lib/structure';
import type { ParsedSong, ParsedSection, SectionType } from '@/types';
import type { RawSongData } from '@/lib/scraper/types';

interface ParseOptions {
  /** Repetir acordes en secciones de solo letra (útil para LaCuerda/CifraClub). Default: true. */
  inferChords?: boolean;
}

export function parseSong(raw: RawSongData, opts?: ParseOptions): ParsedSong {
  const { inferChords = true } = opts ?? {};
  const blocks = splitIntoBlocks(raw.rawContent);

  const allChordLines: string[] = [];
  for (const block of blocks) {
    for (const line of block.rawLines) {
      if (line.trim()) allChordLines.push(line);
    }
  }
  const originalKey = detectMainKey(allChordLines);

  // Detectar tipos con contexto completo
  const types = detectAllSectionTypes(blocks);

  // Contar cuántas veces aparece cada tipo para decidir si numerar
  const typeCounts: Record<string, number> = {};
  for (const t of types) typeCounts[t] = (typeCounts[t] ?? 0) + 1;

  const counters: Record<string, number> = {};

  const sectionsRaw: ParsedSection[] = blocks.map((block, idx) => {
    const lines = classifyAndPairLines(block.rawLines.join('\n'));
    const sectionType = types[idx];
    counters[sectionType] = (counters[sectionType] ?? 0) + 1;
    const showNumber = typeCounts[sectionType] > 1;

    return {
      type: sectionType,
      label: block.label ?? formatLabel(sectionType, showNumber ? counters[sectionType] : 0),
      lines,
    };
  });

  const sections = inferChords ? inferChordsInSections(sectionsRaw) : sectionsRaw;

  return {
    title: raw.title,
    artist: raw.artist,
    sourceUrl: raw.sourceUrl,
    originalKey,
    sections,
  };
}

function formatLabel(type: SectionType | string, num: number): string {
  const labels: Record<string, string> = {
    intro: 'Intro',
    verse: 'Verso',
    'pre-chorus': 'Pre-coro',
    chorus: 'Coro',
    bridge: 'Puente',
    solo: 'Solo',
    outro: 'Final',
    unknown: 'Sección',
  };
  const base = labels[type] ?? 'Sección';
  return num > 0 ? `${base} ${num}` : base;
}
