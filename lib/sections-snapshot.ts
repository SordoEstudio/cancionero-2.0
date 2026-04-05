import type { SongSectionWithLines } from '@/types';

/** Comparación estable de secciones (líneas, acordes, texto) para detectar cambios sin guardar. */
export function sectionsSnapshot(sections: SongSectionWithLines[]): string {
  return JSON.stringify(
    sections.map((s) => ({
      id: s.id,
      lines: s.lines.map((l) => ({
        id: l.id,
        text: l.text,
        chords: l.chords.map((c) => ({ position: c.position, chord: c.chord })),
      })),
    }))
  );
}
