import http from 'http';
import https from 'https';
import { extname } from 'path';
import { getStore } from './cover-cache';
import { decryptApiKeys } from './settings-crypto';
import { logger } from '../../shared/logger';
import type {
  MediaSource,
  SourceEndpoint,
  SourceItem,
  SourceItemType,
  SourceFetchResult,
  SourceTestResult
} from '../../renderer/src/types/sources';

const TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg', '.ico', '.tiff', '.tif', '.avif']);
const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.webm', '.mov', '.avi', '.m3u8', '.m3u', '.ts', '.flv', '.wmv']);
const AUDIO_EXTS = new Set(['.mp3', '.flac', '.wav', '.ogg', '.aac', '.m4a', '.opus', '.wma', '.aiff', '.alac']);

const KNOWN_TYPES = new Set<SourceItemType>(['image', 'video', 'audio', 'file']);

/** Bezpieczny "dot-path" odczyt z JSON: rozdziela po '.', segmenty liczbowe = indeksy tablic. */
export function dotGet(obj: unknown, path: string | undefined): unknown {
  if (!path || obj == null) return undefined;
  let current: unknown = obj;
  for (const raw of path.split('.')) {
    if (current == null) return undefined;
    const seg = raw.trim();
    if (!seg) return undefined;
    if (Array.isArray(current)) {
      const idx = Number(seg);
      if (!Number.isInteger(idx) || idx < 0 || idx >= current.length) return undefined;
      current = current[idx];
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return current;
}

function detectItemType(url: string | undefined): SourceItemType {
  if (!url) return 'file';
  try {
    const ext = extname(new URL(url).pathname).toLowerCase();
    if (IMAGE_EXTS.has(ext)) return 'image';
    if (VIDEO_EXTS.has(ext)) return 'video';
    if (AUDIO_EXTS.has(ext)) return 'audio';
  } catch {
    // not a URL — fall through
  }
  return 'file';
}

function asString(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return undefined;
}

function mapItem(raw: unknown, fields: Record<string, string | undefined>): SourceItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const get = (p: string | undefined): string | undefined => asString(dotGet(raw, p));
  const mediaUrl = get(fields.mediaUrl);
  const sourceUrl = get(fields.sourceUrl);
  let type: SourceItemType | undefined;
  const typeCfg = fields.type;
  if (typeCfg) {
    if (KNOWN_TYPES.has(typeCfg as SourceItemType)) {
      type = typeCfg as SourceItemType;
    } else {
      const v = get(typeCfg);
      if (v && KNOWN_TYPES.has(v as SourceItemType)) type = v as SourceItemType;
    }
  }
  if (!type) type = detectItemType(mediaUrl || sourceUrl);
  const item: SourceItem = {
    id: get(fields.id) || '',
    title: get(fields.title) || '',
    subtitle: get(fields.subtitle),
    thumbnail: get(fields.thumbnail),
    mediaUrl,
    type,
    duration: get(fields.duration),
    sourceUrl,
    extra: raw as Record<string, unknown>
  };
  if (!item.title && !mediaUrl && !item.thumbnail) return null;
  return item;
}

function mapResponse(data: unknown, endpoint: SourceEndpoint): SourceItem[] {
  const mapping = endpoint.mapping;
  const rawArr = mapping.arrayPath ? dotGet(data, mapping.arrayPath) : data;
  if (!Array.isArray(rawArr)) return [];
  const fields = mapping.fields as Record<string, string | undefined>;
  const items: SourceItem[] = [];
  for (const raw of rawArr) {
    const item = mapItem(raw, fields);
    if (item) items.push(item);
  }
  return items;
}

function paginationMeta(
  data: unknown,
  endpoint: SourceEndpoint
): { hasMore: boolean; nextFrom?: string } {
  const pag = endpoint.pagination;
  let hasMore = false;
  let nextFrom: string | undefined;
  if (pag?.totalField) {
    const v = dotGet(data, pag.totalField);
    hasMore = v === true || v === 1 || v === 'true' || v === '1';
  }
  if (pag?.nextFromField) {
    const v = asString(dotGet(data, pag.nextFromField));
    if (v) {
      nextFrom = v;
      hasMore = true;
    }
  }
  return { hasMore, nextFrom };
}

function buildUrl(
  source: MediaSource,
  endpoint: SourceEndpoint,
  pageToken?: string,
  query?: Record<string, string>
): string {
  const base = source.baseUrl.replace(/\/+$/, '');
  const path = endpoint.path.trim();
  const full = /^https?:\/\//i.test(path) ? path : base + (path.startsWith('/') ? path : `/${path}`);
  if (endpoint.method === 'POST') return full;
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(endpoint.params || {})) usp.set(k, v);
  if (query) for (const [k, v] of Object.entries(query)) usp.set(k, v);
  if (endpoint.pagination?.pageParam && pageToken) usp.set(endpoint.pagination.pageParam, pageToken);
  const qs = usp.toString();
  return qs ? full + (full.includes('?') ? '&' : '?') + qs : full;
}

function httpJsonFetch(
  url: string,
  opts: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string },
  redirectsLeft: number = MAX_REDIRECTS
): Promise<{ json: unknown; status: number }> {
  return new Promise((resolve, reject) => {
    const transport = url.startsWith('https:') ? https : http;
    const req = transport.request(
      url,
      {
        method: opts.method,
        headers: { Accept: 'application/json', 'User-Agent': 'Onda/1.0', ...opts.headers }
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          if (redirectsLeft <= 0) {
            res.resume();
            reject(new Error('Too many redirects'));
            return;
          }
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          httpJsonFetch(next, opts, redirectsLeft - 1).then(resolve, reject);
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`HTTP ${status}`));
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > MAX_RESPONSE_BYTES) {
            req.destroy();
            reject(new Error('Response too large'));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          try {
            resolve({ json: text ? JSON.parse(text) : {}, status });
          } catch {
            reject(new Error('Invalid JSON response'));
          }
        });
        res.on('error', reject);
      }
    );
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function resolveApiKey(apiKeyId: string): Promise<string | undefined> {
  try {
    const store = await getStore();
    const decrypted = decryptApiKeys(store.get('apiKeys') as Parameters<typeof decryptApiKeys>[0]);
    const entry = decrypted?.keys?.find((k) => k.id === apiKeyId && k.isActive);
    return entry?.key || undefined;
  } catch (e) {
    logger.warn('sources', 'resolveApiKey failed', e);
    return undefined;
  }
}

export async function resolveSourceHeaders(
  apiKeyId?: string,
  headerName?: string
): Promise<Record<string, string>> {
  if (!apiKeyId) return {};
  const key = await resolveApiKey(apiKeyId);
  if (!key) return {};
  return { [headerName?.trim() || 'X-API-Key']: key };
}

async function resolveAuth(source: MediaSource): Promise<{
  headers: Record<string, string>;
  query: Record<string, string>;
}> {
  const headers: Record<string, string> = {};
  const query: Record<string, string> = {};
  const auth = source.auth;
  if (!auth || auth.type === 'none') return { headers, query };
  const key = auth.apiKeyId ? await resolveApiKey(auth.apiKeyId) : undefined;
  if (!key) return { headers, query };
  if (auth.type === 'bearer') {
    headers['Authorization'] = `Bearer ${key}`;
  } else if (auth.headerName) {
    headers[auth.headerName] = key;
  } else if (auth.queryParam) {
    query[auth.queryParam] = key;
  } else {
    headers['X-API-Key'] = key;
  }
  return { headers, query };
}

export async function fetchSourceItems(
  source: MediaSource,
  endpoint: SourceEndpoint,
  opts?: { query?: Record<string, string>; pageToken?: string }
): Promise<SourceFetchResult> {
  try {
    const { headers, query } = await resolveAuth(source);
    const url = buildUrl(source, endpoint, opts?.pageToken, { ...query, ...(opts?.query || {}) });
    const body =
      endpoint.method === 'POST'
        ? JSON.stringify({ ...(endpoint.params || {}), ...(opts?.query || {}) })
        : undefined;
    const { json } = await httpJsonFetch(url, { method: endpoint.method, headers, body });
    return {
      items: mapResponse(json, endpoint),
      ...paginationMeta(json, endpoint)
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn('sources', `fetch failed for ${source.name}${endpoint.path}: ${msg}`);
    return { items: [], hasMore: false, error: msg };
  }
}

export async function testSourceConnection(
  source: MediaSource,
  endpoint: SourceEndpoint
): Promise<SourceTestResult> {
  try {
    const { headers, query } = await resolveAuth(source);
    const url = buildUrl(source, endpoint, undefined, query);
    const body = endpoint.method === 'POST' ? JSON.stringify(endpoint.params || {}) : undefined;
    const { json, status } = await httpJsonFetch(url, { method: endpoint.method, headers, body });
    const items = mapResponse(json, endpoint);
    return { success: true, status, sample: items[0] };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}