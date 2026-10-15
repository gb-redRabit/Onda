import { describe, expect, it } from 'vitest';
import {
  isRegisteredGenericStreamUrl,
  registerGenericStreamUrl,
  registerProviderStream,
  getProviderStreamFactory
} from '../media/media-server-stream-registry';

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 as const }];
const privateLookup = async () => [{ address: '127.0.0.1', family: 4 as const }];

describe('generic media stream registry', () => {
  it('registers only the exact public URL returned by an extractor', async () => {
    const url = 'https://stream.example/audio?id=unit-test';
    await registerGenericStreamUrl(url, publicLookup);

    expect(isRegisteredGenericStreamUrl(url)).toBe(true);
    expect(isRegisteredGenericStreamUrl('https://stream.example/other')).toBe(false);
  });

  it('rejects extracted URLs resolving to a private address', async () => {
    const url = 'https://private-stream.example/audio';
    await expect(registerGenericStreamUrl(url, privateLookup)).rejects.toThrow(
      'Private network address is not allowed'
    );
    expect(isRegisteredGenericStreamUrl(url)).toBe(false);
  });
});

describe('provider stream registry', () => {
  it('registers a factory and returns it by token', async () => {
    const factory = async () => ({ stream: {} as never, mime: 'video/mp4' });
    const token = registerProviderStream(factory);
    expect(getProviderStreamFactory(token)).toBe(factory);
  });

  it('returns undefined for an unknown token', () => {
    expect(getProviderStreamFactory('nope')).toBeUndefined();
  });

  it('expires a factory after its TTL', () => {
    const factory = async () => ({ stream: {} as never });
    const token = registerProviderStream(factory, 0);
    // TTL to 5h; sprawdzamy poza oknem.
    expect(getProviderStreamFactory(token, 18_000_001)).toBeUndefined();
  });
});
