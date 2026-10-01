import { ipcMain } from 'electron';
import https from 'node:https';
import { isIP } from 'node:net';
import { logger } from '../../shared/logger';
import {
  createPinnedLookup,
  isLoopbackHost,
  isNeverPublicAddress,
  resolveNetworkTarget
} from './network-target';

// Pobiera zdalne obrazy (awatary / banery kanałów) w procesie main i
// zwraca je jako URL-e `data:`. Renderer może nie wczytać niektórych zewnętrznych
// CDN bezpośrednio (specyficzne dla hosta quirki sieci/Chromium), więc main je proxyuje.
// Tylko https, a hosty prywatne/loopback są odrzucane, aby uniknąć SSRF.

const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const CACHE_MAX = 200;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_REDIRECTS = 3;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const cache = new Map<string, { data: string; at: number }>();
const inflight = new Map<string, Promise<string | null>>();

export interface RemoteImageResponse {
  status: number;
  headers: Record<string, string | undefined>;
  body: AsyncIterable<Uint8Array>;
  cancel: () => void;
}

type RemoteImageRequest = (url: string, signal: AbortSignal) => Promise<RemoteImageResponse>;

function isAllowedRemoteUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (parsed.username || parsed.password || isLoopbackHost(host)) {
    return false;
  }
  const literalHost = host.replace(/^\[|\]$/g, '');
  if (isIP(literalHost) && isNeverPublicAddress(literalHost)) return false;
  return true;
}

async function requestRemoteImage(url: string, signal: AbortSignal): Promise<RemoteImageResponse> {
  const target = await resolveNetworkTarget(url);
  if (target.url.protocol !== 'https:') throw new Error('Remote images require HTTPS');
  return new Promise((resolve, reject) => {
    const req = https.request(
      target.url,
      {
        signal,
        lookup: createPinnedLookup(target.addresses),
        headers: { 'User-Agent': USER_AGENT, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' }
      },
      (res) => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers as Record<string, string | undefined>,
          body: res,
          cancel: () => res.destroy()
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function responseHeader(res: RemoteImageResponse, name: string): string | undefined {
  const value = res.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function remember(url: string, data: string): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(url, { data, at: Date.now() });
}

// Podąża za przekierowaniami ręcznie, aby KAŻDY krok był walidowany: przy `redirect: 'follow'`
// publiczny URL mógłby odbić żądanie do localhost / zakresu prywatnego / endpointu
// metadanych chmury, omijając sprawdzenie SSRF zastosowane do początkowego URL.
// Eksportowane dla testów.
export async function followImageRedirects(
  rawUrl: string,
  signal: AbortSignal,
  request: RemoteImageRequest = requestRemoteImage
): Promise<RemoteImageResponse | null> {
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isAllowedRemoteUrl(current)) return null;
    const res = await request(current, signal);
    if (res.status < 300 || res.status >= 400) return res;
    const location = responseHeader(res, 'location');
    res.cancel();
    if (!location) return null;
    try {
      current = new URL(location, current).toString();
    } catch {
      return null;
    }
  }
  logger.warn('media', `remote image redirect limit reached for ${rawUrl}`);
  return null;
}

/** Czyta body obrazu, nigdy nie buforując więcej niż skonfigurowany limit. */
export async function readRemoteImageBody(res: RemoteImageResponse): Promise<Buffer | null> {
  const contentLength = responseHeader(res, 'content-length');
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_BYTES) {
    res.cancel();
    return null;
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const value of res.body) {
    size += value.byteLength;
    if (size > MAX_BYTES) {
      res.cancel();
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return size > 0 ? Buffer.concat(chunks, size) : null;
}

export async function getRemoteImage(
  rawUrl: string,
  request: RemoteImageRequest = requestRemoteImage
): Promise<string | null> {
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
      const res = await followImageRedirects(rawUrl, ctrl.signal, request);
      if (!res) return null;
      if (res.status < 200 || res.status >= 300) {
        res.cancel();
        return null;
      }
      const type = (responseHeader(res, 'content-type') || '').split(';')[0].trim().toLowerCase();
      if (!type.startsWith('image/')) {
        res.cancel();
        return null;
      }
      const buf = await readRemoteImageBody(res);
      if (!buf) return null;
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

/** Usuwa każdy zbuforowany zdalny obraz (LRU w pamięci). Zwraca liczbę wpisów. */
export function clearRemoteImageCache(): number {
  const entries = cache.size;
  cache.clear();
  return entries;
}
