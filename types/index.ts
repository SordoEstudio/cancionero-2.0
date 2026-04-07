// ─── Tipos de sección ────────────────────────────────────────────────────────
export type SectionType =
  | 'intro'
  | 'verse'
  | 'pre-chorus'
  | 'chorus'
  | 'bridge'
  | 'solo'
  | 'outro'
  | 'tab'
  | 'unknown';

export type ViewMode = 'default' | 'inline' | 'chords-only' | 'lyrics-only';

// ─── Chords ──────────────────────────────────────────────────────────────────
export interface ChordToken {
  position: number;
  chord: string;
}

// ─── Filas de DB (espejo del schema SQL) ─────────────────────────────────────
export interface DbSong {
  id: string;
  title: string;
  artist: string;
  source_url: string;
  original_key: string | null;
  imported_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbSongSection {
  id: string;
  song_id: string;
  type: SectionType;
  label: string | null;
  position: number;
  created_at: string;
}

export interface DbSongLine {
  id: string;
  section_id: string;
  position: number;
  chords: ChordToken[];
  text: string;
  created_at: string;
}

export interface DbSongVersion {
  id: string;
  song_id: string;
  user_id: string;
  name: string;
  key: string | null;
  capo: number;
  transpose_steps: number;
  view_mode: ViewMode;
  scroll_speed: number | null;
  hidden_tabs: string[];
  notes: string;
  created_at: string;
  updated_at: string;
}

/** Preferencias persistidas al abrir una versión guardada (?v=). */
export interface SongVersionActive {
  id: string;
  name: string;
  key: string | null;
  capo: number;
  transpose_steps: number;
  view_mode: ViewMode;
  scroll_speed: number | null;
  hidden_tabs: string[];
  notes: string;
}

export interface DbVersionLine {
  id: string;
  version_id: string;
  song_line_id: string;
  chords: ChordToken[];
  text: string | null;
  created_at: string;
}

// ─── Tipos del parser (en memoria) ───────────────────────────────────────────
export interface ParsedLine {
  chords: ChordToken[];
  text: string;
}

export interface ParsedSection {
  type: SectionType;
  label: string;
  lines: ParsedLine[];
}

export interface ParsedSong {
  title: string;
  artist: string;
  sourceUrl: string;
  originalKey: string | null;
  sections: ParsedSection[];
}

// ─── Tipos del scraper ───────────────────────────────────────────────────────
export interface RawSongData {
  title: string;
  artist: string;
  sourceUrl: string;
  rawContent: string;
}

export type ScrapeErrorCode =
  | 'SITE_UNSUPPORTED'
  | 'FETCH_FAILED'
  | 'PARSE_FAILED'
  | 'EMPTY_CONTENT';

export interface ScrapeError {
  code: ScrapeErrorCode;
  message: string;
}

export type ScrapeResult = RawSongData | ScrapeError;

export function isScrapeError(r: ScrapeResult): r is ScrapeError {
  return 'code' in r;
}

// ─── API request/response ────────────────────────────────────────────────────
export interface ImportSongRequest {
  url: string;
}

export interface ImportSongResponse {
  id: string;
  title: string;
  artist: string;
}

export interface VersionOverride {
  songLineId: string;
  chords: ChordToken[];
  text?: string;
}

export interface SaveVersionRequest {
  songId: string;
  name: string;
  key: string | null;
  capo: number;
  transposeSteps: number;
  viewMode: ViewMode;
  scrollSpeed: number;
  overrides: VersionOverride[];
}

/** Ítem de GET /api/versions para la lista en inicio */
export interface SavedVersionListItem {
  id: string;
  song_id: string;
  name: string;
  key: string | null;
  capo: number;
  created_at: string;
  song_title: string;
  song_artist: string;
}

// ─── Tipos compuestos para el frontend ───────────────────────────────────────
export interface SongLineWithId extends ParsedLine {
  id: string;
}

export interface SongSectionWithLines {
  id: string;
  type: SectionType;
  label: string;
  position: number;
  lines: SongLineWithId[];
}

export interface FullSong extends DbSong {
  sections: SongSectionWithLines[];
}

// ─── Favoritos / Tags / Setlists (Sprint 1+2) ───────────────────────────────
export interface UserTag {
  id: string;
  name: string;
  color: string;
}

export interface SongWithMeta extends DbSong {
  is_favorite: boolean;
  tags: UserTag[];
}

export interface SetlistItem {
  id: string;
  name: string;
  description: string;
  is_public: boolean;
  song_count: number;
  created_at: string;
  updated_at: string;
}

export interface SetlistSongItem {
  id: string;
  song_id: string;
  position: number;
  version_id: string | null;
  song_title: string;
  song_artist: string;
  original_key: string | null;
}
