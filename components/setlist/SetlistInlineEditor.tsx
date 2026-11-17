'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, GripVertical, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { ICON_INLINE, ICON_STROKE } from '@/components/ui/icon-tokens';
import type { SetlistItem, SetlistSongItem } from '@/types';

type LibrarySongLite = { id: string; title: string; artist: string };

const stripBtnClass =
  'flex shrink-0 items-center justify-center border-l border-[var(--border)] px-3 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-colors';

export function SetlistInlineEditor({
  setlist,
  expanded,
  onToggleExpand,
  onDeleteSetlist,
  songsLoading,
  songsReady,
  initialSongs,
  librarySongs,
  onSongsChange,
  onSetlistMetaChange,
  onReloadAll,
}: {
  setlist: SetlistItem;
  expanded: boolean;
  onToggleExpand: () => void;
  onDeleteSetlist: () => void;
  songsLoading: boolean;
  songsReady: boolean;
  initialSongs: SetlistSongItem[];
  librarySongs: LibrarySongLite[];
  onSongsChange: (songs: SetlistSongItem[]) => void;
  onSetlistMetaChange: (name: string, description: string) => void;
  onReloadAll: () => Promise<void>;
}) {
  const [songs, setSongs] = useState<SetlistSongItem[]>(initialSongs);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(setlist.name);
  const [editDescription, setEditDescription] = useState(setlist.description ?? '');
  const [savingMeta, setSavingMeta] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [addingSongId, setAddingSongId] = useState<string | null>(null);
  const addPanelRef = useRef<HTMLDivElement>(null);
  const addSearchInputRef = useRef<HTMLInputElement>(null);

  const [reordering, setReordering] = useState(false);
  const [deletingSongId, setDeletingSongId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragFromRef = useRef<number | null>(null);

  useEffect(() => {
    setSongs(initialSongs);
  }, [initialSongs]);

  useEffect(() => {
    if (!editing) {
      setEditName(setlist.name);
      setEditDescription(setlist.description ?? '');
    }
  }, [setlist.name, setlist.description, editing]);

  useEffect(() => {
    if (!expanded) {
      setEditing(false);
      setEditName(setlist.name);
      setEditDescription(setlist.description ?? '');
      setAddOpen(false);
      setAddSearch('');
    }
  }, [expanded, setlist.name, setlist.description]);

  useEffect(() => {
    if (!addOpen) return;
    function onDoc(e: MouseEvent) {
      if (addPanelRef.current && !addPanelRef.current.contains(e.target as Node)) {
        setAddOpen(false);
        setAddSearch('');
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [addOpen]);

  const sortedSongs = useMemo(
    () => [...songs].sort((a, b) => a.position - b.position),
    [songs]
  );

  const songIdsInSet = useMemo(() => new Set(sortedSongs.map((s) => s.song_id)), [sortedSongs]);

  const filteredLibrary = useMemo(() => {
    const q = addSearch.trim().toLowerCase();
    if (!q) return librarySongs;
    return librarySongs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) || (s.artist ?? '').toLowerCase().includes(q)
    );
  }, [librarySongs, addSearch]);

  const refreshFromServer = useCallback(async () => {
    const res = await fetch(`/api/setlists/${setlist.id}`, { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.songs)) {
      const next = data.songs as SetlistSongItem[];
      setSongs(next);
      onSongsChange(next);
    }
    await onReloadAll();
  }, [setlist.id, onSongsChange, onReloadAll]);

  async function persistOrder(nextRows: SetlistSongItem[]) {
    const body = {
      songs: nextRows.map((row, index) => ({
        songId: row.song_id,
        position: index,
      })),
    };
    setReordering(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/setlists/${setlist.id}/songs`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLoadError(typeof data.error === 'string' ? data.error : 'No se pudo reordenar');
        await refreshFromServer();
        return;
      }
      const mapped = nextRows.map((row, index) => ({ ...row, position: index }));
      setSongs(mapped);
      onSongsChange(mapped);
    } finally {
      setReordering(false);
    }
  }

  function reorder(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= sortedSongs.length || to >= sortedSongs.length) {
      return;
    }
    const next = [...sortedSongs];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    void persistOrder(next);
  }

  async function removeSong(songId: string) {
    setDeletingSongId(songId);
    setLoadError(null);
    try {
      const res = await fetch(`/api/setlists/${setlist.id}/songs`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLoadError(typeof data.error === 'string' ? data.error : 'No se pudo quitar');
        return;
      }
      await refreshFromServer();
    } finally {
      setDeletingSongId(null);
    }
  }

  async function addSong(songId: string) {
    setAddingSongId(songId);
    setLoadError(null);
    try {
      const res = await fetch(`/api/setlists/${setlist.id}/songs`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLoadError(typeof data.error === 'string' ? data.error : 'No se pudo agregar');
        return;
      }
      setAddSearch('');
      await refreshFromServer();
    } finally {
      setAddingSongId(null);
    }
  }

  function cancelMetaEdit() {
    setEditing(false);
    setEditName(setlist.name);
    setEditDescription(setlist.description ?? '');
  }

  async function saveMeta() {
    const name = editName.trim();
    if (!name.length) return;
    setSavingMeta(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/setlists/${setlist.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: editDescription,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(typeof data.error === 'string' ? data.error : 'No se pudo guardar');
        return;
      }
      onSetlistMetaChange(name, editDescription);
      setEditing(false);
      await onReloadAll();
    } finally {
      setSavingMeta(false);
    }
  }

  const showBrowseStrip = expanded && songsReady && !editing;
  const showMetaSaveStrip = expanded && songsReady && editing;
  const headerRoundedRight = !showBrowseStrip && !showMetaSaveStrip;

  const countLabel = songsReady
    ? `${sortedSongs.length} ${sortedSongs.length === 1 ? 'canción' : 'canciones'}`
    : `${setlist.song_count} ${setlist.song_count === 1 ? 'canción' : 'canciones'}`;

  return (
    <>
      <div className="flex items-stretch">
        <div
          role={editing ? undefined : 'button'}
          tabIndex={editing ? undefined : 0}
          onClick={editing ? undefined : () => onToggleExpand()}
          onKeyDown={
            editing
              ? undefined
              : (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onToggleExpand();
                  }
                }
          }
          className={[
            'group flex min-w-0 flex-1 flex-col justify-center px-3 py-2.5 text-left outline-none',
            headerRoundedRight ? 'rounded-r-xl' : '',
            editing
              ? ''
              : 'cursor-pointer hover:bg-[var(--bg-elevated)]/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]',
          ].join(' ')}
        >
          {editing ? (
            <>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="Nombre del setlist"
                className="mb-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1.5 text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                aria-label="Nombre del setlist"
              />
              <p className="text-xs text-[var(--text-muted)]">{countLabel}</p>
            </>
          ) : (
            <>
              <p className="truncate text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)]">
                {setlist.name}
              </p>
              <p className="text-xs text-[var(--text-muted)]">{countLabel}</p>
            </>
          )}
        </div>

        {showBrowseStrip ? (
          <>
            <button
              type="button"
              title="Editar setlist"
              aria-label="Editar nombre y descripción del setlist"
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
              className={stripBtnClass}
            >
              <Pencil size={ICON_INLINE} strokeWidth={ICON_STROKE} className="shrink-0" aria-hidden />
            </button>
            <button
              type="button"
              title={addOpen ? 'Cerrar lista de canciones' : 'Agregar canción'}
              aria-label={
                addOpen ? 'Cerrar lista para agregar canciones al setlist' : 'Abrir lista de canciones para agregar al setlist'
              }
              onClick={(e) => {
                e.stopPropagation();
                if (addOpen) {
                  setAddOpen(false);
                  setAddSearch('');
                } else {
                  setAddOpen(true);
                  queueMicrotask(() => addSearchInputRef.current?.focus());
                }
              }}
              className={[
                stripBtnClass,
                addOpen ? 'text-[var(--danger)] hover:bg-red-500/10 hover:text-[var(--danger)]' : '',
              ].join(' ')}
            >
              {addOpen ? (
                <X size={ICON_INLINE} strokeWidth={ICON_STROKE} className="shrink-0" aria-hidden />
              ) : (
                <Plus size={ICON_INLINE} strokeWidth={ICON_STROKE} className="shrink-0" aria-hidden />
              )}
            </button>
            <button
              type="button"
              title="Eliminar setlist"
              aria-label={`Eliminar setlist ${setlist.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onDeleteSetlist();
              }}
              className={`${stripBtnClass} rounded-r-xl hover:bg-red-500/10 hover:text-[var(--danger)]`}
            >
              <Trash2 size={ICON_INLINE} strokeWidth={ICON_STROKE} className="shrink-0" aria-hidden />
            </button>
          </>
        ) : null}

        {showMetaSaveStrip ? (
          <>
            <button
              type="button"
              title="Cancelar edición"
              aria-label="Cancelar edición del setlist"
              disabled={savingMeta}
              onClick={(e) => {
                e.stopPropagation();
                cancelMetaEdit();
              }}
              className={stripBtnClass}
            >
              <X size={ICON_INLINE} strokeWidth={ICON_STROKE} className="shrink-0" aria-hidden />
            </button>
            <button
              type="button"
              title="Guardar cambios"
              aria-label="Guardar nombre y descripción del setlist"
              disabled={savingMeta || !editName.trim()}
              onClick={(e) => {
                e.stopPropagation();
                void saveMeta();
              }}
              className={`${stripBtnClass} rounded-r-xl text-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent-muted)]`}
            >
              <Check size={ICON_INLINE} strokeWidth={ICON_STROKE} className="shrink-0" aria-hidden />
            </button>
          </>
        ) : null}
      </div>

      {expanded ? (
        <div className="border-t border-[var(--border)] bg-[var(--bg-elevated)]/35 px-2 py-3">
          {songsLoading ? (
            <p className="px-1 text-xs text-[var(--text-muted)]">Cargando…</p>
          ) : !songsReady ? (
            <p className="px-1 text-xs text-[var(--danger)]">No se pudo cargar el setlist.</p>
          ) : (
            <>
              {loadError && (
                <p className="mb-2 rounded-md border border-[var(--danger)]/40 bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--danger)]">
                  {loadError}
                  <button type="button" className="ml-2 underline" onClick={() => setLoadError(null)}>
                    Cerrar
                  </button>
                </p>
              )}

              {addOpen && (
                <div
                  ref={addPanelRef}
                  className="relative z-30 mb-3 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-lg"
                  role="dialog"
                  aria-label="Agregar canción"
                >
                  <div className="border-b border-[var(--border)] p-2">
                    <div className="relative">
                      <Search
                        size={ICON_INLINE}
                        strokeWidth={ICON_STROKE}
                        className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                        aria-hidden
                      />
                      <input
                        ref={addSearchInputRef}
                        type="search"
                        value={addSearch}
                        onChange={(e) => setAddSearch(e.target.value)}
                        placeholder="Buscar en tu biblioteca…"
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] py-1.5 pl-8 pr-2 text-sm"
                      />
                    </div>
                  </div>
                  <ul className="max-h-[min(50vh,280px)] overflow-y-auto p-1">
                    {filteredLibrary.length === 0 ? (
                      <li className="px-2 py-3 text-center text-xs text-[var(--text-muted)]">Sin resultados</li>
                    ) : (
                      filteredLibrary.map((s) => {
                        const inSet = songIdsInSet.has(s.id);
                        return (
                          <li key={s.id}>
                            <button
                              type="button"
                              disabled={inSet || addingSongId === s.id}
                              className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-elevated)] disabled:opacity-50"
                              onClick={() => void addSong(s.id)}
                            >
                              <span className="min-w-0 truncate">
                                {s.title}
                                <span className="text-[var(--text-secondary)]"> — {s.artist}</span>
                              </span>
                              {inSet ? (
                                <span className="shrink-0 text-[10px] text-[var(--text-muted)]">Ya está</span>
                              ) : null}
                            </button>
                          </li>
                        );
                      })
                    )}
                  </ul>
                </div>
              )}

              {editing ? (
                <div className="mb-3">
                  <label
                    htmlFor={`setlist-desc-${setlist.id}`}
                    className="mb-1 block text-xs font-medium text-[var(--text-secondary)]"
                  >
                    Descripción
                  </label>
                  <textarea
                    id={`setlist-desc-${setlist.id}`}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={2}
                    placeholder="Notas…"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  />
                </div>
              ) : null}

              {sortedSongs.length === 0 ? (
                <p className="mb-2 px-1 text-xs text-[var(--text-muted)]">
                  Sin canciones. Usá el botón + en la barra del setlist para agregar desde tu biblioteca.
                </p>
              ) : (
                <ul className="mb-2 max-h-64 space-y-0.5 overflow-y-auto">
                  {sortedSongs.map((row, index) => {
                    const href =
                      row.version_id != null
                        ? `/song/${row.song_id}?v=${encodeURIComponent(row.version_id)}`
                        : `/song/${row.song_id}`;
                    const isOver = dragOverIndex === index;
                    return (
                      <li
                        key={row.id}
                        onDragOver={(e) => {
                          if (reordering) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          setDragOverIndex(index);
                        }}
                        onDragLeave={() => setDragOverIndex((i) => (i === index ? null : i))}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragOverIndex(null);
                          const from =
                            dragFromRef.current ??
                            parseInt(e.dataTransfer.getData('application/x-setlist-index'), 10);
                          dragFromRef.current = null;
                          if (Number.isNaN(from)) return;
                          reorder(from, index);
                        }}
                        className={[
                          'flex items-center gap-1 rounded-md px-1 py-0.5',
                          isOver ? 'bg-[var(--accent-muted)] ring-1 ring-[var(--accent)]/40' : '',
                        ].join(' ')}
                      >
                        <button
                          type="button"
                          draggable={!reordering}
                          aria-label="Arrastrar para reordenar"
                          title="Arrastrar para reordenar"
                          disabled={reordering}
                          onDragStart={(e) => {
                            dragFromRef.current = index;
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('application/x-setlist-index', String(index));
                          }}
                          onDragEnd={() => {
                            dragFromRef.current = null;
                            setDragOverIndex(null);
                          }}
                          className="shrink-0 cursor-grab rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <GripVertical size={14} strokeWidth={ICON_STROKE} aria-hidden />
                        </button>
                        <span className="w-5 shrink-0 text-center text-[10px] font-semibold tabular-nums text-[var(--text-muted)]">
                          {index + 1}
                        </span>
                        <Link
                          href={href}
                          className="min-w-0 flex-1 truncate text-sm text-[var(--text-primary)] hover:text-[var(--accent)]"
                        >
                          {row.song_title || 'Sin título'}
                          <span className="text-[var(--text-secondary)]"> — {row.song_artist || '—'}</span>
                        </Link>
                        <button
                          type="button"
                          disabled={deletingSongId === row.song_id}
                          aria-label="Quitar"
                          className="shrink-0 rounded p-1 text-[var(--danger)] hover:bg-red-500/10 disabled:opacity-40"
                          onClick={() => void removeSong(row.song_id)}
                        >
                          <Trash2 size={14} strokeWidth={ICON_STROKE} aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
