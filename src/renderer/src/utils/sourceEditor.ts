import type { SourceAuthType } from '@renderer/types/sources';

// Pure source-editor helpers extracted from
// `components/sources/SourceEditorDialog.vue` (plan 2.8).

export interface AuthDraft {
  authType: SourceAuthType;
  apiKeyId: string;
  headerName: string;
  queryParam: string;
}

export function buildSourceAuth(draft: AuthDraft): {
  type: SourceAuthType;
  apiKeyId?: string;
  headerName?: string;
  queryParam?: string;
} {
  if (draft.authType === 'none') return { type: 'none' as const };
  const base = { type: draft.authType, apiKeyId: draft.apiKeyId || undefined } as {
    type: SourceAuthType;
    apiKeyId?: string;
    headerName?: string;
    queryParam?: string;
  };
  if (draft.authType === 'apikey') {
    base.headerName = draft.headerName.trim() || undefined;
    base.queryParam = draft.queryParam.trim() || undefined;
  }
  return base;
}

export interface ChainEndpoint {
  type: string;
  id: string;
  childId?: string | null;
  tableChildId?: string | null;
}

// Keeps each level's child pointer valid: reuse the configured id when it still
// exists in the chain, otherwise fall back to the next level. Mutates in place.
export function syncEndpointChain(endpoints: ChainEndpoint[]): void {
  const ids = new Set(endpoints.map((e) => e.id));
  for (let i = 0; i < endpoints.length; i++) {
    const ep = endpoints[i];
    const next = endpoints[i + 1]?.id || '';
    if (ep.type === 'page') {
      const cur = ep.tableChildId;
      ep.tableChildId = cur && ids.has(cur) ? cur : next;
    } else {
      const cur = ep.childId;
      ep.childId = cur && ids.has(cur) ? cur : next;
    }
  }
}
