import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ref } from 'vue';
import type { MediaFile, Playlist } from '@renderer/types/media';
import { useLibraryLoad } from '../library-load';
import { useUIStore } from '../ui';

vi.mock('@renderer/i18n', () => ({ i18n: { global: { t: (key: string) => key } } }));

function stubWindowApi(invoke: (channel: string, ...args: unknown[]) => Promise<unknown>): void {
  (window as unknown as { api?: unknown }).api = { invoke };
}

function stubApi(api: Record<string, unknown>): void {
  (window as unknown as { api?: unknown }).api = api;
}

function makeCtx() {
  return {
    tracks: ref<MediaFile[]>([]),
    folders: ref<string[]>([]),
    folderTypes: ref<Record<string, 'audio' | 'video' | 'image' | 'mixed'>>({}),
    playlists: ref<Playlist[]>([]),
    isLoaded: ref(false),
    isLoading: ref(false),
    isScanning: ref(false),
    scanProgress: ref({ current: 0, total: 0 }),
    loadError: ref<string | null>(null)
  };
}

describe('useLibraryLoad error state', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    vi.stubGlobal('requestIdleCallback', undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (window as unknown as { api?: unknown }).api;
  });

  it('records a failed chunk load in loadError and still marks the library loaded', async () => {
    stubWindowApi(async (channel: string) => {
      if (channel === 'library:loadScannedChunk') throw new Error('chunk boom');
      return undefined;
    });

    const ctx = makeCtx();
    const load = useLibraryLoad(ctx);
    const promise = load.loadFromDisk({ audioOnly: true });
    await vi.runAllTimersAsync();
    await promise;

    expect(ctx.loadError.value).toBe('chunk boom');
    expect(ctx.isLoaded.value).toBe(true);
    expect(ctx.isLoading.value).toBe(false);
  });

  it('clears an earlier error when a retry starts', async () => {
    let fail = true;
    stubWindowApi(async (channel: string) => {
      if (channel === 'library:loadScannedChunk') {
        if (fail) throw new Error('chunk boom');
        return { files: [], total: 0, folderTypes: {} };
      }
      return undefined;
    });

    const ctx = makeCtx();
    const load = useLibraryLoad(ctx);
    const first = load.loadFromDisk({ audioOnly: true });
    await vi.runAllTimersAsync();
    await first;
    expect(ctx.loadError.value).toBe('chunk boom');

    fail = false;
    const second = load.loadFromDisk({ audioOnly: true });
    await vi.runAllTimersAsync();
    await second;
    expect(ctx.loadError.value).toBeNull();
  });
});

describe('useLibraryLoad chunked loading', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    vi.stubGlobal('requestIdleCallback', undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (window as unknown as { api?: unknown }).api;
  });

  it('loads playlists, folders and every track chunk, filtering audio', async () => {
    stubWindowApi(async (channel, ...args) => {
      if (channel === 'playlist:loadAll') return [{ id: 'p1' }];
      if (channel === 'library:loadFolders') return ['/music'];
      if (channel === 'library:loadScannedChunk') {
        if (args[0] === 0) {
          return {
            files: [
              { id: 'a', type: 'audio' },
              { id: 'b', type: 'video' }
            ],
            total: 3,
            folderTypes: { '/music': 'audio' }
          };
        }
        return { files: [{ id: 'c', type: 'audio' }], total: 3, folderTypes: {} };
      }
      return undefined;
    });

    const ctx = makeCtx();
    const load = useLibraryLoad(ctx);
    const promise = load.loadFromDisk({ audioOnly: true });
    await vi.runAllTimersAsync();
    await promise;

    expect(ctx.tracks.value.map((t) => t.id)).toEqual(['a', 'c']);
    expect(ctx.playlists.value).toEqual([{ id: 'p1' }]);
    expect(ctx.folders.value).toEqual(['/music']);
    expect(ctx.folderTypes.value).toEqual({ '/music': 'audio' });
    expect(ctx.isLoaded.value).toBe(true);
    expect(ctx.isLoading.value).toBe(false);
  });

  it('takes the single-chunk fast path', async () => {
    stubWindowApi(async (channel) => {
      if (channel === 'library:loadScannedChunk') {
        return { files: [{ id: 'a', type: 'video' }], total: 1, folderTypes: {} };
      }
      return undefined;
    });

    const ctx = makeCtx();
    const load = useLibraryLoad(ctx);
    const promise = load.loadFromDisk({ audioOnly: false });
    await vi.runAllTimersAsync();
    await promise;

    expect(ctx.tracks.value.map((t) => t.id)).toEqual(['a']);
  });

  it('stops when the first chunk is unavailable', async () => {
    stubWindowApi(async (channel) => {
      if (channel === 'library:loadScannedChunk') return null;
      return undefined;
    });

    const ctx = makeCtx();
    const load = useLibraryLoad(ctx);
    const promise = load.loadFromDisk();
    await vi.runAllTimersAsync();
    await promise;

    expect(ctx.tracks.value).toEqual([]);
    expect(ctx.isLoaded.value).toBe(true);
  });

  it('defaults folder types when the chunk omits them', async () => {
    stubWindowApi(async (channel) => {
      if (channel === 'library:loadScannedChunk') {
        return { files: [{ id: 'a', type: 'audio' }], total: 1 };
      }
      return undefined;
    });

    const ctx = makeCtx();
    ctx.folderTypes.value = { stale: 'audio' };
    const load = useLibraryLoad(ctx);
    const promise = load.loadFromDisk({ audioOnly: false });
    await vi.runAllTimersAsync();
    await promise;

    expect(ctx.folderTypes.value).toEqual({});
    expect(ctx.tracks.value.map((t) => t.id)).toEqual(['a']);
  });

  it('stops when a later chunk comes back empty', async () => {
    stubWindowApi(async (channel, ...args) => {
      if (channel === 'library:loadScannedChunk') {
        return args[0] === 0
          ? { files: [{ id: 'a', type: 'audio' }], total: 5, folderTypes: {} }
          : { files: [], total: 5, folderTypes: {} };
      }
      return undefined;
    });

    const ctx = makeCtx();
    const load = useLibraryLoad(ctx);
    const promise = load.loadFromDisk({ audioOnly: false });
    await vi.runAllTimersAsync();
    await promise;

    expect(ctx.tracks.value.map((t) => t.id)).toEqual(['a']);
  });

  it('keeps defaults when playlists or folders fail to load', async () => {
    stubWindowApi(async (channel) => {
      if (channel === 'playlist:loadAll') throw new Error('playlist down');
      if (channel === 'library:loadFolders') throw new Error('folders down');
      if (channel === 'library:loadScannedChunk') {
        return { files: [], total: 0, folderTypes: {} };
      }
      return undefined;
    });

    const ctx = makeCtx();
    const load = useLibraryLoad(ctx);
    const promise = load.loadFromDisk();
    await vi.runAllTimersAsync();
    await promise;

    expect(ctx.playlists.value).toEqual([]);
    expect(ctx.folders.value).toEqual([]);
    expect(ctx.tracks.value).toEqual([]);
  });

  it('resolves the scheduling promise after the timeout even if loading hangs', async () => {
    stubWindowApi((channel) => {
      if (channel === 'library:loadScannedChunk') return new Promise(() => {});
      return Promise.resolve(undefined);
    });

    const ctx = makeCtx();
    const load = useLibraryLoad(ctx);
    const promise = load.loadFromDisk();
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(5000);

    await expect(promise).resolves.toBeUndefined();
    expect(ctx.isLoaded.value).toBe(false);
    expect(ctx.isLoading.value).toBe(false);
  });

  it('resolves all concurrent waiters when a scheduled load finishes', async () => {
    let release!: (value: unknown) => void;
    stubWindowApi((channel) => {
      if (channel === 'library:loadScannedChunk') {
        return new Promise((resolve) => (release = resolve));
      }
      return Promise.resolve(undefined);
    });

    const ctx = makeCtx();
    const load = useLibraryLoad(ctx);
    const first = load.scheduleLoadTracksAsync();
    const second = load.scheduleLoadTracksAsync();
    await vi.advanceTimersByTimeAsync(100);
    release({ files: [], total: 0, folderTypes: {} });
    await Promise.all([first, second]);

    expect(ctx.isLoaded.value).toBe(true);
  });

  it('uses requestIdleCallback when the runtime provides it', async () => {
    const idle = vi.fn((cb: () => void) => {
      cb();
      return 1;
    });
    Object.defineProperty(globalThis, 'requestIdleCallback', {
      configurable: true,
      value: idle
    });
    try {
      stubWindowApi(async (channel) => {
        if (channel === 'library:loadScannedChunk') {
          return { files: [], total: 0, folderTypes: {} };
        }
        return undefined;
      });

      const ctx = makeCtx();
      const load = useLibraryLoad(ctx);
      const promise = load.loadFromDisk({ audioOnly: false });
      await vi.runAllTimersAsync();
      await promise;

      expect(idle).toHaveBeenCalledWith(expect.any(Function), { timeout: 3000 });
      expect(ctx.isLoaded.value).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'requestIdleCallback', {
        configurable: true,
        value: undefined
      });
    }
  });

  it('uses the generic failure code when the error message is empty', async () => {
    stubWindowApi(async (channel) => {
      if (channel === 'library:loadScannedChunk') throw '';
      return undefined;
    });

    const ctx = makeCtx();
    const load = useLibraryLoad(ctx);
    const promise = load.loadFromDisk({ audioOnly: false });
    await vi.runAllTimersAsync();
    await promise;

    expect(ctx.loadError.value).toBe('library-load-failed');
  });
});

describe('useLibraryLoad scanning', () => {
  let progress: ((data?: { current?: number; total?: number }) => void) | undefined;
  let stopListening: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    vi.stubGlobal('requestIdleCallback', undefined);
    progress = undefined;
    stopListening = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (window as unknown as { api?: unknown }).api;
  });

  function scanApi(scanResult: unknown, over: Record<string, unknown> = {}) {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'library:scan') {
        if (scanResult instanceof Error) throw scanResult;
        return scanResult;
      }
      if (channel === 'library:loadScannedChunk') {
        return { files: [], total: 0, folderTypes: {} };
      }
      return undefined;
    });
    stubApi({
      invoke,
      on: vi.fn((channel: string, cb: typeof progress) => {
        if (channel === 'library:scan:progress') progress = cb;
        return stopListening;
      }),
      cancelLibraryScan: vi.fn(async () => undefined),
      ...over
    });
    return invoke;
  }

  it('reports scan progress and schedules a reload on success', async () => {
    const invoke = scanApi({ count: 1, folderTypes: { '/music': 'audio' } });
    const ctx = makeCtx();
    ctx.folders.value = ['/music'];
    const load = useLibraryLoad(ctx);

    const promise = load.scanFolders();
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.folderTypes.value).toEqual({ '/music': 'audio' });
    await vi.runAllTimersAsync();
    await promise;

    const scanCall = invoke.mock.calls.find((c) => c[0] === 'library:scan');
    expect(scanCall).toBeDefined();
    expect(ctx.isScanning.value).toBe(false);
    expect(stopListening).toHaveBeenCalled();
    expect(ctx.isLoaded.value).toBe(true);
  });

  it('updates progress from scan events and tolerates empty events', async () => {
    scanApi({ count: 1, folderTypes: {} });
    const ctx = makeCtx();
    ctx.folders.value = ['/music', '/films'];
    const load = useLibraryLoad(ctx);

    const promise = load.scanFolders();
    progress?.({ current: 1, total: 5 });
    expect(ctx.scanProgress.value).toEqual({ current: 1, total: 5 });
    progress?.();
    expect(ctx.scanProgress.value).toEqual({ current: 1, total: 5 });
    progress?.({});
    expect(ctx.scanProgress.value).toEqual({ current: 0, total: 2 });
    await vi.runAllTimersAsync();
    await promise;
  });

  it('does not schedule a reload when the scan returns nothing', async () => {
    const invoke = scanApi(undefined);
    const ctx = makeCtx();
    ctx.folders.value = ['/music'];
    const load = useLibraryLoad(ctx);

    await load.scanFolders();

    expect(invoke.mock.calls.filter((c) => c[0] === 'library:scan')).toHaveLength(1);
    expect(ctx.isLoaded.value).toBe(false);
    expect(ctx.isScanning.value).toBe(false);
  });

  it('notifies when the scan was aborted without reloading', async () => {
    scanApi({ count: 0, folderTypes: {}, aborted: true });
    const ctx = makeCtx();
    ctx.folders.value = ['/music'];
    const load = useLibraryLoad(ctx);

    await load.scanFolders();

    const notifications = useUIStore().notifications;
    expect(notifications.at(-1)).toMatchObject({ type: 'error', title: 'library.scanAborted' });
    expect(ctx.isLoaded.value).toBe(false);
    expect(stopListening).toHaveBeenCalled();
  });

  it('notifies when the scan fails', async () => {
    scanApi(new Error('scan boom'));
    const ctx = makeCtx();
    ctx.folders.value = ['/music'];
    const load = useLibraryLoad(ctx);

    await load.scanFolders();

    expect(useUIStore().notifications.at(-1)).toMatchObject({
      type: 'error',
      title: 'library.scanError'
    });
    expect(ctx.isScanning.value).toBe(false);
    expect(stopListening).toHaveBeenCalled();
  });

  it('does nothing without folders', async () => {
    const invoke = scanApi({ count: 0, folderTypes: {} });
    const load = useLibraryLoad(makeCtx());

    await load.scanFolders();

    expect(invoke).not.toHaveBeenCalled();
  });

  it('blocks a second scan while the first one is running', async () => {
    let finish!: (value: unknown) => void;
    const invoke = vi.fn((channel: string) => {
      if (channel === 'library:scan') return new Promise((resolve) => (finish = resolve));
      return Promise.resolve(undefined);
    });
    stubApi({ invoke, on: vi.fn(() => stopListening), cancelLibraryScan: vi.fn() });
    const ctx = makeCtx();
    ctx.folders.value = ['/music'];
    const load = useLibraryLoad(ctx);

    const first = load.scanFolders();
    await load.scanFolders();
    expect(invoke.mock.calls.filter((c) => c[0] === 'library:scan')).toHaveLength(1);

    finish({ count: 0, folderTypes: {} });
    await first;
  });

  it('swallows failures while cancelling a scan', async () => {
    stubApi({
      invoke: vi.fn(),
      on: vi.fn(),
      cancelLibraryScan: vi.fn().mockRejectedValue(new Error('nope'))
    });
    const load = useLibraryLoad(makeCtx());

    await expect(load.cancelScan()).resolves.toBeUndefined();
  });
});
