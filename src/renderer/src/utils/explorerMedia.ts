import { AUDIO_EXTS, VIDEO_EXTS } from '@shared/constants';
import type { MediaFile } from '@renderer/types/media';

const VIDEO_EXT_SET = new Set(VIDEO_EXTS);
const AUDIO_EXT_SET = new Set(AUDIO_EXTS);

export interface BuildMediaFileOptions {
  path: string;
  name?: string;
  extension?: string;
  size?: number;
  mimeType?: string;
  type?: MediaFile['type'];
}

function detectType(extension: string): MediaFile['type'] {
  const ext = `.${extension.replace(/^\./, '').toLowerCase()}`;
  if (VIDEO_EXT_SET.has(ext)) return 'video';
  if (AUDIO_EXT_SET.has(ext)) return 'audio';
  return 'unknown';
}

export function buildMediaFile(options: BuildMediaFileOptions): MediaFile {
  // Derive the extension from the path when not provided explicitly (e.g.
  // "Open File"/file-association callers pass only `{ path }`).
  const dot = options.path.lastIndexOf('.');
  const fromPath = dot > 0 ? options.path.slice(dot + 1) : '';
  const extension = (options.extension || fromPath).replace(/^\./, '').toLowerCase();
  const name = options.name || options.path.split(/[/\\]/).pop() || options.path;
  return {
    id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    path: options.path,
    name,
    type: options.type || detectType(extension),
    size: options.size || 0,
    duration: 0,
    extension,
    mimeType: options.mimeType || '',
    addedAt: Date.now(),
    playCount: 0
  };
}
