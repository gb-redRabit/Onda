// OpenSubtitles (REST API v1). Typy współdzielone między procesem main (klient HTTP)
// a rendererem (lista wyników w modalu napisów).

export interface OpenSubtitlesSearchParams {
  /** Tytuł / nazwa pliku do wyszukania. */
  query: string;
  /** Kody języków rozdzielone przecinkiem (np. `pl,en`). */
  languages?: string;
  season?: number;
  episode?: number;
  year?: number;
}

export interface OpenSubtitlesResult {
  fileId: number;
  language: string;
  release: string;
  downloads: number;
  rating: number;
  format: string;
  fileName: string;
}

export interface OpenSubtitlesSearchResult {
  success: boolean;
  results: OpenSubtitlesResult[];
  /** `missing-api-key`, `missing-query`, `rate-limit`, `network` lub surowy komunikat. */
  error?: string;
}

export interface OpenSubtitlesDownloadParams {
  fileId: number;
  /** Gdy podane, plik jest zapisywany obok wideo jako `<base>.<lang>.<ext>`. */
  videoPath?: string;
  language?: string;
}

export interface OpenSubtitlesDownloadResult {
  success: boolean;
  /** Ścieżka zapisanego pliku (gdy podano `videoPath`). */
  path?: string;
  /** Treść napisów (gdy nie zapisano na dysk). */
  content?: string;
  format?: string;
  error?: string;
}
