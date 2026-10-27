import { extname } from 'path';
import type { LyricsResult } from '../../../shared/types/lyrics';
import { readTextFileWithinBounds } from '../../utils/read-text-file';
import { findLyricsSidecar } from './lyrics-files';
import { readEmbeddedLyrics } from './embedded-lyrics';
import { parseLrc } from './lrc';
import { parseSrt } from './srt';

export const LYRICS_EXTS = new Set(['.lrc', '.srt']);
export const LYRICS_MAX_BYTES = 1024 * 1024;

interface LyricsReadDeps {
  findSidecar: (mediaPath: string) => Promise<string | null>;
  readSidecar: (path: string) => Promise<string | null>;
  readEmbedded: (path: string) => Promise<LyricsResult | null>;
}

const defaultDeps: LyricsReadDeps = {
  findSidecar: findLyricsSidecar,
  readSidecar: async (path) => {
    const result = await readTextFileWithinBounds(path, LYRICS_EXTS, LYRICS_MAX_BYTES, 'lyrics');
    return result.ok ? result.text : null;
  },
  readEmbedded: readEmbeddedLyrics
};

/**
 * Czyta tekst z sidecara `.lrc`, a gdy go brak — z tagów pliku audio.
 * Zwraca `kind: 'none'` dla braku tekstu; błędy odczytu nie przerywają odtwarzania.
 */
export async function readLyricsForFile(
  filePath: string,
  deps: LyricsReadDeps = defaultDeps
): Promise<LyricsResult> {
  const sidecar = await deps.findSidecar(filePath);
  if (sidecar) {
    const text = await deps.readSidecar(sidecar);
    if (text) {
      const isSrt = extname(sidecar).toLowerCase() === '.srt';
      const parsed = isSrt ? parseSrt(text) : parseLrc(text);
      if (parsed.kind !== 'none') {
        return { ...parsed, source: 'sidecar', format: isSrt ? 'srt' : 'lrc' };
      }
    }
  }

  const embedded = await deps.readEmbedded(filePath);
  if (embedded) return embedded;

  return { kind: 'none', lines: [] };
}
