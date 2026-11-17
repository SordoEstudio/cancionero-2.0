'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronRight, Pencil, Check, Trash2, StickyNote, Copy, ClipboardPaste } from 'lucide-react';
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
  tabVisible?: boolean;
  onToggleTab?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onDeleteSection?: () => void;
  onRenameSection?: (newLabel: string) => void;
  sectionNote?: string;
  onSectionNoteChange?: (note: string) => void;
  onUpdateLine?: (
    lineId: string,
    patch: { chords?: ChordToken[]; text?: string }
  ) => void;
  hasCopiedPattern?: boolean;
  onCopyChords?: () => void;
  onPasteChords?: () => void;
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
  collapsed = false,
  onToggleCollapse,
  onDeleteSection,
  onRenameSection,
  sectionNote,
  onSectionNoteChange,
  onUpdateLine,
  hasCopiedPattern,
  onCopyChords,
  onPasteChords,
}: SectionBlockProps) {
  const colorClass = SECTION_COLORS[section.type] ?? SECTION_COLORS.unknown;
  const isTab = section.type === 'tab';
  const expanded = isTab ? (tabVisible ?? true) : !collapsed;

  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(section.label);
  const [noteOpen, setNoteOpen] = useState(() => !!sectionNote);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renaming]);

  function commitRename() {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== section.label && onRenameSection) {
      onRenameSection(trimmed);
    }
    setRenaming(false);
  }

  const handleToggle = isTab ? onToggleTab : onToggleCollapse;

  // Section label bar
  const labelBar = (
    <div className="group/label flex items-center gap-1 mb-2">
      <button
        type="button"
        onClick={handleToggle}
        className={`inline-flex items-center gap-1 border-l-2 pl-2 text-xs font-semibold uppercase tracking-widest cursor-pointer hover:opacity-80 transition-all ${colorClass}`}
      >
        <ChevronRight
          size={14}
          strokeWidth={ICON_STROKE}
          className={`shrink-0 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
          aria-hidden
        />
        {renaming ? (
          <input
            ref={renameRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') { setRenameValue(section.label); setRenaming(false); }
            }}
            onClick={(e) => e.stopPropagation()}
            className="bg-transparent border-b border-current text-xs font-semibold uppercase tracking-widest outline-none w-24 sm:w-32"
          />
        ) : (
          <span>{section.label}</span>
        )}
      </button>

      {/* Edit/hide actions — only in edit mode */}
      {editMode && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover/label:opacity-100 transition-opacity">
          {onRenameSection && !renaming && (
            <button
              type="button"
              title="Renombrar sección"
              onClick={(e) => { e.stopPropagation(); setRenameValue(section.label); setRenaming(true); }}
              className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
            >
              <Pencil size={12} strokeWidth={ICON_STROKE} aria-hidden />
            </button>
          )}
          {renaming && (
            <button
              type="button"
              title="Confirmar"
              onClick={(e) => { e.stopPropagation(); commitRename(); }}
              className="p-0.5 rounded text-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            >
              <Check size={12} strokeWidth={ICON_STROKE} aria-hidden />
            </button>
          )}
          {onDeleteSection && !renaming && (
            <button
              type="button"
              title="Eliminar sección"
              onClick={(e) => { e.stopPropagation(); onDeleteSection(); }}
              className="p-0.5 rounded text-[var(--text-muted)] hover:text-red-500 transition-colors"
            >
              <Trash2 size={12} strokeWidth={ICON_STROKE} aria-hidden />
            </button>
          )}
          {onSectionNoteChange && !renaming && (
            <button
              type="button"
              title={noteOpen ? 'Ocultar nota' : 'Agregar nota a esta sección'}
              onClick={(e) => { e.stopPropagation(); setNoteOpen((o) => !o); }}
              className={`p-0.5 rounded transition-colors ${noteOpen || sectionNote ? 'text-amber-500' : 'text-[var(--text-muted)] hover:text-amber-500'}`}
            >
              <StickyNote size={12} strokeWidth={ICON_STROKE} aria-hidden />
            </button>
          )}
          {onCopyChords && !renaming && (
            <button
              type="button"
              title="Copiar acordes de esta sección"
              onClick={(e) => { e.stopPropagation(); onCopyChords(); }}
              className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
            >
              <Copy size={12} strokeWidth={ICON_STROKE} aria-hidden />
            </button>
          )}
          {hasCopiedPattern && onPasteChords && !renaming && (
            <button
              type="button"
              title="Pegar acordes en líneas vacías de esta sección"
              onClick={(e) => { e.stopPropagation(); onPasteChords(); }}
              className="p-0.5 rounded text-[var(--accent)] hover:text-[var(--accent)]/70 transition-colors"
            >
              <ClipboardPaste size={12} strokeWidth={ICON_STROKE} aria-hidden />
            </button>
          )}
        </div>
      )}
    </div>
  );

  const noteArea = (sectionNote || noteOpen) && onSectionNoteChange ? (
    editMode ? (
      <textarea
        value={sectionNote ?? ''}
        onChange={(e) => onSectionNoteChange(e.target.value)}
        placeholder="Nota para esta sección…"
        rows={2}
        className="w-full mb-2 resize-y rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-amber-500/50"
        style={{ minHeight: '2rem' }}
      />
    ) : sectionNote ? (
      <p className="mb-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-1 text-xs text-amber-700 dark:text-amber-300 leading-relaxed whitespace-pre-wrap">
        {sectionNote}
      </p>
    ) : null
  ) : null;

  if (isTab) {
    return (
      <div className="mb-6">
        {labelBar}
        {noteArea}
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
      {labelBar}
      {noteArea}

      {expanded && (
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
      )}
    </div>
  );
}
