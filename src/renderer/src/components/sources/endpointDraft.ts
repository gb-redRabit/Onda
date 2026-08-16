import type { SourceEndpoint, SourcePassKey } from '@renderer/types/sources';

export interface DraftPassKey {
  from: string;
  as: string;
  type: 'string' | 'number';
}

export interface DraftEndpoint {
  id: string;
  name: string;
  method: 'GET' | 'POST';
  type: 'list' | 'page';
  path: string;
  paramsText: string;
  pageParam: string;
  pageStart: number | null;
  nextFromField: string;
  totalField: string;
  arrayPath: string;
  childId: string;
  rangeCountField: string;
  rangeCountValue: number | null;
  rangeStartAt: number | null;
  rangeTitleTemplate: string;
  fId: string;
  fTitle: string;
  fSubtitle: string;
  fThumbnail: string;
  fMediaUrl: string;
  fPlayerUrl: string;
  fType: string;
  fDuration: string;
  fSourceUrl: string;
  passKeys: DraftPassKey[];
  tableEnabled: boolean;
  tableMode: 'field' | 'endpoint';
  tableArrayField: string;
  tablePath: string;
  tableRowKey: string;
  tableTitle: string;
  tableThumbnail: string;
  tablePlayerUrl: string;
  tablePassKeys: DraftPassKey[];
  tableChildId: string;
}

export function randomId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function emptyEndpoint(): DraftEndpoint {
  return {
    id: randomId(),
    name: '',
    method: 'GET',
    type: 'list',
    path: '/',
    paramsText: '',
    pageParam: '',
    pageStart: null,
    nextFromField: '',
    totalField: '',
    arrayPath: '',
    childId: '',
    rangeCountField: '',
    rangeCountValue: null,
    rangeStartAt: null,
    rangeTitleTemplate: '',
    fId: '',
    fTitle: '',
    fSubtitle: '',
    fThumbnail: '',
    fMediaUrl: '',
    fPlayerUrl: '',
    fType: '',
    fDuration: '',
    fSourceUrl: '',
    passKeys: [],
    tableEnabled: false,
    tableMode: 'endpoint',
    tableArrayField: '',
    tablePath: '',
    tableRowKey: '',
    tableTitle: '',
    tableThumbnail: '',
    tablePlayerUrl: '',
    tablePassKeys: [],
    tableChildId: ''
  };
}

export function endpointFromSource(e: SourceEndpoint): DraftEndpoint {
  return {
    id: e.id,
    name: e.name,
    method: e.method,
    type: e.type === 'page' ? 'page' : 'list',
    path: e.path,
    paramsText: Object.entries(e.params || {})
      .map(([k, v]) => `${k}=${v}`)
      .join('\n'),
    pageParam: e.pagination?.pageParam || '',
    pageStart: e.pagination?.pageStart ?? null,
    nextFromField: e.pagination?.nextFromField || '',
    totalField: e.pagination?.totalField || '',
    arrayPath: e.mapping.arrayPath || '',
    childId: e.childId || '',
    rangeCountField: e.range?.countField || '',
    rangeCountValue: e.range?.countValue ?? null,
    rangeStartAt: e.range?.startAt ?? null,
    rangeTitleTemplate: e.range?.titleTemplate || '',
    fId: e.mapping.fields.id || '',
    fTitle: e.mapping.fields.title || '',
    fSubtitle: e.mapping.fields.subtitle || '',
    fThumbnail: e.mapping.fields.thumbnail || '',
    fMediaUrl: e.mapping.fields.mediaUrl || '',
    fPlayerUrl: e.mapping.fields.playerUrl || '',
    fType: e.mapping.fields.type || '',
    fDuration: e.mapping.fields.duration || '',
    fSourceUrl: e.mapping.fields.sourceUrl || '',
    passKeys: (e.passKeys || []).map((k) => ({ from: k.from, as: k.as, type: k.type })),
    tableEnabled: !!e.table,
    tableMode: e.table?.mode || 'endpoint',
    tableArrayField: e.table?.arrayField || '',
    tablePath: e.table?.path || '',
    tableRowKey: e.table?.rowKey || '',
    tableTitle: e.table?.title || '',
    tableThumbnail: e.table?.thumbnail || '',
    tablePlayerUrl: e.table?.playerUrl || '',
    tablePassKeys: (e.table?.passKeys || []).map((k) => ({ from: k.from, as: k.as, type: k.type })),
    tableChildId: e.table?.childId || ''
  };
}

export function toPassKeys(rows: DraftPassKey[]): SourcePassKey[] | undefined {
  const out: SourcePassKey[] = [];
  for (const r of rows) {
    const from = r.from.trim();
    const as = r.as.trim();
    if (!from || !as) continue;
    out.push({ from, as, type: r.type === 'number' ? 'number' : 'string' });
  }
  return out.length ? out : undefined;
}

export function buildEndpointFromDraft(d: DraftEndpoint): SourceEndpoint | null {
  const path = d.path.trim();
  if (!path) return null;
  const hasRange =
    d.rangeCountField.trim() ||
    d.rangeCountValue !== null ||
    d.rangeStartAt !== null ||
    d.rangeTitleTemplate.trim();
  const table =
    d.type === 'page' && d.tableEnabled
      ? {
          mode: d.tableMode as 'field' | 'endpoint',
          arrayField: d.tableMode === 'field' ? d.tableArrayField.trim() || undefined : undefined,
          path: d.tableMode === 'endpoint' ? d.tablePath.trim() || undefined : undefined,
          rowKey: d.tableRowKey.trim() || undefined,
          title: d.tableTitle.trim() || undefined,
          thumbnail: d.tableThumbnail.trim() || undefined,
          playerUrl: d.tablePlayerUrl.trim() || undefined,
          passKeys: toPassKeys(d.tablePassKeys),
          childId: d.tableChildId || undefined
        }
      : undefined;
  return {
    id: d.id || randomId(),
    name: d.name.trim() || 'Endpoint',
    method: d.method,
    path,
    type: d.type === 'page' ? 'page' : undefined,
    params: parseParams(d.paramsText),
    pagination:
      d.pageParam || d.nextFromField || d.totalField || d.pageStart
        ? {
            pageParam: d.pageParam.trim() || undefined,
            pageStart:
              d.pageStart !== null && Number.isFinite(d.pageStart) && d.pageStart >= 1
                ? Math.floor(d.pageStart)
                : undefined,
            nextFromField: d.nextFromField.trim() || undefined,
            totalField: d.totalField.trim() || undefined
          }
        : undefined,
    childId: d.type === 'list' ? d.childId || undefined : undefined,
    range: hasRange
      ? {
          countField: d.rangeCountField.trim() || undefined,
          countValue:
            d.rangeCountValue !== null &&
            Number.isFinite(d.rangeCountValue) &&
            d.rangeCountValue >= 1
              ? Math.floor(d.rangeCountValue)
              : undefined,
          startAt:
            d.rangeStartAt !== null && Number.isFinite(d.rangeStartAt) && d.rangeStartAt >= 0
              ? Math.floor(d.rangeStartAt)
              : undefined,
          titleTemplate: d.rangeTitleTemplate.trim() || undefined
        }
      : undefined,
    passKeys: toPassKeys(d.passKeys),
    table,
    mapping: {
      arrayPath: d.arrayPath.trim() || undefined,
      fields: {
        id: d.fId.trim() || undefined,
        title: d.fTitle.trim() || undefined,
        subtitle: d.fSubtitle.trim() || undefined,
        thumbnail: d.fThumbnail.trim() || undefined,
        mediaUrl: d.fMediaUrl.trim() || undefined,
        playerUrl: d.fPlayerUrl.trim() || undefined,
        type: d.fType.trim() || undefined,
        duration: d.fDuration.trim() || undefined,
        sourceUrl: d.fSourceUrl.trim() || undefined
      }
    }
  };
}

function parseParams(text: string): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    if (k) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Spłaszcza JSON próbki do dot-pathów (do sugestii w dropdownach kreatora). */
export function collectFieldPaths(obj: unknown, prefix = '', depth = 0): string[] {
  const out: string[] = [];
  if (depth > 3 || !obj || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) {
    if (obj[0] && typeof obj[0] === 'object')
      out.push(...collectFieldPaths(obj[0], prefix, depth + 1));
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    out.push(p);
    if (v && typeof v === 'object') out.push(...collectFieldPaths(v, p, depth + 1));
  }
  return out.slice(0, 80);
}
