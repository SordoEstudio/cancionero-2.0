import { classifyAndPairLines, splitIntoBlocks } from './line-classifier';
import { inferChordsInSections } from './chord-inference';
import { detectMainKey } from './chord-detector';
import { detectSectionType } from '@/lib/structure';
import type { ParsedSong, ParsedSection } from '@/types';
import type { RawSongData } from '@/lib/scraper/types';

export function parseSong(raw: RawSongData): ParsedSong {
  const blocks = splitIntoBlocks(raw.rawContent);

  // Recolectar todas las líneas de acorde para detectar la tonalidad
  const allChordLines: string[] = [];
  for (const block of blocks) {
    for (const line of block.rawLines) {
      if (line.trim()) allChordLines.push(line);
    }
  }
  const originalKey = detectMainKey(allChordLines);

  const sectionsRaw: ParsedSection[] = blocks.map((block, idx) => {
    const lines = classifyAndPairLines(block.rawLines.join('\n'));
    const sectionType = detectSectionType(block, idx, blocks.length);

    return {
      type: sectionType,
      label: block.label ?? formatLabel(sectionType, idx),
      lines,
    };
  });

  const sections = inferChordsInSections(sectionsRaw);

  return {
    title: raw.title,
    artist: raw.artist,
    sourceUrl: raw.sourceUrl,
    originalKey,
    sections,
  };
}

function formatLabel(type: string, idx: number): string {
  const labels: Record<string, string> = {
    intro: 'Intro',
    verse: `Estrofa ${idx}`,
    'pre-chorus': 'Pre-coro',
    chorus: 'Coro',
    bridge: 'Puente',
    solo: 'Solo',
    outro: 'Final',
    unknown: `Sección ${idx + 1}`,
  };
  return labels[type] ?? `Sección ${idx + 1}`;
}
