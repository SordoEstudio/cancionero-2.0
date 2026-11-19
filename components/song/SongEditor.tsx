'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MiniToast, type MiniToastKind } from '@/components/ui/MiniToast';
import { useRouter } from 'next/navigation';
import type { ChordToken, FullSong, SectionType, SetlistNavContext, SongSectionWithLines, SongVersionActive, ViewMode } from '@/types';
import { preferFlats, transposeChord } from '@/lib/transpose';
import { buildVersionOverrides } from '@/lib/version-overrides';
import { sectionsSnapshot } from '@/lib/sections-snapshot';
import { SectionBlock } from './SectionBlock';
import { ToneSelector } from '@/components/controls/ToneSelector';
import {
  ScrollControl,
  SCROLL_SPEED_DEFAULT,
  SCROLL_SPEED_MAX,
  SCROLL_SPEED_MIN,
} from '@/components/controls/ScrollControl';
import { useTopNavHidden } from '@/components/layout/LayoutChrome';
import { ViewModeSwitch } from '@/components/controls/ViewModeSwitch';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Brackets,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Home,
  LayoutList,
  List,
  Maximize2,
  Menu,
  Minimize2,
  Minus,
  Music2,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Pencil,
  Play,
  Plus,
  SlidersHorizontal,
  SquarePen,
  Type,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ICON_INLINE, ICON_STROKE } from '@/components/ui/icon-tokens';
import { IconButton, lucideInIconButton } from '@/components/ui/IconButton';
import { Button } from '@/components/ui/Button';
import { TextPromptDialog } from '@/components/ui/TextPromptDialog';
import {
  loadSongPrefs,
  readGlobalScrollSpeed,
  saveSongPrefs,
  writeGlobalScrollSpeed,
} from '@/lib/song-local-prefs';

interface SongEditorProps {
  song: FullSong;
  displaySections?: SongSectionWithLines[];
  activeVersion?: SongVersionActive;
  variantKey: string;
  setlistContext?: SetlistNavContext;
  initialStageMode?: boolean;
}

type PrefsBaseline = {
  transposeSteps: number;
  capo: number;
  viewMode: ViewMode;
  scrollSpeed: number;
  hiddenTabs: string[];
  hiddenSections: string[];
  hiddenLines: string[];
  sectionTypeOverrides: Record<string, SectionType>;
  notes: string;
};

function cloneSections(sections: SongSectionWithLines[]): SongSectionWithLines[] {
  return sections.map((s) => ({
    ...s,
    lines: s.lines.map((l) => ({
      ...l,
      chords: l.chords.map((c) => ({ ...c })),
    })),
  }));
}

function prefsEqual(a: PrefsBaseline, b: PrefsBaseline): boolean {
  return (
    a.transposeSteps === b.transposeSteps &&
    a.capo === b.capo &&
    a.viewMode === b.viewMode &&
    a.scrollSpeed === b.scrollSpeed &&
    JSON.stringify(a.hiddenTabs) === JSON.stringify(b.hiddenTabs) &&
    JSON.stringify(a.hiddenSections) === JSON.stringify(b.hiddenSections) &&
    JSON.stringify(a.hiddenLines) === JSON.stringify(b.hiddenLines) &&
    JSON.stringify(a.sectionTypeOverrides) === JSON.stringify(b.sectionTypeOverrides) &&
    a.notes === b.notes
  );
}

const VIEW_MODE_CYCLE: ViewMode[] = ['default', 'inline', 'chords-only', 'lyrics-only'];

function nextViewMode(current: ViewMode): ViewMode {
  const idx = VIEW_MODE_CYCLE.indexOf(current);
  return VIEW_MODE_CYCLE[(idx + 1) % VIEW_MODE_CYCLE.length]!;
}

const VIEW_MODE_ICONS: Record<ViewMode, LucideIcon> = {
  default: LayoutList,
  inline: Brackets,
  'chords-only': Music2,
  'lyrics-only': Type,
};

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  default: 'Normal',
  inline: 'Inline',
  'chords-only': 'Solo acordes',
  'lyrics-only': 'Solo letra',
};

function sectionColorVar(type: SectionType): string {
  switch (type) {
    case 'intro': case 'solo': case 'tab': return 'var(--section-intro)';
    case 'verse': return 'var(--section-verse)';
    case 'pre-chorus': case 'bridge': return 'var(--section-bridge)';
    case 'chorus': return 'var(--section-chorus)';
    default: return 'var(--section-default)';
  }
}

function buildSuggestedVersionName(
  song: FullSong,
  transposeSteps: number,
  capo: number
): string {
  const parts: string[] = [];
  if (transposeSteps !== 0) {
    parts.push(transposeSteps > 0 ? `+${transposeSteps} semitonos` : `${transposeSteps} semitonos`);
  }
  if (capo > 0) parts.push(`cejilla ${capo}`);
  const suffix = parts.length ? ` — ${parts.join(', ')}` : '';
  return `${song.title}${suffix}`;
}

function duplicateVersionDefaultLabel(
  song: FullSong,
  activeVersion: SongVersionActive | undefined
): string {
  return `${activeVersion?.name ?? song.title} (copia)`;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + '…';
}

interface PanelSectionsProps {
  editMode: boolean;
  openSections: Record<string, boolean>;
  toggleSection: (key: string) => void;
  scrollSpeed: number;
  setScrollSpeed: (v: number) => void;
  scrollPlaying: boolean;
  toggleAutoScroll: () => void;
  resetAutoScroll: () => void;
  song: FullSong;
  transposeSteps: number;
  capo: number;
  useFlats: boolean;
  setTransposeSteps: (v: number) => void;
  setCapo: (v: number) => void;
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  hasTabs: boolean;
  allTabsHidden: boolean;
  toggleAllTabs: () => void;
  chordZoom: number;
  setChordZoom: (v: number) => void;
  lyricZoom: number;
  setLyricZoom: (v: number) => void;
  notes: string;
  setNotes: (v: string) => void;
  notesOpen: boolean;
  setNotesOpen: (fn: (o: boolean) => boolean) => void;
}

function PanelSections({
  editMode, openSections, toggleSection,
  scrollSpeed, setScrollSpeed, scrollPlaying, toggleAutoScroll, resetAutoScroll,
  song, transposeSteps, capo, useFlats, setTransposeSteps, setCapo,
  viewMode, setViewMode, hasTabs, allTabsHidden, toggleAllTabs,
  chordZoom, setChordZoom, lyricZoom, setLyricZoom,
  notes, setNotes, notesOpen, setNotesOpen,
}: PanelSectionsProps) {
  return (
    <>
      {!editMode && (
        <div className="border-b border-[var(--border)]">
          <button
            type="button"
            onClick={() => toggleSection('scroll')}
            className="flex w-full items-center justify-between px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Scroll automático
            <ChevronDown size={12} strokeWidth={ICON_STROKE} className={`shrink-0 transition-transform ${openSections.scroll ? '' : '-rotate-90'}`} aria-hidden />
          </button>
          {openSections.scroll && (
            <div className="px-3 pb-3">
              <ScrollControl
                speed={scrollSpeed}
                onSpeedChange={setScrollSpeed}
                playing={scrollPlaying}
                onTogglePlay={toggleAutoScroll}
                onReset={resetAutoScroll}
                hideTitle
              />
            </div>
          )}
        </div>
      )}

      <div className="border-b border-[var(--border)]">
        <button
          type="button"
          onClick={() => toggleSection('tone')}
          className="flex w-full items-center justify-between px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          Tono
          <ChevronDown size={12} strokeWidth={ICON_STROKE} className={`shrink-0 transition-transform ${openSections.tone ? '' : '-rotate-90'}`} aria-hidden />
        </button>
        {openSections.tone && (
          <div className="px-3 pb-3">
            <ToneSelector
              originalKey={song.original_key}
              transposeSteps={transposeSteps}
              capo={capo}
              useFlats={useFlats}
              onTransposeChange={setTransposeSteps}
              onCapoChange={setCapo}
              hideTitle
            />
          </div>
        )}
      </div>

      {!editMode && (
        <div className="border-b border-[var(--border)]">
          <button
            type="button"
            onClick={() => toggleSection('view')}
            className="flex w-full items-center justify-between px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Vista
            <ChevronDown size={12} strokeWidth={ICON_STROKE} className={`shrink-0 transition-transform ${openSections.view ? '' : '-rotate-90'}`} aria-hidden />
          </button>
          {openSections.view && (
            <div className="px-3 pb-3">
              <ViewModeSwitch
                value={viewMode}
                onChange={setViewMode}
                hasTabs={hasTabs}
                allTabsHidden={allTabsHidden}
                onToggleTabs={toggleAllTabs}
                hideTitle
              />
            </div>
          )}
        </div>
      )}

      <div className="border-b border-[var(--border)]">
        <button
          type="button"
          onClick={() => toggleSection('zoom')}
          className="flex w-full items-center justify-between px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          Tamaño de texto
          <ChevronDown size={12} strokeWidth={ICON_STROKE} className={`shrink-0 transition-transform ${openSections.zoom ? '' : '-rotate-90'}`} aria-hidden />
        </button>
        {openSections.zoom && (
          <div className="space-y-2 px-3 pb-3">
            <label className="flex flex-col gap-1.5 text-xs text-[var(--text-secondary)] sm:flex-row sm:items-center sm:justify-between sm:gap-2">
              <span className="shrink-0">Acordes</span>
              <span className="flex min-h-[2.25rem] min-w-0 flex-1 items-center gap-2 sm:max-w-[9.5rem]">
                <input
                  type="range" min="0.7" max="2" step="0.1" value={chordZoom}
                  onChange={(e) => setChordZoom(parseFloat(e.target.value))}
                  className="h-2 min-w-0 w-full flex-1 cursor-pointer accent-[var(--accent)]"
                />
                <span className="w-8 shrink-0 text-right font-mono text-[10px] tabular-nums">{chordZoom.toFixed(1)}</span>
              </span>
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-[var(--text-secondary)] sm:flex-row sm:items-center sm:justify-between sm:gap-2">
              <span className="shrink-0">Letra</span>
              <span className="flex min-h-[2.25rem] min-w-0 flex-1 items-center gap-2 sm:max-w-[9.5rem]">
                <input
                  type="range" min="0.7" max="2" step="0.1" value={lyricZoom}
                  onChange={(e) => setLyricZoom(parseFloat(e.target.value))}
                  className="h-2 min-w-0 w-full flex-1 cursor-pointer accent-[var(--accent)]"
                />
                <span className="w-8 shrink-0 text-right font-mono text-[10px] tabular-nums">{lyricZoom.toFixed(1)}</span>
              </span>
            </label>
            {(chordZoom !== 1 || lyricZoom !== 1) && (
              <button type="button" onClick={() => { setChordZoom(1); setLyricZoom(1); }} className="text-[10px] text-[var(--accent)] hover:underline">
                Restablecer tamaño
              </button>
            )}
          </div>
        )}
      </div>

      <div className="border-b border-[var(--border)]">
        <button
          type="button"
          onClick={() => setNotesOpen((o) => !o)}
          className="flex w-full items-center justify-between px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          Notas
          <ChevronDown size={12} strokeWidth={ICON_STROKE} className={`shrink-0 transition-transform ${notesOpen ? '' : '-rotate-90'}`} aria-hidden />
        </button>
        {notesOpen && (
          <div className="px-3 pb-3">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Apuntes, ideas, recordatorios…"
              rows={3}
              className="w-full resize-y rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              style={{ minHeight: '3rem' }}
            />
          </div>
        )}
      </div>

      <div className="px-3 py-3 text-xs text-[var(--text-muted)] space-y-1">
        {song.original_key && (
          <p>Tono original: <span className="font-mono text-[var(--chord-color)]">{song.original_key}</span></p>
        )}
        <a href={song.source_url} target="_blank" rel="noopener noreferrer" className="block hover:text-[var(--accent)] underline truncate">
          Ver fuente original
        </a>
      </div>
    </>
  );
}

export function SongEditor({
  song,
  displaySections,
  activeVersion,
  variantKey,
  setlistContext,
  initialStageMode,
}: SongEditorProps) {
  const router = useRouter();
  const topNavHidden = useTopNavHidden();
  const initialSections = displaySections ?? song.sections;
  const [sections, setSections] = useState<SongSectionWithLines[]>(() =>
    cloneSections(initialSections)
  );
  const [transposeSteps, setTransposeSteps] = useState(
    () => activeVersion?.transpose_steps ?? 0
  );
  const [capo, setCapo] = useState(() => activeVersion?.capo ?? 0);
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => activeVersion?.view_mode ?? 'default'
  );
  const [scrollSpeed, setScrollSpeed] = useState(() =>
    typeof activeVersion?.scroll_speed === 'number'
      ? activeVersion.scroll_speed
      : readGlobalScrollSpeed() ?? SCROLL_SPEED_DEFAULT
  );
  const [baseline, setBaseline] = useState<{
    sectionsStr: string;
    prefs: PrefsBaseline;
  } | null>(null);

  const [editMode, setEditMode] = useState(false);
  const [editSession, setEditSession] = useState(0);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    kind: MiniToastKind;
    text: string;
    title?: string;
  } | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [fabOpen, setFabOpen] = useState(false);
  const [stageFabOpen, setStageFabOpen] = useState(false);
  const songHeaderRef = useRef<HTMLElement>(null);
  const [songHeaderInView, setSongHeaderInView] = useState(true);

  const [hiddenTabIds, setHiddenTabIds] = useState<Set<string>>(() => {
    const initial = activeVersion?.hidden_tabs ?? [];
    return new Set(initial);
  });

  const [scrollPlaying, setScrollPlaying] = useState(false);
  const scrollRafRef = useRef<number | null>(null);
  const scrollLastTsRef = useRef(0);
  const scrollAccRef = useRef(0);
  const scrollSpeedRef = useRef(scrollSpeed);

  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [chordZoom, setChordZoom] = useState(() => {
    if (typeof window === 'undefined') return 1;
    return parseFloat(localStorage.getItem('chord-zoom') ?? '1');
  });
  const [lyricZoom, setLyricZoom] = useState(() => {
    if (typeof window === 'undefined') return 1;
    return parseFloat(localStorage.getItem('lyric-zoom') ?? '1');
  });
  const [stageMode, setStageMode] = useState(() => initialStageMode ?? !!setlistContext);
  const [setlistOpen, setSetlistOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return { scroll: true, tone: true, view: true, zoom: true };
    try {
      const stored = localStorage.getItem('panel-open-sections');
      const parsed = stored ? (JSON.parse(stored) as Record<string, boolean>) : {};
      return { scroll: true, tone: true, view: true, zoom: true, ...parsed };
    } catch {
      return { scroll: true, tone: true, view: true, zoom: true };
    }
  });
  // Ensure stage mode activates even if hydration ran before setlistContext arrived
  useEffect(() => {
    if (setlistContext?.setlistId) setStageMode(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setlistContext?.setlistId]);
  const [notes, setNotes] = useState(activeVersion?.notes ?? '');
  const [notesOpen, setNotesOpen] = useState(() => !!(activeVersion?.notes));
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [deletedSectionIds, setDeletedSectionIds] = useState<Set<string>>(() =>
    new Set(activeVersion?.hidden_sections ?? [])
  );
  const [deletedLineIds, setDeletedLineIds] = useState<Set<string>>(() =>
    new Set(activeVersion?.hidden_lines ?? [])
  );
  const [sectionTypeOverrides, setSectionTypeOverrides] = useState<Record<string, SectionType>>(
    () => activeVersion?.section_type_overrides ?? {}
  );
  const [sectionNotes, setSectionNotes] = useState<Record<string, string>>({});
  const [copiedChordPattern, setCopiedChordPattern] = useState<ChordToken[][] | null>(null);
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [nameDialogDefault, setNameDialogDefault] = useState('');
  const [versionDialogKind, setVersionDialogKind] = useState<'new' | 'first' | 'dup' | null>(null);
  const prefsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevActiveSectionRef = useRef<string | null>(null);

  // Título y artista editables localmente
  const [localTitle, setLocalTitle] = useState(song.title);
  const [localArtist, setLocalArtist] = useState(song.artist);
  const [editingField, setEditingField] = useState<'title' | 'artist' | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const metaInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingField && metaInputRef.current) {
      metaInputRef.current.focus();
      metaInputRef.current.select();
    }
  }, [editingField]);

  async function commitMetaEdit() {
    if (!editingField) return;
    const val = editingValue.trim();
    const field = editingField;
    setEditingField(null);
    if (!val) return;
    if (field === 'title' && val === localTitle) return;
    if (field === 'artist' && val === localArtist) return;
    if (field === 'title') setLocalTitle(val);
    if (field === 'artist') setLocalArtist(val);
    try {
      await fetch(`/api/song/${song.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: val }),
      });
    } catch {
      // silently ignore network errors
    }
  }

  useEffect(() => {
    scrollSpeedRef.current = scrollSpeed;
  }, [scrollSpeed]);

  const scrollStep = useCallback((ts: number) => {
    const delta = (ts - scrollLastTsRef.current) / 1000;
    scrollLastTsRef.current = ts;
    scrollAccRef.current += delta * scrollSpeedRef.current;
    const px = Math.floor(scrollAccRef.current);
    if (px >= 1) {
      window.scrollBy(0, px);
      scrollAccRef.current -= px;
    }
    scrollRafRef.current = requestAnimationFrame(scrollStep);
  }, []);

  const pauseAutoScroll = useCallback(() => {
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
    setScrollPlaying(false);
  }, []);

  const playAutoScroll = useCallback(() => {
    setPanelOpen(false);
    scrollLastTsRef.current = performance.now();
    scrollAccRef.current = 0;
    scrollRafRef.current = requestAnimationFrame(scrollStep);
    setScrollPlaying(true);
  }, [scrollStep]);

  const resetAutoScroll = useCallback(() => {
    pauseAutoScroll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [pauseAutoScroll]);

  const toggleAutoScroll = useCallback(() => {
    if (scrollPlaying) pauseAutoScroll();
    else playAutoScroll();
  }, [scrollPlaying, pauseAutoScroll, playAutoScroll]);

  useEffect(
    () => () => {
      if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
    },
    []
  );

  useEffect(() => {
    if (editMode) pauseAutoScroll();
  }, [editMode, pauseAutoScroll]);

  useEffect(() => {
    const el = songHeaderRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setSongHeaderInView(entry.isIntersecting),
      { threshold: 0, rootMargin: '0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    localStorage.setItem('chord-zoom', String(chordZoom));
  }, [chordZoom]);

  useEffect(() => {
    localStorage.setItem('lyric-zoom', String(lyricZoom));
  }, [lyricZoom]);

  useEffect(() => {
    writeGlobalScrollSpeed(scrollSpeed);
  }, [scrollSpeed]);

  useEffect(() => {
    if (prefsSaveTimer.current) clearTimeout(prefsSaveTimer.current);
    prefsSaveTimer.current = setTimeout(() => {
      saveSongPrefs(song.id, {
        versionId: activeVersion?.id ?? null,
        transposeSteps,
        capo,
        scrollSpeed,
        chordZoom,
        lyricZoom,
        collapsedIds: [...collapsedIds],
        hiddenTabIds: [...hiddenTabIds],
      });
    }, 400);
    return () => {
      if (prefsSaveTimer.current) clearTimeout(prefsSaveTimer.current);
    };
  }, [
    song.id,
    activeVersion?.id,
    transposeSteps,
    capo,
    scrollSpeed,
    chordZoom,
    lyricZoom,
    collapsedIds,
    hiddenTabIds,
  ]);

  useEffect(() => {
    if (!activeSectionId) return;
    const prev = prevActiveSectionRef.current;
    prevActiveSectionRef.current = activeSectionId;
    if (prev === activeSectionId) return;
    setCollapsedIds((prevSet) => {
      if (!prevSet.has(activeSectionId)) return prevSet;
      const next = new Set(prevSet);
      next.delete(activeSectionId);
      return next;
    });
  }, [activeSectionId]);

  useEffect(() => {
    const els = sections
      .map((s) => document.getElementById(`section-${s.id}`))
      .filter(Boolean) as HTMLElement[];
    if (els.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSectionId(entry.target.id.replace('section-', ''));
            break;
          }
        }
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
    );
    for (const el of els) obs.observe(el);
    return () => obs.disconnect();
  }, [sections]);

  useEffect(() => {
    if (!stageMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setStageMode(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stageMode]);

  const dismissToast = useCallback(() => setToast(null), []);

  function pushToast(kind: MiniToastKind, text: string, title?: string) {
    setToast({ kind, text, title });
  }

  useEffect(() => {
    const nextSections = cloneSections(displaySections ?? song.sections);
    const nextHiddenTabs = activeVersion?.hidden_tabs ?? [];
    const scrollBase =
      typeof activeVersion?.scroll_speed === 'number'
        ? activeVersion.scroll_speed
        : readGlobalScrollSpeed() ?? SCROLL_SPEED_DEFAULT;

    const nextPrefs: PrefsBaseline = activeVersion
      ? {
          transposeSteps: activeVersion.transpose_steps,
          capo: activeVersion.capo,
          viewMode: activeVersion.view_mode,
          scrollSpeed: scrollBase,
          hiddenTabs: nextHiddenTabs,
          hiddenSections: activeVersion.hidden_sections ?? [],
          hiddenLines: activeVersion.hidden_lines ?? [],
          sectionTypeOverrides: activeVersion.section_type_overrides ?? {},
          notes: activeVersion.notes ?? '',
        }
      : {
          transposeSteps: 0,
          capo: 0,
          viewMode: 'default',
          scrollSpeed: scrollBase,
          hiddenTabs: [],
          hiddenSections: [],
          hiddenLines: [],
          sectionTypeOverrides: {},
          notes: '',
        };

    setSections(nextSections);
    setTransposeSteps(nextPrefs.transposeSteps);
    setCapo(nextPrefs.capo);
    setViewMode(nextPrefs.viewMode);
    setScrollSpeed(nextPrefs.scrollSpeed);
    setHiddenTabIds(new Set(nextHiddenTabs));
    setNotes(nextPrefs.notes);
    setNotesOpen(!!nextPrefs.notes);
    setBaseline({
      sectionsStr: sectionsSnapshot(nextSections),
      prefs: nextPrefs,
    });
    setEditMode(false);
    setCopiedChordPattern(null);
    setDeletedSectionIds(new Set(activeVersion?.hidden_sections ?? []));
    setDeletedLineIds(new Set(activeVersion?.hidden_lines ?? []));
    setSectionTypeOverrides(activeVersion?.section_type_overrides ?? {});

    const stored = loadSongPrefs(song.id);
    if (stored) {
      if (typeof stored.scrollSpeed === 'number') setScrollSpeed(stored.scrollSpeed);
      if (typeof stored.chordZoom === 'number') setChordZoom(stored.chordZoom);
      if (typeof stored.lyricZoom === 'number') setLyricZoom(stored.lyricZoom);
      const vId = activeVersion?.id ?? null;
      if (stored.versionId != null && stored.versionId === vId) {
        if (typeof stored.transposeSteps === 'number') setTransposeSteps(stored.transposeSteps);
        if (typeof stored.capo === 'number') setCapo(stored.capo);
      }
      if (stored.collapsedIds?.length) setCollapsedIds(new Set(stored.collapsedIds));
      if (stored.hiddenTabIds?.length) setHiddenTabIds(new Set(stored.hiddenTabIds));
    }
  }, [variantKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabSectionIds = useMemo(
    () => sections.filter((s) => s.type === 'tab').map((s) => s.id),
    [sections]
  );
  const hasTabs = tabSectionIds.length > 0;
  const allTabsHidden = hasTabs && tabSectionIds.every((id) => hiddenTabIds.has(id));

  const toggleAllTabs = useCallback(() => {
    setHiddenTabIds((prev) => {
      if (tabSectionIds.every((id) => prev.has(id))) {
        const next = new Set(prev);
        for (const id of tabSectionIds) next.delete(id);
        return next;
      }
      const next = new Set(prev);
      for (const id of tabSectionIds) next.add(id);
      return next;
    });
  }, [tabSectionIds]);

  const toggleTabSection = useCallback((sectionId: string) => {
    setHiddenTabIds((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }, []);

  const toggleCollapse = useCallback((sectionId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }, []);

  const handleDeleteSection = useCallback((sectionId: string) => {
    setDeletedSectionIds((prev) => {
      const next = new Set(prev);
      next.add(sectionId);
      return next;
    });
  }, []);

  const handleDeleteLine = useCallback((lineId: string) => {
    setDeletedLineIds((prev) => {
      const next = new Set(prev);
      next.add(lineId);
      return next;
    });
  }, []);

  const handleChangeSectionType = useCallback((sectionId: string, type: SectionType) => {
    setSectionTypeOverrides((prev) => ({ ...prev, [sectionId]: type }));
  }, []);

  const handleRenameSection = useCallback((sectionId: string, newLabel: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, label: newLabel } : s))
    );
  }, []);

  const handleSectionNoteChange = useCallback((sectionId: string, note: string) => {
    setSectionNotes((prev) => ({ ...prev, [sectionId]: note }));
  }, []);

  const handleCopySection = useCallback((sectionId: string) => {
    const sec = sections.find((s) => s.id === sectionId);
    if (!sec) return;
    setCopiedChordPattern(sec.lines.map((l) => [...l.chords]));
  }, [sections]);

  const handlePasteSection = useCallback((sectionId: string) => {
    if (!copiedChordPattern) return;
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lines: sec.lines.map((line, i) => {
            if (line.chords.length > 0) return line;
            const src = copiedChordPattern[i % copiedChordPattern.length];
            if (!src || src.length === 0) return line;
            return { ...line, chords: src };
          }),
        };
      })
    );
  }, [copiedChordPattern]);

  const parsedForFlats = {
    title: song.title,
    artist: song.artist,
    sourceUrl: song.source_url,
    originalKey: song.original_key,
    sections: sections.map((s) => ({
      ...s,
      lines: s.lines,
    })),
  };
  const useFlats = preferFlats(parsedForFlats as Parameters<typeof preferFlats>[0]);

  const playingKeyDisplay = useMemo(() => {
    if (!song.original_key) return null;
    return transposeChord(song.original_key, transposeSteps, useFlats);
  }, [song.original_key, transposeSteps, useFlats]);

  const displayedKeyForScreen = useMemo(() => {
    if (!song.original_key) return null;
    if (capo > 0)
      return transposeChord(song.original_key, transposeSteps - capo, useFlats);
    return playingKeyDisplay;
  }, [song.original_key, capo, transposeSteps, useFlats, playingKeyDisplay]);

  const hiddenTabsArr = useMemo(() => [...hiddenTabIds].sort(), [hiddenTabIds]);
  const deletedSectionsArr = useMemo(() => [...deletedSectionIds].sort(), [deletedSectionIds]);
  const deletedLinesArr = useMemo(() => [...deletedLineIds].sort(), [deletedLineIds]);

  const isDirty = useMemo(() => {
    if (!baseline) return false;
    const prefsNow: PrefsBaseline = {
      transposeSteps,
      capo,
      viewMode,
      scrollSpeed,
      hiddenTabs: hiddenTabsArr,
      hiddenSections: deletedSectionsArr,
      hiddenLines: deletedLinesArr,
      sectionTypeOverrides,
      notes,
    };
    return (
      sectionsSnapshot(sections) !== baseline.sectionsStr || !prefsEqual(prefsNow, baseline.prefs)
    );
  }, [sections, transposeSteps, capo, viewMode, scrollSpeed, hiddenTabsArr, deletedSectionsArr, deletedLinesArr, sectionTypeOverrides, notes, baseline]);

  const handleUpdateLine = useCallback(
    (sectionId: string, lineId: string, patch: { chords?: ChordToken[]; text?: string }) => {
      setSections((prev) =>
        prev.map((sec) =>
          sec.id !== sectionId
            ? sec
            : {
                ...sec,
                lines: sec.lines.map((l) => (l.id !== lineId ? l : { ...l, ...patch })),
              }
        )
      );
    },
    []
  );

  function toggleEditMode() {
    if (editMode) {
      setEditMode(false);
      return;
    }
    setEditSession((s) => s + 1);
    setEditMode(true);
  }

  function buildPayloadBase() {
    const overrides = buildVersionOverrides(song.sections, sections);
    const playingKey = song.original_key
      ? transposeChord(song.original_key, transposeSteps, useFlats)
      : null;
    const keySnapshot =
      playingKey && /^[A-G](#|b)?m?$/u.test(playingKey) ? playingKey : null;
    return {
      songId: song.id,
      key: keySnapshot,
      capo,
      transposeSteps,
      viewMode,
      scrollSpeed,
      hiddenTabs: hiddenTabsArr,
      hiddenSections: deletedSectionsArr,
      hiddenLines: deletedLinesArr,
      sectionTypeOverrides,
      notes,
      overrides,
    };
  }

  function commitBaselineFromState() {
    setBaseline({
      sectionsStr: sectionsSnapshot(sections),
      prefs: {
        transposeSteps,
        capo,
        viewMode,
        scrollSpeed,
        hiddenTabs: hiddenTabsArr,
        hiddenSections: deletedSectionsArr,
        hiddenLines: deletedLinesArr,
        sectionTypeOverrides,
        notes,
      },
    });
  }

  async function handleSaveCurrentVersion() {
    if (!isDirty || !activeVersion?.id) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/version/${activeVersion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayloadBase()),
      });
      const data = await res.json();
      if (res.ok) {
        commitBaselineFromState();
        if (data.demo && data.persisted === false && data.message) {
          pushToast('warn', 'Demo', data.message);
        } else {
          pushToast('ok', 'Guardado');
        }
        router.refresh();
      } else {
        pushToast('err', 'Error', data.error ?? 'desconocido');
      }
    } catch {
      pushToast('err', 'Error', 'Sin conexión');
    } finally {
      setSaving(false);
    }
  }

  function openVersionNameDialog(kind: 'new' | 'first' | 'dup') {
    setVersionDialogKind(kind);
    if (kind === 'new') {
      setNameDialogDefault(buildSuggestedVersionName(song, transposeSteps, capo));
    } else if (kind === 'first') {
      setNameDialogDefault(
        `${song.title} (tono ${song.original_key ?? '?'} ${transposeSteps >= 0 ? '+' : ''}${transposeSteps})`
      );
    } else {
      setNameDialogDefault(duplicateVersionDefaultLabel(song, activeVersion));
    }
    setNameDialogOpen(true);
  }

  async function saveNewVersionWithName(name: string) {
    setSaving(true);
    try {
      const res = await fetch('/api/save-version', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...buildPayloadBase(),
          name,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        commitBaselineFromState();
        if (data.demo && data.persisted === false && data.message) {
          pushToast('warn', 'Demo', data.message);
        } else if (data.id && typeof data.id === 'string') {
          pushToast('ok', 'Creada');
          router.push(`/song/${song.id}?v=${data.id}`);
        } else {
          pushToast('ok', 'Guardado');
        }
        router.refresh();
      } else {
        pushToast('err', 'Error', data.error ?? 'desconocido');
      }
    } catch {
      pushToast('err', 'Error', 'Sin conexión');
    } finally {
      setSaving(false);
    }
  }

  async function onVersionNameConfirm(name: string) {
    const kind = versionDialogKind;
    if (kind === 'new' || kind === 'first' || kind === 'dup') {
      await saveNewVersionWithName(name);
    }
  }

  async function handleSaveAsNewVersion() {
    openVersionNameDialog('new');
  }

  function toggleSection(key: string) {
    setOpenSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem('panel-open-sections', JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function navigateToSong(songId: string, versionId: string | null, newPos: number) {
    if (!setlistContext) return;
    const params = new URLSearchParams({ setlistId: setlistContext.setlistId, pos: String(newPos) });
    if (versionId) params.set('v', versionId);
    if (stageMode) params.set('stage', '1');
    router.push(`/song/${songId}?${params.toString()}`);
  }

  async function handleSavePrimary() {
    if (!isDirty) return;
    if (activeVersion?.id) {
      await handleSaveCurrentVersion();
    } else {
      openVersionNameDialog('first');
    }
  }

  const goToNextSection = useCallback(() => {
    const i = sections.findIndex((s) => s.id === activeSectionId);
    if (i < 0 || i >= sections.length - 1) return;
    const next = sections[i + 1];
    document.getElementById(`section-${next.id}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, [sections, activeSectionId]);

  const showFloatingChrome = !songHeaderInView;

  const adjustScrollSpeed = useCallback((delta: number) => {
    setScrollSpeed((s) =>
      Math.min(SCROLL_SPEED_MAX, Math.max(SCROLL_SPEED_MIN, Math.round(s + delta)))
    );
  }, []);
  const floatBtnClass =
    'inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)]/95 text-[var(--text-primary)] shadow-lg backdrop-blur-sm transition-opacity hover:bg-[var(--bg-elevated)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';

  const fabBtnClass =
    'inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)]/95 text-[var(--text-primary)] shadow-lg backdrop-blur-sm transition-opacity hover:bg-[var(--bg-elevated)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';

  const menuItemClass =
    'flex cursor-default select-none items-center rounded-md px-3 py-2 text-sm text-[var(--text-primary)] outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-[var(--bg-elevated)]';

  return (
    <div className={`min-h-screen bg-[var(--bg-base)] ${stageMode ? 'stage-mode' : ''}`}>
      <style>{`
        .song-content .chord-line { font-size: ${chordZoom}rem; }
        .song-content .lyric-line { font-size: ${lyricZoom}rem; }
      `}</style>

      {!stageMode && (
      <header
        ref={songHeaderRef}
        className="relative z-10 bg-[var(--bg-base)] border-b border-[var(--border)] px-3 sm:px-4 py-2.5 flex items-center justify-between gap-3"
      >
        <div className="min-w-0 flex-1">
          {/* Título editable */}
          <div className="group/title flex items-center gap-1">
            {editingField === 'title' ? (
              <>
                <input
                  ref={metaInputRef}
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={commitMetaEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitMetaEdit();
                    if (e.key === 'Escape') setEditingField(null);
                  }}
                  className="text-lg font-bold bg-transparent border-b border-[var(--accent)] text-[var(--text-primary)] outline-none w-full max-w-xs"
                />
                <button type="button" onMouseDown={(e) => { e.preventDefault(); commitMetaEdit(); }}
                  className="p-0.5 rounded text-[var(--accent)]">
                  <Check size={13} strokeWidth={ICON_STROKE} />
                </button>
              </>
            ) : (
              <>
                <h1 className="text-lg font-bold text-[var(--text-primary)] truncate">{localTitle}</h1>
                <button
                  type="button"
                  title="Editar título"
                  onClick={() => { setEditingValue(localTitle); setEditingField('title'); }}
                  className="shrink-0 p-0.5 rounded text-[var(--text-muted)] opacity-0 group-hover/title:opacity-100 hover:text-[var(--accent)] transition-opacity"
                >
                  <Pencil size={12} strokeWidth={ICON_STROKE} />
                </button>
              </>
            )}
          </div>
          {/* Artista editable */}
          <div className="group/artist flex items-center gap-1">
            {editingField === 'artist' ? (
              <>
                <input
                  ref={metaInputRef}
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={commitMetaEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitMetaEdit();
                    if (e.key === 'Escape') setEditingField(null);
                  }}
                  className="text-sm bg-transparent border-b border-[var(--accent)] text-[var(--text-secondary)] outline-none w-full max-w-xs"
                />
                <button type="button" onMouseDown={(e) => { e.preventDefault(); commitMetaEdit(); }}
                  className="p-0.5 rounded text-[var(--accent)]">
                  <Check size={12} strokeWidth={ICON_STROKE} />
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-[var(--text-secondary)] truncate">{localArtist}</p>
                <button
                  type="button"
                  title="Editar artista"
                  onClick={() => { setEditingValue(localArtist); setEditingField('artist'); }}
                  className="shrink-0 p-0.5 rounded text-[var(--text-muted)] opacity-0 group-hover/artist:opacity-100 hover:text-[var(--accent)] transition-opacity"
                >
                  <Pencil size={11} strokeWidth={ICON_STROKE} />
                </button>
              </>
            )}
          </div>
          {activeVersion && (
            <p className="text-xs text-[var(--accent)] truncate mt-0.5" title={activeVersion.name}>
              Versión: {activeVersion.name}
            </p>
          )}
          {playingKeyDisplay && (
            <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate" title="Tono y cejilla">
              {capo > 0 && displayedKeyForScreen ? (
                <>
                  <span className="font-mono text-[var(--chord-color)]">{displayedKeyForScreen}</span>
                  <span className="text-[var(--text-muted)]"> en cifra</span>
                  <span className="mx-1 text-[var(--border-strong)]">·</span>
                  <span className="text-[var(--text-muted)]">suena</span>{' '}
                  <span className="font-mono text-[var(--chord-color)]">{playingKeyDisplay}</span>
                  <span className="text-[var(--text-muted)]"> (cej. {capo})</span>
                </>
              ) : (
                <>
                  <span className="text-[var(--text-muted)]">Tono:</span>{' '}
                  <span className="font-mono text-[var(--chord-color)]">{playingKeyDisplay}</span>
                </>
              )}
            </p>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <div className="hidden md:flex items-center gap-0.5">
            {!editMode ? (
              <>
                <IconButton label="Inicio" onClick={() => router.push('/')}>
                  <Home {...lucideInIconButton} />
                </IconButton>

                <IconButton label="Importar otra canción" onClick={() => router.push('/')}>
                  <Plus {...lucideInIconButton} />
                </IconButton>

                <IconButton label="Editar cifra" onClick={toggleEditMode}>
                  <SquarePen {...lucideInIconButton} />
                </IconButton>

                <IconButton
                  label={
                    panelOpen
                      ? 'Ocultar panel lateral (tono, vista, scroll)'
                      : 'Mostrar panel lateral (tono, vista, scroll)'
                  }
                  onClick={() => setPanelOpen((o) => !o)}
                >
                  {panelOpen ? (
                    <PanelRightClose {...lucideInIconButton} />
                  ) : (
                    <PanelRightOpen {...lucideInIconButton} />
                  )}
                </IconButton>

                <IconButton
                  label="Modo escenario"
                  onClick={() => {
                    setStageMode(true);
                    if (!scrollPlaying) playAutoScroll();
                  }}
                >
                  <Maximize2 {...lucideInIconButton} />
                </IconButton>
              </>
            ) : (
              <div className="ml-1 flex flex-wrap items-center justify-end gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  type="button"
                  disabled={!isDirty || saving}
                  loading={saving}
                  title={
                    !isDirty
                      ? 'No hay cambios para guardar'
                      : activeVersion?.id
                        ? `Guardar en «${activeVersion.name}»`
                        : 'Crear primera versión con nombre'
                  }
                  onClick={() => void handleSavePrimary()}
                >
                  {activeVersion?.id
                    ? `Guardar «${truncate(activeVersion.name, 18)}»`
                    : 'Guardar como…'}
                </Button>
                {activeVersion?.id ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    disabled={saving}
                    onClick={() => void handleSaveAsNewVersion()}
                  >
                    Guardar nueva versión
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  disabled={saving}
                  onClick={() => setEditMode(false)}
                >
                  Cancelar
                </Button>
              </div>
            )}
          </div>

          <div className="md:hidden">
            {!editMode ? (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    title="Menú de acciones"
                    aria-label="Abrir menú de acciones"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  >
                    <Menu size={ICON_INLINE} strokeWidth={ICON_STROKE} className="shrink-0" aria-hidden />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="z-[200] min-w-[13rem] rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] py-1 shadow-lg"
                    sideOffset={6}
                    align="end"
                  >
                    <DropdownMenu.Item
                      className={menuItemClass}
                      onSelect={() => router.push('/')}
                    >
                      Inicio
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className={menuItemClass}
                      onSelect={() => router.push('/')}
                    >
                      Importar otra canción
                    </DropdownMenu.Item>
                    <DropdownMenu.Item className={menuItemClass} onSelect={toggleEditMode}>
                      Editar cifra
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className={menuItemClass}
                      onSelect={() => {
                        setStageMode(true);
                        if (!scrollPlaying) playAutoScroll();
                      }}
                    >
                      Modo escenario
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            ) : (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    title="Acciones de edición"
                    aria-label="Abrir acciones de edición"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  >
                    <Menu size={ICON_INLINE} strokeWidth={ICON_STROKE} className="shrink-0" aria-hidden />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="z-[200] min-w-[13rem] rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] py-1 shadow-lg"
                    sideOffset={6}
                    align="end"
                  >
                    <DropdownMenu.Item
                      className={menuItemClass}
                      disabled={!isDirty || saving}
                      onSelect={() => void handleSavePrimary()}
                    >
                      {activeVersion?.id
                        ? `Guardar «${truncate(activeVersion.name, 18)}»`
                        : 'Guardar como…'}
                    </DropdownMenu.Item>
                    {activeVersion?.id ? (
                      <DropdownMenu.Item
                        className={menuItemClass}
                        disabled={saving}
                        onSelect={() => void handleSaveAsNewVersion()}
                      >
                        Guardar nueva versión
                      </DropdownMenu.Item>
                    ) : null}
                    <DropdownMenu.Item
                      className={menuItemClass}
                      disabled={saving}
                      onSelect={() => setEditMode(false)}
                    >
                      Cancelar
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            )}
          </div>
        </div>
      </header>
      )}

      {toast && (
        <MiniToast
          kind={toast.kind}
          text={toast.text}
          title={toast.title}
          onDismiss={dismissToast}
        />
      )}

      {showFloatingChrome && !stageMode && (
        <div
          className="fixed right-4 top-14 z-[160] flex items-center gap-2"
          aria-label="Acciones rápidas"
        >
          {!songHeaderInView && (
            <button
              type="button"
              className={floatBtnClass}
              title={panelOpen ? 'Cerrar panel lateral' : 'Abrir panel (tono, vista, scroll)'}
              aria-label={
                panelOpen ? 'Cerrar panel lateral' : 'Abrir panel lateral de tono, vista y scroll'
              }
              onClick={() => setPanelOpen((o) => !o)}
            >
              <Menu size={ICON_INLINE} strokeWidth={ICON_STROKE} className="shrink-0" aria-hidden />
            </button>
          )}
        </div>
      )}


      {stageMode && setlistOpen && setlistContext && (
        <div className="fixed inset-0 z-[170] flex flex-col" role="dialog" aria-modal aria-label="Lista del setlist">
          <div className="flex-1" onClick={() => setSetlistOpen(false)} />
          <div className="bg-[var(--bg-surface)] border-t border-[var(--border)] rounded-t-2xl max-h-[65vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <span className="text-sm font-semibold text-[var(--text-primary)] truncate">{setlistContext.setlistName}</span>
              <button
                type="button"
                onClick={() => setSetlistOpen(false)}
                className="shrink-0 ml-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                aria-label="Cerrar lista"
              >
                <X size={ICON_INLINE} strokeWidth={ICON_STROKE} aria-hidden />
              </button>
            </div>
            <ul className="overflow-y-auto py-2">
              {setlistContext.songs.map((s, i) => {
                const isCurrent = i === setlistContext.position;
                return (
                  <li key={s.songId}>
                    <button
                      type="button"
                      className={[
                        'w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors',
                        isCurrent
                          ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                          : 'hover:bg-[var(--bg-elevated)] text-[var(--text-primary)]',
                      ].join(' ')}
                      onClick={() => { setSetlistOpen(false); navigateToSong(s.songId, s.versionId, i); }}
                    >
                      <span className={`w-5 shrink-0 text-xs font-semibold tabular-nums ${isCurrent ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{s.title || 'Sin título'}</span>
                        {s.artist && <span className="block truncate text-xs text-[var(--text-secondary)]">{s.artist}</span>}
                      </span>
                      {isCurrent && (
                        <ChevronRight size={14} strokeWidth={ICON_STROKE} className="shrink-0 text-[var(--accent)]" aria-hidden />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {editMode && (
        <p className="mx-4 mt-2 text-xs text-[var(--text-muted)]">
          Editá acordes y letra. «Guardar como…» crea una versión con nombre. «Guardar nueva versión» crea otra a partir de la actual.
        </p>
      )}

      <nav
        className={[
          'sticky z-[45] overflow-x-auto border-b border-[var(--border)] bg-[var(--bg-base)]/95 backdrop-blur-sm shadow-sm',
          topNavHidden ? 'top-0' : 'top-[52px]',
          stageMode ? 'hidden' : '',
        ].join(' ')}
      >
        <div className="flex items-center gap-1.5 px-3 py-1.5">
          {sections.map((section) => {
            const color = sectionColorVar(section.type);
            const isActive = activeSectionId === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => {
                  const el = document.getElementById(`section-${section.id}`);
                  if (!el) return;
                  const navHeight = 44;
                  const y = el.getBoundingClientRect().top + window.scrollY - navHeight;
                  window.scrollTo({ top: y, behavior: 'smooth' });
                }}
                className={`shrink-0 rounded-full border px-3 py-0.5 text-xs font-medium transition-all ${
                  isActive
                    ? 'opacity-100 shadow-md ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg-base)] font-semibold scale-[1.02]'
                    : 'opacity-50 hover:opacity-80'
                }`}
                style={{
                  color,
                  borderColor: color,
                  backgroundColor: isActive
                    ? `color-mix(in srgb, ${color} 18%, transparent)`
                    : 'transparent',
                }}
              >
                {section.label}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="flex flex-col gap-0 md:flex-row">
        <main
          className={`flex-1 min-w-0 overflow-x-auto ${stageMode ? 'px-8 sm:px-16 py-10 text-lg' : 'px-4 py-6'}`}
          style={{ '--chord-scale': chordZoom, '--lyric-scale': lyricZoom } as React.CSSProperties}
        >
          {sections.filter((s) => !deletedSectionIds.has(s.id)).map((section) => {
            const displaySection = sectionTypeOverrides[section.id]
              ? { ...section, type: sectionTypeOverrides[section.id] }
              : section;
            const filteredSection = {
              ...displaySection,
              lines: displaySection.lines.filter((l) => !deletedLineIds.has(l.id)),
            };
            return (
              <div key={section.id} id={`section-${section.id}`}>
                <SectionBlock
                  section={filteredSection}
                  chordTransposeSteps={transposeSteps - capo}
                  viewMode={viewMode}
                  useFlats={useFlats}
                  editMode={editMode}
                  editSession={editSession}
                  tabVisible={filteredSection.type === 'tab' ? !hiddenTabIds.has(section.id) : undefined}
                  onToggleTab={filteredSection.type === 'tab' ? () => toggleTabSection(section.id) : undefined}
                  collapsed={collapsedIds.has(section.id)}
                  onToggleCollapse={() => toggleCollapse(section.id)}
                  onDeleteSection={editMode ? () => handleDeleteSection(section.id) : undefined}
                  onChangeType={editMode ? (type) => handleChangeSectionType(section.id, type) : undefined}
                  onDeleteLine={editMode ? (lineId) => handleDeleteLine(lineId) : undefined}
                  onRenameSection={(newLabel) => handleRenameSection(section.id, newLabel)}
                  sectionNote={sectionNotes[section.id] ?? ''}
                  onSectionNoteChange={(note) => handleSectionNoteChange(section.id, note)}
                  onUpdateLine={(lineId, patch) => handleUpdateLine(section.id, lineId, patch)}
                  hasCopiedPattern={copiedChordPattern !== null}
                  onCopyChords={editMode ? () => handleCopySection(section.id) : undefined}
                  onPasteChords={editMode && copiedChordPattern !== null ? () => handlePasteSection(section.id) : undefined}
                />
              </div>
            );
          })}
        </main>

        {panelOpen && !stageMode && (
          <aside
            aria-label="Tono, scroll automático, vista y tamaño de texto"
            className="hidden md:block w-64 shrink-0 border-l border-[var(--border)] bg-[var(--bg-surface)] sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto overscroll-y-contain"
          >
            <PanelSections
              editMode={editMode}
              openSections={openSections}
              toggleSection={toggleSection}
              scrollSpeed={scrollSpeed}
              setScrollSpeed={setScrollSpeed}
              scrollPlaying={scrollPlaying}
              toggleAutoScroll={toggleAutoScroll}
              resetAutoScroll={resetAutoScroll}
              song={song}
              transposeSteps={transposeSteps}
              capo={capo}
              useFlats={useFlats}
              setTransposeSteps={setTransposeSteps}
              setCapo={setCapo}
              viewMode={viewMode}
              setViewMode={setViewMode}
              hasTabs={hasTabs}
              allTabsHidden={allTabsHidden}
              toggleAllTabs={toggleAllTabs}
              chordZoom={chordZoom}
              setChordZoom={setChordZoom}
              lyricZoom={lyricZoom}
              setLyricZoom={setLyricZoom}
              notes={notes}
              setNotes={setNotes}
              notesOpen={notesOpen}
              setNotesOpen={setNotesOpen}
            />
          </aside>
        )}
      </div>

      {/* Mobile FAB speed-dial — backdrop closes dial */}
      {fabOpen && !stageMode && !editMode && (
        <div
          className="md:hidden fixed inset-0 z-[148]"
          onClick={() => setFabOpen(false)}
        />
      )}

      {/* Mobile FAB speed-dial — container is exactly FAB size; items are absolute so they don't shift FAB position */}
      {!stageMode && !editMode && (
        <div
          className="md:hidden fixed bottom-4 right-4 z-[149]"
          style={{ width: 56, height: 56 }}
        >
          {/* Item 1 — Tono (closest to FAB) */}
          <div
            className="absolute right-0 flex items-center gap-2 whitespace-nowrap"
            style={{
              bottom: 68,
              opacity: fabOpen ? 1 : 0,
              transform: fabOpen ? 'translateY(0)' : 'translateY(10px)',
              transition: 'opacity 150ms ease, transform 150ms ease',
              transitionDelay: fabOpen ? '0ms' : '0ms',
              pointerEvents: fabOpen ? 'auto' : 'none',
            }}
          >
            <span className="rounded-md bg-black/55 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
              Tono
            </span>
            <div className="flex items-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--bg-surface)]/95 shadow-md backdrop-blur-sm">
              <button
                type="button"
                aria-label="Bajar un semitono"
                onClick={() => setTransposeSteps((s) => s - 1)}
                className="flex h-11 w-11 shrink-0 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-colors"
              >
                <Minus size={14} strokeWidth={ICON_STROKE} aria-hidden />
              </button>
              <span className="min-w-[2.75rem] px-1 text-center text-sm font-semibold tabular-nums text-[var(--chord-color)]">
                {playingKeyDisplay ?? (transposeSteps === 0 ? '0' : `${transposeSteps > 0 ? '+' : ''}${transposeSteps}`)}
              </span>
              <button
                type="button"
                aria-label="Subir un semitono"
                onClick={() => setTransposeSteps((s) => s + 1)}
                className="flex h-11 w-11 shrink-0 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-colors"
              >
                <Plus size={14} strokeWidth={ICON_STROKE} aria-hidden />
              </button>
            </div>
          </div>

          {/* Item 2 — Vista */}
          <div
            className="absolute right-0 flex items-center gap-2 whitespace-nowrap"
            style={{
              bottom: 124,
              opacity: fabOpen ? 1 : 0,
              transform: fabOpen ? 'translateY(0)' : 'translateY(10px)',
              transition: 'opacity 150ms ease, transform 150ms ease',
              transitionDelay: fabOpen ? '50ms' : '0ms',
              pointerEvents: fabOpen ? 'auto' : 'none',
            }}
          >
            <span className="rounded-md bg-black/55 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
              {VIEW_MODE_LABELS[viewMode]}
            </span>
            <button
              type="button"
              aria-label={`Cambiar vista — ahora: ${VIEW_MODE_LABELS[viewMode]}`}
              onClick={() => setViewMode(nextViewMode(viewMode))}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)]/95 text-[var(--text-primary)] shadow-md backdrop-blur-sm hover:bg-[var(--bg-elevated)] transition-colors"
            >
              {(() => { const Icon = VIEW_MODE_ICONS[viewMode]; return <Icon size={20} strokeWidth={ICON_STROKE} aria-hidden />; })()}
            </button>
          </div>

          {/* Item 3 — Escenario */}
          <div
            className="absolute right-0 flex items-center gap-2 whitespace-nowrap"
            style={{
              bottom: 184,
              opacity: fabOpen ? 1 : 0,
              transform: fabOpen ? 'translateY(0)' : 'translateY(10px)',
              transition: 'opacity 150ms ease, transform 150ms ease',
              transitionDelay: fabOpen ? '100ms' : '0ms',
              pointerEvents: fabOpen ? 'auto' : 'none',
            }}
          >
            <span className="rounded-md bg-black/55 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
              Escenario
            </span>
            <button
              type="button"
              aria-label="Activar modo escenario"
              onClick={() => { setStageMode(true); setFabOpen(false); }}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)]/95 text-[var(--text-primary)] shadow-md backdrop-blur-sm hover:bg-[var(--bg-elevated)] transition-colors"
            >
              <Maximize2 size={20} strokeWidth={ICON_STROKE} aria-hidden />
            </button>
          </div>

          {/* Item 4 — Zoom (farthest from FAB) */}
          <div
            className="absolute right-0 flex items-center gap-2 whitespace-nowrap"
            style={{
              bottom: 244,
              opacity: fabOpen ? 1 : 0,
              transform: fabOpen ? 'translateY(0)' : 'translateY(10px)',
              transition: 'opacity 150ms ease, transform 150ms ease',
              transitionDelay: fabOpen ? '150ms' : '0ms',
              pointerEvents: fabOpen ? 'auto' : 'none',
            }}
          >
            <span className="rounded-md bg-black/55 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
              Zoom
            </span>
            <div className="flex items-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--bg-surface)]/95 shadow-md backdrop-blur-sm">
              <button
                type="button"
                aria-label="Reducir tamaño de texto"
                onClick={() => {
                  const v = parseFloat(Math.max(0.7, chordZoom - 0.1).toFixed(1));
                  setChordZoom(v); setLyricZoom(v);
                }}
                className="flex h-11 w-11 shrink-0 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-colors text-xs font-bold"
              >
                A<span className="text-[8px]">−</span>
              </button>
              <button
                type="button"
                aria-label="Restablecer tamaño de texto"
                onClick={() => { setChordZoom(1); setLyricZoom(1); }}
                className="min-w-[2.75rem] px-1 text-center text-sm font-semibold tabular-nums text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors"
              >
                {chordZoom.toFixed(1)}×
              </button>
              <button
                type="button"
                aria-label="Aumentar tamaño de texto"
                onClick={() => {
                  const v = parseFloat(Math.min(2, chordZoom + 0.1).toFixed(1));
                  setChordZoom(v); setLyricZoom(v);
                }}
                className="flex h-11 w-11 shrink-0 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-colors text-xs font-bold"
              >
                A<span className="text-[10px]">+</span>
              </button>
            </div>
          </div>

          {/* Main FAB */}
          <button
            type="button"
            title={fabOpen ? 'Cerrar opciones' : 'Opciones (tono, vista, zoom…)'}
            aria-label={fabOpen ? 'Cerrar opciones' : 'Abrir opciones'}
            aria-expanded={fabOpen}
            onClick={() => setFabOpen((o) => !o)}
            className="absolute inset-0 flex items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)]/95 text-[var(--text-primary)] shadow-lg backdrop-blur-sm hover:bg-[var(--bg-elevated)] transition-colors active:scale-95"
            style={{ transition: 'transform 200ms ease, background-color 150ms ease' }}
          >
            <SlidersHorizontal
              size={22}
              strokeWidth={ICON_STROKE}
              aria-hidden
              style={{
                transform: fabOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 200ms ease',
              }}
            />
          </button>
        </div>
      )}

      {!editMode && (
        <div
          className="fixed bottom-4 left-1/2 z-[150] flex -translate-x-1/2 items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-surface)]/95 px-2 py-1.5 shadow-lg backdrop-blur-sm md:bottom-6"
          role="toolbar"
          aria-label={stageMode ? 'Controles de setlist' : 'Velocidad de scroll, reproducción automática y secciones'}
        >
          {stageMode ? (
            <>
              {/* Stage mode: prev / scroll / counter / next */}
              <button
                type="button"
                className={setlistContext?.prevSong ? fabBtnClass : `${fabBtnClass} opacity-30 pointer-events-none`}
                title="Canción anterior"
                aria-label="Canción anterior del setlist"
                onClick={() => setlistContext?.prevSong && navigateToSong(
                  setlistContext.prevSong.songId,
                  setlistContext.prevSong.versionId,
                  setlistContext.position - 1
                )}
              >
                <ChevronLeft size={ICON_INLINE} strokeWidth={ICON_STROKE} className="shrink-0" aria-hidden />
              </button>
              <button
                type="button"
                className={scrollPlaying
                  ? `${fabBtnClass} text-[var(--danger)] border-red-500/30 bg-red-500/10`
                  : fabBtnClass}
                title={scrollPlaying ? 'Pausar scroll' : 'Iniciar scroll automático'}
                aria-label={scrollPlaying ? 'Pausar scroll automático' : 'Iniciar scroll automático'}
                onClick={toggleAutoScroll}
              >
                {scrollPlaying
                  ? <Pause size={ICON_INLINE} strokeWidth={ICON_STROKE} className="shrink-0" aria-hidden />
                  : <Play size={ICON_INLINE} strokeWidth={ICON_STROKE} className="shrink-0" aria-hidden />}
              </button>
              {setlistContext && (
                <button
                  type="button"
                  className="px-2 text-xs font-semibold tabular-nums text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
                  title="Ver lista de canciones"
                  aria-label="Ver lista de canciones del setlist"
                  onClick={() => setSetlistOpen((o) => !o)}
                >
                  {setlistContext.position + 1}/{setlistContext.total}
                </button>
              )}
              <button
                type="button"
                className={setlistContext?.nextSong ? fabBtnClass : `${fabBtnClass} opacity-30 pointer-events-none`}
                title="Siguiente canción"
                aria-label="Siguiente canción del setlist"
                onClick={() => setlistContext?.nextSong && navigateToSong(
                  setlistContext.nextSong.songId,
                  setlistContext.nextSong.versionId,
                  setlistContext.position + 1
                )}
              >
                <ChevronRight size={ICON_INLINE} strokeWidth={ICON_STROKE} className="shrink-0" aria-hidden />
              </button>
            </>
          ) : (
            <>
              {/* Normal mode: speed − + / scroll / next-section */}
              <button
                type="button"
                className={fabBtnClass}
                title="Bajar velocidad de scroll"
                aria-label="Bajar velocidad de scroll automático"
                onClick={() => adjustScrollSpeed(-5)}
              >
                <Minus size={ICON_INLINE} strokeWidth={ICON_STROKE} className="shrink-0" aria-hidden />
              </button>
              <button
                type="button"
                className={fabBtnClass}
                title="Subir velocidad de scroll"
                aria-label="Subir velocidad de scroll automático"
                onClick={() => adjustScrollSpeed(5)}
              >
                <Plus size={ICON_INLINE} strokeWidth={ICON_STROKE} className="shrink-0" aria-hidden />
              </button>
              <button
                type="button"
                className={scrollPlaying
                  ? `${fabBtnClass} text-[var(--danger)] border-red-500/30 bg-red-500/10 hover:bg-red-500/15 dark:border-red-400/25`
                  : fabBtnClass}
                title={scrollPlaying ? 'Pausar scroll' : 'Iniciar scroll automático'}
                aria-label={scrollPlaying ? 'Pausar scroll automático' : 'Iniciar scroll automático'}
                onClick={toggleAutoScroll}
              >
                {scrollPlaying
                  ? <Pause size={ICON_INLINE} strokeWidth={ICON_STROKE} className="shrink-0" aria-hidden />
                  : <Play size={ICON_INLINE} strokeWidth={ICON_STROKE} className="shrink-0" aria-hidden />}
              </button>
              <button
                type="button"
                className={fabBtnClass}
                title="Siguiente sección de la canción (verso, estribillo…)"
                aria-label="Desplazarse a la siguiente sección de la canción"
                onClick={goToNextSection}
              >
                <ChevronDown size={ICON_INLINE} strokeWidth={ICON_STROKE} className="shrink-0 -rotate-90" aria-hidden />
              </button>
            </>
          )}
        </div>
      )}

      {/* Stage FAB — bottom-right: list + exit (same z as settings FAB, hidden when settings FAB shows) */}
      {stageMode && !editMode && (
        <>
          {stageFabOpen && (
            <div
              className="fixed inset-0 z-[148]"
              onClick={() => setStageFabOpen(false)}
            />
          )}
          <div
            className="fixed bottom-4 right-4 z-[149]"
            style={{ width: 56, height: 56 }}
          >
            {/* Item 1 — Setlist (only if setlistContext) */}
            {setlistContext && (
              <div
                className="absolute right-0 flex items-center gap-2 whitespace-nowrap"
                style={{
                  bottom: 68,
                  opacity: stageFabOpen ? 1 : 0,
                  transform: stageFabOpen ? 'translateY(0)' : 'translateY(10px)',
                  transition: 'opacity 150ms ease, transform 150ms ease',
                  transitionDelay: stageFabOpen ? '0ms' : '0ms',
                  pointerEvents: stageFabOpen ? 'auto' : 'none',
                }}
              >
                <span className="rounded-md bg-black/55 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
                  {setlistContext.setlistName}
                </span>
                <button
                  type="button"
                  aria-label="Ver lista del setlist"
                  onClick={() => { setSetlistOpen((o) => !o); setStageFabOpen(false); }}
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border shadow-md backdrop-blur-sm transition-colors ${setlistOpen ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent)]' : 'border-[var(--border)] bg-[var(--bg-surface)]/95 text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'}`}
                >
                  <List size={20} strokeWidth={ICON_STROKE} aria-hidden />
                </button>
              </div>
            )}
            {/* Item 2 — Exit */}
            <div
              className="absolute right-0 flex items-center gap-2 whitespace-nowrap"
              style={{
                bottom: setlistContext ? 128 : 68,
                opacity: stageFabOpen ? 1 : 0,
                transform: stageFabOpen ? 'translateY(0)' : 'translateY(10px)',
                transition: 'opacity 150ms ease, transform 150ms ease',
                transitionDelay: stageFabOpen ? (setlistContext ? '50ms' : '0ms') : '0ms',
                pointerEvents: stageFabOpen ? 'auto' : 'none',
              }}
            >
              <span className="rounded-md bg-black/55 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
                Salir escenario
              </span>
              <button
                type="button"
                aria-label="Salir de modo escenario"
                onClick={() => { setStageMode(false); setStageFabOpen(false); }}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)]/95 text-[var(--text-primary)] shadow-md backdrop-blur-sm hover:bg-[var(--bg-elevated)] transition-colors"
              >
                <Minimize2 size={20} strokeWidth={ICON_STROKE} aria-hidden />
              </button>
            </div>
            {/* Main stage FAB */}
            <button
              type="button"
              aria-label={stageFabOpen ? 'Cerrar menú escenario' : 'Opciones de escenario'}
              aria-expanded={stageFabOpen}
              onClick={() => setStageFabOpen((o) => !o)}
              className="absolute inset-0 flex items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)]/95 text-[var(--text-primary)] shadow-lg backdrop-blur-sm hover:bg-[var(--bg-elevated)] transition-colors active:scale-95"
            >
              <Maximize2
                size={22}
                strokeWidth={ICON_STROKE}
                aria-hidden
                style={{
                  transform: stageFabOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 200ms ease',
                }}
              />
            </button>
          </div>
        </>
      )}

      <TextPromptDialog
        open={nameDialogOpen}
        onOpenChange={(open) => {
          setNameDialogOpen(open);
          if (!open) setVersionDialogKind(null);
        }}
        title={
          versionDialogKind === 'dup'
            ? 'Nombre de la copia'
            : versionDialogKind === 'first'
              ? 'Nombre de la versión'
              : 'Nueva versión'
        }
        description={
          versionDialogKind === 'dup'
            ? 'Se crea una nueva versión con el mismo contenido y ajustes actuales.'
            : undefined
        }
        defaultValue={nameDialogDefault}
        confirmLabel="Guardar"
        onConfirm={(name) => void onVersionNameConfirm(name)}
      />
    </div>
  );
}
