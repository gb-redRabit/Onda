import { describe, expect, it } from 'vitest';
import { currentSourceUrl, endpointNameOf } from '../sourceViewLogic';
import type { MediaSource, SourceEndpoint } from '@renderer/types/sources';

const endpoint = {
  id: 'list',
  name: 'List',
  method: 'GET',
  path: '/items'
} as SourceEndpoint;

const source = {
  id: 'source',
  name: 'Source',
  baseUrl: 'https://example.com/',
  endpoints: [endpoint]
} as unknown as MediaSource;

describe('endpointNameOf', () => {
  it('resolves a known endpoint and falls back to its id', () => {
    expect(endpointNameOf(source, 'list')).toBe('List');
    expect(endpointNameOf(source, 'missing')).toBe('missing');
  });

  it('falls back to the id without a source', () => {
    expect(endpointNameOf(null, 'list')).toBe('list');
    expect(endpointNameOf(undefined, 'list')).toBe('list');
  });
});

describe('currentSourceUrl', () => {
  it('builds the URL and appends query overrides', () => {
    expect(currentSourceUrl(source, endpoint, {})).toBe('https://example.com/items');
    expect(currentSourceUrl(source, endpoint, { query: { q: 'search' } })).toBe(
      'https://example.com/items?q=search'
    );
  });

  it('returns an empty string without a source or endpoint', () => {
    expect(currentSourceUrl(null, endpoint, {})).toBe('');
    expect(currentSourceUrl(source, null, {})).toBe('');
    expect(currentSourceUrl(undefined, undefined, {})).toBe('');
  });
});
