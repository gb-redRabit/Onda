import { buildSourceUrl } from '@renderer/utils/sourceUrl';
import type { MediaSource } from '@renderer/types/sources';

type SourceEndpoint = Parameters<typeof buildSourceUrl>[1];
type SourceUrlOpts = Parameters<typeof buildSourceUrl>[2];

export function endpointNameOf(source: MediaSource | null | undefined, id: string): string {
  return source?.endpoints.find((e) => e.id === id)?.name || id;
}

export function currentSourceUrl(
  source: MediaSource | null | undefined,
  endpoint: SourceEndpoint | null | undefined,
  opts: SourceUrlOpts
): string {
  if (!source || !endpoint) return '';
  return buildSourceUrl(source, endpoint, opts);
}
