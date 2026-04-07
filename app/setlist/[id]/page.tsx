'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  Play,
  Pencil,
  Check,
  Search,
  X,
  ListMusic,
} from 'lucide-react';
import { ICON_INLINE, ICON_STROKE } from '@/components/ui/icon-tokens';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

type SetlistPayload = {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
};

type SetlistSongRow = {
  id: string;
  song_id: string;
  position: number;
  version_id: string | null;
  song_title: string;
  song_artist: string;
  original_key: string | null;
};

type LibrarySong = {
  id: string;
  title: string;
  artist: string;
  original_key: string | null;
};

function SetlistPageSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="h-4 w-36 animate-pulse rounded bg-[var(--bg-elevated)]" />
        <div className="flex gap-2">
          <div className="h-9 w-20 animate-pulse rounded-lg bg-[var(--bg-elevated)]" />
          <div className="h-9 w-28 animate-pulse rounded-lg bg-[var(--bg-elevated)]" />
        </div>
      </div>
      <div className="mb-2 h-8 w-2/3 max-w-md animate-pulse rounded bg-[var(--bg-elevated)]" />
      <div className="mb-8 h-4 w-full max-w-lg animate-pulse rounded bg-[var(--bg-elevated)]" />
      <ul className="space-y-2">
        {[1, 2, 3].map((i) => (
          <li
            key={i}
            className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3"
          >
            <div className="h-4 w-6 animate-pulse rounded bg-[var(--bg-elevated)]" />
            <div className="h-4 flex-1 animate-pulse rounded bg-[var(--bg-elevated)]" />
            <div className="h-8 w-20 animate-pulse rounded bg-[var(--bg-elevated)]" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SetlistPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();

  /** Next 15: `params` is a Promise (use `React.use(params)` when on React 19). This unwrap works on React 18 + Next 14 too. */
  const [routeId, setRouteId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve(params).then((p) => {
      if (!cancelled) setRouteId(p.id);
    });
    return () => {
      cancelled = true;
    };
  }, [params]);

  const [setlist, setSetlist] = useState<SetlistPayload | null>(null);
  const [songs, setSongs] = useState<SetlistSongRow[]>([]);
  const [librarySongs, setLibrarySongs] = useState<LibrarySong[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [addingSongId, setAddingSongId] = useState<string | null>(null);
  const addPanelRef = useRef<HTMLDivElement>(null);

  const [reordering, setReordering] = useState(false);
  const [deletingSongId, setDeletingSongId] = useState<string | null>(null);

  const sortedSongs = useMemo(
    () => [...songs].sort((a, b) => a.position - b.position),
    [songs]
  );

  const loadSetlist = useCallback(async (id: string) => {
    setLoadError(null);
    setNotFound(false);
    const res = await fetch(`/api/setlists/${id}`, { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (res.status === 404) {
      setNotFound(true);
      setSetlist(null);
      setSongs([]);
      return;
    }
    if (!res.ok) {
      setSetlist(null);
      setSongs([]);
      setLoadError(typeof data.error === 'string' ? data.error : 'No se pudo cargar el setlist');
      return;
    }
    if (data.setlist && Array.isArray(data.songs)) {
      setSetlist(data.setlist as SetlistPayload);
      setSongs(data.songs as SetlistSongRow[]);
      setEditName(String((data.setlist as SetlistPayload).name ?? ''));
      setEditDescription(String((data.setlist as SetlistPayload).description ?? ''));
    } else {
      setLoadError('Respuesta inválida del servidor');
    }
  }, []);

  const loadLibrary = useCallback(async () => {
    const res = await fetch('/api/songs', { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLibrarySongs([]);
      return;
    }
    setLibrarySongs(Array.isArray(data.songs) ? data.songs : []);
  }, []);

  useEffect(() => {
    if (!routeId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      await Promise.all([loadSetlist(routeId), loadLibrary()]);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [routeId, loadSetlist, loadLibrary]);

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

  const filteredLibrary = useMemo(() => {
    const q = addSearch.trim().toLowerCase();
    if (!q) return librarySongs;
    return librarySongs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)
    );
  }, [librarySongs, addSearch]);

  const songIdsInSet = useMemo(() => new Set(sortedSongs.map((s) => s.song_id)), [sortedSongs]);

  async function persistOrder(nextRows: SetlistSongRow[]) {
    if (!routeId) return;
    const body = {
      songs: nextRows.map((row, index) => ({
        songId: row.song_id,
        position: index,
      })),
    };
    setReordering(true);
    try {
      const res = await fetch(`/api/setlists/${routeId}/songs`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLoadError(typeof data.error === 'string' ? data.error : 'No se pudo reordenar');
        await loadSetlist(routeId);
        return;
      }
      setSongs(
        nextRows.map((row, index) => ({
          ...row,
          position: index,
        }))
      );
    } finally {
      setReordering(false);
    }
  }

  function moveSong(index: number, dir: -1 | 1) {
    const next = [...sortedSongs];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    const tmp = next[index];
    next[index] = next[j]!;
    next[j] = tmp!;
    void persistOrder(next);
  }

  async function removeSong(songId: string) {
    if (!routeId) return;
    setDeletingSongId(songId);
    try {
      const res = await fetch(`/api/setlists/${routeId}/songs`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLoadError(typeof data.error === 'string' ? data.error : 'No se pudo quitar la canción');
        return;
      }
      await loadSetlist(routeId);
    } finally {
      setDeletingSongId(null);
    }
  }

  async function addSong(songId: string) {
    if (!routeId) return;
    setAddingSongId(songId);
    try {
      const res = await fetch(`/api/setlists/${routeId}/songs`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(typeof data.error === 'string' ? data.error : 'No se pudo agregar');
        return;
      }
      setAddOpen(false);
      setAddSearch('');
      await loadSetlist(routeId);
    } finally {
      setAddingSongId(null);
    }
  }

  async function saveMeta() {
    if (!routeId || !setlist) return;
    const name = editName.trim();
    if (!name.length) return;
    setSavingMeta(true);
    try {
      const res = await fetch(`/api/setlists/${routeId}`, {
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
      setSetlist((prev) =>
        prev ? { ...prev, name, description: editDescription } : prev
      );
      setEditing(false);
    } finally {
      setSavingMeta(false);
    }
  }

  function playFirst() {
    const first = sortedSongs[0];
    if (!first) return;
    const href =
      first.version_id != null
        ? `/song/${first.song_id}?v=${encodeURIComponent(first.version_id)}`
        : `/song/${first.song_id}`;
    router.push(href);
  }

  if (!routeId) {
    return <SetlistPageSkeleton />;
  }

  if (loading) {
    return <SetlistPageSkeleton />;
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <ListMusic
          size={40}
          strokeWidth={ICON_STROKE}
          className="mx-auto mb-4 text-[var(--text-muted)]"
          aria-hidden
        />
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
          Setlist no encontrada
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          No existe o no tenés acceso a este setlist.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[var(--accent)] hover:underline"
        >
          <ArrowLeft size={ICON_INLINE} strokeWidth={ICON_STROKE} aria-hidden />
          Volver a la biblioteca
        </Link>
      </div>
    );
  }

  if (!setlist) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-sm text-[var(--danger)]">
          {loadError ?? 'No se pudo cargar el setlist'}
        </p>
        <Button variant="secondary" className="mt-4" onClick={() => routeId && loadSetlist(routeId)}>
          Reintentar
        </Button>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-[var(--accent)] hover:underline"
          >
            <ArrowLeft size={ICON_INLINE} strokeWidth={ICON_STROKE} aria-hidden />
            Volver a la biblioteca
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
        >
          <ArrowLeft size={ICON_INLINE} strokeWidth={ICON_STROKE} aria-hidden />
          Volver a la biblioteca
        </Link>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {editing ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => {
                  setEditing(false);
                  setEditName(setlist.name);
                  setEditDescription(setlist.description ?? '');
                }}
              >
                <X size={ICON_INLINE} strokeWidth={ICON_STROKE} aria-hidden />
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                type="button"
                loading={savingMeta}
                onClick={() => void saveMeta()}
              >
                <Check size={ICON_INLINE} strokeWidth={ICON_STROKE} aria-hidden />
                Guardar
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" size="sm" type="button" onClick={() => setEditing(true)}>
                <Pencil size={ICON_INLINE} strokeWidth={ICON_STROKE} aria-hidden />
                Editar
              </Button>
              <Button
                variant="primary"
                size="sm"
                type="button"
                disabled={sortedSongs.length === 0}
                onClick={playFirst}
              >
                <Play size={ICON_INLINE} strokeWidth={ICON_STROKE} aria-hidden />
                Modo reproducción
              </Button>
            </>
          )}
        </div>
      </header>

      {loadError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-[var(--danger)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--danger)]"
        >
          {loadError}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => setLoadError(null)}
          >
            Cerrar
          </button>
        </div>
      )}

      <section className="mb-8">
        {editing ? (
          <div className="space-y-3">
            <Input
              label="Nombre"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Nombre del setlist"
            />
            <div className="flex flex-col gap-1">
              <label
                htmlFor="setlist-desc"
                className="text-sm font-medium text-[var(--text-secondary)]"
              >
                Descripción
              </label>
              <textarea
                id="setlist-desc"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
                placeholder="Notas o descripción…"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] transition-colors"
              />
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
              {setlist.name}
            </h1>
            {setlist.description ? (
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)] sm:text-base">
                {setlist.description}
              </p>
            ) : (
              <p className="mt-2 text-sm italic text-[var(--text-muted)]">Sin descripción</p>
            )}
          </>
        )}
      </section>

      <ul className="space-y-2">
        {sortedSongs.length === 0 ? (
          <li className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-surface)] px-4 py-10 text-center text-sm text-[var(--text-muted)]">
            Este setlist todavía no tiene canciones. Agregá alguna desde tu biblioteca.
          </li>
        ) : (
          sortedSongs.map((row, index) => {
            const href =
              row.version_id != null
                ? `/song/${row.song_id}?v=${encodeURIComponent(row.version_id)}`
                : `/song/${row.song_id}`;
            return (
              <li
                key={row.id}
                className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3 sm:flex-row sm:items-center sm:gap-3"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
                  <span className="mt-0.5 w-6 shrink-0 text-sm font-semibold tabular-nums text-[var(--text-muted)] sm:mt-0">
                    {index + 1}.
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={href}
                      className="font-medium text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors"
                    >
                      {row.song_title || 'Sin título'}
                      <span className="font-normal text-[var(--text-secondary)]"> — </span>
                      <span className="font-normal text-[var(--text-secondary)]">
                        {row.song_artist || 'Sin artista'}
                      </span>
                    </Link>
                  </div>
                  {row.original_key ? (
                    <span
                      className="shrink-0 rounded-md border border-[var(--chord-color)] bg-[var(--chord-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--chord-color)]"
                      title="Tonalidad original"
                    >
                      {row.original_key}
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs text-[var(--text-muted)]">—</span>
                  )}
                </div>
                <div className="flex shrink-0 items-center justify-end gap-1 sm:justify-start">
                  {index > 0 && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        className="px-2"
                        disabled={reordering}
                        aria-label="Subir"
                        onClick={() => moveSong(index, -1)}
                      >
                        <ArrowUp size={ICON_INLINE} strokeWidth={ICON_STROKE} aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        className="px-2"
                        disabled={index === sortedSongs.length - 1 || reordering}
                        aria-label="Bajar"
                        onClick={() => moveSong(index, 1)}
                      >
                        <ArrowDown size={ICON_INLINE} strokeWidth={ICON_STROKE} aria-hidden />
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    className="px-2 text-[var(--danger)] hover:bg-[var(--bg-elevated)]"
                    disabled={deletingSongId === row.song_id}
                    loading={deletingSongId === row.song_id}
                    aria-label="Quitar del setlist"
                    onClick={() => void removeSong(row.song_id)}
                  >
                    <Trash2 size={ICON_INLINE} strokeWidth={ICON_STROKE} aria-hidden />
                  </Button>
                </div>
              </li>
            );
          })
        )}
      </ul>

      <div className="relative mt-6" ref={addPanelRef}>
        <Button
          variant="secondary"
          type="button"
          className="w-full sm:w-auto"
          onClick={() => setAddOpen((o) => !o)}
        >
          <Plus size={ICON_INLINE} strokeWidth={ICON_STROKE} aria-hidden />
          Agregar canción
        </Button>

        {addOpen && (
          <div
            className="absolute left-0 right-0 z-20 mt-2 max-h-[min(70vh,420px)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-lg sm:left-0 sm:right-auto sm:w-full sm:max-w-md"
            role="dialog"
            aria-label="Agregar canción al setlist"
          >
            <div className="border-b border-[var(--border)] p-3">
              <div className="relative">
                <Search
                  size={ICON_INLINE}
                  strokeWidth={ICON_STROKE}
                  className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-[var(--text-muted)]"
                  aria-hidden
                />
                <Input
                  type="search"
                  value={addSearch}
                  onChange={(e) => setAddSearch(e.target.value)}
                  placeholder="Buscar en tu biblioteca…"
                  className="pl-9"
                  autoFocus
                />
              </div>
            </div>
            <ul className="max-h-[min(50vh,320px)] overflow-y-auto p-2">
              {filteredLibrary.length === 0 ? (
                <li className="px-2 py-6 text-center text-sm text-[var(--text-muted)]">
                  No hay canciones que coincidan.
                </li>
              ) : (
                filteredLibrary.map((s) => {
                  const already = songIdsInSet.has(s.id);
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        disabled={already || addingSongId === s.id}
                        onClick={() => void addSong(s.id)}
                        className={[
                          'flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                          already
                            ? 'cursor-not-allowed opacity-50'
                            : 'hover:bg-[var(--bg-surface)]',
                        ].join(' ')}
                      >
                        <span className="font-medium text-[var(--text-primary)]">{s.title}</span>
                        <span className="text-xs text-[var(--text-secondary)]">{s.artist}</span>
                        {already && (
                          <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                            Ya está en el setlist
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
