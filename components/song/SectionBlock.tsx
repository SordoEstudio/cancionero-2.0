'use client';

import { ChevronRight } from 'lucide-react';
import type { ChordToken, SongSectionWithLines, ViewMode, SectionType } from '@/types';
import { ChordLine } from './ChordLine';
import { LineEditRow } from './LineEditRow';
import { ICON_STROKE } from '@/components/ui/icon-tokens';

interface SectionBlockProps {
  section: SongSectionWithLines;
  chordTransposeSteps: number;
  viewMode: ViewMode;
  useFlats?: boolean;
  editMode?: boolean;
  editSession?: number;
  /** For tab sections: controlled visibility from parent (global + per-section). */
  tabVisible?: boolean;
  /** Called when user clicks the per-section tab toggle. */
  onToggleTab?: () => void;
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
  tab:          'text-[var(--section-intro)]  border-[var(--section-intro)]',
  unknown:      'text-[var(--section-default)] border-[var(--section-default)]',
};

export function SectionBlock({
  section,
  chordTransposeSteps,
  viewMode,
  useFlats,
  editMode = false,
  editSession = 0,
  tabVisible,
  onToggleTab,
  onUpdateLine,
}: SectionBlockProps) {
  const colorClass = SECTION_COLORS[section.type] ?? SECTION_COLORS.unknown;
  const isTab = section.type === 'tab';
  const expanded = tabVisible ?? true;

  if (isTab) {
    return (
      <div className="mb-6">
        <button
          type="button"
          onClick={onToggleTab}
          className={`inline-flex items-center gap-1 mb-2 border-l-2 pl-2 text-xs font-semibold uppercase tracking-widest cursor-pointer hover:opacity-80 transition-opacity ${colorClass}`}
        >
          <ChevronRight
            size={14}
            strokeWidth={ICON_STROKE}
            className={`shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
            aria-hidden
          />
          {section.label}
        </button>

        {expanded && (
          <pre className="song-content overflow-x-auto font-mono text-xs leading-relaxed text-[var(--text-secondary)] bg-[var(--bg-elevated)] rounded-lg p-3 whitespace-pre">
            {section.lines.map((l) => l.text).join('\n')}
          </pre>
        )}
      </div>
    );
  }

  return (
    <div className="mb-6">
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
