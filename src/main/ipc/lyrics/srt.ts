import type { LyricsLine, LyricsResult } from '../../../shared/types/lyrics';

const CUE_TIME = /(\d+):(\d{2}):(\d{2})[,.](\d{1,3})/;

function toMs(hours: string, minutes: string, seconds: string, fraction: string): number {
  return (
    Number(hours) * 3_600_000 +
    Number(minutes) * 60_000 +
    Number(seconds) * 1000 +
    Number(fraction.padEnd(3, '0'))
  );
}

function cleanCueText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\{\\[^}]+\}/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();
}

/**
 * Parsuje napisy SRT jako tekst piosenki: każdy cue staje się linią o czasie
 * rozpoczęcia. Obsługuje `,` i `.` w milisekundach, wielolinijkowe cue oraz
 * znaczniki HTML/ASS.
 */
export function parseSrt(input: string): LyricsResult {
  const blocks = input
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/);
  const lines: LyricsLine[] = [];

  for (const block of blocks) {
    const blockLines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const timeIndex = blockLines.findIndex((line) => line.includes('-->'));
    if (timeIndex < 0) continue;

    const match = blockLines[timeIndex].match(CUE_TIME);
    if (!match) continue;

    const text = cleanCueText(blockLines.slice(timeIndex + 1).join('\n'));
    if (!text) continue;

    lines.push({
      timeMs: toMs(match[1], match[2], match[3], match[4]),
      text
    });
  }

  if (lines.length === 0) return { kind: 'none', lines: [] };

  const seen = new Set<string>();
  const unique = lines
    .sort((a, b) => a.timeMs - b.timeMs)
    .filter((line) => {
      const key = `${line.timeMs}\u0000${line.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return { kind: 'synced', lines: unique };
}
