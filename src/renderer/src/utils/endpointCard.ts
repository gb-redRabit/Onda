import { buildSourceUrl } from './sourceUrl';
import {
  buildEndpointFromDraft,
  type DraftEndpoint
} from '@renderer/components/sources/endpointDraft';
import type { MediaSource } from '@renderer/types/sources';

// Czysty builder podglądu endpointu wydzielony z
// `components/sources/EndpointLevelCard.vue` (plan 2.8).
export function buildEndpointPreview(draft: DraftEndpoint, baseUrl: string): string {
  const endpoint = buildEndpointFromDraft(draft);
  if (!endpoint || !baseUrl.trim()) return '';
  const source: MediaSource = {
    id: 'preview',
    name: draft.name.trim() || 'preview',
    baseUrl: baseUrl.trim(),
    auth: { type: 'none' },
    endpoints: [],
    createdAt: 0
  };
  const pageMode = !!endpoint.pagination?.pageParam && !endpoint.pagination.nextFromField;
  return buildSourceUrl(source, endpoint, {
    page: pageMode ? (endpoint.pagination?.pageStart ?? 1) : undefined
  });
}
