import { classifyAndPairLines, splitIntoBlocks } from './line-classifier';
import { inferChordsInSections } from './chord-inference';
import { isChordLine, detectMainKey } from './chord-detector';
import {
  detectAllSectionTypes,
  detectSectionType,
  explicitSectionTypeFromLabel,
} from '@/lib/structure';
import { mergeParentheticalChordsInSections } from './chord-inference';
import type { ParsedSong, ParsedSection, SectionType } from '@/types';
import type { RawSongData } from '@/lib/scraper/types';

interface ParseOptions {
  /** Repetir acordes en secciones de solo letra (útil para LaCuerda/CifraClub). Default: true. */
  inferChords?: boolean;
  /**
   * Texto ya normalizado por Gemini con [Sección]: respeta etiqueta y tipo explícitos
   * y evita reclasificar por heurísticas de repetición (verso↔coro).
   */
  geminiStructured?: boolean;
}

export function parseSong(raw: RawSongData, opts?: ParseOptions): ParsedSong {
  const { inferChords = true, geminiStructured = false } = opts ?? {};
  const blocks = splitIntoBlocks(raw.rawContent);

  // Only pass actual chord lines; blank separator between blocks so
  // detectMainKey can apply section-first bonuses correctly.
  const keyLines: string[] = [];
  for (const block of blocks) {
    let added = false;
    for (const line of block.rawLines) {
      if (isChordLine(line)) {
        keyLines.push(line);
        added = true;
      }
    }
    if (added) keyLines.push('');
  }
  const originalKey = detectMainKey(keyLines);

  const types = geminiStructured
    ? blocks.map((block, idx) => {
        const explicit = explicitSectionTypeFromLabel(block.label);
        return explicit ?? detectSectionType(block, idx, blocks.length, blocks);
      })
    : detectAllSectionTypes(blocks);

  // Contar cuántas veces aparece cada tipo para decidir si numerar
  const typeCounts: Record<string, number> = {};
  for (const t of types) typeCounts[t] = (typeCounts[t] ?? 0) + 1;

  const counters: Record<string, number> = {};

  const sectionsRaw: ParsedSection[] = blocks.map((block, idx) => {
    const lines = classifyAndPairLines(block.rawLines.join('\n'));
    const sectionType = types[idx];
    counters[sectionType] = (counters[sectionType] ?? 0) + 1;
    const showNumber = typeCounts[sectionType] > 1;

    const labelFromGemini =
      geminiStructured && block.label?.trim() ? block.label.trim() : null;
    const label =
      labelFromGemini ??
      block.label ??
      formatLabel(sectionType, showNumber ? counters[sectionType] : 0);

    return {
      type: sectionType,
      label,
      lines,
    };
  });

  let sections: ParsedSection[];
  if (geminiStructured) {
    sections = inferChords
      ? inferChordsInSections(sectionsRaw)
      : mergeParentheticalChordsInSections(sectionsRaw);
  } else {
    sections = inferChords ? inferChordsInSections(sectionsRaw) : sectionsRaw;
  }

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
    tab: 'Tablatura',
    unknown: 'Sección',
  };
  const base = labels[type] ?? 'Sección';
  return num > 0 ? `${base} ${num}` : base;
}
