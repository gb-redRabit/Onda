import { logger } from '../../shared/logger';
import type { MediaSource, SourceEndpoint } from '../../shared/types/sources';
import { getStore } from './cover/cover-cache';
import { decryptApiKeys } from './settings/settings-crypto';
import { buildUrl, resolveTemplate } from './generic-fetch-mappers';

// Nagłówki, rozwiązywanie poświadczeń i budowa żądania źródła — wydzielone z
// `generic-fetch.ts` (plan 2.8). Tu mieszka ochrona same-origin: klucz API źródła
// nigdy nie trafia na inny host niż zapisany `baseUrl`.

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
export async function buildEndpointRequest(
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
