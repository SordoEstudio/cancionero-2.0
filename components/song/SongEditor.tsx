'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MiniToast, type MiniToastKind } from '@/components/ui/MiniToast';
import { useRouter } from 'next/navigation';
import type { ChordToken, FullSong, SectionType, SongSectionWithLines, SongVersionActive, ViewMode } from '@/types';
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
  ChevronDown,
  Home,
  Maximize2,
  Menu,
  Minimize2,
  Minus,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  Plus,
  SquarePen,
} from 'lucide-react';
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
}

type PrefsBaseline = {
  transposeSteps: number;
  capo: number;
  viewMode: ViewMode;
  scrollSpeed: number;
  hiddenTabs: string[];
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
    a.notes === b.notes
  );
}

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

export function SongEditor({
  song,
  displaySections,
  activeVersion,
  variantKey,
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
  const [stageMode, setStageMode] = useState(false);
  const [notes, setNotes] = useState(activeVersion?.notes ?? '');
  const [notesOpen, setNotesOpen] = useState(() => !!(activeVersion?.notes));
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [hiddenLabelIds, setHiddenLabelIds] = useState<Set<string>>(new Set());
  const [sectionNotes, setSectionNotes] = useState<Record<string, string>>({});
  const [copiedChordPattern, setCopiedChordPattern] = useState<ChordToken[][] | null>(null);
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [nameDialogDefault, setNameDialogDefault] = useState('');
  const [versionDialogKind, setVersionDialogKind] = useState<'new' | 'first' | 'dup' | null>(null);
  const prefsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevActiveSectionRef = useRef<string | null>(null);

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
          notes: activeVersion.notes ?? '',
        }
      : {
          transposeSteps: 0,
          capo: 0,
          viewMode: 'default',
          scrollSpeed: scrollBase,
          hiddenTabs: [],
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
    setStageMode(false);
    setCopiedChordPattern(null);

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

  const toggleLabelHidden = useCallback((sectionId: string) => {
    setHiddenLabelIds((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
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

  const isDirty = useMemo(() => {
    if (!baseline) return false;
    const prefsNow: PrefsBaseline = {
      transposeSteps,
      capo,
      viewMode,
      scrollSpeed,
      hiddenTabs: hiddenTabsArr,
      notes,
    };
    return (
      sectionsSnapshot(sections) !== baseline.sectionsStr || !prefsEqual(prefsNow, baseline.prefs)
    );
  }, [sections, transposeSteps, capo, viewMode, scrollSpeed, hiddenTabsArr, notes, baseline]);

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
          <h1 className="text-lg font-bold text-[var(--text-primary)] truncate">
            {song.title}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] truncate">{song.artist}</p>
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
                        ? 'Guardar en la versión actual'
                        : 'Crear la primera versión'
                  }
                  onClick={() => void handleSavePrimary()}
                >
                  Guardar
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
                      onSelect={() => setPanelOpen((o) => !o)}
                    >
                      {panelOpen ? 'Ocultar panel lateral' : 'Mostrar panel lateral'}
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
                      Guardar
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

      {stageMode && (
        <div className="fixed right-4 top-4 z-[160] flex items-center gap-2">
          <button
            type="button"
            className={floatBtnClass}
            title="Salir de modo escenario"
            aria-label="Salir de modo escenario"
            onClick={() => setStageMode(false)}
          >
            <Minimize2 size={ICON_INLINE} strokeWidth={ICON_STROKE} className="shrink-0" aria-hidden />
          </button>
          {scrollPlaying && (
            <button
              type="button"
              className={`${floatBtnClass} text-[var(--danger)] border-red-500/30 bg-red-500/10 hover:bg-red-500/15 dark:border-red-400/25`}
              title="Pausar scroll"
              aria-label="Pausar scroll automático"
              onClick={pauseAutoScroll}
            >
              <Pause size={ICON_INLINE} strokeWidth={ICON_STROKE} className="shrink-0" aria-hidden />
            </button>
          )}
        </div>
      )}

      {editMode && (
        <p className="mx-4 mt-2 text-xs text-[var(--text-muted)]">
          Editá acordes y letra. Los acordes se confirman al salir del campo (Tab o clic fuera). Usá Guardar para la versión actual o Guardar nueva versión para crear otra entrada.
        </p>
      )}

      <nav
        className={[
          'sticky z-[45] overflow-x-auto border-b border-[var(--border)] bg-[var(--bg-base)]/95 backdrop-blur-sm shadow-sm',
          topNavHidden ? 'top-0' : 'top-[52px]',
          stageMode ? 'opacity-60 hover:opacity-100 transition-opacity' : '',
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
                onClick={() =>
                  document
                    .getElementById(`section-${section.id}`)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
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
          {sections.map((section) => (
            <div key={section.id} id={`section-${section.id}`}>
              <SectionBlock
                section={section}
                chordTransposeSteps={transposeSteps - capo}
                viewMode={viewMode}
                useFlats={useFlats}
                editMode={editMode}
                editSession={editSession}
                tabVisible={section.type === 'tab' ? !hiddenTabIds.has(section.id) : undefined}
                onToggleTab={section.type === 'tab' ? () => toggleTabSection(section.id) : undefined}
                collapsed={collapsedIds.has(section.id)}
                onToggleCollapse={() => toggleCollapse(section.id)}
                labelHidden={hiddenLabelIds.has(section.id)}
                onToggleLabelHidden={() => toggleLabelHidden(section.id)}
                onRenameSection={(newLabel) => handleRenameSection(section.id, newLabel)}
                sectionNote={sectionNotes[section.id] ?? ''}
                onSectionNoteChange={(note) => handleSectionNoteChange(section.id, note)}
                onUpdateLine={(lineId, patch) => handleUpdateLine(section.id, lineId, patch)}
                hasCopiedPattern={copiedChordPattern !== null}
                onCopyChords={editMode ? () => handleCopySection(section.id) : undefined}
                onPasteChords={editMode && copiedChordPattern !== null ? () => handlePasteSection(section.id) : undefined}
              />
            </div>
          ))}
        </main>

        {panelOpen && !stageMode && (
          <aside
            aria-label="Tono, scroll automático, vista y tamaño de texto"
            className={[
              'w-full shrink-0 space-y-3 border-[var(--border)] bg-[var(--bg-surface)] p-3 sm:p-4',
              'border-t md:w-64 md:border-l md:border-t-0',
              'max-h-[min(28rem,78svh)] overflow-y-auto overscroll-y-contain md:max-h-none',
              'md:sticky md:top-16 md:h-[calc(100vh-4rem)]',
            ].join(' ')}
          >
            {!editMode && (
              <ScrollControl
                speed={scrollSpeed}
                onSpeedChange={setScrollSpeed}
                playing={scrollPlaying}
                onTogglePlay={toggleAutoScroll}
                onReset={resetAutoScroll}
              />
            )}
            <ToneSelector
              originalKey={song.original_key}
              transposeSteps={transposeSteps}
              capo={capo}
              useFlats={useFlats}
              onTransposeChange={setTransposeSteps}
              onCapoChange={setCapo}
            />
            {!editMode && (
              <ViewModeSwitch
                value={viewMode}
                onChange={setViewMode}
                hasTabs={hasTabs}
                allTabsHidden={allTabsHidden}
                onToggleTabs={toggleAllTabs}
              />
            )}

            <div className="space-y-2">
              <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                Tamaño
              </p>
              <label className="flex flex-col gap-1.5 text-xs text-[var(--text-secondary)] sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                <span className="shrink-0 sm:pt-0">Acordes</span>
                <span className="flex min-h-[2.25rem] min-w-0 flex-1 items-center gap-2 sm:max-w-[9.5rem]">
                  <input
                    type="range"
                    min="0.7"
                    max="2"
                    step="0.1"
                    value={chordZoom}
                    onChange={(e) => setChordZoom(parseFloat(e.target.value))}
                    className="h-2 min-w-0 w-full flex-1 cursor-pointer accent-[var(--accent)] sm:w-24 sm:flex-none"
                  />
                  <span className="w-8 shrink-0 text-right font-mono text-[10px] tabular-nums">
                    {chordZoom.toFixed(1)}
                  </span>
                </span>
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-[var(--text-secondary)] sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                <span className="shrink-0 sm:pt-0">Letra</span>
                <span className="flex min-h-[2.25rem] min-w-0 flex-1 items-center gap-2 sm:max-w-[9.5rem]">
                  <input
                    type="range"
                    min="0.7"
                    max="2"
                    step="0.1"
                    value={lyricZoom}
                    onChange={(e) => setLyricZoom(parseFloat(e.target.value))}
                    className="h-2 min-w-0 w-full flex-1 cursor-pointer accent-[var(--accent)] sm:w-24 sm:flex-none"
                  />
                  <span className="w-8 shrink-0 text-right font-mono text-[10px] tabular-nums">
                    {lyricZoom.toFixed(1)}
                  </span>
                </span>
              </label>
              {(chordZoom !== 1 || lyricZoom !== 1) && (
                <button
                  type="button"
                  onClick={() => {
                    setChordZoom(1);
                    setLyricZoom(1);
                  }}
                  className="text-[10px] text-[var(--accent)] hover:underline"
                >
                  Restablecer tamaño
                </button>
              )}
            </div>

            <div className="text-xs text-[var(--text-muted)] space-y-1 pt-2">
              {song.original_key && (
                <p>
                  Tono original:{' '}
                  <span className="font-mono text-[var(--chord-color)]">{song.original_key}</span>
                </p>
              )}
              <a
                href={song.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block hover:text-[var(--accent)] underline truncate"
              >
                Ver fuente original
              </a>
            </div>

            <div className="border-t border-[var(--border)] pt-2">
              <button
                type="button"
                onClick={() => setNotesOpen((o) => !o)}
                className="flex items-center gap-1 w-full text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider hover:text-[var(--text-primary)]"
              >
                <ChevronDown
                  size={12}
                  strokeWidth={ICON_STROKE}
                  className={`shrink-0 transition-transform ${notesOpen ? '' : '-rotate-90'}`}
                  aria-hidden
                />
                Notas
              </button>
              {notesOpen && (
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Apuntes, ideas, recordatorios…"
                  rows={3}
                  className="mt-1.5 w-full resize-y rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  style={{ minHeight: '3rem' }}
                />
              )}
            </div>
          </aside>
        )}
      </div>

      {!stageMode && !editMode && (
        <div
          className="fixed bottom-4 left-1/2 z-[150] flex -translate-x-1/2 items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-surface)]/95 px-2 py-1.5 shadow-lg backdrop-blur-sm md:bottom-6"
          role="toolbar"
          aria-label="Velocidad de scroll, reproducción automática y secciones"
        >
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
            className={
              scrollPlaying
                ? `${fabBtnClass} text-[var(--danger)] border-red-500/30 bg-red-500/10 hover:bg-red-500/15 dark:border-red-400/25`
                : fabBtnClass
            }
            title={scrollPlaying ? 'Pausar scroll' : 'Iniciar scroll automático'}
            aria-label={scrollPlaying ? 'Pausar scroll automático' : 'Iniciar scroll automático'}
            onClick={toggleAutoScroll}
          >
            {scrollPlaying ? (
              <Pause size={ICON_INLINE} strokeWidth={ICON_STROKE} className="shrink-0" aria-hidden />
            ) : (
              <Play size={ICON_INLINE} strokeWidth={ICON_STROKE} className="shrink-0" aria-hidden />
            )}
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
        </div>
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
