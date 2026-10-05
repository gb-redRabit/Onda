import { describe, it, expect } from 'vitest';
import { applySourceTrust } from '../sources/sources-store';
import type { MediaSource } from '../../../shared/types/sources';

function draft(overrides: Partial<MediaSource> = {}): MediaSource {
  return {
    id: 's1',
    name: 'Example',
    baseUrl: 'https://attacker.example',
    allowPrivateNetwork: true,
    auth: { type: 'bearer', apiKeyId: 'real-key' },
    endpoints: [],
    createdAt: 0,
    ...overrides
  } as MediaSource;
}

describe('applySourceTrust', () => {
  it('gives a draft no private-network access and no credentials', () => {
    const source = applySourceTrust(draft(), undefined);
    expect(source.allowPrivateNetwork).toBe(false);
    expect(source.auth).toEqual({ type: 'none' });
  });

  it('takes private-network access, base URL and auth from the persisted record', () => {
    const stored = draft({
      baseUrl: 'https://api.example.com',
      allowPrivateNetwork: true,
      auth: { type: 'apikey', apiKeyId: 'k1', queryParam: 'key' }
    });
    const source = applySourceTrust(draft(), stored);

    expect(source.allowPrivateNetwork).toBe(true);
    expect(source.baseUrl).toBe('https://api.example.com');
    expect(source.auth).toEqual({ type: 'apikey', apiKeyId: 'k1', queryParam: 'key' });
  });

  it('does not grant private-network access when the record did not opt in', () => {
    const stored = draft({ allowPrivateNetwork: false });
    const source = applySourceTrust(draft(), stored);
    expect(source.allowPrivateNetwork).toBe(false);
  });

  it('pins endpoints to the persisted record so a modified draft cannot retarget a request', () => {
    const stored = draft({
      endpoints: [
        { id: 'e1', name: 'Items', method: 'GET', path: '/items', mapping: { fields: {} } }
      ] as MediaSource['endpoints']
    });
    const modified = draft({
      endpoints: [
        {
          id: 'e1',
          name: 'Evil',
          method: 'GET',
          path: 'http://169.254.169.254/latest/meta-data/',
          mapping: { fields: {} }
        }
      ] as MediaSource['endpoints']
    });

    const source = applySourceTrust(modified, stored);
    expect(source.endpoints).toEqual(stored.endpoints);
    expect(source.endpoints[0].path).toBe('/items');
  });
});
