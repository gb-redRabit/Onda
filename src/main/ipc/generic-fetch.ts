import { extname } from 'path';
import { httpRequest } from './http-request';
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
} from '../../shared/types/sources';
import {
  dotGet,
  asString,
  resolveTemplate,
  generateRangeItems,
  paginationMeta,
  buildUrl
} from './generic-fetch-mappers';
export { dotGet, generateRangeItems, buildUrl } from './generic-fetch-mappers';

const MAX_REDIRECTS = 5;

const IMAGE_EXTS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.svg',
  '.ico',
  '.tiff',
  '.tif',
  '.avif'
]);
const VIDEO_EXTS = new Set([
  '.mp4',
  '.mkv',
  '.webm',
  '.mov',
  '.avi',
  '.m3u8',
  '.m3u',
  '.ts',
  '.flv',
  '.wmv'
]);
const AUDIO_EXTS = new Set([
  '.mp3',
  '.flac',
  '.wav',
  '.ogg',
  '.aac',
  '.m4a',
  '.opus',
  '.wma',
  '.aiff',
  '.alac'
]);

const KNOWN_TYPES = new Set<SourceItemType>(['image', 'video', 'audio', 'file']);

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

function mapItem(raw: unknown, fields: Record<string, string | undefined>): SourceItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const get = (p: string | undefined): string | undefined => asString(dotGet(raw, p));
  const mediaUrl = get(fields.mediaUrl);
  const playerUrl = get(fields.playerUrl);
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
    playerUrl,
    type,
    duration: get(fields.duration),
    sourceUrl,
    extra: raw as Record<string, unknown>
  };
  if (!item.title && !mediaUrl && !item.thumbnail) return null;
  return item;
}

export function mapResponse(data: unknown, endpoint: SourceEndpoint): SourceItem[] {
  const mapping = endpoint.mapping;
  let rawArr: unknown;
  if (mapping.arrayPath) {
    rawArr = dotGet(data, mapping.arrayPath);
  } else if (Array.isArray(data)) {
    rawArr = data;
  } else if (data && typeof data === 'object') {
    rawArr = [data];
  } else {
    rawArr = undefined;
  }
  if (!Array.isArray(rawArr)) return [];
  const fields = mapping.fields as Record<string, string | undefined>;
  const items: SourceItem[] = [];
  for (const raw of rawArr) {
    const item = mapItem(raw, fields);
    if (item) items.push(item);
  }
  return items;
}

/** Wyciąga tablicę wierszy tabeli: mode='field' → dotGet(json, arrayField); mode='endpoint' → korzeń JSON. */
export function tableArrayFromData(
  json: unknown,
  table: NonNullable<SourceEndpoint['table']>
): unknown {
  if (table.mode === 'field') return table.arrayField ? dotGet(json, table.arrayField) : undefined;
  return Array.isArray(json) ? json : undefined;
}

/** Mapuje surowe wiersze tabeli na SourceItem (czysta funkcja, testowana bez sieci). */
export function mapTableRows(
  rawArr: unknown,
  table: NonNullable<SourceEndpoint['table']>
): SourceItem[] {
  if (!Array.isArray(rawArr)) return [];
  const out: SourceItem[] = [];
  for (const raw of rawArr) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const n = table.rowKey ? dotGet(row, table.rowKey) : undefined;
    const title = table.title ? resolveTemplate(table.title, { ...row, n }) : undefined;
    const thumb = table.thumbnail ? asString(dotGet(row, table.thumbnail)) : undefined;
    const playerUrl = table.playerUrl ? asString(dotGet(row, table.playerUrl)) : undefined;
    if (!title && !thumb) continue;
    out.push({
      id: n === undefined || n === null ? '' : (asString(n) ?? ''),
      title: title ?? '',
      thumbnail: thumb,
      playerUrl,
      type: 'file',
      extra: row
    });
  }
  return out;
}

/** Pobiera wiersze tabeli poziomu 'page': z odpowiedzi strony (field) albo osobnym fetchem (endpoint). */
export async function fetchTableRows(
  source: MediaSource,
  endpoint: SourceEndpoint,
  opts?: { context?: unknown }
): Promise<SourceItem[]> {
  const table = endpoint.table;
  if (!table) return [];
  try {
    let json: unknown;
    if (table.mode === 'endpoint') {
      const path = table.path?.trim();
      if (!path) return [];
      const auth = await resolveAuth(source);
      const { url, headers } = finalizeRequest(
        source,
        { ...endpoint, path, params: undefined, pagination: undefined, method: 'GET' },
        auth,
        undefined,
        {},
        undefined,
        opts?.context
      );
      const res = await httpJsonFetch(url, {
        method: 'GET',
        headers,
        allowPrivateNetwork: source.allowPrivateNetwork
      });
      json = res.json;
    } else {
      const auth = await resolveAuth(source);
      const { url, headers } = finalizeRequest(
        source,
        endpoint,
        auth,
        undefined,
        {},
        undefined,
        opts?.context
      );
      const res = await httpJsonFetch(url, {
        method: endpoint.method,
        headers,
        allowPrivateNetwork: source.allowPrivateNetwork
      });
      json = res.json;
    }
    return mapTableRows(tableArrayFromData(json, table), table);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn('sources', `table fetch failed for ${source.name}${table.path ?? ''}: ${msg}`);
    return [];
  }
}

// Exported for tests: redirect handling (credential stripping) is security
// relevant and easier to cover directly than through a source configuration.
export interface HttpJsonFetchOptions {
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
  allowPrivateNetwork?: boolean;
}

export async function httpJsonFetch(
  url: string,
  opts: HttpJsonFetchOptions,
  redirectsLeft: number = MAX_REDIRECTS,
  trustedOrigin?: string
): Promise<{ json: unknown; status: number }> {
  const res = await httpRequest(url, {
    method: opts.method,
    headers: opts.headers,
    defaultHeaders: { Accept: 'application/json', 'User-Agent': 'Onda/1.0' },
    body: opts.body,
    allowPrivateNetwork: opts.allowPrivateNetwork,
    trustedOrigin,
    maxRedirects: redirectsLeft
  });
  try {
    return { json: res.text ? JSON.parse(res.text) : {}, status: res.status };
  } catch {
    throw new Error('Invalid JSON response');
  }
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

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Builds the request URL and drops resolved credentials when the target origin
 * differs from the source's declared origin. `endpoint.path` may be an absolute
 * URL (CDN-style), so a renderer-supplied config must never carry the source's
 * API key to another host. When credentials are refused the URL is rebuilt
 * without the auth query parameter, so the key never reaches the other origin.
 */
export function finalizeRequest(
  source: MediaSource,
  endpoint: SourceEndpoint,
  auth: { headers: Record<string, string>; query: Record<string, string> },
  pageToken: string | undefined,
  extraQuery: Record<string, string>,
  page: number | undefined,
  context: unknown
): { url: string; headers: Record<string, string> } {
  const merged = { ...auth.query, ...extraQuery };
  const url = buildUrl(source, endpoint, pageToken, merged, page, context);
  if (safeOrigin(url) === safeOrigin(source.baseUrl)) return { url, headers: auth.headers };
  if (Object.keys(auth.headers).length || Object.keys(auth.query).length) {
    logger.warn('sources', `credentials dropped: ${url} is not same-origin as ${source.baseUrl}`);
  }
  return { url: buildUrl(source, endpoint, pageToken, extraQuery, page, context), headers: {} };
}

export async function fetchSourceItems(
  source: MediaSource,
  endpoint: SourceEndpoint,
  opts?: { query?: Record<string, string>; pageToken?: string; page?: number; context?: unknown }
): Promise<SourceFetchResult> {
  try {
    if (endpoint.range) {
      return { items: generateRangeItems(endpoint, opts?.context), hasMore: false };
    }
    const auth = await resolveAuth(source);
    const { url, headers } = finalizeRequest(
      source,
      endpoint,
      auth,
      opts?.pageToken,
      opts?.query || {},
      opts?.page,
      opts?.context
    );
    const bodyParams: Record<string, string> = {};
    for (const [k, v] of Object.entries(endpoint.params || {})) {
      bodyParams[k] = resolveTemplate(v, opts?.context);
    }
    const body =
      endpoint.method === 'POST'
        ? JSON.stringify({ ...bodyParams, ...(opts?.query || {}) })
        : undefined;
    const { json } = await httpJsonFetch(url, {
      method: endpoint.method,
      headers,
      body,
      allowPrivateNetwork: source.allowPrivateNetwork
    });
    const items = mapResponse(json, endpoint);
    const meta = paginationMeta(json, endpoint);
    const isPageMode =
      !!endpoint.pagination?.pageParam &&
      !endpoint.pagination.nextFromField &&
      !endpoint.pagination.totalField;
    return {
      items,
      hasMore: isPageMode ? items.length > 0 : meta.hasMore,
      ...(meta.nextFrom ? { nextFrom: meta.nextFrom } : {})
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn('sources', `fetch failed for ${source.name}${endpoint.path}: ${msg}`);
    return { items: [], hasMore: false, error: msg };
  }
}

export async function testSourceConnection(
  source: MediaSource,
  endpoint: SourceEndpoint,
  opts?: { context?: unknown }
): Promise<SourceTestResult> {
  try {
    const auth = await resolveAuth(source);
    const { url, headers } = finalizeRequest(
      source,
      endpoint,
      auth,
      undefined,
      {},
      undefined,
      opts?.context
    );
    const bodyParams: Record<string, string> = {};
    for (const [k, v] of Object.entries(endpoint.params || {})) {
      bodyParams[k] = resolveTemplate(v, opts?.context);
    }
    const body = endpoint.method === 'POST' ? JSON.stringify(bodyParams) : undefined;
    const { json, status } = await httpJsonFetch(url, {
      method: endpoint.method,
      headers,
      body,
      allowPrivateNetwork: source.allowPrivateNetwork
    });
    const items = mapResponse(json, endpoint);
    let sample = items[0];
    if (!sample && json && typeof json === 'object' && !Array.isArray(json)) {
      sample = { id: '', title: '', type: 'file', extra: json as Record<string, unknown> };
    }
    return { success: true, status, sample };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}
