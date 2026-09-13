import crypto from 'crypto';
import { sep } from 'path';
import { isAllowedRadioHost } from './ipc/radio-store';

// Pure security/stream helpers extracted from `media-server.ts` (plan 2.8).
// `media-server` re-exports `isAllowedStreamHost` and `validateStreamUrl` so
// importers and tests stay unchanged.

export function isWithinRoot(filePath: string, root: string): boolean {
  if (process.platform === 'win32') {
    const f = filePath.toLowerCase();
    const r = root.toLowerCase();
    if (f === r) return true;
    return f.startsWith(r) && (f.charAt(r.length) === '\\' || f.charAt(r.length) === '/');
  }
  if (filePath === root) return true;
  return (
    filePath.startsWith(root) &&
    (filePath.charAt(root.length) === sep || filePath.charAt(root.length) === '/')
  );
}

export function timingSafeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function allowedOrigin(origin: string | undefined): string | null {
  // Chromium sends 'null' as the literal string for file:// pages.
  if (!origin) return null;
  if (origin === 'null') return origin;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return null;
  }
  if (parsed.protocol === 'file:') return origin;
  const isLocalDev =
    (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
    (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
  return isLocalDev ? origin : null;
}

// Remote stream proxying (online playback). Only YouTube/SoundCloud media
// hosts plus the hosts of user-added radio stations are allowed so the
// endpoint cannot be abused as an open SSRF proxy; the renderer can only ever
// reach it with URLs produced by `yt:stream:get` / `sc:stream:get` or stations
// persisted via `radio:save`.
export const STREAM_ALLOWED_HOSTS = [
  'googlevideo.com',
  'ytimg.com',
  'youtube.com',
  'youtu.be',
  // SoundCloud progressive MP3 CDN + page hosts (short links redirect there).
  'sndcdn.com',
  'soundcloud.com',
  'snd.sc'
];
export const STREAM_MAX_REDIRECTS = 3;
// googlevideo 403s are usually transient (per-IP throttling, flaky edge
// routing), so give each stream up to 4 attempts with a short backoff. The
// last delay is longer: throttle windows on a shared CGNAT IP can outlast the
// first two, and the 4th attempt usually lands in a fresh window.
export const STREAM_MAX_ATTEMPTS = 4;
// Delay before retry attempt N (index 0 = before attempt 2, etc.).
export const STREAM_RETRY_DELAYS = [400, 1200, 3000];
export const STREAM_TIMEOUT_MS = 30000;

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function isAllowedStreamHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    STREAM_ALLOWED_HOSTS.some((suffix) => h === suffix || h.endsWith('.' + suffix)) ||
    isAllowedRadioHost(h)
  );
}

// Validates a stream target for the /stream proxy: https on an allowlisted
// YouTube media host, or http(s) on a host of a user-added radio station
// (Icecast/SHOUTcast streams are commonly plain http). Returns null when
// rejected.
export function validateStreamUrl(rawUrl: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  const isHttps = parsed.protocol === 'https:';
  const isHttp = parsed.protocol === 'http:';
  const isYtHost = STREAM_ALLOWED_HOSTS.some((suffix) => {
    const h = parsed.hostname.toLowerCase();
    return h === suffix || h.endsWith('.' + suffix);
  });
  if (!isHttps && !(isHttp && isAllowedRadioHost(parsed.hostname))) {
    return null;
  }
  if (!isYtHost && !isAllowedRadioHost(parsed.hostname)) {
    return null;
  }
  return parsed;
}

// Browser-like UA: some googlevideo endpoints reject requests whose
// User-Agent does not look like a browser.
export const STREAM_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
