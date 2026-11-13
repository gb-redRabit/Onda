import { describe, expect, it } from 'vitest';
import { buildSourceAuth, syncEndpointChain } from '../sourceEditor';

// Source editor helpers: auth draft assembly and child pointer repair.

describe('buildSourceAuth', () => {
  it('returns none for no auth', () => {
    expect(
      buildSourceAuth({ authType: 'none', apiKeyId: 'k', headerName: 'X', queryParam: 'q' })
    ).toEqual({ type: 'none' });
  });

  it('keeps the API key id for the other auth types', () => {
    expect(
      buildSourceAuth({ authType: 'bearer', apiKeyId: 'k', headerName: 'X', queryParam: 'q' })
    ).toEqual({ type: 'bearer', apiKeyId: 'k' });
    expect(
      buildSourceAuth({ authType: 'bearer', apiKeyId: '', headerName: 'X', queryParam: 'q' })
    ).toEqual({ type: 'bearer', apiKeyId: undefined });
  });

  it('trims header and query parameter names for API-key auth', () => {
    expect(
      buildSourceAuth({
        authType: 'apikey',
        apiKeyId: 'k',
        headerName: '  X-Key  ',
        queryParam: '  api_key  '
      })
    ).toEqual({ type: 'apikey', apiKeyId: 'k', headerName: 'X-Key', queryParam: 'api_key' });

    expect(
      buildSourceAuth({ authType: 'apikey', apiKeyId: '', headerName: '   ', queryParam: '   ' })
    ).toEqual({
      type: 'apikey',
      apiKeyId: undefined,
      headerName: undefined,
      queryParam: undefined
    });
  });
});

describe('syncEndpointChain', () => {
  it('points each page at the next endpoint by default', () => {
    const chain = [
      { type: 'page', id: 'a', tableChildId: null },
      { type: 'table', id: 'b', childId: null }
    ];

    syncEndpointChain(chain);

    expect(chain[0]!.tableChildId).toBe('b');
    expect(chain[1]!.childId).toBe('');
  });

  it('keeps an existing child id that is still in the chain', () => {
    const chain = [
      { type: 'list', id: 'a', childId: 'c' },
      { type: 'details', id: 'b' },
      { type: 'table', id: 'c' }
    ];

    syncEndpointChain(chain);

    expect(chain[0]!.childId).toBe('c');
  });

  it('keeps an existing table child id for page endpoints', () => {
    const chain = [
      { type: 'page', id: 'a', tableChildId: 'b' },
      { type: 'table', id: 'b' }
    ];

    syncEndpointChain(chain);

    expect(chain[0]!.tableChildId).toBe('b');
  });

  it('falls back to the next endpoint when the stored child disappeared', () => {
    const chain = [
      { type: 'page', id: 'a', tableChildId: 'gone' },
      { type: 'table', id: 'b' }
    ];

    syncEndpointChain(chain);

    expect(chain[0]!.tableChildId).toBe('b');
  });

  it('handles an empty chain', () => {
    const chain: Array<{ type: string; id: string }> = [];

    expect(() => syncEndpointChain(chain)).not.toThrow();
  });

  it('falls back to an empty child when the next endpoint has no id', () => {
    const chain = [
      { type: 'page', id: 'a', tableChildId: null },
      { type: 'table', id: '' }
    ];

    syncEndpointChain(chain);

    expect(chain[0]!.tableChildId).toBe('');
  });
});
