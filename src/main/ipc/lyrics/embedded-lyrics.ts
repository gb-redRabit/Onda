import { parseFile } from 'music-metadata';
import type { ILyricsTag } from 'music-metadata';
import type { LyricsResult } from '../../../shared/types/lyrics';
import { parseLrc } from './lrc';

/**
 * Mapuje tagi lyrics z music-metadata. Preferuje SYLT (`syncText`), potem
 * USLT zawierający LRC, a na końcu zwykły tekst.
 */
export function mapEmbeddedLyrics(tags: readonly ILyricsTag[] | undefined): LyricsResult | null {
  if (!tags?.length) return null;

  for (const tag of tags) {
    const sync = (tag.syncText || []).filter((entry) => entry.text?.trim());
    if (sync.length === 0) continue;
    return {
      kind: 'synced',
      source: 'tag',
      lines: sync
        .map((entry) => ({
          timeMs: Math.max(0, Math.round(entry.timestamp || 0)),
          text: entry.text.trim()
        }))
        .sort((a, b) => a.timeMs - b.timeMs)
    };
  }

  for (const tag of tags) {
    const text = tag.text?.trim();
    if (!text) continue;
    const parsed = parseLrc(text);
    if (parsed.kind !== 'none') return { ...parsed, source: 'tag' };
  }

  return null;
}

export async function readEmbeddedLyrics(filePath: string): Promise<LyricsResult | null> {
  try {
    const metadata = await parseFile(filePath, { duration: false, skipCovers: true });
    return mapEmbeddedLyrics(metadata.common.lyrics);
  } catch {
    return null;
  }
}
