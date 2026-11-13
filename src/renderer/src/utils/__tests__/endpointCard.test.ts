import { describe, expect, it } from 'vitest';

import { emptyEndpoint } from '@renderer/components/sources/endpointDraft';
import { buildEndpointPreview } from '../endpointCard';

function draft(over: Record<string, unknown> = {}) {
  return { ...emptyEndpoint(), path: '/items', ...over } as never;
}

describe('buildEndpointPreview', () => {
  it('returns an empty preview without a path or base url', () => {
    expect(buildEndpointPreview(draft({ path: '' }), 'https://api.test')).toBe('');
    expect(buildEndpointPreview(draft(), '   ')).toBe('');
  });

  it('builds a plain endpoint url with trimmed base', () => {
    expect(buildEndpointPreview(draft(), ' https://api.test/ ')).toBe('https://api.test/items');
  });

  it('adds the page parameter in page mode', () => {
    const result = buildEndpointPreview(
      draft({ pageParam: 'page', pageStart: 3 }),
      'https://api.test'
    );

    expect(result).toBe('https://api.test/items?page=3');
  });

  it('defaults the page to one when pageStart is unset', () => {
    expect(buildEndpointPreview(draft({ pageParam: 'page' }), 'https://api.test')).toBe(
      'https://api.test/items?page=1'
    );
  });

  it('omits the page parameter when the endpoint paginates by token', () => {
    const result = buildEndpointPreview(
      draft({ pageParam: 'page', nextFromField: 'next' }),
      'https://api.test'
    );

    expect(result).toBe('https://api.test/items');
  });

  it('keeps an absolute endpoint path', () => {
    expect(buildEndpointPreview(draft({ path: 'https://cdn.test/list' }), 'https://api.test')).toBe(
      'https://cdn.test/list'
    );
  });

  it('falls back to the preview name', () => {
    // The name only affects the synthetic source, not the URL; smoke it to cover the branch.
    expect(buildEndpointPreview(draft({ name: '  ' }), 'https://api.test')).toBe(
      'https://api.test/items'
    );
  });
});
