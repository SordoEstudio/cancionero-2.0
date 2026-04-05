import type { ViewMode } from '@/types';

const VIEW_MODES: ViewMode[] = ['default', 'inline', 'chords-only', 'lyrics-only'];

export function viewModeFromDb(value: string | null | undefined): ViewMode {
  return value && VIEW_MODES.includes(value as ViewMode) ? (value as ViewMode) : 'default';
}
