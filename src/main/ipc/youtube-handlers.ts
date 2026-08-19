import { app, ipcMain } from 'electron';
import { dirname, join } from 'path';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { runCommand } from '../utils/exec';
import { resolveBin } from '../binaries';
import { getYtAuthConfig, cleanupYtAuthTemp } from '../youtube-auth';
import { classifyYtDlpError, redactSecrets } from '../downloads/error-classifier';
import { logger } from '../../shared/logger';
import type { IpcDownloadErrorCode, IpcStreamResult } from '../../shared/types/ipc';
import {
  pickChannelThumbnail,
  resolveChannelAvatar,
  buildYtArgs,
  buildStreamGetArgs,
  parseStreamGetOutput,
  detectYtKind,
  normalizeYtUrl,
  mapResolvedEntry,
  mapResolvedContainer,
  mapVideoEntry,
  type YtDlpEntry
} from './youtube-utils';
import { readProxyArgs } from './proxy-utils';

// Runs yt-dlp with authentication applied and cleans up any temporary cookie
// file afterwards. Centralized so every caller gets auth + cleanup consistently.
async function runYtDlp(args: string[], timeout: number): Promise<string> {
  const bin = (await resolveBin('yt-dlp')) || 'yt-dlp';
  const auth = await getYtAuthConfig();
  try {
    return await runCommand(bin, buildYtArgs(args, auth), { timeout });
  } finally {
    await cleanupYtAuthTemp(auth);
  }
}

export async function fetchChannelItems(opts: {
  url: string;
  start?: number;
  end?: number;
  tab?: 'videos' | 'shorts';
}): Promise<{
  success: boolean;
  error?: string;
  code?: IpcDownloadErrorCode;
  channel?: {
    id: string;
    url: string;
    title: string;
    thumbnail: string;
    subscriberCount?: number;
    description?: string;
    videoCount?: number;
    bannerUrl?: string;
  };
  items: ReturnType<typeof mapVideoEntry>[];
  hasMore: boolean;
}> {
  if (detectYtKind(opts.url) !== 'channel') {
    return { success: false, error: 'Expected a channel link or name', items: [], hasMore: false };
  }
  const base = normalizeYtUrl(opts.url, 'channel');
  const tab = opts.tab === 'shorts' ? 'shorts' : 'videos';
  const target = `${base}/${tab}`;
  const start = Math.max(1, Math.floor(Number(opts.start) || 1));
  const end = Math.max(start, Math.min(start + 199, Math.floor(Number(opts.end) || start + 29)));
  try {
    const stdout = await runYtDlp(
      [
        target,
        '--flat-playlist',
        '--playlist-start',
        String(start),
        '--playlist-end',
        String(end),
        '--no-warnings',
        '-J',
        ...(await readProxyArgs())
      ],
      60000
    );
    const parsed = JSON.parse(stdout) as YtDlpEntry;
    const items = (parsed.entries || [])
      .filter((e) => e.id && e.title)
      .map((e) => mapVideoEntry(e));
    const channelId = parsed.channel_id || parsed.uploader_id || parsed.id || '';
    const channelThumbnail =
      pickChannelThumbnail(parsed) ||
      (await resolveChannelAvatar(channelId));
    return {
      success: true,
      channel: {
        id: channelId,
        url: base,
        title: parsed.channel || parsed.uploader || parsed.title || '',
        thumbnail: channelThumbnail,
        subscriberCount: parsed.channel_follower_count,
        description: parsed.description || '',
        videoCount: parsed.playlist_count ?? items.length,
        bannerUrl: pickChannelThumbnail(parsed) || undefined
      },
      items,
      hasMore: items.length >= end - start + 1
    };
  } catch (e: unknown) {
    const err = e as { message?: string };
    const msg = err.message || String(e);
    logger.warn('yt', 'channel failed', msg);
    if (tab === 'shorts' && /does not have a shorts tab/i.test(msg)) {
      return { success: false, error: 'no_shorts_tab', items: [], hasMore: false };
    }
    return {
      success: false,
      error: msg || 'Could not load this channel',
      code: classifyYtDlpError(msg),
      items: [],
      hasMore: false
    };
  }
}

// Fetches the ENTIRE channel video list in a single `--flat-playlist -J` call
// (no per-page pagination). Used by the subscription checker so "check now"
// does not issue dozens of redundant yt-dlp invocations.
export async function fetchChannelAll(opts: { url: string; tab?: 'videos' | 'shorts' }): Promise<{
  success: boolean;
  error?: string;
  code?: IpcDownloadErrorCode;
  channel?: {
    id: string;
    url: string;
    title: string;
    thumbnail: string;
    subscriberCount?: number;
    description?: string;
    videoCount?: number;
  };
  items: ReturnType<typeof mapVideoEntry>[];
}> {
  if (detectYtKind(opts.url) !== 'channel') {
    return { success: false, error: 'Expected a channel link or name', items: [] };
  }
  const base = normalizeYtUrl(opts.url, 'channel');
  const tab = opts.tab === 'shorts' ? 'shorts' : 'videos';
  const target = `${base}/${tab}`;
  try {
    const stdout = await runYtDlp(
      [target, '--flat-playlist', '--no-warnings', '-J', ...(await readProxyArgs())],
      120000
    );
    const parsed = JSON.parse(stdout) as YtDlpEntry;
    const items = (parsed.entries || [])
      .filter((e) => e.id && e.title)
      .map((e) => mapVideoEntry(e));
    const channelId = parsed.channel_id || parsed.uploader_id || parsed.id || '';
    const channelThumbnail =
      pickChannelThumbnail(parsed) ||
      (await resolveChannelAvatar(channelId));
    return {
      success: true,
      channel: {
        id: channelId,
        url: base,
        title: parsed.channel || parsed.uploader || parsed.title || '',
        thumbnail: channelThumbnail,
        subscriberCount: parsed.channel_follower_count,
        description: parsed.description || '',
        videoCount: parsed.playlist_count ?? items.length
      },
      items
    };
  } catch (e: unknown) {
    const err = e as { message?: string };
    logger.warn('yt', 'fetchChannelAll failed', err.message || String(e));
    return {
      success: false,
      error: err.message || 'Could not load this channel',
      code: classifyYtDlpError(err.message || ''),
      items: []
    };
  }
}

// Resolves a direct audio stream URL for a video via `yt-dlp -g`. Results are
// cached (LRU, 5h TTL — googlevideo URLs stay valid ~6h) because repeated -g
// calls are slow (~3-10s) and can trigger rate-limits. The cache is persisted
// to userData so repeat plays stay instant across app restarts.
interface StreamCacheEntry {
  url: string;
  expires: number;
}
const streamCache = new Map<string, StreamCacheEntry>();
const STREAM_CACHE_TTL_MS = 5 * 60 * 60 * 1000;
const STREAM_CACHE_MAX = 100;
const STREAM_CACHE_FILE = join(app.getPath('userData'), 'stream-url-cache.json');

let streamCacheLoaded = false;
let streamCacheSaveTimer: NodeJS.Timeout | null = null;

// Lazy, best-effort load of the persisted URL cache (first call of
// getStreamUrl). Corrupt/missing files are ignored — the cache just starts
// empty. Persisted entries beyond the LRU cap are dropped on the next save.
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

// In-flight dedupe: a hover-prefetch and the subsequent click must not spawn
// two yt-dlp processes for the same URL — the second caller awaits the first.
const streamPending = new Map<string, Promise<IpcStreamResult>>();

export function getStreamUrl(url: string): Promise<IpcStreamResult> {
  if (
    typeof url !== 'string' ||
    !url.trim() ||
    url.length > 2048 ||
    detectYtKind(url) !== 'video'
  ) {
    return Promise.resolve({ success: false, error: 'Invalid YouTube video link', code: 'invalid' });
  }

  const now = Date.now();
  loadStreamCache();
  const cached = streamCache.get(url);
  if (cached && cached.expires > now) {
    streamCache.delete(url);
    streamCache.set(url, cached);
    return Promise.resolve({ success: true, url: cached.url });
  }
  streamCache.delete(url);

  const pending = streamPending.get(url);
  if (pending) return pending;

  const task = resolveStreamUrl(url).finally(() => {
    streamPending.delete(url);
  });
  streamPending.set(url, task);
  return task;
}

async function resolveStreamUrl(url: string): Promise<IpcStreamResult> {
  const t0 = Date.now();
  const proxyArgs = await readProxyArgs();
  // Primary attempt uses ios_safari/tv_embedded (audio-only 251, ~3 s resolve).
  // When both fail (e.g. age-restricted videos), retry once with the android,web
  // client pair — it degrades to the combined itag 18, but keeps playback alive.
  for (const fallback of [false, true]) {
    try {
      const stdout = await runYtDlp(
        buildStreamGetArgs(url, proxyArgs, { fallback }),
        30000
      );
      const parsed = parseStreamGetOutput(stdout);
      logger.info('yt', `stream resolve${fallback ? ' (fallback)' : ''} ms=${Date.now() - t0} url=${url}`);
      if (!parsed.ok || !parsed.url) {
        const code = parsed?.code === 'hls' ? 'hls' : 'invalid';
        if (!fallback) continue;
        return {
          success: false,
          error: code === 'hls' ? 'HLS streams are not supported yet' : 'Invalid stream URL',
          code
        };
      }
      streamCache.set(url, { url: parsed.url, expires: Date.now() + STREAM_CACHE_TTL_MS });
      if (streamCache.size > STREAM_CACHE_MAX) {
        const oldest = streamCache.keys().next().value;
        if (oldest) streamCache.delete(oldest);
      }
      scheduleStreamCacheSave();
      return { success: true, url: parsed.url };
    } catch (e: unknown) {
      const err = e as { message?: string };
      const msg = err.message || String(e);
      if (!fallback) {
        logger.warn('yt', `stream get failed ms=${Date.now() - t0}, retrying with fallback clients`, msg);
        continue;
      }
      logger.warn('yt', `stream get failed (fallback) ms=${Date.now() - t0}`, msg);
      return { success: false, error: redactSecrets(msg), code: classifyYtDlpError(msg) };
    }
  }
  return { success: false, error: 'Unknown stream error', code: 'network' };
}

export function registerYoutubeHandlers(): void {
  ipcMain.handle('yt:search', async (_event, query: string) => {
    if (typeof query !== 'string' || !query.trim() || query.length > 200) {
      return {
        success: false,
        error: 'Invalid search query',
        items: [],
        nextPageToken: null,
        prevPageToken: null
      };
    }
    try {
      const stdout = await runYtDlp(
        [
          `ytsearch100:${query}`,
          '--flat-playlist',
          '--no-warnings',
          '-J',
          ...(await readProxyArgs())
        ],
        60000
      );
      const parsed = JSON.parse(stdout) as { entries?: YtDlpEntry[] };
      const items = (parsed.entries || [])
        .filter((e) => e.id && e.title)
        .map((e) => mapVideoEntry(e));
      return { success: true, items, nextPageToken: null, prevPageToken: null };
    } catch (e: unknown) {
      const err = e as { message?: string };
      logger.warn('yt', 'search failed', err.message || String(e));
      return {
        success: false,
        error: err.message || 'YouTube search failed',
        code: classifyYtDlpError(err.message || ''),
        items: [],
        nextPageToken: null,
        prevPageToken: null
      };
    }
  });

  ipcMain.handle(
    'yt:channel',
    async (
      _event,
      opts: { url: string; start?: number; end?: number; tab?: 'videos' | 'shorts' }
    ) => {
      return fetchChannelItems(opts);
    }
  );

  ipcMain.handle(
    'yt:channelAll',
    async (_event, opts: { url: string; tab?: 'videos' | 'shorts' }) => {
      return fetchChannelAll(opts);
    }
  );

  ipcMain.handle('yt:resolve', async (_event, url: string) => {
    const kind = detectYtKind(url);
    if (!kind) {
      return { success: false, error: 'Unsupported or invalid YouTube link' };
    }
    const target = normalizeYtUrl(url, kind);
    // Channels open directly in the dedicated channel view — no need to fetch
    // the full uploads list here, so return a lightweight marker.
    if (kind === 'channel') {
      return {
        success: true,
        result: { kind, sourceUrl: target, title: '', meta: {}, items: [] }
      };
    }
    try {
      const isVideo = kind === 'video';
      const proxyArgs = await readProxyArgs();
      const stdout = await runYtDlp(
        isVideo
          ? [target, '--no-warnings', '-J', ...proxyArgs]
          : [
              target,
              '--flat-playlist',
              '--playlist-start',
              '1',
              '--playlist-end',
              '30',
              '--no-warnings',
              '-J',
              ...proxyArgs
            ],
        60000
      );
      const parsed = JSON.parse(stdout) as YtDlpEntry;

      if (isVideo) {
        if (!parsed.id || !parsed.title) {
          return { success: false, error: 'Could not read video info' };
        }
        return {
          success: true,
          result: {
            kind,
            sourceUrl: target,
            title: parsed.title || '',
            meta: {
              channelId: parsed.channel_id || '',
              channelTitle: parsed.channel || parsed.uploader || ''
            },
            items: [mapResolvedEntry(parsed)]
          }
        };
      }

      const items = mapResolvedContainer(parsed);
      const title =
        parsed.title || parsed.playlist_title || parsed.channel || parsed.uploader || '';
      const playlistCount = parsed.playlist_count;
      // When yt-dlp does not report the playlist count we leave it unknown and
      // let the renderer fill in the exact total once the whole list is loaded.
      const totalItems = playlistCount ?? null;
      return {
        success: true,
        result: {
          kind,
          sourceUrl: target,
          title,
          meta: {
            channelId: parsed.channel_id || parsed.uploader_id || '',
            channelTitle: parsed.channel || parsed.uploader || '',
            totalItems,
            // Keep loading while the page is full — even when playlist_count is
            // missing, a full 30-item page means there is almost certainly more.
            hasMore: items.length >= 30 && (playlistCount == null || items.length < playlistCount)
          },
          items
        }
      };
    } catch (e: unknown) {
      const err = e as { message?: string };
      logger.warn('yt', 'resolve failed', err.message || String(e));
      return {
        success: false,
        error: err.message || 'Could not resolve this link',
        code: classifyYtDlpError(err.message || '')
      };
    }
  });

  ipcMain.handle(
    'yt:resolveMore',
    async (_event, opts: { url: string; start: number; end: number }) => {
      if (!opts || typeof opts.url !== 'string' || !detectYtKind(opts.url)) {
        return {
          success: false,
          error: 'Invalid YouTube link',
          items: [],
          hasMore: false,
          totalItems: 0
        };
      }
      try {
        const start = Math.max(1, Math.floor(Number(opts.start) || 1));
        const end = Math.max(
          start,
          Math.min(start + 199, Math.floor(Number(opts.end) || start + 29))
        );
        const stdout = await runYtDlp(
          [
            opts.url,
            '--flat-playlist',
            '--playlist-start',
            String(start),
            '--playlist-end',
            String(end),
            '--no-warnings',
            '-J',
            ...(await readProxyArgs())
          ],
          60000
        );
        const parsed = JSON.parse(stdout) as YtDlpEntry;
        const items = mapResolvedContainer(parsed);
        const playlistCount = parsed.playlist_count;
        return {
          success: true,
          items,
          // A full page means there is more to load — unless the playlist count
          // is known and the cumulative items already reached it.
          hasMore:
            items.length >= end - start + 1 &&
            (playlistCount == null || start - 1 + items.length < playlistCount),
          totalItems: playlistCount ?? null
        };
      } catch (e: unknown) {
        const err = e as { message?: string };
        logger.warn('yt', 'resolveMore failed', err.message || String(e));
        return {
          success: false,
          error: err.message || 'Could not load more items',
          code: classifyYtDlpError(err.message || ''),
          items: [],
          hasMore: false,
          totalItems: 0
        };
      }
    }
  );

  ipcMain.handle('yt:stream:get', async (_event, url: string) => {
    return getStreamUrl(url);
  });
}
