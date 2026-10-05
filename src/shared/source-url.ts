import type { MediaSource, SourceEndpoint } from './types/sources';

// Wspólne helpery dot-path i budowy URL źródeł. Wcześniej main (`generic-fetch-mappers`)
// i renderer (`utils/sourceUrl`) miały DWIE różne implementacje `dotGet` i `buildUrl`
// o rozbieżnej semantyce (m.in. main obsługiwał indeksy tablic `a.0`, renderer nie),
// co dawało niespójne wyniki na tej samej konfiguracji źródła.

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

export function asString(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return undefined;
}

/** Zastępuje placeholdery {a.b} wartościami z kontekstu (surowy JSON rodzica); {n} = wygenerowany indeks. */
export function resolveTemplate(template: string, context: unknown): string {
  if (!context || typeof context !== 'object') return template;
  return template.replace(/\{([^}]+)\}/g, (raw, name: string) => {
    const v = dotGet(context, name);
    return v === undefined || v === null ? raw : (asString(v) ?? raw);
  });
}

/** Zamienia placeholdery w ścieżce; wartości trafiające do segmentu ścieżki są encodeURIComponent. */
export function resolvePathTemplate(path: string, context: unknown): string {
  if (!context || typeof context !== 'object' || !path.includes('{')) return path;
  return path.replace(/\{([^}]+)\}/g, (raw, name: string) => {
    const v = dotGet(context, name);
    return v === undefined || v === null ? raw : encodeURIComponent(asString(v) ?? raw);
  });
}

export interface BuildSourceUrlOptions {
  query?: Record<string, string>;
  pageToken?: string;
  page?: number;
  context?: unknown;
}

/**
 * Buduje URL żądania endpointu. `endpoint.path` może być absolutny (CDN) — wtedy
 * nadpisuje `baseUrl`. Dla POST zwraca goły URL (parametry idą w ciele żądania).
 * Wartości `endpoint.params` przechodzą przez placeholdery kontekstu
 * (`resolveTemplate`), więc podgląd w rendererze pokazuje realne zapytanie.
 */
export function buildSourceUrl(
  source: MediaSource,
  endpoint: SourceEndpoint,
  opts?: BuildSourceUrlOptions
): string {
  const base = source.baseUrl.replace(/\/+$/, '');
  const path = resolvePathTemplate(endpoint.path.trim(), opts?.context);
  const full = /^https?:\/\//i.test(path)
    ? path
    : base + (path.startsWith('/') ? path : `/${path}`);
  if (endpoint.method === 'POST') return full;
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(endpoint.params || {}))
    usp.set(k, resolveTemplate(v, opts?.context));
  if (opts?.query) for (const [k, v] of Object.entries(opts.query)) usp.set(k, v);
  if (endpoint.pagination?.pageParam) {
    const v = opts?.page ?? opts?.pageToken;
    if (v !== undefined) usp.set(endpoint.pagination.pageParam, String(v));
  }
  const qs = usp.toString();
  return qs ? full + (full.includes('?') ? '&' : '?') + qs : full;
}
