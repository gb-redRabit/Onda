import { logger } from '../../shared/logger';
import { detectScKind, normalizeScUrl } from '../../shared/soundcloud';
import type { IpcStreamResult } from '../../shared/types/ipc';
import { redactSecrets } from '../downloads/error-classifier';
import { runYtDlp } from './youtube-handlers';
import { parseStreamGetOutput } from './youtube-utils';
import { readProxyArgs } from './proxy-utils';
import { extractSignedUrlExpiryMs, scTrackStreamUrl } from './soundcloud-client';
import { errorCodeOf } from './soundcloud-error';

// SoundCloud stream cache + resolution extracted from
// `soundcloud-handlers.ts` (plan 2.8). Progressive MP3 through the API, with a
// yt-dlp `-g` fallback, LRU-cached and persisted in memory.

export interface ScStreamCacheEntry {
  url: string;
  expires: number;
}

// Fallback for URLs without a parseable signature; signed SC CDN URLs
// (~30 min lifetime) always use their own embedded expiry minus a safety
// margin — see streamCacheExpiry below.
const STREAM_CACHE_FALLBACK_TTL_MS = 10 * 60 * 1000;
// Serve the URL at most until this long BEFORE its real expiry.
const STREAM_EXPIRY_SAFETY_MS = 60 * 1000;
export const STREAM_CACHE_MAX = 50;

// Cache lifetime for a resolved CDN URL: the signature's own expiry (parsed
// from the Policy blob) minus a safety margin, capped by the fallback TTL.
export function streamCacheExpiry(cdnUrl: string): number {
  const now = Date.now();
  const epoch = extractSignedUrlExpiryMs(cdnUrl);
  if (epoch == null) return now + STREAM_CACHE_FALLBACK_TTL_MS;
  return Math.min(
    now + STREAM_CACHE_FALLBACK_TTL_MS,
    Math.max(now + 5000, epoch - STREAM_EXPIRY_SAFETY_MS)
  );
}

const streamCache = new Map<string, ScStreamCacheEntry>();
const streamPending = new Map<string, Promise<IpcStreamResult>>();

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
