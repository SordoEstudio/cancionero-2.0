import type { ChordToken, SongSectionWithLines } from '@/types';

export type VersionLineOverride = { chords: ChordToken[]; text: string | null };

/** Aplica filas de version_lines sobre las secciones ya inferidas (tono canónico). */
export function applyLineOverridesToSections(
  sections: SongSectionWithLines[],
  byLineId: ReadonlyMap<string, VersionLineOverride>
): SongSectionWithLines[] {
  return sections.map((sec) => ({
    ...sec,
    lines: sec.lines.map((line) => {
      const o = byLineId.get(line.id);
      if (!o) return line;
      return {
        ...line,
        chords: o.chords,
        text: o.text != null ? o.text : line.text,
      };
    }),
  }));
}
