import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  toMediaStreamUrl: vi.fn((url: string) => `media:${url}`),
  streamTargetFor: vi.fn(
    (video: { id: string; url?: string }) => video.url ?? `target:${video.id}`
  ),
  streamChannelFor: vi.fn((url: string) => (url.startsWith('sc:') ? 'sc:stream' : 'yt:stream'))
}));

vi.mock('@renderer/utils/mediaUrl', () => ({ toMediaStreamUrl: h.toMediaStreamUrl }));
vi.mock('@renderer/utils/onlineHelpers', () => ({
  streamTargetFor: h.streamTargetFor,
  streamChannelFor: h.streamChannelFor
}));

import { createStreamPrefetcher } from '../streamPrefetch';

const api = window as unknown as { api?: { invoke: typeof h.invoke } };
const fetchMock = vi.fn();

beforeEach(() => {
  h.invoke.mockReset().mockResolvedValue({ success: true, url: 'https://cdn/x' });
  h.toMediaStreamUrl.mockClear();
  h.streamTargetFor.mockClear();
  h.streamChannelFor.mockClear();
  fetchMock.mockReset().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
  api.api = { invoke: h.invoke };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createStreamPrefetcher', () => {
  it('resolves a stream and warms the CDN connection', async () => {
    const prefetcher = createStreamPrefetcher();

    await prefetcher.prefetch({ id: 'v1', url: 'yt:v1' });

    expect(h.streamTargetFor).toHaveBeenCalledWith({ id: 'v1', url: 'yt:v1' });
    expect(h.streamChannelFor).toHaveBeenCalledWith('yt:v1');
    expect(h.invoke).toHaveBeenCalledWith('yt:stream', 'yt:v1');
    expect(h.toMediaStreamUrl).toHaveBeenCalledWith('https://cdn/x');
    expect(fetchMock).toHaveBeenCalledWith('media:https://cdn/x', {
      headers: { Range: 'bytes=0-1' }
    });
  });

  it('uses the SoundCloud channel when the target indicates it', async () => {
    const prefetcher = createStreamPrefetcher();

    await prefetcher.prefetch({ id: 's1', url: 'sc:123' });

    expect(h.invoke).toHaveBeenCalledWith('sc:stream', 'sc:123');
  });

  it('skips an already prefetched video', async () => {
    const prefetcher = createStreamPrefetcher();
    await prefetcher.prefetch({ id: 'v1' });

    await prefetcher.prefetch({ id: 'v1' });

    expect(h.invoke).toHaveBeenCalledTimes(1);
  });

  it('ignores unsuccessful resolutions', async () => {
    h.invoke.mockResolvedValue({ success: false });
    const prefetcher = createStreamPrefetcher();

    await prefetcher.prefetch({ id: 'v1' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores a resolution without a url', async () => {
    h.invoke.mockResolvedValue({ success: true });
    const prefetcher = createStreamPrefetcher();

    await prefetcher.prefetch({ id: 'v1' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('swallows resolver failures', async () => {
    h.invoke.mockRejectedValue(new Error('resolver down'));
    const prefetcher = createStreamPrefetcher();

    await expect(prefetcher.prefetch({ id: 'v1' })).resolves.toBeUndefined();
  });

  it('swallows probe failures', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    const prefetcher = createStreamPrefetcher();

    await expect(prefetcher.prefetch({ id: 'v1' })).resolves.toBeUndefined();
  });

  it('caps concurrent requests at five', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    h.invoke.mockReturnValue(gate);
    const prefetcher = createStreamPrefetcher();

    const pending = Array.from({ length: 7 }, (_, i) => prefetcher.prefetch({ id: `v${i}` }));
    expect(h.invoke).toHaveBeenCalledTimes(5);

    release();
    await Promise.all(pending);
  });

  it('clears the prefetch cache beyond a thousand entries', async () => {
    h.invoke.mockResolvedValue({ success: false });
    const prefetcher = createStreamPrefetcher();

    for (let i = 0; i <= 1000; i++) await prefetcher.prefetch({ id: `v${i}` });
    expect(h.invoke).toHaveBeenCalledTimes(1001);

    await prefetcher.prefetch({ id: 'v1001' });
    expect(h.invoke).toHaveBeenCalledTimes(1002);
  });
});
