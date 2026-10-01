import { extname, join, dirname, basename } from 'path';
import type { IpcCoverSpec } from '../../shared/types/ipc';

const INVALID_DIR_CHARS = /[<>:"/\\|?*]/g;
const MAX_SEGMENT_LENGTH = 120;

// Sanityzuje nazwę kanału/playlisty do użycia jako segment katalogu (bezpieczny dla
// Windows, bez końcowych kropek/spacji, ograniczona długość).
export function sanitizeDirSegment(name: string): string {
  let out = (name || '')
    .replace(INVALID_DIR_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, MAX_SEGMENT_LENGTH);
  if (out === '.' || out === '..') out = '';
  return out;
}

// Zastępuje tokeny `{channel}` / `{playlist}` w szablonie katalogu wyjściowego
// zsanityzowanymi tytułami. Tokeny bez tytułu rozwiązują się do katalogu globalnego.
export function resolveFolderTokens(
  template: string,
  ctx: { channelTitle?: string; playlistTitle?: string }
): string {
  let out = template || '';
  const channel = sanitizeDirSegment(ctx.channelTitle || '');
  const playlist = sanitizeDirSegment(ctx.playlistTitle || '');
  if (channel) out = out.split('{channel}').join(channel);
  else out = out.split('{channel}').join('');
  if (playlist) out = out.split('{playlist}').join(playlist);
  else out = out.split('{playlist}').join('');
  return out.trim();
}

export function clampSeconds(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(24 * 3600, Math.round(value * 10) / 10));
}

// Waliduje i przycina niezaufany cover spec pochodzący z renderera.
export function normalizeCoverSpec(cover: unknown): IpcCoverSpec | undefined {
  if (!cover || typeof cover !== 'object') return undefined;
  const c = cover as Record<string, unknown>;
  const type = c.type;
  if (type === 'none') return { type: 'none' };
  if (type === 'thumbnail') return { type: 'thumbnail' };
  if (type === 'custom') {
    const customPath = typeof c.customPath === 'string' ? c.customPath.trim() : '';
    if (!customPath) return undefined;
    return { type: 'custom', customPath };
  }
  if (type === 'frame') {
    return { type: 'frame', frameTime: clampSeconds(c.frameTime as number, 30) };
  }
  if (type === 'clip') {
    const start = clampSeconds(c.clipStart as number, 0);
    const end = clampSeconds(c.clipEnd as number, 30);
    if (end <= start) return undefined;
    const clipFormat = c.clipFormat === 'mp4' ? 'mp4' : 'webm';
    return { type: 'clip', clipStart: start, clipEnd: end, clipFormat };
  }
  return undefined;
}

// Argumenty yt-dlp osadzające miniaturę YouTube w tagach audio podczas pobierania.
export function buildThumbnailArgs(): string[] {
  return ['--write-thumbnail', '--convert-thumbnails', 'jpg', '--embed-thumbnail'];
}

// Argumenty yt-dlp ograniczające pobieranie do jednego przedziału czasu (dla clipów/frames).
export function buildSectionArgs(start: number, end: number): string[] {
  return ['--download-sections', `*${start}-${end}`, '--force-keyframes-at-cuts'];
}

// Animowany cover clip jest przechowywany obok pliku audio pod tą samą nazwą bazową
// (biblioteka i tak wychwytuje takie sąsiednie wideo przez getCover).
export function siblingCoverPath(audioPath: string, format: 'webm' | 'mp4'): string {
  const dir = dirname(audioPath);
  const base = basename(audioPath, extname(audioPath));
  return join(dir, `${base}.${format}`);
}
