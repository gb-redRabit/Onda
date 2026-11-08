import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick, ref } from 'vue';
import { createSourcesDownloads } from '../downloads';

const state = vi.hoisted(() => ({
  settings: { download: { autoAddDownloadFolder: true } },
  buildInput: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn()
}));

vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@shared/logger', () => ({
  logger: { warn: state.warn, info: state.info, error: state.error }
}));
vi.mock('@renderer/utils/sourceDownload', () => ({
  buildSourceDownloadInput: state.buildInput
}));

function source(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    name: 'Source',
    baseUrl: 'https://api.example.com',
    endpoints: [],
    download: { outputDir: '' },
    ...overrides
  } as any;
}

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item1',
    title: 'Item',
    playerUrl: 'https://cdn.example/v.mp4',
    mediaUrl: '',
    sourceUrl: '',
    ...overrides
  } as any;
}

function setup(initial: any = source()) {
  const activeRef = ref<any>(initial);
  const scoped = computed(() => activeRef.value);
  const downloads = createSourcesDownloads({ activeSource: scoped });
  return { downloads, activeRef };
}

beforeEach(() => {
  state.settings.download.autoAddDownloadFolder = true;
  state.buildInput.mockReset();
  state.buildInput.mockImplementation((args: any) => ({ input: args.item.id, ...args }));
  state.invoke.mockReset();
  state.invoke.mockResolvedValue([]);
  state.on.mockReset();
  state.warn.mockReset();
  (window as { api?: unknown }).api = {
    invoke: state.invoke,
    on: state.on
  };
});

afterEach(() => {
  delete (window as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('downloaded ids', () => {
  it('loads ids immediately for the active source', async () => {
    state.invoke.mockResolvedValue(['a', 'b']);
    const { downloads } = setup();
    await nextTick();
    await Promise.resolve();
    await Promise.resolve();

    expect(state.invoke).toHaveBeenCalledWith('sources:downloaded', 's1');
    expect([...downloads.downloadedIds.value]).toEqual(['a', 'b']);
  });

  it('clears the set without an active source', async () => {
    const { downloads } = setup(null);
    await nextTick();
    expect(state.invoke).not.toHaveBeenCalledWith('sources:downloaded', '');
    expect(downloads.downloadedIds.value.size).toBe(0);

    await downloads.loadDownloaded('');
    expect(downloads.downloadedIds.value.size).toBe(0);
  });

  it('handles missing and thrown responses', async () => {
    const { downloads } = setup(null);
    state.invoke.mockResolvedValueOnce(undefined);
    await downloads.loadDownloaded('s2');
    expect(downloads.downloadedIds.value.size).toBe(0);

    state.invoke.mockRejectedValueOnce(new Error('ipc'));
    await downloads.loadDownloaded('s2');
    expect(state.warn).toHaveBeenCalledWith('sources', 'loadDownloaded failed', expect.any(Error));
    expect(downloads.downloadedIds.value.size).toBe(0);
  });

  it('ignores stale responses when the source changes', async () => {
    let resolveA: (value: string[]) => void = () => {};
    state.invoke.mockImplementationOnce(
      () => new Promise<string[]>((resolve) => (resolveA = resolve))
    );
    const { downloads } = setup();
    await nextTick();

    state.invoke.mockResolvedValueOnce(['b']);
    await downloads.loadDownloaded('s2');
    expect([...downloads.downloadedIds.value]).toEqual(['b']);

    resolveA(['a']);
    await Promise.resolve();
    await Promise.resolve();
    expect([...downloads.downloadedIds.value]).toEqual(['b']);
  });

  it('ignores stale failures', async () => {
    let rejectA: (error: Error) => void = () => {};
    state.invoke.mockImplementationOnce(
      () => new Promise((_resolve, reject) => (rejectA = reject))
    );
    const { downloads } = setup();
    await nextTick();

    state.invoke.mockResolvedValueOnce(['b']);
    await downloads.loadDownloaded('s2');

    rejectA(new Error('late'));
    await Promise.resolve();
    await Promise.resolve();
    expect([...downloads.downloadedIds.value]).toEqual(['b']);
    expect(state.warn).toHaveBeenCalledTimes(1);
  });

  it('marks items once and replaces the set', () => {
    const { downloads } = setup();
    const handler = state.on.mock.calls[0][1];
    handler({ status: 'completed', source: { sourceId: 's1', sourceItemId: 'a' } });
    const first = downloads.downloadedIds.value;
    expect([...first]).toEqual(['a']);

    handler({ status: 'completed', source: { sourceId: 's1', sourceItemId: 'a' } });
    expect(downloads.downloadedIds.value).toBe(first);

    handler({ status: 'completed', source: { sourceId: 's1', sourceItemId: 'b' } });
    expect(downloads.downloadedIds.value).not.toBe(first);
    expect([...downloads.downloadedIds.value]).toEqual(['a', 'b']);
  });
});

describe('unmarking', () => {
  it('removes an item through IPC and replaces the set', async () => {
    const { downloads } = setup();
    await nextTick();
    state.invoke.mockResolvedValueOnce(['b']);
    expect(await downloads.unmarkDownloaded('a')).toBe(true);
    expect(state.invoke).toHaveBeenCalledWith('sources:unmarkDownloaded', 's1', ['a']);
    expect([...downloads.downloadedIds.value]).toEqual(['b']);
  });

  it('returns false without a source or item and on failures', async () => {
    const { downloads } = setup(null);
    expect(await downloads.unmarkDownloaded('a')).toBe(false);

    const withSource = setup();
    expect(await withSource.downloads.unmarkDownloaded('')).toBe(false);

    state.invoke.mockRejectedValueOnce(new Error('ipc'));
    expect(await withSource.downloads.unmarkDownloaded('a')).toBe(false);
    expect(state.warn).toHaveBeenCalledWith(
      'sources',
      'unmarkDownloaded failed',
      expect.any(Error)
    );
  });

  it('treats a missing response as an empty set', async () => {
    const { downloads } = setup();
    await nextTick();
    state.invoke.mockResolvedValueOnce(undefined);
    expect(await downloads.unmarkDownloaded('a')).toBe(true);
    expect(downloads.downloadedIds.value.size).toBe(0);
  });
});

describe('download progress subscription', () => {
  it('marks matching completed items once', () => {
    const { downloads } = setup();
    expect(state.on).toHaveBeenCalledWith('yt:downloadProgress', expect.any(Function));
    const handler = state.on.mock.calls[0][1];

    handler({ status: 'downloading', source: { sourceId: 's1', sourceItemId: 'x' } });
    expect(downloads.downloadedIds.value.size).toBe(0);

    handler({ status: 'completed', source: {} });
    handler({ status: 'completed', source: { sourceId: 'other', sourceItemId: 'x' } });
    handler({ status: 'completed', source: { sourceId: 's1' } });
    handler({ status: 'completed', source: { sourceId: 's1', sourceItemId: 'x' } });
    expect([...downloads.downloadedIds.value]).toEqual(['x']);

    handler({ status: 'completed', source: { sourceId: 's1', sourceItemId: 'x' } });
    expect([...downloads.downloadedIds.value]).toEqual(['x']);
  });

  it('tolerates malformed progress payloads and missing bridges', () => {
    const { downloads } = setup();
    const handler = state.on.mock.calls[0][1];
    expect(() => handler(null)).not.toThrow();
    expect(() => handler({ status: 'completed' })).not.toThrow();
    expect(downloads.downloadedIds.value.size).toBe(0);
  });

  it('subscribes at most once per store instance', () => {
    const active = ref(source());
    createSourcesDownloads({ activeSource: computed(() => active.value) });
    expect(state.on).toHaveBeenCalledTimes(1);
  });
});

describe('enqueueDownload', () => {
  it('uses the source output directory and auto-add setting', async () => {
    const { downloads } = setup(source({ download: { outputDir: ' D:/out ' } }));
    await nextTick();
    state.invoke.mockResolvedValue([{ id: 'task' }]);

    expect(await downloads.enqueueDownload(item(), { addToLibrary: false })).toEqual({
      ok: true
    });
    expect(state.buildInput).toHaveBeenCalledWith({
      item: item(),
      source: expect.objectContaining({ id: 's1' }),
      baseDir: 'D:/out',
      outputDir: undefined,
      addToLibrary: false,
      autoAddToLibrary: true
    });
    expect(state.invoke).toHaveBeenCalledWith('sources:enqueue', [expect.any(Object)]);
  });

  it('falls back to the IPC download directory', async () => {
    const { downloads } = setup();
    await nextTick();
    state.invoke.mockImplementation(async (channel: string) => {
      if (channel === 'sources:downloadDir') return 'E:/downloads';
      return [{ id: 'task' }];
    });
    expect(await downloads.enqueueDownload(item())).toEqual({ ok: true });
    expect(state.buildInput.mock.calls[0][0].baseDir).toBe('E:/downloads');
  });

  it('rejects missing URLs and sources', async () => {
    const noSource = setup(null);
    expect(await noSource.downloads.enqueueDownload(item())).toEqual({
      ok: false,
      error: 'No URL'
    });

    const { downloads } = setup();
    expect(
      await downloads.enqueueDownload(item({ playerUrl: '', mediaUrl: '', sourceUrl: '' }))
    ).toEqual({ ok: false, error: 'No URL' });
    expect(state.invoke).not.toHaveBeenCalledWith('sources:enqueue', expect.anything());
  });

  it('accepts media and source URLs as fallbacks', async () => {
    const { downloads } = setup();
    await nextTick();
    state.invoke.mockImplementation(async (channel: string) =>
      channel === 'sources:downloadDir' ? 'E:/downloads' : [{ id: 'task' }]
    );
    expect(
      await downloads.enqueueDownload(
        item({ playerUrl: '', mediaUrl: 'https://m', sourceUrl: 's' })
      )
    ).toEqual({ ok: true });

    state.invoke.mockImplementation(async (channel: string) =>
      channel === 'sources:downloadDir' ? 'E:/downloads' : []
    );
    expect(
      await downloads.enqueueDownload(item({ playerUrl: '', mediaUrl: '', sourceUrl: 's' }))
    ).toEqual({ ok: false });
  });

  it('reports IPC failures as text', async () => {
    const { downloads } = setup();
    await nextTick();
    state.invoke.mockImplementation(async (channel: string) => {
      if (channel === 'sources:downloadDir') return 'E:/downloads';
      throw new Error('queue full');
    });
    expect(await downloads.enqueueDownload(item())).toEqual({
      ok: false,
      error: 'queue full'
    });

    state.invoke.mockImplementation(async (channel: string) => {
      if (channel === 'sources:downloadDir') return 'E:/downloads';
      throw 'plain';
    });
    expect(await downloads.enqueueDownload(item())).toEqual({ ok: false, error: 'plain' });
    expect(state.warn).toHaveBeenCalledTimes(2);
  });
});

describe('enqueueAll', () => {
  it('queues every item with one IPC call', async () => {
    const { downloads } = setup();
    await nextTick();
    state.invoke.mockImplementation(async (channel: string) => {
      if (channel === 'sources:downloadDir') return 'E:/downloads';
      return [{ id: 'a' }, { id: 'b' }];
    });
    const list = [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'skip', playerUrl: '' })];

    expect(await downloads.enqueueAll(list)).toEqual({ queued: 2, failed: 0, errors: [] });
    expect(state.invoke).toHaveBeenCalledWith('sources:downloadDir');
    expect(state.invoke).toHaveBeenCalledWith('sources:enqueue', expect.any(Array));
    expect(state.invoke.mock.calls.filter((call) => call[0] === 'sources:enqueue')).toHaveLength(1);
    expect(state.buildInput).toHaveBeenCalledTimes(2);
    expect(state.buildInput.mock.calls[0][0].autoAddToLibrary).toBe(true);
  });

  it('skips the directory lookup when the source defines one', async () => {
    const { downloads } = setup(source({ download: { outputDir: 'D:/out' } }));
    await nextTick();
    state.invoke.mockResolvedValue([{ id: 'a' }]);
    expect(await downloads.enqueueAll([item()])).toEqual({
      queued: 1,
      failed: 0,
      errors: []
    });
    expect(state.invoke).not.toHaveBeenCalledWith('sources:downloadDir');
    expect(state.buildInput.mock.calls[0][0].baseDir).toBe('D:/out');
  });

  it('continues after a directory lookup failure', async () => {
    const { downloads } = setup();
    await nextTick();
    state.invoke.mockImplementation(async (channel: string) => {
      if (channel === 'sources:downloadDir') throw new Error('no dir');
      return [{ id: 'a' }];
    });
    expect(await downloads.enqueueAll([item()])).toEqual({
      queued: 1,
      failed: 0,
      errors: []
    });
    expect(state.warn).toHaveBeenCalledWith(
      'sources',
      'enqueueAll: downloadDir failed',
      expect.any(Error)
    );
    expect(state.buildInput.mock.calls[0][0].baseDir).toBe('');
  });

  it('returns early without a source or usable items', async () => {
    const noSource = setup(null);
    expect(await noSource.downloads.enqueueAll([item()])).toEqual({
      queued: 0,
      failed: 0,
      errors: []
    });

    const { downloads } = setup();
    await nextTick();
    state.invoke.mockClear();
    expect(await downloads.enqueueAll([item({ playerUrl: '' })])).toEqual({
      queued: 0,
      failed: 0,
      errors: []
    });
    expect(state.invoke).not.toHaveBeenCalled();
  });

  it('reports the difference between inputs and created tasks', async () => {
    const { downloads } = setup();
    await nextTick();
    state.invoke.mockImplementation(async (channel: string) => {
      if (channel === 'sources:downloadDir') return 'E:/downloads';
      return [{ id: 'a' }];
    });
    expect(await downloads.enqueueAll([item({ id: 'a' }), item({ id: 'b' })])).toEqual({
      queued: 1,
      failed: 1,
      errors: []
    });
  });

  it('reports enqueue failures with the item count', async () => {
    const { downloads } = setup();
    await nextTick();
    state.invoke.mockImplementation(async (channel: string) => {
      if (channel === 'sources:downloadDir') return 'E:/downloads';
      throw new Error('batch failed');
    });
    expect(await downloads.enqueueAll([item(), item({ id: 'b' })])).toEqual({
      queued: 0,
      failed: 2,
      errors: ['batch failed']
    });

    state.invoke.mockImplementation(async (channel: string) => {
      if (channel === 'sources:downloadDir') return 'E:/downloads';
      throw 'plain';
    });
    expect(await downloads.enqueueAll([item()])).toEqual({
      queued: 0,
      failed: 1,
      errors: ['plain']
    });
  });
});
