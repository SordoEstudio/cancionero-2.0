'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MiniToast, type MiniToastKind } from '@/components/ui/MiniToast';
import { useRouter } from 'next/navigation';
import type { ChordToken, FullSong, SongSectionWithLines, SongVersionActive, ViewMode } from '@/types';
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
  PanelRightClose,
  PanelRightOpen,
  Save,
  SquarePen,
} from 'lucide-react';
import { ICON_CHEVRON, ICON_TOOLBAR, lucideDecorative } from '@/components/ui/icon-tokens';
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
    a.scrollSpeed === b.scrollSpeed
  );
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

  const dismissToast = useCallback(() => setToast(null), []);

  function pushToast(kind: MiniToastKind, text: string, title?: string) {
    setToast({ kind, text, title });
  }

  useEffect(() => {
    const nextSections = cloneSections(displaySections ?? song.sections);
    const nextPrefs: PrefsBaseline = activeVersion
      ? {
          transposeSteps: activeVersion.transpose_steps,
          capo: activeVersion.capo,
          viewMode: activeVersion.view_mode,
          scrollSpeed: activeVersion.scroll_speed ?? SCROLL_SPEED_DEFAULT,
        }
      : {
          transposeSteps: 0,
          capo: 0,
          viewMode: 'default',
          scrollSpeed: SCROLL_SPEED_DEFAULT,
        };

    setSections(nextSections);
    setTransposeSteps(nextPrefs.transposeSteps);
    setCapo(nextPrefs.capo);
    setViewMode(nextPrefs.viewMode);
    setScrollSpeed(nextPrefs.scrollSpeed);
    setBaseline({
      sectionsStr: sectionsSnapshot(nextSections),
      prefs: nextPrefs,
    });
    setEditMode(false);
    setSaveMenuOpen(false);
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

  const isDirty = useMemo(() => {
    if (!baseline) return false;
    const prefsNow: PrefsBaseline = {
      transposeSteps,
      capo,
      viewMode,
      scrollSpeed,
    };
    return (
      sectionsSnapshot(sections) !== baseline.sectionsStr || !prefsEqual(prefsNow, baseline.prefs)
    );
  }, [sections, transposeSteps, capo, viewMode, scrollSpeed, baseline]);

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

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      <header className="sticky top-0 z-20 bg-[var(--bg-base)] border-b border-[var(--border)] px-3 sm:px-4 py-2.5 flex items-center justify-between gap-3">
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

      {toast && (
        <MiniToast
          kind={toast.kind}
          text={toast.text}
          title={toast.title}
          onDismiss={dismissToast}
        />
      )}

      {editMode && (
        <p className="mx-4 mt-2 text-xs text-[var(--text-muted)]">
          Editá acordes y letra. Los acordes se confirman al salir del campo (Tab o clic fuera). Usá el ícono de guardar para persistir.
        </p>
      )}

      <div className="flex gap-0">
        <main className="flex-1 min-w-0 px-4 py-6 overflow-x-auto">
          {sections.map((section) => (
            <SectionBlock
              key={section.id}
              section={section}
              chordTransposeSteps={transposeSteps - capo}
              viewMode={viewMode}
              useFlats={useFlats}
              editMode={editMode}
              editSession={editSession}
              onUpdateLine={(lineId, patch) => handleUpdateLine(section.id, lineId, patch)}
            />
          ))}
        </main>

        {panelOpen && (
          <aside className="w-64 shrink-0 p-4 border-l border-[var(--border)] space-y-3 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
            {!editMode && (
              <ScrollControl
                speed={scrollSpeed}
                onSpeedChange={setScrollSpeed}
                onScrollSessionStart={() => setPanelOpen(false)}
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
            {!editMode && <ViewModeSwitch value={viewMode} onChange={setViewMode} />}

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
          </aside>
        )}
      </div>
    </div>
  );
}
