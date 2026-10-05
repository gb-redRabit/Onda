import type { SourcePassKey } from '@renderer/types/sources';
import { dotGet } from '@shared/source-url';

export { dotGet } from '@shared/source-url';
export { buildSourceUrl } from '@shared/source-url';

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
