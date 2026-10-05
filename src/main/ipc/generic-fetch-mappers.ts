import type { MediaSource, SourceEndpoint, SourceItem } from '../../shared/types/sources';
import { dotGet, asString, resolveTemplate, buildSourceUrl } from '../../shared/source-url';

// Czyste helpery szablonów/URL/dot-path wyodrębnione z `generic-fetch.ts`
// (plan 2.8). Współdzielone z rendererem przez `shared/source-url`, aby oba
// procesy liczyły URL i dot-path identycznie. `generic-fetch` re-eksportuje
// publiczne z nich, aby istniejące importery/testy działały bez zmian.

export { dotGet, asString, resolveTemplate } from '../../shared/source-url';

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
  // Deleguje do współdzielonej implementacji (identyczne zachowanie); sygnatura
  // pozycyjna zachowana dla istniejących importerów.
  return buildSourceUrl(source, endpoint, { pageToken, query, page, context });
}
