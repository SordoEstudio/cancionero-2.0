import type { SongLineWithId, SongSectionWithLines, VersionOverride } from '@/types';

function chordsEqual(a: SongLineWithId['chords'], b: SongLineWithId['chords']): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (t, i) => t.position === b[i]?.position && t.chord === b[i]?.chord
  );
}

/** Líneas que cambiaron respecto al original (para POST /api/save-version). */
export function buildVersionOverrides(
  original: SongSectionWithLines[],
  edited: SongSectionWithLines[]
): VersionOverride[] {
  const origById = new Map<string, SongLineWithId>();
  for (const sec of original) {
    for (const line of sec.lines) {
      origById.set(line.id, line);
    }
  }

  const overrides: VersionOverride[] = [];

  for (const sec of edited) {
    for (const line of sec.lines) {
      const o = origById.get(line.id);
      if (!o) continue;

      const chordsChanged = !chordsEqual(o.chords, line.chords);
      const textChanged = o.text !== line.text;

      if (chordsChanged || textChanged) {
        overrides.push({
          songLineId: line.id,
          chords: line.chords,
          ...(textChanged ? { text: line.text } : {}),
        });
      }
    }
  }

  return overrides;
}
