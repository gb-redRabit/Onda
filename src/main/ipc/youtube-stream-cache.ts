import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { app } from 'electron';
import { logger } from '../../shared/logger';

// Persisted YouTube stream-URL cache extracted from `youtube-handlers.ts`
// (plan 2.8). yt-dlp resolves are slow (~3-10s) and rate-limited, so resolved
// URLs are cached (LRU + TTL) and persisted to userData across restarts.

export interface StreamCacheEntry {
  url: string;
  expires: number;
}

const STREAM_CACHE_TTL_MS = 5 * 60 * 60 * 1000;
const STREAM_CACHE_MAX = 100;
const STREAM_CACHE_FILE = join(app.getPath('userData'), 'stream-url-cache.json');

const streamCache = new Map<string, StreamCacheEntry>();
let streamCacheLoaded = false;
let streamCacheSaveTimer: NodeJS.Timeout | null = null;

// Lazy, best-effort load of the persisted URL cache. Corrupt/missing files are
// ignored — the cache just starts empty. Persisted entries beyond the LRU cap
// are dropped on the next save.
function loadStreamCache(): void {
  if (streamCacheLoaded) return;
  streamCacheLoaded = true;
  try {
    const raw = readFileSync(STREAM_CACHE_FILE, 'utf8');
    const entries = JSON.parse(raw) as { url: string; streamUrl: string; expires: number }[];
    const now = Date.now();
    for (const entry of entries) {
      if (
        streamCache.size >= STREAM_CACHE_MAX ||
        !entry?.url ||
        !entry?.streamUrl ||
        typeof entry.expires !== 'number' ||
        entry.expires <= now
      ) {
        continue;
      }
      streamCache.set(entry.url, { url: entry.streamUrl, expires: entry.expires });
    }
    if (streamCache.size > 0) {
      logger.info('yt', `stream cache loaded entries=${streamCache.size}`);
    }
  } catch {
    // first run or corrupt file — start with an empty cache
  }
}

// Debounced write so a burst of resolves (play-all, hover prefetches) flushes
// at most once per second instead of once per resolve.
function scheduleStreamCacheSave(): void {
  if (streamCacheSaveTimer) return;
  streamCacheSaveTimer = setTimeout(() => {
    streamCacheSaveTimer = null;
    try {
      const now = Date.now();
      const entries = [...streamCache.entries()]
        .filter(([, v]) => v.expires > now)
        .map(([url, v]) => ({ url, streamUrl: v.url, expires: v.expires }));
      mkdirSync(dirname(STREAM_CACHE_FILE), { recursive: true });
      writeFileSync(STREAM_CACHE_FILE, JSON.stringify(entries));
    } catch (e) {
      logger.warn('yt', 'stream cache save failed', String(e));
    }
  }, 1000);
}

// Returns a live cached entry (touching LRU order) or undefined; expired
// entries are dropped.
export function getCachedStream(url: string, now = Date.now()): StreamCacheEntry | undefined {
  loadStreamCache();
  const cached = streamCache.get(url);
  if (!cached) return undefined;
  if (cached.expires <= now) {
    streamCache.delete(url);
    return undefined;
  }
  streamCache.delete(url);
  streamCache.set(url, cached);
  return cached;
}

export function cacheStream(url: string, streamUrl: string): void {
  streamCache.set(url, { url: streamUrl, expires: Date.now() + STREAM_CACHE_TTL_MS });
  if (streamCache.size > STREAM_CACHE_MAX) {
    const oldest = streamCache.keys().next().value;
    if (oldest) streamCache.delete(oldest);
  }
  scheduleStreamCacheSave();
}
