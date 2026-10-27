import type { LyricsLine, LyricsResult } from '../../../shared/types/lyrics';

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const META_TAG = /^\[([a-zA-Z]+):(.*)\]$/;

function fractionToMs(fraction: string | undefined): number {
  if (!fraction) return 0;
  if (fraction.length === 1) return Number(fraction) * 100;
  if (fraction.length === 2) return Number(fraction) * 10;
  return Number(fraction);
}

function parseTimestamp(minutes: string, seconds: string, fraction?: string): number {
  return Number(minutes) * 60_000 + Number(seconds) * 1000 + fractionToMs(fraction);
}

/**
 * Parsuje LRC. Obsługuje wiele znaczników czasu w jednej linii, metadane
 * `[ar:]`, `[ti:]`, `[al:]`, `[by:]` oraz `[offset:...]`. Gdy plik nie ma
 * znaczników czasu, zwraca tekst niesynchronizowany (`kind: 'plain'`).
 */
export function parseLrc(input: string): LyricsResult {
  const timed: LyricsLine[] = [];
  const plain: string[] = [];
  let offsetMs = 0;

  for (const rawLine of input
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const meta = line.match(META_TAG);
    if (meta) {
      if (meta[1].toLowerCase() === 'offset') {
        const value = Number.parseInt(meta[2], 10);
        if (Number.isFinite(value)) offsetMs = value;
      }
      continue;
    }

    TIME_TAG.lastIndex = 0;
    const times: number[] = [];
    let lastTagEnd = 0;
    let match: RegExpExecArray | null;
    while ((match = TIME_TAG.exec(line)) !== null) {
      times.push(parseTimestamp(match[1], match[2], match[3]));
      lastTagEnd = TIME_TAG.lastIndex;
    }

    if (times.length === 0) {
      plain.push(line);
      continue;
    }

    const text = line.slice(lastTagEnd).trim();
    if (!text) continue;
    for (const timeMs of times) timed.push({ timeMs, text });
  }

  if (timed.length === 0) {
    return {
      kind: plain.length ? 'plain' : 'none',
      lines: plain.map((text) => ({ timeMs: 0, text }))
    };
  }

  const seen = new Set<string>();
  const lines = timed
    .sort((a, b) => a.timeMs - b.timeMs)
    .filter((line) => {
      const key = `${line.timeMs}\u0000${line.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return { kind: 'synced', lines, ...(offsetMs ? { offsetMs } : {}) };
}
