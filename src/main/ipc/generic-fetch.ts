import { extname } from 'path';
import { httpRequest } from './http-request';
import { getStore } from './cover/cover-cache';
import { decryptApiKeys } from './settings/settings-crypto';
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

// Nagłówki odpowiedzi, których wartość maskujemy przed pokazaniem w UI/logach
// (mogą nieść sekrety: tokeny, ciasteczka, klucze API).
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api-key',
  'x-auth-token',
  'x-access-token'
]);

/** Normalizuje nagłówki odpowiedzi do stringów, maskując wartości wrażliwe. */
export function maskHeaders(
  headers: Record<string, string | string[] | undefined>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    out[key] = SENSITIVE_HEADERS.has(key.toLowerCase())
      ? '***'
      : Array.isArray(value)
        ? value.join(', ')
        : value;
  }
  return out;
}

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
    // to nie URL — przechodzimy dalej
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

/** Rozwiązuje tylko wartości passKeys (as → wartość) z surowego obiektu. */
function passValues(
  raw: Record<string, unknown> | undefined,
  keys: SourceEndpoint['passKeys']
): Record<string, unknown> | undefined {
  if (!raw || !keys?.length) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (!k.from || !k.as) continue;
    const v = dotGet(raw, k.from);
    if (v !== undefined && v !== null) out[k.as] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Zastępuje ciężkie `extra` lekkim `passContext` (tylko wartości passKeys). Pełny surowy
 * obiekt każdego elementu nie jest przesyłany do renderera — przy dużych listach jego
 * deserializacja przez IPC blokowała wątek UI (freez i zatrzymana animacja ładowania).
 */
function slimItem(item: SourceItem, endpoint: SourceEndpoint): SourceItem {
  if (!item.extra) return item;
  const { extra, ...rest } = item;
  const passContext = passValues(extra, endpoint.passKeys);
  return passContext ? { ...rest, passContext } : rest;
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
      const request = await buildEndpointRequest(
        source,
        { ...endpoint, path, params: undefined, pagination: undefined, method: 'GET' },
        { context: opts?.context, includeBody: false }
      );
      json = (await httpJsonFetch(request.url, request)).json;
    } else {
      const request = await buildEndpointRequest(source, endpoint, {
        context: opts?.context,
        includeBody: false
      });
      json = (await httpJsonFetch(request.url, request)).json;
    }
    return mapTableRows(tableArrayFromData(json, table), table);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn('sources', `table fetch failed for ${source.name}${table.path ?? ''}: ${msg}`);
    return [];
  }
}

// Eksportowane dla testów: obsługa przekierowań (usuwanie poświadczeń) jest istotna
// dla bezpieczeństwa i łatwiej ją pokryć bezpośrednio niż przez konfigurację źródła.
export interface HttpJsonFetchOptions {
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
  allowPrivateNetwork?: boolean;
  /**
   * Origin, z którym wolno łączyć się siecią prywatną. Zaufanie do sieci prywatnej
   * źródła jest wiązane z jego ZAPISANYM `baseUrl`, więc przejęty renderer nie może
   * sparować flagi z innym hostem (loopback/metadata).
   */
  trustedOrigin?: string;
}

export async function httpJsonFetch(
  url: string,
  opts: HttpJsonFetchOptions,
  redirectsLeft: number = MAX_REDIRECTS,
  trustedOrigin?: string
): Promise<{ json: unknown; status: number; headers: Record<string, string> }> {
  const res = await httpRequest(url, {
    method: opts.method,
    headers: opts.headers,
    defaultHeaders: { Accept: 'application/json', 'User-Agent': 'Onda/1.0' },
    body: opts.body,
    allowPrivateNetwork: opts.allowPrivateNetwork,
    trustedOrigin: trustedOrigin ?? opts.trustedOrigin,
    maxRedirects: redirectsLeft
  });
  try {
    return {
      json: res.text ? JSON.parse(res.text) : {},
      status: res.status,
      headers: maskHeaders(res.headers)
    };
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
 * Buduje URL żądania i usuwa rozwiązane poświadczenia, gdy origin celu
 * różni się od zadeklarowanego origin źródła. `endpoint.path` może być absolutnym
 * URL (w stylu CDN), więc konfiguracja dostarczona przez renderer nigdy nie może
 * przenieść klucza API źródła na inny host. Gdy poświadczenia zostaną odrzucone, URL
 * jest budowany ponownie bez parametru zapytania auth, więc klucz nigdy nie trafia na inny origin.
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
    // Logujemy wyłącznie origin: pełny URL mógłby nieść klucz API w parametrze
    // o nazwie spoza listy redakcji (np. `?q=`), a log jest czytelny dla renderera
    // przez `diagnostics:readLogs`.
    logger.warn(
      'sources',
      `credentials dropped: ${safeOrigin(url) ?? '(invalid)'} is not same-origin as ${source.baseUrl}`
    );
  }
  return { url: buildUrl(source, endpoint, pageToken, extraQuery, page, context), headers: {} };
}

interface EndpointRequestInput {
  query?: Record<string, string>;
  pageToken?: string;
  page?: number;
  context?: unknown;
  /** Tabele nie wysyłają ciała POST — tylko nagłówki/query. */
  includeBody?: boolean;
}

/**
 * Wspólna budowa żądania dla listy, tabeli i testu połączenia: rozwiązuje auth,
 * finalizuje URL (z ochroną same-origin), renderuje szablony params i składa body
 * dla POST. Wcześniej ta logika była powtórzona w trzech miejscach.
 */
async function buildEndpointRequest(
  source: MediaSource,
  endpoint: SourceEndpoint,
  opts?: EndpointRequestInput
): Promise<{
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
  allowPrivateNetwork?: boolean;
  trustedOrigin: string;
}> {
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
  let body: string | undefined;
  if (endpoint.method === 'POST' && opts?.includeBody !== false) {
    const bodyParams: Record<string, string> = {};
    for (const [k, v] of Object.entries(endpoint.params || {})) {
      bodyParams[k] = resolveTemplate(v, opts?.context);
    }
    body = JSON.stringify({ ...bodyParams, ...(opts?.query || {}) });
  }
  return {
    url,
    method: endpoint.method,
    headers,
    body,
    allowPrivateNetwork: source.allowPrivateNetwork,
    trustedOrigin: source.baseUrl
  };
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
    const request = await buildEndpointRequest(source, endpoint, {
      query: opts?.query,
      pageToken: opts?.pageToken,
      page: opts?.page,
      context: opts?.context
    });
    const { json } = await httpJsonFetch(request.url, request);
    const items = mapResponse(json, endpoint).map((item) => slimItem(item, endpoint));
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
  opts?: { context?: unknown; includeRaw?: boolean }
): Promise<SourceTestResult> {
  try {
    const request = await buildEndpointRequest(source, endpoint, { context: opts?.context });
    const { json, status, headers } = await httpJsonFetch(request.url, request);
    const items = mapResponse(json, endpoint);
    let sample = items[0];
    if (!sample && json && typeof json === 'object' && !Array.isArray(json)) {
      sample = { id: '', title: '', type: 'file', extra: json as Record<string, unknown> };
    }
    // Auto-test przy wejściu w źródło potrzebuje tylko `success` — pełna odpowiedź i próbka
    // (`extra`) to duży ładunek IPC, który blokował renderer. Zwracamy je tylko na żądanie
    // (edytor, diagnostyka).
    if (opts?.includeRaw) {
      return { success: true, status, sample, raw: json, headers };
    }
    return { success: true, status, headers };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}
