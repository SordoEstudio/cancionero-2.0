/**
 * Preferencias locales por canción (localStorage). Complementa lo guardado en versión en servidor.
 */

const storageKey = (songId: string) => `cancionero.songPrefs.v1:${songId}`;

export type SongLocalPrefs = {
  versionId?: string | null;
  transposeSteps?: number;
  capo?: number;
  scrollSpeed?: number;
  chordZoom?: number;
  lyricZoom?: number;
  collapsedIds?: string[];
  hiddenTabIds?: string[];
};

export function loadSongPrefs(songId: string): SongLocalPrefs | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(songId));
    if (!raw) return null;
    const p = JSON.parse(raw) as SongLocalPrefs;
    return p && typeof p === 'object' ? p : null;
  } catch {
    return null;
  }
}

export function saveSongPrefs(songId: string, prefs: SongLocalPrefs): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey(songId), JSON.stringify(prefs));
  } catch {
    /* quota / private mode */
  }
}

const GLOBAL_SCROLL_KEY = 'scroll-speed';

export function readGlobalScrollSpeed(): number | null {
  if (typeof window === 'undefined') return null;
  const v = parseFloat(localStorage.getItem(GLOBAL_SCROLL_KEY) ?? '');
  return Number.isFinite(v) ? v : null;
}

export function writeGlobalScrollSpeed(speed: number): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GLOBAL_SCROLL_KEY, String(speed));
  } catch {
    /* ignore */
  }
}
