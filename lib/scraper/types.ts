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
  return 'code' in r && typeof (r as ScrapeError).code === 'string';
}
