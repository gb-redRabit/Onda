import { ipcMain } from 'electron';
import { logger } from '../../shared/logger';

// Fetches remote images (channel avatars / banners) in the main process and
// returns them as `data:` URLs. The renderer can fail to load certain external
// CDNs directly (host-specific network/Chromium quirks), so main proxies them.
// https-only and private/loopback hosts are rejected to avoid SSRF.

const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const CACHE_MAX = 200;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const cache = new Map<string, { data: string; at: number }>();
const inflight = new Map<string, Promise<string | null>>();

function isAllowedRemoteUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host === '::1' || host.endsWith('.localhost')) return false;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return false;
  if (/^169\.254\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  return true;
}

function remember(url: string, data: string): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(url, { data, at: Date.now() });
}

export async function getRemoteImage(rawUrl: string): Promise<string | null> {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > 4096) return null;
  if (!isAllowedRemoteUrl(rawUrl)) return null;

  const cached = cache.get(rawUrl);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;
  const pending = inflight.get(rawUrl);
  if (pending) return pending;

  const task = (async (): Promise<string | null> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(rawUrl, {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: { 'User-Agent': USER_AGENT, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' }
      });
      if (!res.ok) return null;
      const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!type.startsWith('image/')) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > MAX_BYTES) return null;
      const data = `data:${type};base64,${buf.toString('base64')}`;
      remember(rawUrl, data);
      return data;
    } catch (e) {
      logger.warn('media', `remote image failed for ${rawUrl}`, e);
      return null;
    } finally {
      clearTimeout(timer);
      inflight.delete(rawUrl);
    }
  })();
  inflight.set(rawUrl, task);
  return task;
}

export function registerRemoteImageHandler(): void {
  ipcMain.handle('media:remoteImage', (_event, url: string) => getRemoteImage(url));
}

/** Drops every cached remote image (in-memory LRU). Returns the entry count. */
export function clearRemoteImageCache(): number {
  const entries = cache.size;
  cache.clear();
  return entries;
}
