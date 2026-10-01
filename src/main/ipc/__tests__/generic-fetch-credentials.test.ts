import { describe, it, expect } from 'vitest';
import { finalizeRequest } from '../generic-fetch';
import type { MediaSource, SourceEndpoint } from '../../../shared/types/sources';

// Źródło deklaruje `https://api.example.com`; ścieżka endpointu może być
// absolutnym URL do innego hosta. Poświadczenia rozwiązane dla źródła nigdy nie mogą
// trafić do tego innego hosta.

const source = {
  id: 's1',
  name: 'Example',
  baseUrl: 'https://api.example.com',
  auth: { type: 'apikey', apiKeyId: 'k1', queryParam: 'key' },
  endpoints: []
} as unknown as MediaSource;

function endpoint(path: string): SourceEndpoint {
  return { id: 'e1', path, method: 'GET', mapping: { fields: {} } } as unknown as SourceEndpoint;
}

describe('finalizeRequest credential binding', () => {
  it('keeps credentials when the request stays on the source origin', () => {
    const result = finalizeRequest(
      source,
      endpoint('/items'),
      { headers: { Authorization: 'Bearer token' }, query: { key: 'SECRET' } },
      undefined,
      {},
      undefined,
      undefined
    );

    expect(result.url).toContain('https://api.example.com/items');
    expect(result.url).toContain('key=SECRET');
    expect(result.headers).toEqual({ Authorization: 'Bearer token' });
  });

  it('drops credentials and strips the auth query for a cross-origin path', () => {
    const result = finalizeRequest(
      source,
      endpoint('https://evil.example/steal'),
      { headers: { Authorization: 'Bearer token' }, query: { key: 'SECRET' } },
      undefined,
      {},
      undefined,
      undefined
    );

    expect(result.url).toBe('https://evil.example/steal');
    expect(result.url).not.toContain('SECRET');
    expect(result.headers).toEqual({});
  });

  it('keeps non-auth query parameters when credentials are dropped', () => {
    const result = finalizeRequest(
      source,
      endpoint('https://evil.example/steal'),
      { headers: {}, query: { key: 'SECRET' } },
      undefined,
      { page: '2' },
      undefined,
      undefined
    );

    expect(result.url).toContain('page=2');
    expect(result.url).not.toContain('SECRET');
    expect(result.headers).toEqual({});
  });
});
