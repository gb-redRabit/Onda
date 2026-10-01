import type { SourceAuthType } from '@renderer/types/sources';

// Czyste helpery edytora źródeł wydzielone z
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

// Utrzymuje poprawność wskaźnika dziecka każdego poziomu: użyj ponownie skonfigurowanego
// id, gdy nadal istnieje w łańcuchu, w przeciwnym razie wycofaj się do następnego poziomu. Mutuje w miejscu.
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
