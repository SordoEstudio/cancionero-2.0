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
import { ScrollControl, SCROLL_SPEED_DEFAULT } from '@/components/controls/ScrollControl';
import { ViewModeSwitch } from '@/components/controls/ViewModeSwitch';
import {
  Check,
  ChevronDown,
  Maximize2,
  Menu,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Save,
  SquarePen,
} from 'lucide-react';
import { ICON_CHEVRON, ICON_INLINE, ICON_STROKE, ICON_TOOLBAR, lucideDecorative } from '@/components/ui/icon-tokens';
import { IconButton, lucideInIconButton } from '@/components/ui/IconButton';

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

export function SongEditor({
  song,
  displaySections,
  activeVersion,
  variantKey,
}: SongEditorProps) {
  const router = useRouter();
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
  const [scrollSpeed, setScrollSpeed] = useState(
    () => activeVersion?.scroll_speed ?? SCROLL_SPEED_DEFAULT
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
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  const saveMenuRef = useRef<HTMLDivElement>(null);
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
    const nextPrefs: PrefsBaseline = activeVersion
      ? {
          transposeSteps: activeVersion.transpose_steps,
          capo: activeVersion.capo,
          viewMode: activeVersion.view_mode,
          scrollSpeed: activeVersion.scroll_speed ?? SCROLL_SPEED_DEFAULT,
          hiddenTabs: nextHiddenTabs,
          notes: activeVersion.notes ?? '',
        }
      : {
          transposeSteps: 0,
          capo: 0,
          viewMode: 'default',
          scrollSpeed: SCROLL_SPEED_DEFAULT,
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
    setSaveMenuOpen(false);
    setStageMode(false);
  }, [variantKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!saveMenuRef.current?.contains(e.target as Node)) {
        setSaveMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSaveMenuOpen(false);
    }
    if (saveMenuOpen) {
      document.addEventListener('mousedown', onDocClick);
      window.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('mousedown', onDocClick);
        window.removeEventListener('keydown', onKey);
      };
    }
  }, [saveMenuOpen]);

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
    setSaveMenuOpen(false);
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

  async function handleSaveAsNewVersion() {
    const name = prompt(
      'Nombre para la nueva versión:',
      `${song.title} (${activeVersion?.name ?? 'copia'})`
    );
    if (!name) return;

    setSaving(true);
    setSaveMenuOpen(false);
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

  async function handleSavePrimary() {
    if (!isDirty) return;
    if (activeVersion?.id) {
      await handleSaveCurrentVersion();
    } else {
      const name = prompt(
        'Nombre para esta versión:',
        `${song.title} (tono ${song.original_key ?? '?'} +${transposeSteps})`
      );
      if (!name) return;
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
  }

  const savePrimaryLabel = !activeVersion?.id
    ? 'Guardar como nueva versión'
    : 'Guardar cambios en esta versión';

  const showFloatingChrome = scrollPlaying || !songHeaderInView;
  const floatBtnClass =
    'inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)]/95 text-[var(--text-primary)] shadow-lg backdrop-blur-sm transition-opacity hover:bg-[var(--bg-elevated)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';

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
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-[var(--text-primary)] truncate">
            {song.title}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] truncate">{song.artist}</p>
          {activeVersion && (
            <p className="text-xs text-[var(--accent)] truncate mt-0.5" title={activeVersion.name}>
              Versión: {activeVersion.name}
            </p>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <IconButton
            label={editMode ? 'Listo (salir de edición)' : 'Editar cifra'}
            onClick={toggleEditMode}
            className={
              editMode
                ? 'text-[var(--accent)] bg-[var(--accent-muted)] hover:bg-[var(--accent-muted)]'
                : ''
            }
          >
            {editMode ? (
              <Check {...lucideInIconButton} />
            ) : (
              <SquarePen {...lucideInIconButton} />
            )}
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
            onClick={() => { setStageMode(true); if (!scrollPlaying) playAutoScroll(); }}
          >
            <Maximize2 {...lucideInIconButton} />
          </IconButton>

          <div className="relative ml-1 flex items-center" ref={saveMenuRef}>
            <div className="flex items-stretch rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden">
              <button
                type="button"
                disabled={!isDirty || saving}
                title={
                  !isDirty
                    ? 'No hay cambios para guardar'
                    : savePrimaryLabel
                }
                aria-label={!isDirty ? 'No hay cambios para guardar' : savePrimaryLabel}
                onClick={handleSavePrimary}
                className={[
                  'inline-flex h-9 w-9 items-center justify-center text-[var(--text-secondary)]',
                  'hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]',
                  'disabled:pointer-events-none disabled:opacity-40',
                  saving && 'animate-pulse',
                ].join(' ')}
              >
                <Save {...lucideDecorative(ICON_TOOLBAR)} />
              </button>
              {activeVersion?.id && (
                <button
                  type="button"
                  disabled={saving}
                  title="Más opciones de guardado"
                  aria-label="Más opciones de guardado"
                  aria-expanded={saveMenuOpen}
                  onClick={() => setSaveMenuOpen((o) => !o)}
                  className="w-7 flex items-center justify-center border-l border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
                >
                  <ChevronDown {...lucideDecorative(ICON_CHEVRON)} />
                </button>
              )}
            </div>

            {saveMenuOpen && activeVersion?.id && (
              <div
                className="absolute right-0 top-[calc(100%+4px)] z-30 min-w-[14rem] rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] py-1 shadow-lg"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  disabled={saving}
                  className="w-full px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                  onClick={() => {
                    void handleSaveAsNewVersion();
                  }}
                >
                  Guardar como nueva versión…
                </button>
                <p className="px-3 pb-2 text-[10px] text-[var(--text-muted)] leading-snug">
                  Crea otra entrada en tu lista con el estado actual (misma cifra y ajustes).
                </p>
              </div>
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
          Editá acordes y letra. Los acordes se confirman al salir del campo (Tab o clic fuera). Usá el ícono de guardar para persistir.
        </p>
      )}

      <nav
        className={`sticky top-0 z-20 overflow-x-auto border-b border-[var(--border)] bg-[var(--bg-base)]/95 backdrop-blur-sm ${
          stageMode ? 'opacity-60 hover:opacity-100 transition-opacity' : ''
        }`}
      >
        <div className="flex gap-1.5 px-3 py-1.5">
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
                className={`shrink-0 rounded-full px-3 py-0.5 text-xs font-medium border transition-all ${
                  isActive ? 'opacity-100 shadow-sm' : 'opacity-50 hover:opacity-80'
                }`}
                style={{
                  color,
                  borderColor: color,
                  backgroundColor: isActive
                    ? `color-mix(in srgb, ${color} 15%, transparent)`
                    : 'transparent',
                }}
              >
                {section.label}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="flex gap-0">
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
                onUpdateLine={(lineId, patch) => handleUpdateLine(section.id, lineId, patch)}
              />
            </div>
          ))}
        </main>

        {panelOpen && !stageMode && (
          <aside className="w-64 shrink-0 p-4 border-l border-[var(--border)] space-y-3 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
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
              <label className="flex items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
                Acordes
                <input
                  type="range"
                  min="0.7"
                  max="2"
                  step="0.1"
                  value={chordZoom}
                  onChange={(e) => setChordZoom(parseFloat(e.target.value))}
                  className="w-24 accent-[var(--accent)]"
                />
                <span className="w-8 text-right font-mono text-[10px]">
                  {chordZoom.toFixed(1)}
                </span>
              </label>
              <label className="flex items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
                Letra
                <input
                  type="range"
                  min="0.7"
                  max="2"
                  step="0.1"
                  value={lyricZoom}
                  onChange={(e) => setLyricZoom(parseFloat(e.target.value))}
                  className="w-24 accent-[var(--accent)]"
                />
                <span className="w-8 text-right font-mono text-[10px]">
                  {lyricZoom.toFixed(1)}
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
    </div>
  );
}
