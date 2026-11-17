'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { TextPromptDialog } from '@/components/ui/TextPromptDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { MiniToast, type MiniToastKind } from '@/components/ui/MiniToast';
import { SongImportSkeleton } from '@/components/song/SongImportSkeleton';
import { SetlistInlineEditor } from '@/components/setlist/SetlistInlineEditor';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { DbSong, SavedVersionListItem, UserTag, SetlistItem, SetlistSongItem } from '@/types';
import {
  Search, Star, Plus, Trash2, Tag, ChevronDown,
  ListMusic, X, Check, Link2, ClipboardPaste, Music, Copy, RefreshCw,
} from 'lucide-react';
import { ICON_INLINE, ICON_STROKE } from '@/components/ui/icon-tokens';

type ImportMode = 'url' | 'paste';
type ActiveFilter = 'all' | 'favorites' | string;

export default function HomePage() {
  const router = useRouter();

  // ── Import form ──────────────────────────────────────────────────────────
  const [importMode, setImportMode] = useState<ImportMode>('url');
  const [url, setUrl] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteArtist, setPasteArtist] = useState('');
  const [loading, setLoading] = useState(false);
  const [pocLoading, setPocLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importErrorMeta, setImportErrorMeta] = useState<{
    code?: string;
    details?: unknown;
    status?: number;
  } | null>(null);
  const [setlistDialogOpen, setSetlistDialogOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    description?: string;
    onConfirm: () => void;
  } | null>(null);
  const [pageToast, setPageToast] = useState<{
    kind: MiniToastKind;
    text: string;
    title?: string;
  } | null>(null);

  // ── Library ──────────────────────────────────────────────────────────────
  const [songs, setSongs] = useState<DbSong[]>([]);
  const [versions, setVersions] = useState<SavedVersionListItem[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [tags, setTags] = useState<UserTag[]>([]);
  const [songTags, setSongTags] = useState<Record<string, string[]>>({});
  const [setlists, setSetlists] = useState<SetlistItem[]>([]);

  const [libraryLoading, setLibraryLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const [homeTab, setHomeTab] = useState<'import' | 'library' | 'setlists'>('library');
  const [librarySearchOpen, setLibrarySearchOpen] = useState(false);
  const [deletingSongId, setDeletingSongId] = useState<string | null>(null);
  const [deletingVersionId, setDeletingVersionId] = useState<string | null>(null);
  const [tagDropdownSongId, setTagDropdownSongId] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [creatingTag, setCreatingTag] = useState(false);
  const [expandedSongId, setExpandedSongId] = useState<string | null>(null);
  const [expandedSetlistId, setExpandedSetlistId] = useState<string | null>(null);
  const [setlistSongsById, setSetlistSongsById] = useState<Record<string, SetlistSongItem[]>>({});
  const [setlistSongsLoadingId, setSetlistSongsLoadingId] = useState<string | null>(null);
  const tagDropdownRef = useRef<HTMLDivElement>(null);
  const librarySearchInputRef = useRef<HTMLInputElement>(null);

  // ── Data fetching ────────────────────────────────────────────────────────
  const loadLibrary = useCallback(async () => {
    setListError(null);
    setNeedLogin(false);
    try {
      const [songsRes, versionsRes, favsRes, tagsRes, songTagsRes, setlistsRes] =
        await Promise.all([
          fetch('/api/songs', { credentials: 'include' }),
          fetch('/api/versions', { credentials: 'include' }),
          fetch('/api/favorites', { credentials: 'include' }),
          fetch('/api/tags', { credentials: 'include' }),
          fetch('/api/song-tags', { credentials: 'include' }),
          fetch('/api/setlists', { credentials: 'include' }),
        ]);

      const songsData = await songsRes.json().catch(() => ({}));
      const versionsData = await versionsRes.json().catch(() => ({}));
      const favsData = await favsRes.json().catch(() => ({}));
      const tagsData = await tagsRes.json().catch(() => ({}));
      const songTagsData = await songTagsRes.json().catch(() => ({}));
      const setlistsData = await setlistsRes.json().catch(() => ({}));

      if (songsRes.status === 401) {
        setSongs([]); setVersions([]); setNeedLogin(true);
        return;
      }

      setSongs(
        !songsRes.ok ? [] : Array.isArray(songsData.songs) ? songsData.songs : []
      );
      if (!songsRes.ok) setListError(songsData.error ?? 'No se pudo cargar la lista');

      setVersions(
        versionsRes.ok && Array.isArray(versionsData.versions)
          ? versionsData.versions
          : []
      );
      if (favsRes.ok && Array.isArray(favsData.favorites))
        setFavorites(new Set(favsData.favorites));
      if (tagsRes.ok && Array.isArray(tagsData.tags))
        setTags(tagsData.tags);
      if (songTagsRes.ok && songTagsData.songTags)
        setSongTags(songTagsData.songTags);
      if (setlistsRes.ok && Array.isArray(setlistsData.setlists))
        setSetlists(setlistsData.setlists);
    } catch {
      setSongs([]); setVersions([]);
      setListError('Error de conexión al cargar canciones');
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  useEffect(() => { loadLibrary(); }, [loadLibrary]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') loadLibrary(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadLibrary]);

  useEffect(() => {
    if (!tagDropdownSongId) return;
    function handleClick(e: MouseEvent) {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target as Node)) {
        setTagDropdownSongId(null);
        setNewTagName('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [tagDropdownSongId]);

  useEffect(() => {
    if (searchQuery.trim()) setLibrarySearchOpen(true);
  }, [searchQuery]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  async function pasteUrlFromClipboard() {
    try {
      const t = await navigator.clipboard.readText();
      if (t.trim()) setUrl(t.trim());
    } catch {
      /* sin permiso o portapapeles vacío */
    }
  }

  async function pasteCifraFromClipboard() {
    try {
      const t = await navigator.clipboard.readText();
      if (t.trim()) setPastedText(t);
    } catch {
      /* sin permiso o portapapeles vacío */
    }
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setImportErrorMeta(null);
    if (importMode === 'url') {
      if (!url.trim()) { setError('Ingresá una URL'); return; }
    } else if (!pastedText.trim()) {
      setError('Pegá el texto de la cifra'); return;
    }
    setLoading(true);
    try {
      const payload =
        importMode === 'url'
          ? { mode: 'url' as const, url: url.trim() }
          : {
              mode: 'paste' as const,
              text: pastedText,
              ...(pasteTitle.trim() ? { title: pasteTitle.trim() } : {}),
              ...(pasteArtist.trim() ? { artist: pasteArtist.trim() } : {}),
            };
      const res = await fetch('/api/import-song', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Error al importar la canción');
        setImportErrorMeta({
          code: typeof data.code === 'string' ? data.code : undefined,
          details: data.details,
          status: res.status,
        });
        return;
      }
      await loadLibrary();
      router.push(`/song/${data.id}`);
    } catch {
      setError('Error de conexión. Revisá tu internet.');
      setImportErrorMeta(null);
    } finally {
      setLoading(false);
    }
  }

  /** POC: scrape + Gemini; resultado en consola del navegador, sin importar. */
  async function handleGeminiPoc() {
    if (!url.trim()) {
      setError('Ingresá una URL (LaCuerda o Cifra Club) para el POC');
      return;
    }
    setPocLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/gemini-poc', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('[POC Gemini] error API:', data);
        if (data.details != null) console.error('[POC Gemini] detalle Google:', data.details);
        setError(data.error ?? 'POC Gemini falló');
        return;
      }
      console.log('[POC Gemini] objeto completo (modelText + apiResponse + scrape):', data);
      console.log('[POC Gemini] texto del modelo (sin parseSong):', data.modelText);
      console.log('[POC Gemini] respuesta cruda de Gemini API:', data.apiResponse);
    } catch (e) {
      console.error('[POC Gemini] red:', e);
      setError('Error de conexión en POC');
    } finally {
      setPocLoading(false);
    }
  }

  function handleDeleteSong(song: DbSong) {
    setConfirmDialog({
      title: `¿Eliminar «${song.title}»?`,
      description: 'Esta acción no se puede deshacer.',
      onConfirm: async () => {
        setDeletingSongId(song.id);
        try {
          const res = await fetch(`/api/songs/${song.id}`, { method: 'DELETE', credentials: 'include' });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) { setPageToast({ kind: 'err', text: data.error ?? 'No se pudo eliminar' }); return; }
          await loadLibrary();
        } catch { setPageToast({ kind: 'err', text: 'Error de conexión' }); }
        finally { setDeletingSongId(null); }
      },
    });
  }

  function handleDeleteVersion(v: SavedVersionListItem) {
    setConfirmDialog({
      title: `¿Eliminar la versión «${v.name}»?`,
      description: 'Esta acción no se puede deshacer.',
      onConfirm: async () => {
        setDeletingVersionId(v.id);
        try {
          const res = await fetch(`/api/version/${v.id}`, { method: 'DELETE', credentials: 'include' });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) { setPageToast({ kind: 'err', text: data.error ?? 'No se pudo eliminar' }); return; }
          await loadLibrary();
        } catch { setPageToast({ kind: 'err', text: 'Error de conexión' }); }
        finally { setDeletingVersionId(null); }
      },
    });
  }

  async function handleToggleFavorite(songId: string) {
    const wasFav = favorites.has(songId);
    setFavorites((prev) => {
      const next = new Set(prev);
      if (wasFav) next.delete(songId); else next.add(songId);
      return next;
    });
    try {
      const res = await fetch(`/api/favorites/${songId}`, {
        method: wasFav ? 'DELETE' : 'POST', credentials: 'include',
      });
      if (!res.ok) throw new Error();
    } catch {
      setFavorites((prev) => {
        const r = new Set(prev);
        if (wasFav) r.add(songId); else r.delete(songId);
        return r;
      });
    }
  }

  async function handleToggleSongTag(songId: string, tagId: string) {
    const current = songTags[songId] ?? [];
    const has = current.includes(tagId);
    setSongTags((prev) => ({
      ...prev,
      [songId]: has ? current.filter((t) => t !== tagId) : [...current, tagId],
    }));
    try {
      const res = await fetch('/api/song-tags', {
        method: has ? 'DELETE' : 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId, songId }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setSongTags((prev) => ({ ...prev, [songId]: current }));
    }
  }

  async function handleCreateTag() {
    const name = newTagName.trim();
    if (!name || creatingTag) return;
    setCreatingTag(true);
    try {
      const res = await fetch('/api/tags', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.tag) setTags((prev) => [...prev, data.tag]);
        setNewTagName('');
      }
    } catch { /* silent */ }
    finally { setCreatingTag(false); }
  }

  function openCreateSetlistDialog() {
    setSetlistDialogOpen(true);
  }

  async function handleSetlistNameConfirm(name: string) {
    try {
      const res = await fetch('/api/setlists', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) await loadLibrary();
    } catch { /* silent */ }
  }

  function handleDeleteSetlist(id: string, name: string) {
    setConfirmDialog({
      title: `¿Eliminar el setlist «${name}»?`,
      description: 'Esta acción no se puede deshacer.',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/setlists/${id}`, { method: 'DELETE', credentials: 'include' });
          if (res.ok) {
            setSetlists((prev) => prev.filter((s) => s.id !== id));
            setSetlistSongsById((prev) => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
            if (expandedSetlistId === id) setExpandedSetlistId(null);
          } else {
            setPageToast({ kind: 'err', text: 'No se pudo eliminar el setlist' });
          }
        } catch { setPageToast({ kind: 'err', text: 'Error de conexión' }); }
      },
    });
  }

  async function toggleSetlistExpand(setlistId: string) {
    if (expandedSetlistId === setlistId) {
      setExpandedSetlistId(null);
      return;
    }
    setExpandedSetlistId(setlistId);
    if (setlistSongsById[setlistId]) return;
    setSetlistSongsLoadingId(setlistId);
    try {
      const res = await fetch(`/api/setlists/${setlistId}`, { credentials: 'include' });
      const data = await res.json();
      if (res.ok && Array.isArray(data.songs)) {
        setSetlistSongsById((prev) => ({ ...prev, [setlistId]: data.songs as SetlistSongItem[] }));
      }
    } catch {
      /* ignore */
    } finally {
      setSetlistSongsLoadingId(null);
    }
  }

  async function addSongToSetlist(setlistId: string, songId: string) {
    try {
      const res = await fetch(`/api/setlists/${setlistId}/songs`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId }),
      });
      if (!res.ok) return;
      await loadLibrary();
      if (expandedSetlistId === setlistId) {
        const detail = await fetch(`/api/setlists/${setlistId}`, { credentials: 'include' });
        const d = await detail.json();
        if (detail.ok && Array.isArray(d.songs)) {
          setSetlistSongsById((p) => ({ ...p, [setlistId]: d.songs as SetlistSongItem[] }));
        }
      }
    } catch {
      /* ignore */
    }
  }

  // ── Filtering ────────────────────────────────────────────────────────────
  const filteredSongs = songs.filter((song) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || song.title.toLowerCase().includes(q) || song.artist.toLowerCase().includes(q);
    if (!matchesSearch) return false;
    if (activeFilter === 'all') return true;
    if (activeFilter === 'favorites') return favorites.has(song.id);
    return (songTags[song.id] ?? []).includes(activeFilter);
  });

  const versionsBySong = versions.reduce<Record<string, SavedVersionListItem[]>>((acc, v) => {
    (acc[v.song_id] ??= []).push(v);
    return acc;
  }, {});

  const showDemoStrip = process.env.NEXT_PUBLIC_AUTH_DEMO_MODE === 'true';

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <main className="max-w-2xl mx-auto px-4 py-8 pb-24">
      {showDemoStrip && (
        <p className="mb-6 text-center text-xs text-amber-800 dark:text-amber-300/90 bg-amber-500/10 border border-amber-500/25 rounded-lg py-2 px-3">
          Modo demo activo — acceso sin login para pruebas locales
        </p>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-1">
          Cancionero Pro
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Importá, transponé, y tocá con scroll automático
        </p>
      </div>

      <div
        className="mb-6 flex gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-1"
        role="tablist"
        aria-label="Secciones de inicio"
      >
        {(
          [
            { id: 'import' as const, label: 'Importar', icon: Link2 },
            { id: 'library' as const, label: 'Biblioteca', icon: Music },
            { id: 'setlists' as const, label: 'Setlists', icon: ListMusic },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={homeTab === id}
            onClick={() => setHomeTab(id)}
            className={[
              'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              homeTab === id
                ? 'bg-[var(--accent-muted)] text-[var(--accent)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]',
            ].join(' ')}
          >
            <Icon size={ICON_INLINE} strokeWidth={ICON_STROKE} aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {homeTab === 'import' && (
      <section className="mb-6">
        <form
          onSubmit={handleImport}
          className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden"
        >
          <div className="flex border-b border-[var(--border)]">
            <button
              type="button"
              onClick={() => { setImportMode('url'); setError(null); setImportErrorMeta(null); }}
              className={[
                'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors',
                importMode === 'url'
                  ? 'text-[var(--accent)] border-b-2 border-[var(--accent)] bg-[var(--accent-muted)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]',
              ].join(' ')}
            >
              <Link2 size={ICON_INLINE} strokeWidth={ICON_STROKE} aria-hidden />
              Desde URL
            </button>
            <button
              type="button"
              onClick={() => { setImportMode('paste'); setError(null); setImportErrorMeta(null); }}
              className={[
                'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors',
                importMode === 'paste'
                  ? 'text-[var(--accent)] border-b-2 border-[var(--accent)] bg-[var(--accent-muted)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]',
              ].join(' ')}
            >
              <ClipboardPaste size={ICON_INLINE} strokeWidth={ICON_STROKE} aria-hidden />
              Pegar texto
            </button>
          </div>

          <div className="p-4 space-y-3">
            {importMode === 'url' ? (
              <div className="space-y-2">
                <span className="text-sm font-medium text-[var(--text-secondary)]">URL de la canción</span>
                <div className="flex flex-wrap items-stretch gap-2 sm:flex-nowrap">
                  <button
                    type="button"
                    onClick={() => void pasteUrlFromClipboard()}
                    disabled={loading || pocLoading}
                    title="Pegar URL del portapapeles"
                    aria-label="Pegar URL del portapapeles"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-primary)] transition-colors hover:bg-[var(--border)] disabled:opacity-40"
                  >
                    <ClipboardPaste size={ICON_INLINE} strokeWidth={ICON_STROKE} aria-hidden />
                  </button>
                  <input
                    id="url-de-la-canción"
                    type="url"
                    placeholder="https://www.lacuerda.net/... o https://www.cifraclub.com/..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={loading || pocLoading}
                    autoComplete="off"
                    className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-colors duration-150 focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  />
                  <Button
                    type="submit"
                    loading={loading}
                    size="md"
                    className="w-auto shrink-0 px-4"
                  >
                    {loading ? 'Importando…' : 'Importar'}
                  </Button>
                </div>
                {error && importMode === 'url' ? (
                  <p className="text-xs text-[var(--danger)]">{error}</p>
                ) : null}
                {false && (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      size="md"
                      className="w-full"
                      loading={pocLoading}
                      disabled={loading}
                      onClick={handleGeminiPoc}
                    >
                      POC: Gemini crudo (ver consola)
                    </Button>
                    <p className="text-xs text-[var(--text-muted)]">
                      No guarda la canción: scrape + Gemini y <code className="text-[0.7rem]">console.log</code> del resultado.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="Título (opcional)" type="text" placeholder="Nombre de la canción"
                    value={pasteTitle} onChange={(e) => setPasteTitle(e.target.value)} disabled={loading} />
                  <Input label="Artista (opcional)" type="text" placeholder="Artista o banda"
                    value={pasteArtist} onChange={(e) => setPasteArtist(e.target.value)} disabled={loading} />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="cifra" className="text-sm font-medium text-[var(--text-secondary)]">
                    Cifra
                  </label>
                  <div className="relative">
                    <textarea
                      id="cifra"
                      placeholder={'Am          F          C\nPrimera línea de la letra…\nG              D\nSegunda línea…'}
                      value={pastedText}
                      onChange={(e) => setPastedText(e.target.value)}
                      disabled={loading}
                      spellCheck={false}
                      className={[
                        'w-full min-h-[12rem] rounded-lg border bg-[var(--bg-surface)] px-3 py-2 pr-11 text-sm',
                        'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
                        'border-[var(--border)] focus:border-[var(--accent)]',
                        'focus:outline-none focus:ring-1 focus:ring-[var(--accent)]',
                        'transition-colors duration-150 font-mono leading-relaxed',
                        error ? 'border-[var(--danger)]' : '',
                      ].join(' ')}
                    />
                    <button
                      type="button"
                      onClick={() => void pasteCifraFromClipboard()}
                      disabled={loading}
                      title="Pegar cifra del portapapeles"
                      aria-label="Pegar cifra del portapapeles"
                      className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] shadow-sm transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] disabled:opacity-40"
                    >
                      <ClipboardPaste size={ICON_INLINE} strokeWidth={ICON_STROKE} aria-hidden />
                    </button>
                  </div>
                  {error && importMode === 'paste' ? (
                    <p className="text-xs text-[var(--danger)]">{error}</p>
                  ) : null}
                </div>
                <Button type="submit" loading={loading} size="lg" className="w-full justify-center">
                  {loading ? 'Guardando…' : 'Guardar'}
                </Button>
              </>
            )}
          </div>
        </form>

        {importErrorMeta && error && !loading && (
          <div
            className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-3 text-sm text-[var(--text-secondary)] space-y-2"
            role="status"
          >
            <p className="text-[var(--text-primary)] font-medium">No se pudo importar</p>
            <p>{error}</p>
            <div className="flex flex-wrap gap-2 text-xs">
              {importErrorMeta.status != null && (
                <span className="rounded-md bg-[var(--bg-elevated)] px-2 py-0.5 font-mono tabular-nums">
                  HTTP {importErrorMeta.status}
                </span>
              )}
              {importErrorMeta.code && (
                <span className="rounded-md bg-[var(--bg-elevated)] px-2 py-0.5 font-mono">
                  {importErrorMeta.code}
                </span>
              )}
            </div>
            {importErrorMeta.details != null && (
              <pre className="max-h-32 overflow-auto rounded-md bg-[var(--bg-elevated)] p-2 text-[10px] leading-relaxed text-[var(--text-muted)] whitespace-pre-wrap break-words">
                {typeof importErrorMeta.details === 'string'
                  ? importErrorMeta.details
                  : JSON.stringify(importErrorMeta.details, null, 2)}
              </pre>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="inline-flex items-center gap-1.5"
                onClick={() => void handleImport({ preventDefault: () => {} } as React.FormEvent)}
              >
                <RefreshCw size={ICON_INLINE} strokeWidth={ICON_STROKE} aria-hidden />
                Reintentar
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="inline-flex items-center gap-1.5"
                onClick={() => {
                  const payload = { message: error, ...importErrorMeta };
                  void navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
                }}
              >
                <Copy size={ICON_INLINE} strokeWidth={ICON_STROKE} aria-hidden />
                Copiar diagnóstico
              </Button>
            </div>
          </div>
        )}

        {loading && (
          <div className="mt-4"><SongImportSkeleton /></div>
        )}
      </section>
      )}

      {homeTab === 'library' && (
      <>
      {!needLogin && songs.length > 0 && (
        <div className="mb-3 flex min-h-[2.25rem] flex-nowrap items-center gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
          <button
            type="button"
            onClick={() => {
              setLibrarySearchOpen((prev) => {
                const next = !prev;
                if (next) {
                  queueMicrotask(() => librarySearchInputRef.current?.focus());
                }
                return next;
              });
            }}
            aria-expanded={librarySearchOpen}
            aria-label={librarySearchOpen ? 'Ocultar campo de búsqueda' : 'Mostrar búsqueda'}
            title={librarySearchOpen ? 'Ocultar búsqueda' : 'Buscar'}
            className={[
              'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors',
              librarySearchOpen
                ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent)]'
                : 'border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]',
            ].join(' ')}
          >
            <Search size={ICON_INLINE} strokeWidth={ICON_STROKE} aria-hidden />
          </button>
          <div
            className={[
              'shrink-0 overflow-hidden transition-[max-width,opacity] duration-200 ease-out',
              librarySearchOpen ? 'max-w-[min(16rem,42vw)] opacity-100' : 'max-w-0 opacity-0',
            ].join(' ')}
          >
            <input
              ref={librarySearchInputRef}
              type="text"
              placeholder="Buscar…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-[min(16rem,42vw)] rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            className={[
              'shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors',
              activeFilter === 'all'
                ? 'bg-[var(--accent)] text-white border-transparent'
                : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--accent)]',
            ].join(' ')}
          >
            Todas
          </button>
          <button
            type="button"
            onClick={() =>
              setActiveFilter((prev) => (prev === 'favorites' ? 'all' : 'favorites'))
            }
            title="Solo favoritas"
            aria-label="Solo favoritas"
            className={[
              'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors',
              activeFilter === 'favorites'
                ? 'border-transparent bg-[var(--accent)] text-white'
                : 'border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--accent)]',
            ].join(' ')}
          >
            <Star size={14} strokeWidth={ICON_STROKE} className={activeFilter === 'favorites' ? 'fill-current' : ''} aria-hidden />
          </button>
          {tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() =>
                setActiveFilter((prev) => (prev === tag.id ? 'all' : tag.id))
              }
              className={[
                'shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors inline-flex items-center gap-1.5',
                activeFilter === tag.id
                  ? 'bg-[var(--accent)] text-white border-transparent'
                  : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--accent)]',
              ].join(' ')}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color || 'var(--accent)' }} />
              {tag.name}
            </button>
          ))}
        </div>
      )}

      <section className="mb-8" aria-label="Biblioteca de canciones">

        {libraryLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-16 rounded-xl bg-[var(--bg-elevated)] animate-pulse" />
            ))}
          </div>
        ) : listError ? (
          <p className="text-center text-sm text-[var(--danger)] py-6">{listError}</p>
        ) : needLogin ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
            <p className="mb-3">Iniciá sesión para ver tus canciones.</p>
            <Link href="/auth/login" className="inline-flex font-medium text-[var(--accent)] hover:underline">
              Ir a iniciar sesión
            </Link>
          </div>
        ) : filteredSongs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-10 text-center">
            {songs.length === 0 ? (
              <div className="max-w-sm mx-auto space-y-3">
                <div className="flex justify-center text-[var(--accent)]">
                  <Music size={36} strokeWidth={ICON_STROKE} className="opacity-80" aria-hidden />
                </div>
                <p className="text-[var(--text-primary)] text-sm font-medium">Tu biblioteca está vacía</p>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Importá desde una URL (La Cuerda, Cifra Club) o pegá una cifra en texto. Las canciones quedan guardadas para transponer, scroll y versiones.
                </p>
                <ul className="text-left text-xs text-[var(--text-secondary)] space-y-1.5 list-disc list-inside">
                  <li>Andá a la pestaña Importar, elegí «Desde URL» y tocá Importar.</li>
                  <li>O usá «Pegar texto» si ya tenés la cifra en el portapapeles.</li>
                </ul>
              </div>
            ) : (
              <p className="text-[var(--text-muted)] text-sm">Sin resultados para tu búsqueda.</p>
            )}
          </div>
        ) : (
          <ul className="space-y-1.5">
            {filteredSongs.map((song) => {
              const isFav = favorites.has(song.id);
              const sTagIds = songTags[song.id] ?? [];
              const sTagObjs = sTagIds.map((tid) => tags.find((t) => t.id === tid)).filter(Boolean) as UserTag[];
              const songVersions = versionsBySong[song.id] ?? [];
              const hasVersions = songVersions.length > 0;
              const isExpanded = expandedSongId === song.id;

              return (
                <li key={song.id}>
                  <div className="flex items-stretch rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] transition-colors hover:border-[var(--accent)]/50 group">
                    {/* Favorite */}
                    <button
                      type="button"
                      title={isFav ? 'Quitar de favoritas' : 'Agregar a favoritas'}
                      aria-label={isFav ? 'Quitar de favoritas' : 'Agregar a favoritas'}
                      onClick={() => void handleToggleFavorite(song.id)}
                      className="flex shrink-0 items-center justify-center pl-2 pr-1 text-[var(--text-muted)] hover:text-yellow-500 transition-colors"
                    >
                      <Star
                        size={ICON_INLINE} strokeWidth={ICON_STROKE}
                        className={isFav ? 'fill-yellow-400 text-yellow-500' : ''}
                        aria-hidden
                      />
                    </button>

                    {/* Main area */}
                    <Link
                      href={`/song/${song.id}`}
                      className="flex min-w-0 flex-1 items-center justify-between gap-2 px-2 py-2.5 text-left"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-[var(--text-primary)] group-hover:text-[var(--accent)] truncate leading-tight">
                          {song.title}
                          {song.artist && (
                            <span className="font-normal text-[var(--text-secondary)]">
                              {' — '}{song.artist}
                            </span>
                          )}
                        </p>
                        {(sTagObjs.length > 0 || hasVersions) && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {sTagObjs.map((t) => (
                              <span
                                key={t.id}
                                className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-medium leading-none"
                                style={{
                                  backgroundColor: (t.color || 'var(--accent)') + '20',
                                  color: t.color || 'var(--accent)',
                                }}
                              >
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: t.color || 'var(--accent)' }} />
                                {t.name}
                              </span>
                            ))}
                            {hasVersions && (
                              <span className="text-[10px] text-[var(--text-muted)] leading-none">
                                {songVersions.length} {songVersions.length === 1 ? 'versión' : 'versiones'}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </Link>

                    {setlists.length > 0 && (
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <button
                            type="button"
                            title="Agregar a setlist"
                            aria-label="Agregar canción a un setlist"
                            className="flex shrink-0 items-center justify-center px-1.5 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                          >
                            <ListMusic size={ICON_INLINE} strokeWidth={ICON_STROKE} aria-hidden />
                          </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content
                            className="z-[200] max-h-64 min-w-[10rem] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] py-1 shadow-lg"
                            sideOffset={4}
                            align="end"
                          >
                            {setlists.map((sl) => (
                              <DropdownMenu.Item
                                key={sl.id}
                                className="flex cursor-default select-none items-center px-3 py-2 text-sm text-[var(--text-primary)] outline-none data-[highlighted]:bg-[var(--bg-elevated)]"
                                onSelect={() => void addSongToSetlist(sl.id, song.id)}
                              >
                                {sl.name}
                              </DropdownMenu.Item>
                            ))}
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    )}

                    {/* Versions expand button */}
                    {hasVersions && (
                      <button
                        type="button"
                        title={isExpanded ? 'Ocultar versiones' : `${songVersions.length} versiones`}
                        onClick={() => setExpandedSongId(isExpanded ? null : song.id)}
                        className="flex shrink-0 items-center justify-center px-2 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                      >
                        <ChevronDown
                          size={ICON_INLINE} strokeWidth={ICON_STROKE}
                          className={`shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          aria-hidden
                        />
                      </button>
                    )}

                    {/* Tag dropdown */}
                    <div className="relative flex shrink-0 items-center">
                      <button
                        type="button"
                        title="Etiquetas"
                        aria-label="Gestionar etiquetas"
                        onClick={() => {
                          setTagDropdownSongId(tagDropdownSongId === song.id ? null : song.id);
                          setNewTagName('');
                        }}
                        className="flex items-center justify-center px-2 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                      >
                        <Tag size={14} strokeWidth={ICON_STROKE} aria-hidden />
                      </button>

                      {tagDropdownSongId === song.id && (
                        <div
                          ref={tagDropdownRef}
                          className="absolute right-0 top-full mt-1 z-50 w-56 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-lg py-1 animate-in fade-in slide-in-from-top-1"
                        >
                          {tags.length === 0 && (
                            <p className="px-3 py-2 text-xs text-[var(--text-muted)]">No hay etiquetas aún</p>
                          )}
                          {tags.map((tag) => {
                            const isAssigned = (songTags[song.id] ?? []).includes(tag.id);
                            return (
                              <button
                                key={tag.id} type="button"
                                onClick={() => void handleToggleSongTag(song.id, tag.id)}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors"
                              >
                                <span className="w-3 h-3 rounded-full shrink-0 border"
                                  style={{
                                    backgroundColor: isAssigned ? (tag.color || 'var(--accent)') : 'transparent',
                                    borderColor: tag.color || 'var(--accent)',
                                  }}
                                />
                                <span className="flex-1 text-left truncate">{tag.name}</span>
                                {isAssigned && <Check size={14} strokeWidth={ICON_STROKE} className="text-[var(--accent)] shrink-0" aria-hidden />}
                              </button>
                            );
                          })}
                          <div className="border-t border-[var(--border)] mt-1 pt-1 px-2 pb-1">
                            <div className="flex items-center gap-1">
                              <input type="text" placeholder="Nueva etiqueta…"
                                value={newTagName} onChange={(e) => setNewTagName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleCreateTag(); } }}
                                className="flex-1 min-w-0 rounded-md border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                              />
                              <button type="button" disabled={!newTagName.trim() || creatingTag}
                                onClick={() => void handleCreateTag()}
                                className="rounded-md p-1 text-[var(--accent)] hover:bg-[var(--bg-surface)] disabled:opacity-40 transition-colors"
                              >
                                <Plus size={14} strokeWidth={ICON_STROKE} aria-hidden />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Delete */}
                    <button
                      type="button"
                      disabled={deletingSongId === song.id}
                      title="Eliminar canción"
                      aria-label={`Eliminar ${song.title}`}
                      onClick={() => void handleDeleteSong(song)}
                      className="flex shrink-0 items-center justify-center rounded-r-xl border-l border-[var(--border)] px-3 text-[var(--text-muted)] hover:bg-red-500/10 hover:text-[var(--danger)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] disabled:opacity-40 transition-colors"
                    >
                      <Trash2 size={ICON_INLINE} strokeWidth={ICON_STROKE} className="shrink-0" aria-hidden />
                    </button>
                  </div>

                  {/* Expanded versions sub-list */}
                  {isExpanded && songVersions.length > 0 && (
                    <ul className="ml-8 mt-1 space-y-1 mb-1">
                      {songVersions.map((v) => (
                        <li
                          key={v.id}
                          className="flex items-stretch rounded-lg border border-[var(--border)]/60 bg-[var(--bg-elevated)]/50 transition-colors hover:border-[var(--accent)]/40 group/v"
                        >
                          <Link
                            href={`/song/${v.song_id}?v=${v.id}`}
                            className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-1.5 text-left"
                          >
                            <span className="text-sm text-[var(--text-primary)] group-hover/v:text-[var(--accent)] truncate">
                              {v.name}
                            </span>
                            {v.key && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--chord-bg)] text-[var(--chord-color)] shrink-0">
                                {v.key}
                              </span>
                            )}
                          </Link>
                          <button
                            type="button"
                            disabled={deletingVersionId === v.id}
                            title="Eliminar versión"
                            aria-label={`Eliminar versión ${v.name}`}
                            onClick={() => void handleDeleteVersion(v)}
                            className="flex shrink-0 items-center justify-center rounded-r-lg border-l border-[var(--border)]/60 px-2.5 text-[var(--text-muted)] hover:bg-red-500/10 hover:text-[var(--danger)] disabled:opacity-40 transition-colors"
                          >
                            <Trash2 size={14} strokeWidth={ICON_STROKE} className="shrink-0" aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      </>
      )}

      {homeTab === 'setlists' && (
        needLogin ? (
          <div className="mb-8 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
            <p className="mb-3">Iniciá sesión para ver y crear setlists.</p>
            <Link href="/auth/login" className="inline-flex font-medium text-[var(--accent)] hover:underline">
              Ir a iniciar sesión
            </Link>
          </div>
        ) : (
        <section className="mb-8" aria-labelledby="setlists-heading">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2
              id="setlists-heading"
              className="text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)] inline-flex items-center gap-1.5"
            >
              <ListMusic size={ICON_INLINE} strokeWidth={ICON_STROKE} aria-hidden />
              Setlists
            </h2>
            {!libraryLoading && (
              <button
                type="button" title="Crear setlist"
                onClick={() => openCreateSetlistDialog()}
                className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-elevated)] transition-colors"
              >
                <Plus size={ICON_INLINE} strokeWidth={ICON_STROKE} aria-hidden />
              </button>
            )}
          </div>

          {libraryLoading ? (
            <div className="space-y-2">
              {[1, 2].map((n) => (
                <div key={n} className="h-14 rounded-xl bg-[var(--bg-elevated)] animate-pulse" />
              ))}
            </div>
          ) : setlists.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center">
              <p className="text-[var(--text-muted)] text-sm">No tenés setlists. Creá uno con el +.</p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {setlists.map((sl) => {
                const slOpen = expandedSetlistId === sl.id;
                const slSongs = setlistSongsById[sl.id];
                const slLoading = setlistSongsLoadingId === sl.id;
                return (
                  <li
                    key={sl.id}
                    className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] transition-colors hover:border-[var(--accent)]/50"
                  >
                    <SetlistInlineEditor
                      setlist={sl}
                      expanded={slOpen}
                      onToggleExpand={() => void toggleSetlistExpand(sl.id)}
                      onDeleteSetlist={() => void handleDeleteSetlist(sl.id, sl.name)}
                      songsLoading={slOpen && slLoading}
                      songsReady={Array.isArray(slSongs)}
                      initialSongs={slSongs ?? []}
                      librarySongs={songs.map((s) => ({
                        id: s.id,
                        title: s.title,
                        artist: s.artist ?? '',
                      }))}
                      onSongsChange={(next) =>
                        setSetlistSongsById((prev) => ({ ...prev, [sl.id]: next }))
                      }
                      onSetlistMetaChange={(name, description) => {
                        setSetlists((prev) =>
                          prev.map((x) => (x.id === sl.id ? { ...x, name, description } : x))
                        );
                      }}
                      onReloadAll={loadLibrary}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        )
      )}

      <TextPromptDialog
        open={setlistDialogOpen}
        onOpenChange={setSetlistDialogOpen}
        title="Nuevo setlist"
        description="Un setlist agrupa canciones para un ensayo o show."
        defaultValue=""
        confirmLabel="Crear"
        onConfirm={(name) => void handleSetlistNameConfirm(name)}
      />

      {confirmDialog && (
        <ConfirmDialog
          open={!!confirmDialog}
          onOpenChange={(open) => { if (!open) setConfirmDialog(null); }}
          title={confirmDialog.title}
          description={confirmDialog.description}
          destructive
          disabled={deletingSongId !== null || deletingVersionId !== null}
          onConfirm={confirmDialog.onConfirm}
        />
      )}

      {pageToast && (
        <MiniToast
          kind={pageToast.kind}
          text={pageToast.text}
          title={pageToast.title}
          onDismiss={() => setPageToast(null)}
        />
      )}
    </main>
  );
}
