import { applyPassKeys } from '@renderer/utils/sourceUrl';
import type { SourceEndpoint, SourceItem } from '@renderer/types/sources';

export function itemPassContext(
  item: SourceItem,
  endpoint: SourceEndpoint
): Record<string, unknown> {
  return applyPassKeys((item.extra ?? {}) as Record<string, unknown>, endpoint.passKeys);
}

// Page-level context merged with the row's extra (row wins), then page passKeys,
// then table passKeys (row still wins).
export function tableRowPassContext(
  pageCtx: unknown,
  row: SourceItem,
  endpoint: SourceEndpoint,
  table: NonNullable<SourceEndpoint['table']>
): Record<string, unknown> {
  const merged = {
    ...((pageCtx ?? {}) as Record<string, unknown>),
    ...((row.extra ?? {}) as Record<string, unknown>)
  };
  return applyPassKeys(applyPassKeys(merged, endpoint.passKeys), table.passKeys);
}
