import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shallowRef } from 'vue';

const h = vi.hoisted(() => ({
  notify: vi.fn(),
  t: vi.fn((key: string) => key),
  invoke: vi.fn(),
  on: vi.fn(),
  stopListening: vi.fn()
}));

vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => ({ notify: h.notify }) }));
vi.mock('@renderer/i18n', () => ({ i18n: { global: { t: h.t } } }));

import { createBatchLoader } from '../explorerLoader';
import type { FileItem } from '@renderer/types/explorer';

function file(name: string): FileItem {
  return { name, path: `/dir/${name}`, isDirectory: false, size: 1 } as never;
}

function setup(onError?: (message: string | null) => void) {
  const files = shallowRef<FileItem[]>([]);
  const isLoading = shallowRef(false);
  const loader = createBatchLoader(files, isLoading, onError);
  return { files, isLoading, ...loader };
}

let handler: (...args: unknown[]) => void;
let originalApi: Window['api'];

beforeEach(() => {
  originalApi = window.api;
  handler = vi.fn();
  h.notify.mockClear();
  h.invoke.mockReset().mockResolvedValue(undefined);
  h.on.mockReset().mockImplementation(((_channel: string, cb: (...args: unknown[]) => void) => {
    handler = cb;
    return h.stopListening;
  }) as never);
  h.stopListening.mockClear();
  window.api = { ...originalApi, on: h.on, invoke: h.invoke } as Window['api'];
});

afterEach(() => {
  window.api = originalApi;
  vi.useRealTimers();
});

describe('batch loading', () => {
  it('streams batches into the shallow ref and finishes on done', async () => {
    const onError = vi.fn();
    const { files, isLoading, load } = setup(onError);
    files.value = [file('stale.txt')];

    const pending = load('/dir', { showHidden: true });
    expect(isLoading.value).toBe(true);
    expect(files.value).toEqual([]);
    expect(onError).toHaveBeenCalledWith(null);
    expect(h.on).toHaveBeenCalledWith('fs:readdir:batch', expect.any(Function));
    expect(h.invoke).toHaveBeenCalledWith('fs:readdir', '/dir', { showHidden: true });

    handler({ done: false, items: [file('a.mp3')] });
    expect(files.value.map((item) => item.name)).toEqual(['a.mp3']);

    handler({ done: true, items: [file('b.mp3')] });
    await pending;

    expect(files.value.map((item) => item.name)).toEqual(['a.mp3', 'b.mp3']);
    expect(isLoading.value).toBe(false);
    expect(h.stopListening).toHaveBeenCalled();
  });

  it('reports batch errors without dropping received items', async () => {
    const onError = vi.fn();
    const { files, isLoading, load } = setup(onError);
    const pending = load('/dir');

    handler({ done: false, items: [file('partial.mp3')], error: 'permission denied' });

    expect(h.notify).toHaveBeenCalledWith('error', 'explorer.loadError', 'permission denied');
    expect(onError).toHaveBeenCalledWith('permission denied');
    expect(files.value).toHaveLength(1);
    expect(isLoading.value).toBe(true);

    handler({ done: true, items: [] });
    await pending;
    expect(isLoading.value).toBe(false);
  });

  it('ignores batches from a superseded load', async () => {
    const { files, load } = setup();
    const firstHandler = handler;
    const first = load('/first');
    const second = load('/second');

    firstHandler({ done: true, items: [file('old.mp3')] });
    await first;
    expect(files.value).toEqual([]);

    handler({ done: true, items: [file('new.mp3')] });
    await second;
    expect(files.value.map((item) => item.name)).toEqual(['new.mp3']);
  });

  it('clears state and reports invoke failures', async () => {
    const onError = vi.fn();
    const { files, isLoading, load } = setup(onError);
    h.invoke.mockRejectedValue(new Error('boom'));

    await load('/dir');

    expect(files.value).toEqual([]);
    expect(isLoading.value).toBe(false);
    expect(onError).toHaveBeenLastCalledWith('boom');
    expect(h.stopListening).toHaveBeenCalled();
  });

  it('reports non-Error invoke failures as strings', async () => {
    const onError = vi.fn();
    const { load } = setup(onError);
    h.invoke.mockRejectedValue('plain');

    await load('/dir');

    expect(onError).toHaveBeenLastCalledWith('plain');
  });

  it('cancels an in-flight load and ignores later batches', async () => {
    const { files, isLoading, load, cancel } = setup();
    const pending = load('/dir');

    cancel();
    expect(isLoading.value).toBe(false);

    handler({ done: false, items: [file('late.mp3')] });
    await pending;

    expect(files.value).toEqual([]);
    expect(h.stopListening).toHaveBeenCalled();
  });

  it('gives up after 15 seconds without a done batch', async () => {
    vi.useFakeTimers();
    const { isLoading, load } = setup();
    const pending = load('/dir');

    vi.advanceTimersByTime(15_000);
    await pending;

    expect(isLoading.value).toBe(false);
    expect(h.stopListening).toHaveBeenCalled();
  });

  it('does not run the timeout after a completed batch', async () => {
    vi.useFakeTimers();
    const { isLoading, load } = setup();
    const pending = load('/dir');
    handler({ done: true, items: [] });
    await pending;

    h.stopListening.mockClear();
    vi.advanceTimersByTime(20_000);

    expect(isLoading.value).toBe(false);
    expect(h.stopListening).not.toHaveBeenCalled();
  });

  it('works without an error callback and without window.api', async () => {
    const { files, isLoading, load } = setup();
    window.api = undefined as never;

    await expect(load('/dir')).resolves.toBeUndefined();

    expect(files.value).toEqual([]);
    expect(isLoading.value).toBe(false);
    expect(h.on).not.toHaveBeenCalled();
  });

  it('treats an empty batch as a no-op write', async () => {
    const { files, load } = setup();
    const pending = load('/dir');

    handler({ done: true, items: [] });
    await pending;

    expect(files.value).toEqual([]);
  });
});
