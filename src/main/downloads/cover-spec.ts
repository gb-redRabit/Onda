import { extname, join, dirname, basename } from 'path';
import type { IpcCoverSpec } from '../../shared/types/ipc';

const INVALID_DIR_CHARS = /[<>:"/\\|?*]/g;
const MAX_SEGMENT_LENGTH = 120;

// Sanitizes a channel/playlist name for use as a directory segment (Windows-safe,
// no trailing dots/spaces, capped length).
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

// Replaces `{channel}` / `{playlist}` tokens in an output-dir template with the
// sanitized titles. Tokens without a title resolve to the global dir.
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

// Validates and clamps an untrusted cover spec coming from the renderer.
export function normalizeCoverSpec(cover: unknown): IpcCoverSpec | undefined {
  if (!cover || typeof cover !== 'object') return undefined;
  const c = cover as Record<string, unknown>;
  const type = c.type;
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

// yt-dlp args embedding the YouTube thumbnail into audio tags during download.
export function buildThumbnailArgs(): string[] {
  return ['--write-thumbnail', '--convert-thumbnails', 'jpg', '--embed-thumbnail'];
}

// yt-dlp args limiting the download to a single time section (for clips/frames).
export function buildSectionArgs(start: number, end: number): string[] {
  return ['--download-sections', `*${start}-${end}`, '--force-keyframes-at-cuts'];
}

// Animated cover clip is stored next to the audio file under the same base name
// (the library already picks such sibling videos up via getCover).
export function siblingCoverPath(audioPath: string, format: 'webm' | 'mp4'): string {
  const dir = dirname(audioPath);
  const base = basename(audioPath, extname(audioPath));
  return join(dir, `${base}.${format}`);
}
