'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { SongImportSkeleton } from '@/components/song/SongImportSkeleton';
import type { DbSong, SavedVersionListItem } from '@/types';
import { Trash2 } from 'lucide-react';
import { ICON_INLINE, ICON_STROKE } from '@/components/ui/icon-tokens';

type ImportMode = 'url' | 'paste';

export default function HomePage() {
  const router = useRouter();
  const [importMode, setImportMode] = useState<ImportMode>('url');
  const [url, setUrl] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteArtist, setPasteArtist] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<DbSong[]>([]);
  const [versions, setVersions] = useState<SavedVersionListItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [deletingSongId, setDeletingSongId] = useState<string | null>(null);
  const [deletingVersionId, setDeletingVersionId] = useState<string | null>(null);

  const loadLibrary = useCallback(async () => {
    setListError(null);
    setVersionsError(null);
    setNeedLogin(false);
    try {
      const [songsRes, versionsRes] = await Promise.all([
        fetch('/api/songs', { credentials: 'include' }),
        fetch('/api/versions', { credentials: 'include' }),
      ]);

      const songsData = await songsRes.json().catch(() => ({}));
      const versionsData = await versionsRes.json().catch(() => ({}));

      if (songsRes.status === 401) {
        setHistory([]);
        setVersions([]);
        setNeedLogin(true);
        return;
      }

      if (!songsRes.ok) {
        setHistory([]);
        setListError(songsData.error ?? 'No se pudo cargar la lista');
      } else {
        setHistory(Array.isArray(songsData.songs) ? songsData.songs : []);
      }

      if (versionsRes.status === 401) {
        setVersions([]);
      } else if (!versionsRes.ok) {
        setVersions([]);
        setVersionsError(versionsData.error ?? 'No se pudo cargar las versiones');
      } else {
        setVersions(Array.isArray(versionsData.versions) ? versionsData.versions : []);
      }
    } catch {
      setHistory([]);
      setVersions([]);
      setListError('Error de conexión al cargar canciones');
      setVersionsError('Error de conexión al cargar versiones');
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadLibrary();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadLibrary]);

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (importMode === 'url') {
      if (!url.trim()) {
        setError('Ingresá una URL');
        return;
      }
    } else if (!pastedText.trim()) {
      setError('Pegá el texto de la cifra');
      return;
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

      if (!res.ok) {
        setError(data.error ?? 'Error al importar la canción');
        return;
      }

      await loadLibrary();
      router.push(`/song/${data.id}`);
    } catch {
      setError('Error de conexión. Revisá tu internet.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteSong(song: DbSong) {
    if (!window.confirm(`¿Eliminar «${song.title}»?`)) return;
    setDeletingSongId(song.id);
    try {
      const res = await fetch(`/api/songs/${song.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(data.error ?? 'No se pudo eliminar la canción');
        return;
      }
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
      const res = await fetch(`/api/version/${v.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(data.error ?? 'No se pudo eliminar la versión');
        return;
      }
      await loadLibrary();
    } catch {
      window.alert('Error de conexión');
    } finally {
      setDeletingVersionId(null);
    }
  }

  const showDemoStrip = process.env.NEXT_PUBLIC_AUTH_DEMO_MODE === 'true';

  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      {showDemoStrip && (
        <p className="mb-6 text-center text-xs text-amber-800 dark:text-amber-300/90 bg-amber-500/10 border border-amber-500/25 rounded-lg py-2 px-3">
          Modo demo activo — acceso sin login para pruebas locales
        </p>
      )}

      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-[var(--text-primary)] mb-3">
          Cancionero Pro
        </h1>
        <p className="text-[var(--text-secondary)]">
          Importá desde LaCuerda o CifraClub, pegá una cifra en texto, transponé y tocá con scroll
          automático.
        </p>
      </div>

      <form onSubmit={handleImport} className="flex flex-col gap-3 mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          Importar canción
        </h2>

        <div
          className="flex rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-0.5"
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
            onClick={() => {
              setImportMode('url');
              setError(null);
            }}
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
            onClick={() => {
              setImportMode('paste');
              setError(null);
            }}
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
              Mismo estilo que LaCuerda: líneas de acordes y debajo la letra. Podés pegar varias
              secciones separadas por líneas en blanco.
            </p>
          </>
        )}

        <Button type="submit" loading={loading} size="lg">
          {loading ? 'Importando...' : importMode === 'url' ? 'Importar canción' : 'Guardar cifra pegada'}
        </Button>
      </form>

      {loading && (
        <div className="mb-8">
          <SongImportSkeleton />
        </div>
      )}

      <section className="mb-6" aria-labelledby="song-list-heading">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2
            id="song-list-heading"
            className="text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]"
          >
            Tus canciones guardadas
          </h2>
          {!libraryLoading && history.length > 0 && (
            <span className="text-xs text-[var(--text-muted)]">{history.length} en total</span>
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
        ) : history.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-10 text-center">
            <p className="text-[var(--text-muted)] text-sm mb-1">Todavía no hay canciones en tu lista.</p>
            <p className="text-xs text-[var(--text-muted)]">
              Importá una arriba. Si ya importaste antes sin estar logueado, volvé a importar la misma URL
              estando conectado para asociarla a tu usuario.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {history.map((song) => (
              <li
                key={song.id}
                className="flex items-stretch gap-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-muted)] group"
              >
                <Link
                  href={`/song/${song.id}`}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--text-primary)] group-hover:text-[var(--accent-text)] truncate">
                      {song.title}
                    </p>
                    <p className="text-sm text-[var(--text-secondary)] truncate">{song.artist}</p>
                  </div>
                  {song.original_key && (
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-[var(--chord-bg)] text-[var(--chord-color)] shrink-0">
                      {song.original_key}
                    </span>
                  )}
                </Link>
                <button
                  type="button"
                  disabled={deletingSongId === song.id}
                  title="Eliminar canción"
                  aria-label={`Eliminar ${song.title}`}
                  onClick={() => void handleDeleteSong(song)}
                  className="flex shrink-0 items-center justify-center border-l border-[var(--border)] px-3 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--danger)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] disabled:opacity-40"
                >
                  <Trash2
                    size={ICON_INLINE}
                    strokeWidth={ICON_STROKE}
                    className="shrink-0"
                    aria-hidden
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-6" aria-labelledby="versions-list-heading">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2
            id="versions-list-heading"
            className="text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]"
          >
            Tus versiones guardadas
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
                  className="flex shrink-0 items-center justify-center border-l border-[var(--border)] px-3 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--danger)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] disabled:opacity-40"
                >
                  <Trash2
                    size={ICON_INLINE}
                    strokeWidth={ICON_STROKE}
                    className="shrink-0"
                    aria-hidden
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
