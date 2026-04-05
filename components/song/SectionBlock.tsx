'use client';

import type { ChordToken, SongSectionWithLines, ViewMode, SectionType } from '@/types';
import { ChordLine } from './ChordLine';
import { LineEditRow } from './LineEditRow';

interface SectionBlockProps {
  section: SongSectionWithLines;
  /** Pasos de transporte en pantalla (tono − cejilla). */
  chordTransposeSteps: number;
  viewMode: ViewMode;
  useFlats?: boolean;
  editMode?: boolean;
  /** Incrementar al abrir modo edición (resetea borradores de acordes por línea). */
  editSession?: number;
  onUpdateLine?: (
    lineId: string,
    patch: { chords?: ChordToken[]; text?: string }
  ) => void;
}

const SECTION_COLORS: Record<SectionType, string> = {
  intro:        'text-[var(--section-intro)]  border-[var(--section-intro)]',
  verse:        'text-[var(--section-verse)]  border-[var(--section-verse)]',
  'pre-chorus': 'text-[var(--section-bridge)] border-[var(--section-bridge)]',
  chorus:       'text-[var(--section-chorus)] border-[var(--section-chorus)]',
  bridge:       'text-[var(--section-bridge)] border-[var(--section-bridge)]',
  solo:         'text-[var(--section-intro)]  border-[var(--section-intro)]',
  outro:        'text-[var(--section-default)] border-[var(--section-default)]',
  unknown:      'text-[var(--section-default)] border-[var(--section-default)]',
};

export function SectionBlock({
  section,
  chordTransposeSteps,
  viewMode,
  useFlats,
  editMode = false,
  editSession = 0,
  onUpdateLine,
}: SectionBlockProps) {
  const colorClass = SECTION_COLORS[section.type] ?? SECTION_COLORS.unknown;

  return (
    <div className="mb-6">
      {/* Etiqueta de sección */}
      <div className={`inline-flex items-center gap-1.5 mb-2 border-l-2 pl-2 text-xs font-semibold uppercase tracking-widest ${colorClass}`}>
        {section.label}
      </div>

      <div className="song-content">
        {editMode && onUpdateLine
          ? section.lines.map((line) => (
              <LineEditRow
                key={`${line.id}-${editSession}`}
                line={line}
                onChange={(patch) => onUpdateLine(line.id, patch)}
              />
            ))
          : section.lines.map((line) => (
              <ChordLine
                key={line.id}
                chords={line.chords}
                text={line.text}
                transposeSteps={chordTransposeSteps}
                viewMode={viewMode}
                useFlats={useFlats}
              />
            ))}
      </div>
    </div>
  );
}
