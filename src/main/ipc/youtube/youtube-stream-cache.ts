import { readFileSync, mkdirSync, writeFileSync, rmSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { app } from 'electron';
import { logger } from '../../../shared/logger';

// Trwały cache URL-i strumieni YouTube wyodrębniony z `youtube-handlers.ts`
// (plan 2.8). Rozwiązywanie yt-dlp jest wolne (~3-10 s) i rate-limitowane, więc rozwiązane
// URL-e są cache'owane (LRU + TTL) i utrwalane w userData między restartami.

export interface StreamCacheEntry {
  url: string;
  expires: number;
}

const STREAM_CACHE_TTL_MS = 5 * 60 * 60 * 1000;
const STREAM_CACHE_MAX = 100;
// Rozwiązywane leniwie: `app.setPath('userData', ...)` dla trybu portable/E2E działa
// po ewaluacji modułu, więc odczyt ścieżki w czasie importu wskazałby
// cache na prawdziwy profil użytkownika.
let streamCacheFileCache: string | null = null;
function streamCacheFile(): string {
  if (!streamCacheFileCache) {
    streamCacheFileCache = join(app.getPath('userData'), 'stream-url-cache.json');
  }
  return streamCacheFileCache;
}

const streamCache = new Map<string, StreamCacheEntry>();
let streamCacheLoaded = false;
let streamCacheSaveTimer: NodeJS.Timeout | null = null;

// Leniwe, best-effort wczytywanie trwałego cache URL-i. Uszkodzone/brakujące pliki są
// ignorowane — cache po prostu startuje pusty. Zapisane wpisy ponad limit LRU
// są usuwane przy następnym zapisie.
function loadStreamCache(): void {
  if (streamCacheLoaded) return;
  streamCacheLoaded = true;
  try {
    const raw = readFileSync(streamCacheFile(), 'utf8');
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
    // pierwsze uruchomienie lub uszkodzony plik — zacznij z pustym cache
  }
}

// Debounce'owany zapis, aby seria rozwiązań (play-all, prefetch przy hoverze) zlewała się
// najwyżej raz na sekundę, a nie raz na rozwiązanie.
function scheduleStreamCacheSave(): void {
  if (streamCacheSaveTimer) return;
  streamCacheSaveTimer = setTimeout(() => {
    streamCacheSaveTimer = null;
    try {
      const now = Date.now();
      const entries = [...streamCache.entries()]
        .filter(([, v]) => v.expires > now)
        .map(([url, v]) => ({ url, streamUrl: v.url, expires: v.expires }));
      mkdirSync(dirname(streamCacheFile()), { recursive: true });
      writeFileSync(streamCacheFile(), JSON.stringify(entries));
    } catch (e) {
      logger.warn('yt', 'stream cache save failed', String(e));
    }
  }, 1000);
}

// Zwraca żywy wpis cache (aktualizując kolejność LRU) lub undefined; wygasłe
// wpisy są usuwane.
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

/**
 * Usuwa cache URL-i w pamięci i trwały plik JSON. Zwraca liczbę
 * usuniętych żywych wpisów plus liczbę usuniętych plików i ich rozmiar w bajtach.
 */
export function clearStreamCache(): {
  entries: number;
  removed: number;
  bytesFreed: number;
} {
  const entries = streamCache.size;
  streamCache.clear();
  if (streamCacheSaveTimer) {
    clearTimeout(streamCacheSaveTimer);
    streamCacheSaveTimer = null;
  }
  let removed = 0;
  let bytesFreed = 0;
  try {
    bytesFreed = statSync(streamCacheFile()).size;
    rmSync(streamCacheFile(), { force: true });
    removed = 1;
  } catch {
    // brak trwałego pliku cache — nie ma czego usuwać
  }
  return { entries, removed, bytesFreed };
}
