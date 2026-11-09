import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import type { EffectScope } from 'vue';

const state = vi.hoisted(() => ({
  cache: new Map<string, string>(),
  setCached: vi.fn(),
  loggerWarn: vi.fn(),
  invoke: vi.fn()
}));

vi.mock('@renderer/utils/thumbLoader', () => ({
  cachedThumb: (path: string) => state.cache.get(path),
  setCachedThumb: (path: string, value: string) => {
    state.cache.set(path, value);
    state.setCached(path, value);
  }
}));
vi.mock('@shared/logger', () => ({
  logger: { warn: state.loggerWarn, info: vi.fn(), error: vi.fn() }
}));

import { useMediaAssets } from '../useMediaAssets';

let scope: EffectScope | null = null;

function setup(size = 180) {
  scope = effectScope();
  return scope.run(() => useMediaAssets(size))!;
}

beforeEach(() => {
  vi.useFakeTimers();
  state.cache = new Map();
  state.setCached.mockReset();
  state.loggerWarn.mockReset();
  state.invoke.mockReset();
  state.invoke.mockResolvedValue({});
  (window as unknown as { api?: unknown }).api = { invoke: state.invoke };
});

afterEach(() => {
  scope?.stop();
  scope = null;
  vi.useRealTimers();
  delete (window as unknown as { api?: unknown }).api;
});

describe('request batching', () => {
  it('batches paths after the debounce window', async () => {
    state.invoke.mockResolvedValueOnce({ a: 'thumb-a', b: 'thumb-b' });
    const assets = setup(120);

    assets.request(['a', 'b']);
    expect(state.invoke).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(39);
    expect(state.invoke).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(state.invoke).toHaveBeenCalledWith('media:batchThumbnails', ['a', 'b'], 120);
    expect(assets.thumbs.value).toEqual({ a: 'thumb-a', b: 'thumb-b' });
    expect(state.setCached).toHaveBeenCalledWith('a', 'thumb-a');
    expect(state.setCached).toHaveBeenCalledWith('b', 'thumb-b');
  });

  it('merges repeated requests into one batch and deduplicates', async () => {
    const assets = setup();

    assets.request(['a', 'a']);
    await vi.advanceTimersByTimeAsync(20);
    assets.request(['a', 'b']);
    await vi.advanceTimersByTimeAsync(39);
    expect(state.invoke).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(state.invoke).toHaveBeenCalledTimes(1);
    expect(state.invoke).toHaveBeenCalledWith('media:batchThumbnails', ['a', 'b'], 180);
  });

  it('skips empty paths', async () => {
    const assets = setup();
    assets.request(['', undefined as unknown as string]);
    await vi.advanceTimersByTimeAsync(40);

    expect(state.invoke).not.toHaveBeenCalled();
    expect(assets.thumbs.value).toEqual({});
  });

  it('does nothing for an empty batch', async () => {
    const assets = setup();
    await assets.flush();
    expect(state.invoke).not.toHaveBeenCalled();
  });
});

describe('cache reuse', () => {
  it('fills from the shared cache without a request', async () => {
    state.cache.set('a', 'cached');
    const assets = setup();

    assets.request(['a']);
    await vi.advanceTimersByTimeAsync(40);

    expect(state.invoke).not.toHaveBeenCalled();
    expect(assets.thumbs.value).toEqual({ a: 'cached' });
  });

  it('fills from the local record without a request', async () => {
    const assets = setup();
    state.invoke.mockResolvedValueOnce({ a: 'thumb-a' });
    assets.request(['a']);
    await vi.advanceTimersByTimeAsync(40);
    state.invoke.mockClear();

    assets.request(['a']);
    await vi.advanceTimersByTimeAsync(40);

    expect(state.invoke).not.toHaveBeenCalled();
  });

  it('prefers the local record in get()', async () => {
    const assets = setup();
    state.invoke.mockResolvedValueOnce({ a: 'fresh' });
    assets.request(['a']);
    await vi.advanceTimersByTimeAsync(40);

    expect(assets.get('a')).toBe('fresh');

    state.cache.set('b', 'cached');
    expect(assets.get('b')).toBe('cached');
    expect(assets.get('missing')).toBeUndefined();
  });

  it('keeps only the newest entries past the local limit', () => {
    const assets = setup();
    const paths = Array.from({ length: 2001 }, (_, i) => `p${i}`);
    for (const path of paths) state.cache.set(path, `thumb-${path}`);

    assets.request(paths);

    const keys = Object.keys(assets.thumbs.value);
    expect(keys).toHaveLength(2000);
    expect(keys[0]).toBe('p1');
    expect(keys[keys.length - 1]).toBe('p2000');
  });
});

describe('failures', () => {
  it('tolerates a missing result', async () => {
    state.invoke.mockResolvedValueOnce(undefined);
    const assets = setup();

    assets.request(['a']);
    await vi.advanceTimersByTimeAsync(40);

    expect(assets.thumbs.value).toEqual({});
  });

  it('logs bridge failures and keeps going', async () => {
    state.invoke.mockRejectedValueOnce(new Error('ipc'));
    const assets = setup();

    assets.request(['a']);
    await vi.advanceTimersByTimeAsync(40);

    expect(state.loggerWarn).toHaveBeenCalledWith(
      'thumbnails',
      'media:batchThumbnails failed',
      expect.any(Error)
    );
    expect(assets.thumbs.value).toEqual({});
  });

  it('works without the bridge', async () => {
    delete (window as unknown as { api?: unknown }).api;
    const assets = setup();

    assets.request(['a']);
    await vi.advanceTimersByTimeAsync(40);

    expect(state.invoke).not.toHaveBeenCalled();
  });
});

describe('scope disposal', () => {
  it('cancels the pending flush', async () => {
    const assets = setup();
    assets.request(['a']);

    scope!.stop();
    scope = null;
    await vi.advanceTimersByTimeAsync(40);

    expect(state.invoke).not.toHaveBeenCalled();
  });
});
