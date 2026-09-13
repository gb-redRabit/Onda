import type { MediaSource, SourceEndpoint, SourceItem } from '../../renderer/src/types/sources';

// Pure templating/URL/dot-path helpers extracted from `generic-fetch.ts`
// (plan 2.8). `generic-fetch` re-exports the public ones so existing
// importers/tests keep working unchanged.

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

const MAX_RANGE_ITEMS = 1000;

export function generateRangeItems(endpoint: SourceEndpoint, context: unknown): SourceItem[] {
  const range = endpoint.range;
  if (!range || !context || typeof context !== 'object') return [];
  let count = typeof range.countValue === 'number' ? Math.floor(range.countValue) : 0;
  if (range.countField) {
    const v = dotGet(context, range.countField);
    if (typeof v === 'number' && Number.isFinite(v)) count = Math.floor(v);
  }
  count = Math.max(0, Math.min(count, MAX_RANGE_ITEMS));
  const startAt = range.startAt ?? 1;
  const titleTpl = range.titleTemplate?.trim() || '{n}';
  const ctxRecord = context as Record<string, unknown>;
  const items: SourceItem[] = [];
  for (let i = 0; i < count; i++) {
    const n = startAt + i;
    items.push({
      id: String(n),
      title: resolveTemplate(titleTpl, { ...ctxRecord, n }),
      type: 'file',
      extra: { ...ctxRecord, n }
    });
  }
  return items;
}

export function paginationMeta(
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

export function buildUrl(
  source: MediaSource,
  endpoint: SourceEndpoint,
  pageToken?: string,
  query?: Record<string, string>,
  page?: number,
  context?: unknown
): string {
  const base = source.baseUrl.replace(/\/+$/, '');
  const path = resolvePathTemplate(endpoint.path.trim(), context);
  const full = /^https?:\/\//i.test(path)
    ? path
    : base + (path.startsWith('/') ? path : `/${path}`);
  if (endpoint.method === 'POST') return full;
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(endpoint.params || {}))
    usp.set(k, resolveTemplate(v, context));
  if (query) for (const [k, v] of Object.entries(query)) usp.set(k, v);
  if (endpoint.pagination?.pageParam) {
    const v = page ?? pageToken;
    if (v !== undefined) usp.set(endpoint.pagination.pageParam, String(v));
  }
  const qs = usp.toString();
  return qs ? full + (full.includes('?') ? '&' : '?') + qs : full;
}
