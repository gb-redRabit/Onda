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

  it('rejects oversized URLs before resolving them', async () => {
    await expect(
      registerGenericStreamUrl(`https://stream.example/${'a'.repeat(8192)}`, publicLookup)
    ).rejects.toThrow('Stream URL is too long');
  });

  it('expires registrations after the TTL and forgets them', async () => {
    const url = 'https://stream.example/ttl';
    await registerGenericStreamUrl(url, publicLookup, 0);

    expect(isRegisteredGenericStreamUrl(url, 0)).toBe(true);
    expect(isRegisteredGenericStreamUrl(url, 18_000_001)).toBe(false);
    // Second lookup stays false: the expired entry was deleted, not just skipped.
    expect(isRegisteredGenericStreamUrl(url, 0)).toBe(false);
  });

  it('returns false for malformed URLs', () => {
    expect(isRegisteredGenericStreamUrl('not a url')).toBe(false);
  });

  it('prunes expired entries when registering later streams', async () => {
    const old = 'https://prune.example/old';
    await registerGenericStreamUrl(old, publicLookup, 0);
    await registerGenericStreamUrl('https://prune.example/new', publicLookup, 18_000_001);

    expect(isRegisteredGenericStreamUrl(old, 0)).toBe(false);
  });

  it('keeps the registry bounded by evicting the oldest entries', async () => {
    const urls = Array.from({ length: 257 }, (_, i) => `https://bounded-${i}.example/audio`);
    for (const url of urls) await registerGenericStreamUrl(url, publicLookup, 0);

    expect(isRegisteredGenericStreamUrl(urls[0]!, 0)).toBe(false);
    expect(isRegisteredGenericStreamUrl(urls.at(-1)!, 0)).toBe(true);
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

  it('keeps the provider registry bounded and prunes expired factories', () => {
    const factory = async () => ({ stream: {} as never });
    const tokens = Array.from({ length: 257 }, () => registerProviderStream(factory, 0));

    expect(getProviderStreamFactory(tokens[0]!, 0)).toBeUndefined();
    expect(getProviderStreamFactory(tokens.at(-1)!, 0)).toBe(factory);

    const fresh = registerProviderStream(factory, 18_000_001);
    expect(getProviderStreamFactory(tokens.at(-1)!, 18_000_001)).toBeUndefined();
    expect(getProviderStreamFactory(fresh, 18_000_001)).toBe(factory);
  });
});
