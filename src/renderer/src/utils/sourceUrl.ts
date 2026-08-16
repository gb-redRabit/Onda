import type { MediaSource, SourceEndpoint, SourcePassKey } from '@renderer/types/sources';

export function dotGet(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  let cur: unknown = obj;
  for (const seg of path.split('.')) {
    if (cur && typeof cur === 'object' && seg in cur) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** Wypełnia klucze {as} wartościami pól {from} z kontekstu (kontrakt passKeys). */
export function applyPassKeys(
  ctx: Record<string, unknown>,
  keys?: SourcePassKey[]
): Record<string, unknown> {
  if (!keys?.length) return ctx;
  const out = { ...ctx };
  for (const k of keys) {
    if (!k.from || !k.as) continue;
    const v = dotGet(ctx, k.from);
    if (v !== undefined && v !== null) out[k.as] = v;
  }
  return out;
}

function resolvePath(path: string, context: unknown): string {
  if (!context || typeof context !== 'object' || !path.includes('{')) return path;
  return path.replace(/\{([^}]+)\}/g, (raw, name: string) => {
    const v = dotGet(context, name);
    return v === undefined || v === null
      ? raw
      : encodeURIComponent(typeof v === 'string' ? v : String(v));
  });
}

export function buildSourceUrl(
  source: MediaSource,
  endpoint: SourceEndpoint,
  opts?: { query?: Record<string, string>; pageToken?: string; page?: number; context?: unknown }
): string {
  const base = source.baseUrl.replace(/\/+$/, '');
  const path = resolvePath(endpoint.path.trim(), opts?.context);
  const full = /^https?:\/\//i.test(path) ? path : base + (path.startsWith('/') ? path : `/${path}`);
  if (endpoint.method === 'POST') return full;
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(endpoint.params || {})) usp.set(k, v);
  if (opts?.query) for (const [k, v] of Object.entries(opts.query)) usp.set(k, v);
  if (endpoint.pagination?.pageParam) {
    const v = opts?.page ?? opts?.pageToken;
    if (v !== undefined) usp.set(endpoint.pagination.pageParam, String(v));
  }
  const qs = usp.toString();
  return qs ? full + (full.includes('?') ? '&' : '?') + qs : full;
}