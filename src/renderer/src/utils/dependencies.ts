export interface DepStatus {
  installed: boolean;
  version: string | null;
  path: string | null;
  managed: boolean;
}

export interface DepRow {
  name: string;
  tool: 'ffmpeg' | 'ffprobe' | 'yt-dlp' | 'mkvextract';
  descriptionKey: string;
  description: string;
  installed: boolean;
  version: string | null;
  path: string | null;
  managed: boolean;
  updateAvailable: boolean;
  installing: boolean;
  percent: number;
  error: string | null;
}

export const DEP_LIST = [
  { name: 'FFmpeg', tool: 'ffmpeg', descriptionKey: 'settings.ffmpegDesc' },
  { name: 'FFprobe', tool: 'ffprobe', descriptionKey: 'settings.ffprobeDesc' },
  { name: 'yt-dlp', tool: 'yt-dlp', descriptionKey: 'settings.ytdlpDesc' },
  { name: 'MKVToolbox', tool: 'mkvextract', descriptionKey: 'settings.mkvDesc' }
] as const;

export const EMPTY_DEP_STATUS: DepStatus = {
  installed: false,
  version: null,
  path: null,
  managed: false
};

interface DepApi {
  install: (() => Promise<{ success: boolean; error?: string; cancelled?: boolean }>) | undefined;
  check: (() => Promise<DepStatus>) | undefined;
  remove: (() => Promise<{ success: boolean; error?: string }>) | undefined;
}

export function toolApi(dep: DepRow): DepApi {
  if (dep.tool === 'mkvextract') {
    return {
      install: window.api?.installMkvextract,
      check: window.api?.checkMkvextract,
      remove: window.api?.removeMkvextract
    };
  }
  if (dep.tool === 'yt-dlp') {
    return {
      install: window.api?.installYtdlp,
      check: window.api?.checkYtdlp,
      remove: window.api?.removeYtdlp
    };
  }
  return {
    install: window.api?.installFfmpeg,
    check: dep.tool === 'ffprobe' ? window.api?.checkFfprobe : window.api?.checkFfmpeg,
    remove: window.api?.removeFfmpeg
  };
}

export async function safeCheck<T>(fn: (() => Promise<T>) | undefined, fallback: T): Promise<T> {
  if (!fn) return fallback;
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export function isStatus(s: unknown): s is DepStatus {
  return typeof s === 'object' && s !== null && 'installed' in s;
}
