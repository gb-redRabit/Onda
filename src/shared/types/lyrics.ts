/** Jedna linia tekstu; `timeMs` = 0 dla tekstu bez synchronizacji. */
export interface LyricsLine {
  timeMs: number;
  text: string;
}

export type LyricsKind = 'synced' | 'plain' | 'none';
export type LyricsSource = 'tag' | 'sidecar';

export interface LyricsResult {
  kind: LyricsKind;
  source?: LyricsSource;
  /** Format sidecara, jeśli tekst pochodzi z pliku. */
  format?: 'lrc' | 'srt';
  lines: LyricsLine[];
  /** Offset z nagłówka LRC `[offset:...]` (ms); dodatni = linie później. */
  offsetMs?: number;
}
