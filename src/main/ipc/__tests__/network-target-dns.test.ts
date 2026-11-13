import { describe, expect, it, vi } from 'vitest';

const lookup = vi.hoisted(() =>
  vi.fn(async () => [{ address: '93.184.216.34', family: 4 as const }])
);

vi.mock('node:dns/promises', () => ({ lookup }));

import { resolveNetworkTarget } from '../network-target';

// The default resolver path: hostnames go through dns.lookup(all) before policy checks.

describe('resolveNetworkTarget default lookup', () => {
  it('resolves hostnames with the system DNS resolver', async () => {
    await expect(resolveNetworkTarget('https://example.com/path')).resolves.toMatchObject({
      addresses: [{ address: '93.184.216.34', family: 4 }]
    });
    expect(lookup).toHaveBeenCalledWith('example.com', { all: true, verbatim: true });
  });
});
