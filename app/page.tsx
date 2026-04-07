'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { SongImportSkeleton } from '@/components/song/SongImportSkeleton';
import type { DbSong, SavedVersionListItem, UserTag, SetlistItem } from '@/types';
import {
  Search, Star, Plus, Trash2, Tag, ChevronDown, ChevronUp,
  ListMusic, X, Check,
} from 'lucide-react';
import { ICON_INLINE, ICON_STROKE } from '@/components/ui/icon-tokens';

type ImportMode = 'url' | 'paste';
type ActiveFilter = 'all' | 'favorites' | string; // string = tagId

export default function HomePage() {
  const router = useRouter();

  // ── Import form state ──────────────────────────────────────────────────────
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>('url');
  const [url, setUrl] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteArtist, setPasteArtist] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Library state ──────────────────────────────────────────────────────────
  const [songs, setSongs] = useState<DbSong[]>([]);
  const [versions, setVersions] = useState<SavedVersionListItem[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [tags, setTags] = useState<UserTag[]>([]);
  const [songTags, setSongTags] = useState<Record<string, string[]>>({});
  const [setlists, setSetlists] = useState<SetlistItem[]>([]);

  const [libraryLoading, setLibraryLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);

  // ── UI interaction state ───────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const [deletingSongId, setDeletingSongId] = useState<string | null>(null);
  const [deletingVersionId, setDeletingVersionId] = useState<string | null>(null);
  const [tagDropdownSongId, setTagDropdownSongId] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [creatingTag, setCreatingTag] = useState(false);
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const loadLibrary = useCallback(async () => {
    setListError(null);
    setVersionsError(null);
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
        setSongs([]);
        setVersions([]);
        setNeedLogin(true);
        return;
      }

      if (!songsRes.ok) {
        setSongs([]);
        setListError(songsData.error ?? 'No se pudo cargar la lista');
      } else {
        setSongs(Array.isArray(songsData.songs) ? songsData.songs : []);
      }

      if (versionsRes.status === 401) {
        setVersions([]);
      } else if (!versionsRes.ok) {
        setVersions([]);
        setVersionsError(versionsData.error ?? 'No se pudo cargar las versiones');
      } else {
        setVersions(Array.isArray(versionsData.versions) ? versionsData.versions : []);
      }

      if (favsRes.ok && Array.isArray(favsData.favorites)) {
        setFavorites(new Set(favsData.favorites));
      }
      if (tagsRes.ok && Array.isArray(tagsData.tags)) {
        setTags(tagsData.tags);
      }
      if (songTagsRes.ok && songTagsData.songTags) {
        setSongTags(songTagsData.songTags);
      }
      if (setlistsRes.ok && Array.isArray(setlistsData.setlists)) {
        setSetlists(setlistsData.setlists);
      }
    } catch {
      setSongs([]);
      setVersions([]);
      setListError('Error de conexión al cargar canciones');
      setVersionsError('Error de conexión al cargar versiones');
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  useEffect(() => { loadLibrary(); }, [loadLibrary]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadLibrary();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadLibrary]);

  // Close tag dropdown on outside click
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

  // ── Import handler ─────────────────────────────────────────────────────────
  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

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
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Error al importar la canción'); return; }

      await loadLibrary();
      router.push(`/song/${data.id}`);
    } catch {
      setError('Error de conexión. Revisá tu internet.');
    } finally {
      setLoading(false);
    }
  }

  // ── Delete handlers ────────────────────────────────────────────────────────
  async function handleDeleteSong(song: DbSong) {
    if (!window.confirm(`¿Eliminar «${song.title}»?`)) return;
    setDeletingSongId(song.id);
    try {
      const res = await fetch(`/api/songs/${song.id}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { window.alert(data.error ?? 'No se pudo eliminar la canción'); return; }
      await loadLibrary();
    } catch {
      window.alert('Error de conexión');
    } finally {
      setDeletingSongId(null);
    }
  }

  async function handleDeleteVersion(v: SavedVersionListItem) {
    if (!window.confirm(`¿Eliminar la versión «${v.name}»?`)) return;
    setDeletingVersionId(v.id);
    try {
      const res = await fetch(`/api/version/${v.id}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { window.alert(data.error ?? 'No se pudo eliminar la versión'); return; }
      await loadLibrary();
    } catch {
      window.alert('Error de conexión');
    } finally {
      setDeletingVersionId(null);
    }
  }

  // ── Favorites (optimistic) ─────────────────────────────────────────────────
  async function handleToggleFavorite(songId: string) {
    const wasFav = favorites.has(songId);
    setFavorites((prev) => {
      const next = new Set(prev);
      if (wasFav) next.delete(songId); else next.add(songId);
      return next;
    });

    try {
      const res = await fetch(`/api/favorites/${songId}`, {
        method: wasFav ? 'DELETE' : 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error();
    } catch {
      setFavorites((prev) => {
        const reverted = new Set(prev);
        if (wasFav) reverted.add(songId); else reverted.delete(songId);
        return reverted;
      });
    }
  }

  // ── Tag management ─────────────────────────────────────────────────────────
  async function handleToggleSongTag(songId: string, tagId: string) {
    const current = songTags[songId] ?? [];
    const has = current.includes(tagId);

    setSongTags((prev) => ({
      ...prev,
      [songId]: has ? current.filter((t) => t !== tagId) : [...current, tagId],
    }));

    try {
      const res = await fetch('/api/song-tags', {
        method: has ? 'DELETE' : 'POST',
        credentials: 'include',
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
        method: 'POST',
        credentials: 'include',
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

  // ── Setlist management ─────────────────────────────────────────────────────
  async function handleCreateSetlist() {
    const name = window.prompt('Nombre del setlist:');
    if (!name?.trim()) return;
    try {
      const res = await fetch('/api/setlists', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) await loadLibrary();
    } catch { /* silent */ }
  }

  async function handleDeleteSetlist(id: string, setlistName: string) {
    if (!window.confirm(`¿Eliminar el setlist «${setlistName}»?`)) return;
    try {
      const res = await fetch(`/api/setlists/${id}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) setSetlists((prev) => prev.filter((s) => s.id !== id));
    } catch { /* silent */ }
  }

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filteredSongs = songs.filter((song) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      song.title.toLowerCase().includes(q) ||
      song.artist.toLowerCase().includes(q);
    if (!matchesSearch) return false;

    if (activeFilter === 'all') return true;
    if (activeFilter === 'favorites') return favorites.has(song.id);
    return (songTags[song.id] ?? []).includes(activeFilter);
  });

  const showDemoStrip = process.env.NEXT_PUBLIC_AUTH_DEMO_MODE === 'true';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      {showDemoStrip && (
        <p className="mb-6 text-center text-xs text-amber-800 dark:text-amber-300/90 bg-amber-500/10 border border-amber-500/25 rounded-lg py-2 px-3">
          Modo demo activo — acceso sin login para pruebas locales
        </p>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-[var(--text-primary)] mb-3">
          Cancionero Pro
        </h1>
        <p className="text-[var(--text-secondary)]">
          Importá desde LaCuerda o CifraClub, pegá una cifra en texto, transponé
          y tocá con scroll automático.
        </p>
      </div>

      {/* ── Search + Import button ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search
            size={ICON_INLINE}
            strokeWidth={ICON_STROKE}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
            aria-hidden
          />
          <input
            type="text"
            placeholder="Buscar por título o artista…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] pl-9 pr-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] transition-colors"
          />
        </div>
        <Button
          variant={importOpen ? 'secondary' : 'primary'}
          size="md"
          onClick={() => setImportOpen((o) => !o)}
          className="shrink-0"
        >
          {importOpen ? (
            <><X size={ICON_INLINE} strokeWidth={ICON_STROKE} aria-hidden /> Cerrar</>
          ) : (
            <><Plus size={ICON_INLINE} strokeWidth={ICON_STROKE} aria-hidden /> Importar</>
          )}
        </Button>
      </div>

      {/* ── Filter chips ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 mb-5 overflow-x-auto pb-1 scrollbar-hide">
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
          onClick={() => setActiveFilter('favorites')}
          className={[
            'shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors inline-flex items-center gap-1',
            activeFilter === 'favorites'
              ? 'bg-[var(--accent)] text-white border-transparent'
              : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--accent)]',
          ].join(' ')}
        >
          <Star size={12} strokeWidth={ICON_STROKE} aria-hidden />
          Favoritas
        </button>
        {tags.map((tag) => (
          <button
            key={tag.id}
            type="button"
            onClick={() => setActiveFilter(tag.id)}
            className={[
              'shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors inline-flex items-center gap-1.5',
              activeFilter === tag.id
                ? 'bg-[var(--accent)] text-white border-transparent'
                : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--accent)]',
            ].join(' ')}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: tag.color || 'var(--accent)' }}
            />
            {tag.name}
          </button>
        ))}
      </div>

      {/* ── Collapsible import form ────────────────────────────────────────── */}
      {importOpen && (
        <form
          onSubmit={handleImport}
          className="flex flex-col gap-3 mb-6 p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]"
        >
          <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            Importar canción
          </h2>

          <div
            className="flex rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-0.5"
            role="tablist"
            aria-label="Forma de importación"
          >
            <button
              type="button"
              role="tab"
              aria-selected={importMode === 'url'}
              className={[
                'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                importMode === 'url'
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
              ].join(' ')}
              onClick={() => { setImportMode('url'); setError(null); }}
            >
              Desde URL
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={importMode === 'paste'}
              className={[
                'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                importMode === 'paste'
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
              ].join(' ')}
              onClick={() => { setImportMode('paste'); setError(null); }}
            >
              Pegar texto
            </button>
          </div>

          {importMode === 'url' ? (
            <Input
              label="URL de la canción"
              type="url"
              placeholder="https://www.lacuerda.net/... o https://www.cifraclub.com/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              error={error ?? undefined}
              disabled={loading}
            />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Título (opcional)"
                  type="text"
                  placeholder="Si no ponés nada: Canción pegada"
                  value={pasteTitle}
                  onChange={(e) => setPasteTitle(e.target.value)}
                  disabled={loading}
                />
                <Input
                  label="Artista (opcional)"
                  type="text"
                  placeholder="Ej. nombre del autor"
                  value={pasteArtist}
                  onChange={(e) => setPasteArtist(e.target.value)}
                  disabled={loading}
                />
              </div>
              <Textarea
                label="Cifra pegada"
                placeholder={
                  'Ejemplo:\n' +
                  'Am          F          C\n' +
                  'Primera línea de la letra aquí...\n' +
                  'G              D\n' +
                  'Segunda línea...'
                }
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                error={error ?? undefined}
                disabled={loading}
                spellCheck={false}
              />
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Mismo estilo que LaCuerda: líneas de acordes y debajo la letra. Podés
                pegar varias secciones separadas por líneas en blanco.
              </p>
            </>
          )}

          <Button type="submit" loading={loading} size="lg">
            {loading
              ? 'Importando...'
              : importMode === 'url'
                ? 'Importar canción'
                : 'Guardar cifra pegada'}
          </Button>
        </form>
      )}

      {loading && (
        <div className="mb-6">
          <SongImportSkeleton />
        </div>
      )}

      {/* ── Song list ──────────────────────────────────────────────────────── */}
      <section className="mb-8" aria-labelledby="song-list-heading">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2
            id="song-list-heading"
            className="text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]"
          >
            Tus canciones
          </h2>
          {!libraryLoading && songs.length > 0 && (
            <span className="text-xs text-[var(--text-muted)]">
              {filteredSongs.length === songs.length
                ? `${songs.length} en total`
                : `${filteredSongs.length} de ${songs.length}`}
            </span>
          )}
        </div>

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
            <p className="mb-3">Iniciá sesión para ver las canciones que importaste con tu cuenta.</p>
            <Link
              href="/auth/login"
              className="inline-flex font-medium text-[var(--accent)] hover:underline"
            >
              Ir a iniciar sesión
            </Link>
          </div>
        ) : filteredSongs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-10 text-center">
            {songs.length === 0 ? (
              <>
                <p className="text-[var(--text-muted)] text-sm mb-1">
                  Todavía no hay canciones en tu lista.
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  Importá una usando el botón &quot;+ Importar&quot; arriba.
                </p>
              </>
            ) : (
              <p className="text-[var(--text-muted)] text-sm">
                No hay canciones que coincidan con tu búsqueda.
              </p>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {filteredSongs.map((song) => {
              const isFav = favorites.has(song.id);
              const sTagIds = songTags[song.id] ?? [];
              const sTagObjs = sTagIds
                .map((tid) => tags.find((t) => t.id === tid))
                .filter(Boolean) as UserTag[];

              return (
                <li
                  key={song.id}
                  className="relative flex items-stretch gap-0 overflow-visible rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-muted)] group"
                >
                  {/* Favorite toggle */}
                  <button
                    type="button"
                    title={isFav ? 'Quitar de favoritas' : 'Agregar a favoritas'}
                    aria-label={isFav ? 'Quitar de favoritas' : 'Agregar a favoritas'}
                    onClick={() => void handleToggleFavorite(song.id)}
                    className="flex shrink-0 items-center justify-center pl-3 pr-1 text-[var(--text-muted)] hover:text-yellow-500 transition-colors"
                  >
                    <Star
                      size={ICON_INLINE}
                      strokeWidth={ICON_STROKE}
                      className={isFav ? 'fill-yellow-400 text-yellow-500' : ''}
                      aria-hidden
                    />
                  </button>

                  {/* Main clickable area */}
                  <Link
                    href={`/song/${song.id}`}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 px-2 py-3 text-left"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--text-primary)] group-hover:text-[var(--accent-text)] truncate">
                        {song.title}
                        {song.artist && (
                          <span className="font-normal text-[var(--text-secondary)]">
                            {' — '}{song.artist}
                          </span>
                        )}
                      </p>
                      {sTagObjs.length > 0 && (
                        <div className="flex items-center gap-1 mt-0.5">
                          {sTagObjs.map((t) => (
                            <span
                              key={t.id}
                              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                              style={{
                                backgroundColor: (t.color || 'var(--accent)') + '20',
                                color: t.color || 'var(--accent)',
                              }}
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: t.color || 'var(--accent)' }}
                              />
                              {t.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {song.original_key && (
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-[var(--chord-bg)] text-[var(--chord-color)] shrink-0">
                        {song.original_key}
                      </span>
                    )}
                  </Link>

                  {/* Tag button + dropdown */}
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
                      <Tag size={ICON_INLINE} strokeWidth={ICON_STROKE} aria-hidden />
                    </button>

                    {tagDropdownSongId === song.id && (
                      <div
                        ref={tagDropdownRef}
                        className="absolute right-0 top-full mt-1 z-50 w-56 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-lg py-1 animate-in fade-in slide-in-from-top-1"
                      >
                        {tags.length === 0 && (
                          <p className="px-3 py-2 text-xs text-[var(--text-muted)]">
                            No hay etiquetas aún
                          </p>
                        )}
                        {tags.map((tag) => {
                          const isAssigned = (songTags[song.id] ?? []).includes(tag.id);
                          return (
                            <button
                              key={tag.id}
                              type="button"
                              onClick={() => void handleToggleSongTag(song.id, tag.id)}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors"
                            >
                              <span
                                className="w-3 h-3 rounded-full shrink-0 border"
                                style={{
                                  backgroundColor: isAssigned ? (tag.color || 'var(--accent)') : 'transparent',
                                  borderColor: tag.color || 'var(--accent)',
                                }}
                              />
                              <span className="flex-1 text-left truncate">{tag.name}</span>
                              {isAssigned && (
                                <Check size={14} strokeWidth={ICON_STROKE} className="text-[var(--accent)] shrink-0" aria-hidden />
                              )}
                            </button>
                          );
                        })}
                        <div className="border-t border-[var(--border)] mt-1 pt-1 px-2 pb-1">
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              placeholder="Nueva etiqueta…"
                              value={newTagName}
                              onChange={(e) => setNewTagName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleCreateTag(); } }}
                              className="flex-1 min-w-0 rounded-md border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                            />
                            <button
                              type="button"
                              disabled={!newTagName.trim() || creatingTag}
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

                  {/* Delete button */}
                  <button
                    type="button"
                    disabled={deletingSongId === song.id}
                    title="Eliminar canción"
                    aria-label={`Eliminar ${song.title}`}
                    onClick={() => void handleDeleteSong(song)}
                    className="flex shrink-0 items-center justify-center border-l border-[var(--border)] px-3 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--danger)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] disabled:opacity-40 transition-colors"
                  >
                    <Trash2 size={ICON_INLINE} strokeWidth={ICON_STROKE} className="shrink-0" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Setlists ───────────────────────────────────────────────────────── */}
      <section className="mb-8" aria-labelledby="setlists-heading">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2
            id="setlists-heading"
            className="text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)] inline-flex items-center gap-1.5"
          >
            <ListMusic size={ICON_INLINE} strokeWidth={ICON_STROKE} aria-hidden />
            Setlists
          </h2>
          {!libraryLoading && !needLogin && (
            <button
              type="button"
              title="Crear setlist"
              onClick={() => void handleCreateSetlist()}
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
        ) : needLogin ? (
          <p className="text-xs text-[var(--text-muted)] text-center py-2">
            Iniciá sesión para ver tus setlists.
          </p>
        ) : setlists.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center">
            <p className="text-[var(--text-muted)] text-sm">
              No tenés setlists todavía. Creá uno con el botón +.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {setlists.map((sl) => (
              <li
                key={sl.id}
                className="flex items-stretch gap-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-muted)] group"
              >
                <Link
                  href={`/setlist/${sl.id}`}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--text-primary)] group-hover:text-[var(--accent-text)] truncate">
                      {sl.name}
                    </p>
                    <p className="text-sm text-[var(--text-secondary)] truncate">
                      {sl.song_count} {sl.song_count === 1 ? 'canción' : 'canciones'}
                    </p>
                  </div>
                </Link>
                <button
                  type="button"
                  title="Eliminar setlist"
                  aria-label={`Eliminar setlist ${sl.name}`}
                  onClick={() => void handleDeleteSetlist(sl.id, sl.name)}
                  className="flex shrink-0 items-center justify-center border-l border-[var(--border)] px-3 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--danger)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] transition-colors"
                >
                  <Trash2 size={ICON_INLINE} strokeWidth={ICON_STROKE} className="shrink-0" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Saved versions ─────────────────────────────────────────────────── */}
      <section className="mb-6" aria-labelledby="versions-list-heading">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2
            id="versions-list-heading"
            className="text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]"
          >
            Versiones guardadas
          </h2>
          {!libraryLoading && !needLogin && versions.length > 0 && (
            <span className="text-xs text-[var(--text-muted)]">{versions.length} en total</span>
          )}
        </div>

        {libraryLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-14 rounded-xl bg-[var(--bg-elevated)] animate-pulse" />
            ))}
          </div>
        ) : needLogin ? (
          <p className="text-xs text-[var(--text-muted)] text-center py-2">
            Iniciá sesión para ver las versiones que guardaste.
          </p>
        ) : versionsError ? (
          <p className="text-center text-sm text-[var(--danger)] py-4">{versionsError}</p>
        ) : versions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center">
            <p className="text-[var(--text-muted)] text-sm">
              Todavía no hay versiones. En una canción, editá la cifra y tocá &quot;Guardar versión&quot;.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {versions.map((v) => (
              <li
                key={v.id}
                className="flex items-stretch gap-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-muted)] group"
              >
                <Link
                  href={`/song/${v.song_id}?v=${v.id}`}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--text-primary)] group-hover:text-[var(--accent-text)] truncate">
                      {v.name}
                    </p>
                    <p className="text-sm text-[var(--text-secondary)] truncate">
                      {v.song_title}
                      {v.song_artist ? ` — ${v.song_artist}` : ''}
                    </p>
                  </div>
                  {v.key && (
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-[var(--chord-bg)] text-[var(--chord-color)] shrink-0">
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
                  className="flex shrink-0 items-center justify-center border-l border-[var(--border)] px-3 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--danger)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] disabled:opacity-40 transition-colors"
                >
                  <Trash2 size={ICON_INLINE} strokeWidth={ICON_STROKE} className="shrink-0" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
