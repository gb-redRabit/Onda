import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref, type EffectScope, type Ref } from 'vue';
import { flushPromises } from '@vue/test-utils';

import { useRemoteImage } from '../useRemoteImage';

const invoke = vi.mocked(window.api.invoke);
const scopes: EffectScope[] = [];

function setup(url: string | null): { url: Ref<string | null>; src: Ref<string | null> } {
  const initial = ref<string | null>(url);
  const scope = effectScope();
  scopes.push(scope);
  const src = scope.run(() => useRemoteImage(initial))!;
  return { url: initial, src };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  invoke.mockReset();
});

afterEach(() => {
  while (scopes.length) scopes.pop()!.stop();
});

describe('useRemoteImage', () => {
  it('starts empty and ignores non-https sources', async () => {
    const { url, src } = setup(null);
    expect(src.value).toBeNull();

    url.value = 'http://insecure.example/avatar.png';
    await flushPromises();
    expect(src.value).toBeNull();

    url.value = '';
    await flushPromises();

    expect(src.value).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('loads an https image through the main process', async () => {
    invoke.mockResolvedValue('data:image/png;base64,AAA');

    const { src } = setup('https://cdn.example/avatar.png');
    await flushPromises();

    expect(invoke).toHaveBeenCalledWith('media:remoteImage', 'https://cdn.example/avatar.png');
    expect(src.value).toBe('data:image/png;base64,AAA');
  });

  it('reuses the cached image for the same url', async () => {
    invoke.mockResolvedValue('data:image/png;base64,CACHED');
    const url = 'https://cdn.example/cached.png';

    const first = setup(url);
    await flushPromises();
    const second = setup(url);
    await flushPromises();

    expect(first.src.value).toBe('data:image/png;base64,CACHED');
    expect(second.src.value).toBe('data:image/png;base64,CACHED');
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('clears the image when the main process has no data', async () => {
    invoke.mockResolvedValue(null);

    const { src } = setup('https://cdn.example/missing.png');
    await flushPromises();

    expect(src.value).toBeNull();
  });

  it('clears the image on transport errors', async () => {
    invoke.mockRejectedValue(new Error('ipc down'));

    const { src } = setup('https://cdn.example/boom.png');
    await flushPromises();

    expect(src.value).toBeNull();
  });

  it('clears a loaded image when switching to a non-https url', async () => {
    invoke.mockResolvedValue('data:image/png;base64,OLD');

    const { url, src } = setup('https://cdn.example/old.png');
    await flushPromises();
    expect(src.value).toBe('data:image/png;base64,OLD');

    url.value = 'data:image/png;base64,NEW';
    await flushPromises();

    expect(src.value).toBeNull();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('ignores stale responses that arrive after a newer url', async () => {
    const slow = deferred<string | null>();
    const fast = deferred<string | null>();
    invoke.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);

    const { url, src } = setup('https://cdn.example/slow.png');
    url.value = 'https://cdn.example/fast.png';
    await flushPromises();

    fast.resolve('data:image/png;base64,FAST');
    await flushPromises();
    expect(src.value).toBe('data:image/png;base64,FAST');

    slow.resolve('data:image/png;base64,SLOW');
    await flushPromises();
    expect(src.value).toBe('data:image/png;base64,FAST');
  });

  it('ignores responses after the scope was disposed', async () => {
    const pending = deferred<string | null>();
    invoke.mockReturnValueOnce(pending.promise);

    const { src } = setup('https://cdn.example/late.png');
    await flushPromises();
    scopes.pop()!.stop();

    pending.resolve('data:image/png;base64,LATE');
    await flushPromises();

    expect(src.value).toBeNull();
  });

  it('ignores a late failure from a stale url', async () => {
    const slow = deferred<string | null>();
    invoke.mockReturnValueOnce(slow.promise).mockResolvedValueOnce('data:image/png;base64,NEW');

    const { url, src } = setup('https://cdn.example/slow3.png');
    url.value = 'https://cdn.example/new3.png';
    await flushPromises();
    expect(src.value).toBe('data:image/png;base64,NEW');

    slow.reject(new Error('late'));
    await flushPromises();

    expect(src.value).toBe('data:image/png;base64,NEW');
  });

  it('keeps the newest failure from clobbering a resolved image', async () => {
    const slow = deferred<string | null>();
    const failing = deferred<string | null>();
    invoke.mockReturnValueOnce(slow.promise).mockReturnValueOnce(failing.promise);

    const { url, src } = setup('https://cdn.example/slow2.png');
    url.value = 'https://cdn.example/failing.png';
    await flushPromises();

    failing.resolve(null);
    await flushPromises();
    slow.resolve('data:image/png;base64,LATE2');
    await flushPromises();

    expect(src.value).toBeNull();
  });
});
