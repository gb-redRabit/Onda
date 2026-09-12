// SoundCloud IPC handlers (SC-only module). Primary data source is the
// internal api-v2 client; yt-dlp is the explicit fallback engine for every
// channel (search/resolve/stream) so a rotated client_id or API change
// degrades to "slow but working" instead of breaking the platform.
import { ipcMain } from 'electron';
import { logger } from '../../shared/logger';
import { detectScKind, normalizeScUrl } from '../../shared/soundcloud';
import type {
  IpcDownloadErrorCode,
  IpcStreamResult,
  IpcYoutubeVideo
} from '../../shared/types/ipc';
import { classifyYtDlpError, redactSecrets } from '../downloads/error-classifier';
import { readProxyArgs } from './proxy-utils';
import { formatDuration as formatDurationBase } from '../../shared/formatDuration';
import {
  mapResolvedContainer,
  pickChannelThumbnail,
  parseStreamGetOutput,
  type YtDlpEntry
} from './youtube-utils';
import { runYtDlp, fetchEntryJson, fetchRangeJson } from './youtube-handlers';
import {
  scSearchTracks,
  scResolve,
  scPlaylistTracks,
  scUserTracks,
  scTrackStreamUrl,
  scProfileSnapshot,
  upgradeArtworkUrl,
  extractSignedUrlExpiryMs,
  ScApiError
} from './soundcloud-client';

function errorCodeOf(e: unknown): IpcDownloadErrorCode {
  if (e instanceof ScApiError) return 'network';
  return classifyYtDlpError(e instanceof Error ? e.message : String(e));
}

// Duration text from SC's millisecond field (yt-dlp reports seconds).
function durMs(ms?: number): string | undefined {
  return durSec(ms != null ? Math.round(ms / 1000) : undefined);
}

function durSec(seconds?: number): string | undefined {
  const text = formatDurationBase(seconds, '');
  return text === '' ? undefined : text;
}

// Thumbnail picker for yt-dlp SC entries — like the YouTube one but WITHOUT
// the i.ytimg.com fallback (a numeric SC id would produce a dead link).
function scThumbFromEntry(entry: YtDlpEntry): string {
  const thumbs = (entry.thumbnails || []).filter((t) => t.url && /^https:\/\//i.test(t.url));
  if (thumbs.length) {
    const best = [...thumbs].sort((a, b) => (b.width || 0) - (a.width || 0))[0];
    if (best?.url) return best.url;
  }
  return entry.thumbnail && /^https:\/\//i.test(entry.thumbnail) ? entry.thumbnail : '';
}

// Canonical page URL of a yt-dlp entry — flat search results are URL entries.
function entryUrl(entry: YtDlpEntry): string {
  if (entry.webpage_url && /^https:\/\//i.test(entry.webpage_url)) return entry.webpage_url;
  if (entry.url && /^https:\/\//i.test(entry.url)) return entry.url;
  if (entry.id && /^https:\/\//i.test(entry.id)) return entry.id;
  return '';
}

// Maps a yt-dlp SoundCloud entry onto the shared video-card shape.
export function scVideoFromEntry(entry: YtDlpEntry): IpcYoutubeVideo {
  return {
    id: entry.id || entryUrl(entry),
    title: entry.title || '',
    description: entry.description || '',
    thumbnail: scThumbFromEntry(entry),
    channelTitle: entry.channel || entry.uploader || '',
    channelId: entry.uploader_id || '',
    duration: durSec(entry.duration),
    viewCount: entry.view_count != null ? String(entry.view_count) : undefined,
    publishedAt: '',
    url: entryUrl(entry)
  };
}

// ---------------------------------------------------------------------------
// yt-dlp fallbacks

async function fallbackSearch(query: string): Promise<IpcYoutubeVideo[]> {
  const stdout = await runYtDlp(
    [`scsearch100:${query}`, '--flat-playlist', '--no-warnings', '-J', ...(await readProxyArgs())],
    60000
  );
  const parsed = JSON.parse(stdout) as { entries?: YtDlpEntry[] };
  return (parsed.entries || [])
    .filter((e) => e.title && (e.id || entryUrl(e)))
    .map((e) => scVideoFromEntry(e));
}

async function fallbackResolvePage(
  target: string,
  mode: 'full' | 'page30'
): Promise<{
  title: string;
  items: IpcYoutubeVideo[];
  resolvedItems: ReturnType<typeof mapResolvedContainer>;
  totalItems: number | null;
  hasMore: boolean;
}> {
  const parsed = await fetchEntryJson(target, mode);
  const valid = (parsed.entries || []).filter((e) => e.title && (e.id || entryUrl(e)));
  const items = valid.map((e) => scVideoFromEntry(e));
  const resolvedItems = valid.map((e) => {
    const base = mapResolvedContainer({ entries: [e] })[0];
    return {
      ...base,
      thumbnail: scThumbFromEntry(e),
      url: entryUrl(e) || (/^https:\/\//i.test(base.id) ? base.id : undefined)
    };
  });
  const count = parsed.playlist_count;
  return {
    title: parsed.title || parsed.playlist_title || parsed.channel || parsed.uploader || '',
    items,
    resolvedItems,
    totalItems: count ?? null,
    hasMore: items.length >= 30 && (count == null || items.length < count)
  };
}

// ---------------------------------------------------------------------------
// Stream URL resolution — progressive MP3 through the API, LRU-cached.

interface ScStreamCacheEntry {
  url: string;
  expires: number;
}
const streamCache = new Map<string, ScStreamCacheEntry>();
// Fallback for URLs without a parseable signature; signed SC CDN URLs
// (~30 min lifetime) always use their own embedded expiry minus a safety
// margin — see streamCacheExpiry below.
const STREAM_CACHE_FALLBACK_TTL_MS = 10 * 60 * 1000;
// Serve the URL at most until this long BEFORE its real expiry.
const STREAM_EXPIRY_SAFETY_MS = 60 * 1000;
const STREAM_CACHE_MAX = 50;
const streamPending = new Map<string, Promise<IpcStreamResult>>();

// Cache lifetime for a resolved CDN URL: the signature's own expiry (parsed
// from the Policy blob) minus a safety margin, capped by the fallback TTL.
function streamCacheExpiry(cdnUrl: string): number {
  const now = Date.now();
  const epoch = extractSignedUrlExpiryMs(cdnUrl);
  if (epoch == null) return now + STREAM_CACHE_FALLBACK_TTL_MS;
  return Math.min(
    now + STREAM_CACHE_FALLBACK_TTL_MS,
    Math.max(now + 5000, epoch - STREAM_EXPIRY_SAFETY_MS)
  );
}

export async function getScStreamUrl(rawUrl: string): Promise<IpcStreamResult> {
  // Legacy saved SoundCloud entries carry a bare numeric track id instead of
  // a permalink — the client resolves those via /tracks/{id}.
  const isNumericId = typeof rawUrl === 'string' && /^\d+$/.test(rawUrl.trim());
  const kind = typeof rawUrl === 'string' && !isNumericId ? detectScKind(rawUrl) : 'video';
  if (typeof rawUrl !== 'string' || !rawUrl.trim() || rawUrl.length > 2048 || kind === null) {
    return { success: false, error: 'Invalid SoundCloud track link', code: 'invalid' };
  }
  if (kind === 'channel') {
    return { success: false, error: 'Profiles have no stream — open a track', code: 'invalid' };
  }
  const url = normalizeScUrl(rawUrl);

  const now = Date.now();
  const cached = streamCache.get(url);
  if (cached && cached.expires > now) {
    streamCache.delete(url);
    streamCache.set(url, cached);
    return { success: true, url: cached.url };
  }
  streamCache.delete(url);

  const pending = streamPending.get(url);
  if (pending) return pending;

  const task = resolveStream(url).finally(() => streamPending.delete(url));
  streamPending.set(url, task);
  return task;
}

async function resolveStream(url: string): Promise<IpcStreamResult> {
  // Primary: internal API progressive MP3 (~300 ms).
  try {
    const stream = await scTrackStreamUrl(url);
    if (stream?.url) {
      streamCache.set(url, { url: stream.url, expires: streamCacheExpiry(stream.url) });
      if (streamCache.size > STREAM_CACHE_MAX) {
        const oldest = streamCache.keys().next().value;
        if (oldest) streamCache.delete(oldest);
      }
      return { success: true, url: stream.url };
    }
    logger.warn('sc', `no progressive transcoding, falling back to yt-dlp url=${url}`);
  } catch (e) {
    logger.warn('sc', `api stream failed, falling back to yt-dlp url=${url}`, String(e));
  }

  // Fallback: yt-dlp -g (rejects HLS via parseStreamGetOutput → readable error).
  try {
    const stdout = await runYtDlp(
      [
        url,
        '--no-playlist',
        '-f',
        'ba[protocol^=https]/bestaudio[protocol^=https]/b[protocol^=https]/w',
        '-g',
        '-4',
        '--no-warnings',
        ...(await readProxyArgs())
      ],
      30000
    );
    const parsed = parseStreamGetOutput(stdout);
    if (!parsed.ok || !parsed.url) {
      return {
        success: false,
        error: parsed.code === 'hls' ? 'HLS streams are not supported yet' : 'Invalid stream URL',
        code: parsed.code ?? 'invalid'
      };
    }
    streamCache.set(url, { url: parsed.url, expires: streamCacheExpiry(parsed.url) });
    return { success: true, url: parsed.url };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn('sc', `stream fallback failed url=${url}`, redactSecrets(msg));
    return { success: false, error: redactSecrets(msg), code: errorCodeOf(e) };
  }
}

// ---------------------------------------------------------------------------
// IPC registration

export function registerSoundcloudHandlers(): void {
  ipcMain.handle('sc:search', async (_event, query: string, offset?: number) => {
    if (typeof query !== 'string' || !query.trim() || query.length > 200) {
      return { success: false, error: 'Invalid search query', items: [] };
    }
    const pageOffset = Math.max(0, Math.min(900, Math.floor(Number(offset) || 0)));
    try {
      const items = await scSearchTracks(query.trim(), 100, pageOffset);
      return { success: true, items };
    } catch (e: unknown) {
      logger.warn('sc', 'api search failed, falling back to yt-dlp', String(e));
      if (pageOffset > 0) {
        // yt-dlp scsearch has no offset — deeper pages are API-only.
        return { success: true, items: [] };
      }
      try {
        const items = await fallbackSearch(query.trim());
        return { success: true, items };
      } catch (e2: unknown) {
        const err = e2 as { message?: string };
        logger.warn('sc', 'search failed', err.message || String(e2));
        return {
          success: false,
          error: err.message || 'SoundCloud search failed',
          code: errorCodeOf(e2),
          items: []
        };
      }
    }
  });

  ipcMain.handle('sc:resolve', async (_event, rawUrl: string) => {
    const kind = detectScKind(rawUrl);
    if (!kind) {
      return { success: false, error: 'Unsupported or invalid SoundCloud link' };
    }
    const target = normalizeScUrl(rawUrl);
    // Personalized /discover/sets links are session-bound — the API answers
    // 404 for them. Fail fast with a clear code instead of a generic error.
    if (/\/discover\/sets\//i.test(target)) {
      return {
        success: false,
        error: 'Personalized SoundCloud sets (discover) are not supported',
        code: 'unsupported'
      };
    }
    // Channels open directly in the dedicated channel view — lightweight
    // marker, same contract as yt:resolve.
    if (kind === 'channel') {
      return {
        success: true,
        result: { kind, sourceUrl: target, title: '', meta: {}, items: [] }
      };
    }
    try {
      const resource = await scResolve(target);
      if (resource.kind === 'track') {
        const t = resource.track;
        const user = t.user || {};
        return {
          success: true,
          result: {
            kind: 'video',
            sourceUrl: target,
            title: t.title || '',
            meta: {
              channelId: user.permalink || '',
              channelTitle: user.username || ''
            },
            items: [
              {
                id: t.id != null ? String(t.id) : target,
                title: t.title || '',
                duration: durMs(t.duration),
                // No avatar fallback — a missing artwork shows the card
                // placeholder instead of repeating the profile image.
                thumbnail: upgradeArtworkUrl(t.artwork_url),
                channelTitle: user.username || '',
                channelId: user.permalink || '',
                isPlayable: true,
                url: t.permalink_url || target
              }
            ]
          }
        };
      }
      if (resource.kind === 'playlist') {
        const p = resource.playlist;
        if (p.id == null) throw new ScApiError('Playlist without id');
        const page = await scPlaylistTracks(p.id, 30, 0);
        const count = p.track_count ?? page.items.length;
        return {
          success: true,
          result: {
            kind: 'playlist',
            sourceUrl: target,
            title: p.title || '',
            meta: {
              channelId: p.user?.permalink || '',
              channelTitle: p.user?.username || '',
              totalItems: count ?? null,
              hasMore: page.items.length >= 30 && page.items.length < count
            },
            items: page.items.map((v) => ({
              id: v.id,
              title: v.title,
              duration: v.duration,
              thumbnail: v.thumbnail,
              channelTitle: v.channelTitle || p.user?.username || '',
              channelId: v.channelId || p.user?.permalink || '',
              isPlayable: true,
              url: v.url || ''
            }))
          }
        };
      }
      // A user reached here means detection and resolution disagree; treat it
      // as a channel marker so the UI opens the profile view.
      return {
        success: true,
        result: { kind: 'channel', sourceUrl: target, title: '', meta: {}, items: [] }
      };
    } catch (e: unknown) {
      logger.warn('sc', 'api resolve failed, falling back to yt-dlp', String(e));
      try {
        const fb = await fallbackResolvePage(target, kind === 'video' ? 'full' : 'page30');
        if (kind === 'video') {
          const first = fb.resolvedItems[0];
          return {
            success: true,
            result: {
              kind: 'video',
              sourceUrl: target,
              title: fb.title,
              meta: {},
              items: first ? [first] : []
            }
          };
        }
        return {
          success: true,
          result: {
            kind: 'playlist',
            sourceUrl: target,
            title: fb.title,
            meta: {
              totalItems: fb.totalItems,
              hasMore: fb.hasMore
            },
            items: fb.resolvedItems
          }
        };
      } catch (e2: unknown) {
        const err = e2 as { message?: string };
        logger.warn('sc', 'resolve failed', err.message || String(e2));
        return {
          success: false,
          error: err.message || 'Could not resolve this link',
          code: errorCodeOf(e2)
        };
      }
    }
  });

  ipcMain.handle(
    'sc:resolveMore',
    async (_event, opts: { url: string; start: number; end: number }) => {
      if (
        !opts ||
        typeof opts.url !== 'string' ||
        detectScKind(opts.url) === null ||
        detectScKind(opts.url) === 'channel'
      ) {
        return {
          success: false,
          error: 'Invalid SoundCloud link',
          items: [],
          hasMore: false,
          totalItems: null
        };
      }
      const start = Math.max(1, Math.floor(Number(opts.start) || 1));
      const end = Math.max(
        start,
        Math.min(start + 199, Math.floor(Number(opts.end) || start + 29))
      );
      const limit = end - start + 1;
      try {
        const resource = await scResolve(normalizeScUrl(opts.url));
        if (resource.kind !== 'playlist' || resource.playlist.id == null) {
          return { success: true, items: [], hasMore: false, totalItems: null };
        }
        const page = await scPlaylistTracks(resource.playlist.id, limit, start - 1);
        const count = resource.playlist.track_count;
        return {
          success: true,
          items: page.items.map((v) => ({
            id: v.id,
            title: v.title,
            duration: v.duration,
            thumbnail: v.thumbnail,
            channelTitle: v.channelTitle,
            channelId: v.channelId,
            isPlayable: true,
            url: v.url || ''
          })),
          hasMore:
            page.items.length >= limit && (count == null || start - 1 + page.items.length < count),
          totalItems: count ?? null
        };
      } catch (e: unknown) {
        logger.warn('sc', 'api resolveMore failed, falling back to yt-dlp', String(e));
        try {
          const parsed = await fetchRangeJson(normalizeScUrl(opts.url), start, end);
          const valid = (parsed.entries || []).filter((e) => e.title && (e.id || entryUrl(e)));
          const items = valid.map((e) => {
            const base = mapResolvedContainer({ entries: [e] })[0];
            return {
              ...base,
              thumbnail: scThumbFromEntry(e),
              url: entryUrl(e) || (/^https:\/\//i.test(base.id) ? base.id : undefined)
            };
          });
          const count = parsed.playlist_count;
          return {
            success: true,
            items,
            hasMore: items.length >= limit && (count == null || start - 1 + items.length < count),
            totalItems: count ?? null
          };
        } catch (e2: unknown) {
          const err = e2 as { message?: string };
          logger.warn('sc', 'resolveMore failed', err.message || String(e2));
          return {
            success: false,
            error: err.message || 'Could not load more items',
            code: errorCodeOf(e2),
            items: [],
            hasMore: false,
            totalItems: null
          };
        }
      }
    }
  );

  ipcMain.handle(
    'sc:channel',
    async (_event, opts: { url: string; start?: number; end?: number }) => {
      if (detectScKind(opts?.url || '') !== 'channel') {
        return {
          success: false,
          error: 'Expected a SoundCloud profile link',
          items: [],
          hasMore: false
        };
      }
      const target = normalizeScUrl(opts.url);
      const start = Math.max(1, Math.floor(Number(opts.start) || 1));
      const end = Math.max(
        start,
        Math.min(start + 199, Math.floor(Number(opts.end) || start + 29))
      );
      const limit = end - start + 1;
      try {
        const resource = await scResolve(target);
        if (resource.kind !== 'user') throw new ScApiError('Not a SoundCloud profile');
        const user = resource.user;
        if (user.id == null) throw new ScApiError('Profile without id');
        const page = await scUserTracks(user.id, limit, start - 1);
        const avatar = upgradeArtworkUrl(user.avatar_url);
        const permalink = user.permalink ? `https://soundcloud.com/${user.permalink}` : target;
        const count = user.track_count;
        return {
          success: true,
          channel: {
            id: user.permalink || String(user.id),
            url: permalink,
            title: user.username || '',
            thumbnail: avatar,
            // SC profiles have no separate banner — reuse the avatar so the
            // header keeps the same look as YT channels (banner behind title).
            bannerUrl: avatar || undefined,
            subscriberCount: user.followers_count,
            description: typeof user.description === 'string' ? user.description : '',
            videoCount: count ?? page.items.length
          },
          items: page.items,
          hasMore:
            page.items.length >= limit && (count == null || start - 1 + page.items.length < count)
        };
      } catch (e: unknown) {
        logger.warn('sc', 'api channel failed, falling back to yt-dlp', String(e));
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
            .filter((en) => en.title && (en.id || entryUrl(en)))
            .map((en) => scVideoFromEntry(en));
          return {
            success: true,
            channel: {
              id: parsed.uploader_id || parsed.uploader || target,
              url: target,
              title: parsed.channel || parsed.uploader || parsed.title || '',
              thumbnail: pickChannelThumbnail(parsed),
              bannerUrl: pickChannelThumbnail(parsed) || undefined,
              subscriberCount: parsed.channel_follower_count,
              description: parsed.description || '',
              videoCount: parsed.playlist_count ?? items.length
            },
            items,
            hasMore: items.length >= limit
          };
        } catch (e2: unknown) {
          const err = e2 as { message?: string };
          logger.warn('sc', 'channel failed', err.message || String(e2));
          return {
            success: false,
            error: err.message || 'Could not load this profile',
            code: errorCodeOf(e2),
            items: [],
            hasMore: false
          };
        }
      }
    }
  );

  ipcMain.handle('sc:stream:get', async (_event, url: string) => {
    return getScStreamUrl(url);
  });

  // Whole profile in one call (subscription "download all" + checker).
  ipcMain.handle('sc:channelAll', async (_event, opts: { url: string }) => {
    if (detectScKind(opts?.url || '') !== 'channel') {
      return { success: false, error: 'Expected a SoundCloud profile link', items: [] };
    }
    const target = normalizeScUrl(opts.url);
    try {
      const snapshot = await scProfileSnapshot(target);
      return {
        success: true,
        channel: {
          id: snapshot.channel.id,
          url: snapshot.channel.url,
          title: snapshot.channel.title,
          thumbnail: snapshot.channel.thumbnail,
          subscriberCount: snapshot.channel.followerCount,
          description: snapshot.channel.description,
          videoCount: snapshot.channel.trackCount
        },
        items: snapshot.items
      };
    } catch (e: unknown) {
      logger.warn('sc', 'channelAll api failed, falling back to yt-dlp', String(e));
      try {
        const stdout = await runYtDlp(
          [target, '--flat-playlist', '--no-warnings', '-J', ...(await readProxyArgs())],
          120000
        );
        const parsed = JSON.parse(stdout) as YtDlpEntry;
        const valid = (parsed.entries || []).filter((en) => en.title && (en.id || entryUrl(en)));
        const items = valid.slice(0, 500).map((en) => scVideoFromEntry(en));
        return {
          success: true,
          channel: {
            id: parsed.uploader_id || parsed.uploader || target,
            url: target,
            title: parsed.channel || parsed.uploader || parsed.title || '',
            thumbnail: pickChannelThumbnail(parsed),
            bannerUrl: pickChannelThumbnail(parsed) || undefined,
            subscriberCount: parsed.channel_follower_count,
            description: parsed.description || '',
            videoCount: parsed.playlist_count ?? items.length
          },
          items
        };
      } catch (e2: unknown) {
        const err = e2 as { message?: string };
        logger.warn('sc', 'channelAll failed', err.message || String(e2));
        return {
          success: false,
          error: err.message || 'Could not load this profile',
          code: errorCodeOf(e2),
          items: []
        };
      }
    }
  });
}
