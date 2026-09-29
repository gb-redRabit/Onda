import { describe, expect, it } from 'vitest';
import {
  createPinnedLookup,
  isNonPublicAddress,
  privateNetworkAllowedForTarget,
  resolveNetworkTarget
} from '../network-target';

describe('network target validation', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.20.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1'
  ])('classifies %s as non-public', (address) => {
    expect(isNonPublicAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])('allows public address %s', (address) => {
    expect(isNonPublicAddress(address)).toBe(false);
  });

  it('rejects private literal targets unless the source is explicitly trusted', async () => {
    await expect(resolveNetworkTarget('http://127.0.0.1:8080/api')).rejects.toThrow(
      'Private network address is not allowed'
    );
    await expect(
      resolveNetworkTarget('http://127.0.0.1:8080/api', { allowPrivateNetwork: true })
    ).resolves.toMatchObject({ addresses: [{ address: '127.0.0.1', family: 4 }] });
  });

  it('rejects unsupported schemes and URL userinfo', async () => {
    await expect(resolveNetworkTarget('file:///etc/passwd')).rejects.toThrow(
      'Unsupported network protocol'
    );
    await expect(resolveNetworkTarget('https://user:secret@example.com')).rejects.toThrow(
      'Credentials in URL are not allowed'
    );
  });

  it('rejects public DNS names resolving to private addresses', async () => {
    const lookup = async (_hostname: string) => [{ address: '10.0.0.8', family: 4 as const }];
    await expect(
      resolveNetworkTarget('https://attacker.example/image', {}, lookup)
    ).rejects.toThrow('Private network address is not allowed');
  });

  it('allows private redirects only within the source origin explicitly trusted by the user', () => {
    expect(
      privateNetworkAllowedForTarget(
        'http://192.168.1.10:8080/next',
        'http://192.168.1.10:8080',
        true
      )
    ).toBe(true);
    expect(
      privateNetworkAllowedForTarget(
        'http://192.168.1.11:8080/admin',
        'http://192.168.1.10:8080',
        true
      )
    ).toBe(false);
    expect(
      privateNetworkAllowedForTarget(
        'http://192.168.1.10:8080/api',
        'http://192.168.1.10:8080',
        false
      )
    ).toBe(false);
  });

  it('pins DNS answers and honors requested address family', () => {
    const lookup = createPinnedLookup([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 }
    ]);
    const callback = (error: NodeJS.ErrnoException | null, address: string | unknown[]) => {
      expect(error).toBeNull();
      expect(address).toBe('2606:2800:220:1:248:1893:25c8:1946');
    };
    lookup('example.com', { family: 6, hints: 0, all: false, verbatim: true }, callback);
  });
});
