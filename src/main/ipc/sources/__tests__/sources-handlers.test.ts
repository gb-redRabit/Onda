import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => any>,
  getPath: vi.fn(),
  fromWebContents: vi.fn(),
  showSaveDialog: vi.fn(),
  showOpenDialog: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn(),
  loadSources: vi.fn(),
  saveSource: vi.fn(),
  deleteSource: vi.fn(),
  reorderSources: vi.fn(),
  saveAllSources: vi.fn(),
  sanitizeImportedSource: vi.fn(),
  sanitizeSource: vi.fn(),
  sanitizeEndpoint: vi.fn(),
  applySourceTrust: vi.fn(),
  getStore: vi.fn(),
  fetchSourceItems: vi.fn(),
  testSourceConnection: vi.fn(),
  fetchTableRows: vi.fn(),
  resolveSourceHeaders: vi.fn(),
  registerPlayableMediaUrls: vi.fn(),
  scrapePlayerUrl: vi.fn(),
  resolveNetworkTarget: vi.fn(),
  privateNetworkAllowed: vi.fn(),
  addDownloadJobs: vi.fn(),
  setDownloadedHandler: vi.fn(),
  appendDownloadedItem: vi.fn(),
  getDownloadedForSource: vi.fn(),
  removeDownloadedItems: vi.fn(),
  warn: vi.fn(),
  mapLimit: vi.fn()
}));

vi.mock('electron', () => ({
  app: { getPath: state.getPath },
  BrowserWindow: { fromWebContents: state.fromWebContents },
  dialog: {
    showSaveDialog: state.showSaveDialog,
    showOpenDialog: state.showOpenDialog
  },
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => any) => {
      state.handlers[channel] = fn;
    }
  }
}));
vi.mock('path', () => ({ join: (...parts: string[]) => parts.join('/') }));
vi.mock('fs/promises', () => ({
  writeFile: state.writeFile,
  readFile: state.readFile
}));
vi.mock('../sources-store', () => ({
  loadSources: state.loadSources,
  saveSource: state.saveSource,
  deleteSource: state.deleteSource,
  reorderSources: state.reorderSources,
  saveAllSources: state.saveAllSources,
  sanitizeImportedSource: state.sanitizeImportedSource,
  sanitizeSource: state.sanitizeSource,
  sanitizeEndpoint: state.sanitizeEndpoint,
  applySourceTrust: state.applySourceTrust
}));
vi.mock('../../cover/cover-cache', () => ({ getStore: state.getStore }));
vi.mock('../../generic-fetch', () => ({
  fetchSourceItems: state.fetchSourceItems,
  testSourceConnection: state.testSourceConnection,
  fetchTableRows: state.fetchTableRows,
  resolveSourceHeaders: state.resolveSourceHeaders,
  registerPlayableMediaUrls: state.registerPlayableMediaUrls
}));
vi.mock('../../player-scraper', () => ({ scrapePlayerUrl: state.scrapePlayerUrl }));
vi.mock('../../network-target', () => ({
  resolveNetworkTarget: state.resolveNetworkTarget,
  privateNetworkAllowedForTarget: state.privateNetworkAllowed
}));
vi.mock('../../../downloads/download-manager', () => ({
  addDownloadJobs: state.addDownloadJobs,
  setSourceItemDownloadedHandler: state.setDownloadedHandler
}));
vi.mock('../sources-downloaded-store', () => ({
  appendDownloadedItem: state.appendDownloadedItem,
  getDownloadedForSource: state.getDownloadedForSource,
  removeDownloadedItems: state.removeDownloadedItems
}));
vi.mock('../../../../shared/logger', () => ({
  logger: { warn: state.warn, info: vi.fn(), error: vi.fn() }
}));
vi.mock('../../../utils/map-limit', () => ({ mapLimit: state.mapLimit }));
vi.mock('../../../../shared/constants', () => ({ CHROME_USER_AGENT: 'Chrome-UA' }));

async function load() {
  vi.resetModules();
  const module = await import('../sources-handlers');
  module.registerSourcesHandlers();
  return state.handlers;
}

function source(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    name: 'Source',
    baseUrl: 'https://api.example.com',
    auth: { type: 'none' },
    endpoints: [{ id: 'e1', name: 'E', method: 'GET', path: '/', mapping: { fields: {} } }],
    createdAt: 0,
    ...overrides
  } as any;
}

beforeEach(() => {
  state.handlers = {};
  for (const value of Object.values(state)) {
    if (value && typeof value === 'object' && 'mockReset' in value) {
      (value as { mockReset: () => void }).mockReset();
    }
  }
  state.getPath.mockImplementation((name: string) => `C:/${name}`);
  state.loadSources.mockResolvedValue([source()]);
  state.saveSource.mockResolvedValue({ list: [], saved: null });
  state.deleteSource.mockResolvedValue([]);
  state.reorderSources.mockResolvedValue([]);
  state.saveAllSources.mockResolvedValue(undefined);
  state.sanitizeSource.mockImplementation((value: unknown) => value as any);
  state.sanitizeImportedSource.mockImplementation((value: unknown) => value as any);
  state.sanitizeEndpoint.mockImplementation((value: unknown) => value as any);
  state.applySourceTrust.mockImplementation((value: unknown) => value as any);
  state.getStore.mockResolvedValue({ get: () => undefined });
  state.fetchSourceItems.mockResolvedValue({ items: [{}], hasMore: false });
  state.testSourceConnection.mockResolvedValue({ success: true });
  state.fetchTableRows.mockResolvedValue([{ id: 'row' }]);
  state.resolveSourceHeaders.mockResolvedValue({ Authorization: 'key' });
  state.scrapePlayerUrl.mockResolvedValue(null);
  state.resolveNetworkTarget.mockResolvedValue(undefined);
  state.privateNetworkAllowed.mockReturnValue(true);
  state.addDownloadJobs.mockImplementation(async (jobs: unknown[]) => jobs);
  state.appendDownloadedItem.mockResolvedValue(undefined);
  state.getDownloadedForSource.mockReturnValue([]);
  state.removeDownloadedItems.mockResolvedValue([]);
  state.mapLimit.mockImplementation(
    (items: unknown[], _limit: number, fn: (item: unknown) => unknown) => Promise.all(items.map(fn))
  );
  state.showSaveDialog.mockResolvedValue({ canceled: false, filePath: 'C:/export.json' });
  state.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['C:/import.json'] });
  state.writeFile.mockResolvedValue(undefined);
  state.readFile.mockResolvedValue('{"version":1,"sources":[]}');
  state.fromWebContents.mockReturnValue({ id: 1 });
});

describe('registration and downloaded marks', () => {
  it('registers channels and forwards completion marks', async () => {
    await load();
    expect(state.setDownloadedHandler).toHaveBeenCalled();
    const handler = state.setDownloadedHandler.mock.calls[0][0];
    handler('s1', 'item1');
    await Promise.resolve();
    expect(state.appendDownloadedItem).toHaveBeenCalledWith(
      'C:/userData/sources-downloaded.json',
      's1',
      'item1'
    );
    expect(Object.keys(state.handlers)).toEqual(
      expect.arrayContaining([
        'sources:list',
        'sources:downloaded',
        'sources:unmarkDownloaded',
        'sources:export',
        'sources:import',
        'sources:downloadDir',
        'sources:save',
        'sources:delete',
        'sources:reorder',
        'sources:test',
        'sources:fetch',
        'sources:tableRows',
        'sources:enqueue'
      ])
    );
  });

  it('lists, reads and clears downloaded items with sanitised arguments', async () => {
    const h = await load();
    expect(await h['sources:list']()).toEqual([source()]);

    await h['sources:downloaded']({}, 42);
    expect(state.getDownloadedForSource).toHaveBeenCalledWith(
      'C:/userData/sources-downloaded.json',
      ''
    );

    await h['sources:unmarkDownloaded']({}, 's1', ['a', 2, 'b']);
    expect(state.removeDownloadedItems).toHaveBeenCalledWith(
      'C:/userData/sources-downloaded.json',
      's1',
      ['a', 'b']
    );

    await h['sources:unmarkDownloaded']({}, 's1', 'bad');
    expect(state.removeDownloadedItems).toHaveBeenLastCalledWith(
      'C:/userData/sources-downloaded.json',
      's1',
      []
    );
  });

  it('deletes sources and clears their downloaded marks', async () => {
    const h = await load();
    await h['sources:delete']({}, 's1');
    expect(state.deleteSource).toHaveBeenCalledWith('C:/userData/sources.json', 's1');
    expect(state.removeDownloadedItems).toHaveBeenCalledWith(
      'C:/userData/sources-downloaded.json',
      's1',
      []
    );

    state.removeDownloadedItems.mockClear();
    await h['sources:delete']({}, 5);
    expect(state.deleteSource).toHaveBeenLastCalledWith('C:/userData/sources.json', '');
    expect(state.removeDownloadedItems).not.toHaveBeenCalled();
  });

  it('saves and reorders with filtered ids', async () => {
    const h = await load();
    await h['sources:save']({}, { raw: true });
    expect(state.saveSource).toHaveBeenCalledWith('C:/userData/sources.json', { raw: true });

    await h['sources:reorder']({}, ['a', 1, 'b']);
    expect(state.reorderSources).toHaveBeenCalledWith('C:/userData/sources.json', ['a', 'b']);

    await h['sources:reorder']({}, null);
    expect(state.reorderSources).toHaveBeenLastCalledWith('C:/userData/sources.json', []);
  });
});

describe('export and import', () => {
  it('exports sources through a saved file', async () => {
    const h = await load();
    await expect(h['sources:export']({ sender: {} })).resolves.toEqual({ success: true });
    expect(state.showSaveDialog).toHaveBeenCalled();
    expect(state.writeFile).toHaveBeenCalledWith(
      'C:/export.json',
      JSON.stringify({ version: 1, sources: [source()] }, null, 2),
      'utf-8'
    );
  });

  it('uses a windowless dialog and handles cancellation and write errors', async () => {
    const h = await load();
    state.fromWebContents.mockReturnValue(null);
    await h['sources:export']({ sender: {} });
    expect(state.showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Eksportuj źródła' })
    );

    state.showSaveDialog.mockResolvedValueOnce({ canceled: true });
    await expect(h['sources:export']({ sender: {} })).resolves.toEqual({
      success: false,
      canceled: true
    });

    state.writeFile.mockRejectedValueOnce(new Error('disk'));
    await expect(h['sources:export']({ sender: {} })).resolves.toEqual({
      success: false,
      error: 'disk'
    });
  });

  it('imports arrays and object payloads, renaming duplicate ids', async () => {
    const h = await load();
    state.readFile.mockResolvedValueOnce(
      JSON.stringify({ version: 1, sources: [{ id: 's1' }, { id: 'new' }] })
    );
    const result = await h['sources:import']({ sender: {} });

    expect(result).toMatchObject({ success: true, count: 2 });
    expect(state.sanitizeImportedSource).toHaveBeenCalledTimes(2);
    expect(state.saveAllSources).toHaveBeenCalled();
    const saved = state.saveAllSources.mock.calls[0][1];
    expect(saved[1].id).toMatch(/^import-/);
  });

  it('accepts a bare array and skips invalid entries', async () => {
    const h = await load();
    state.readFile.mockResolvedValueOnce(JSON.stringify([{ id: 'a' }, null]));
    state.sanitizeImportedSource.mockImplementationOnce((v: any) => v).mockReturnValueOnce(null);

    const result = await h['sources:import']({ sender: {} });
    expect(result).toMatchObject({ success: true, count: 1 });
  });

  it('handles cancel, invalid files and read errors', async () => {
    const h = await load();
    state.showOpenDialog.mockResolvedValueOnce({ canceled: true });
    await expect(h['sources:import']({ sender: {} })).resolves.toEqual({
      success: false,
      canceled: true
    });

    state.readFile.mockResolvedValueOnce('{"sources": "nope"}');
    await expect(h['sources:import']({ sender: {} })).resolves.toEqual({
      success: false,
      error: 'Invalid file'
    });

    state.readFile.mockResolvedValueOnce('not json');
    const invalid = await h['sources:import']({ sender: {} });
    expect(invalid.success).toBe(false);
    expect(invalid.error).toBeTruthy();
  });
});

describe('download directory', () => {
  it('prefers the sources dir, then downloads/api, then system downloads', async () => {
    state.readFile.mockReset();
    state.getStore.mockResolvedValueOnce({ get: () => ({ sourcesDir: ' D:/src/ ' }) });
    const h = await load();
    expect(await h['sources:downloadDir']()).toBe('D:/src');

    state.getStore.mockResolvedValueOnce({ get: () => ({ defaultPath: 'D:/dl/' }) });
    expect(await h['sources:downloadDir']()).toBe('D:/dl//api');

    state.getStore.mockRejectedValueOnce(new Error('store'));
    expect(await h['sources:downloadDir']()).toBe('C:/downloads/api');
  });
});

describe('test, fetch and table rows', () => {
  it('validates and resolves a trusted source before testing', async () => {
    const h = await load();
    state.sanitizeSource.mockReturnValueOnce(null);
    await expect(h['sources:test']({}, {}, {})).resolves.toEqual({
      success: false,
      error: 'Invalid source'
    });

    state.testSourceConnection.mockResolvedValueOnce({ success: true });
    const result = await h['sources:test']({}, source(), source().endpoints[0], { ctx: 1 }, true);
    expect(state.applySourceTrust).toHaveBeenCalled();
    expect(state.testSourceConnection).toHaveBeenCalledWith(source(), source().endpoints[0], {
      context: { ctx: 1 },
      includeRaw: true
    });
    expect(result).toEqual({
      success: true,
      error: undefined,
      sample: null,
      raw: null,
      headers: null
    });
  });

  it('fetches items, registers playable URLs and passes options', async () => {
    const h = await load();
    const res = await h['sources:fetch']({}, source(), undefined, { page: 2 });
    expect(state.fetchSourceItems).toHaveBeenCalledWith(source(), source().endpoints[0], {
      page: 2
    });
    expect(state.registerPlayableMediaUrls).toHaveBeenCalledWith(res.items);
    expect(res).toEqual({ items: [{}], hasMore: false });
  });

  it('returns invalid-source errors and empty table rows', async () => {
    const h = await load();
    state.sanitizeEndpoint.mockReturnValueOnce(null);
    expect(await h['sources:fetch']({}, source(), undefined)).toEqual({
      items: [],
      hasMore: false,
      error: 'Invalid source'
    });
    state.sanitizeEndpoint.mockReturnValueOnce(null);
    expect(await h['sources:tableRows']({}, source(), undefined, {})).toEqual([]);
  });

  it('returns table rows for valid sources', async () => {
    const h = await load();
    expect(
      await h['sources:tableRows']({}, source(), source().endpoints[0], { context: {} })
    ).toEqual([{ id: 'row' }]);
    expect(state.fetchTableRows).toHaveBeenCalledWith(source(), source().endpoints[0], {
      context: {}
    });
  });
});

describe('enqueue', () => {
  const input = (overrides: Record<string, unknown> = {}) =>
    ({
      url: 'https://cdn.example.com/video.mp4',
      title: 'Video',
      ...overrides
    }) as any;

  it('drops malformed inputs and returns early', async () => {
    const h = await load();
    expect(await h['sources:enqueue']({}, null)).toEqual([]);
    expect(await h['sources:enqueue']({}, [{ url: 1, title: 'x' }, { url: 'u' }])).toEqual([]);
    expect(state.addDownloadJobs).not.toHaveBeenCalled();
  });

  it('validates targets and forwards jobs', async () => {
    const h = await load();
    const jobs = [input(), input({ url: 'https://other.example/x', title: 'Other' })];
    const result = await h['sources:enqueue']({}, jobs);

    expect(state.resolveNetworkTarget).toHaveBeenCalledTimes(2);
    expect(state.addDownloadJobs).toHaveBeenCalledWith(jobs);
    expect(result).toEqual(jobs);
  });

  it('binds private network trust to the stored source origin', async () => {
    const h = await load();
    state.loadSources.mockResolvedValueOnce([
      source({ id: 's1', baseUrl: 'https://trusted.example', allowPrivateNetwork: true })
    ]);
    const job = input({
      url: 'https://trusted.example/file',
      source: { sourceId: 's1', mode: 'http' }
    });

    await h['sources:enqueue']({}, [job]);

    expect(state.privateNetworkAllowed).toHaveBeenCalledWith(
      'https://trusted.example/file',
      'https://trusted.example',
      true
    );
    expect(job.source.allowPrivateNetwork).toBe(true);
  });

  it('scrapes yt-dlp fallbacks and adds auth only for the source origin', async () => {
    const h = await load();
    state.loadSources.mockResolvedValueOnce([
      source({ id: 's1', baseUrl: 'https://trusted.example' })
    ]);
    state.scrapePlayerUrl.mockResolvedValueOnce({
      url: 'https://cdn.example/stream.m3u8',
      kind: 'hls',
      referer: 'https://trusted.example'
    });

    const job = input({
      url: 'https://trusted.example/embed/1',
      source: { sourceId: 's1', mode: 'ytdlp', apiKeyId: 'k', headerName: 'X-Key' }
    });
    await h['sources:enqueue']({}, [job]);

    expect(state.resolveSourceHeaders).toHaveBeenCalledWith('k', 'X-Key');
    expect(state.scrapePlayerUrl).toHaveBeenCalledWith(
      'https://trusted.example/embed/1',
      { Authorization: 'key' },
      false
    );
    expect(job.url).toBe('https://cdn.example/stream.m3u8');
    expect(job.source).toMatchObject({
      mode: 'ytdlp',
      headers: {
        Referer: 'https://trusted.example',
        'User-Agent': 'Chrome-UA'
      }
    });
  });

  it('does not send credentials to a different origin', async () => {
    const h = await load();
    state.loadSources.mockResolvedValueOnce([
      source({ id: 's1', baseUrl: 'https://trusted.example' })
    ]);
    state.scrapePlayerUrl.mockResolvedValueOnce({
      url: 'https://cdn.example/direct.mp4',
      kind: 'direct',
      referer: 'https://x'
    });

    const job = input({
      url: 'https://evil.example/embed',
      source: { sourceId: 's1', mode: 'ytdlp', apiKeyId: 'k', headerName: 'X-Key' }
    });
    await h['sources:enqueue']({}, [job]);

    expect(state.resolveSourceHeaders).not.toHaveBeenCalled();
    expect(state.scrapePlayerUrl).toHaveBeenCalledWith('https://evil.example/embed', {}, false);
    expect(job.source.mode).toBe('http');
  });

  it('skips blocked targets but keeps valid jobs', async () => {
    const h = await load();
    state.resolveNetworkTarget
      .mockRejectedValueOnce(new Error('blocked'))
      .mockResolvedValueOnce(undefined);
    const blocked = input({ url: 'http://127.0.0.1/x', title: 'Blocked' });
    const ok = input({ url: 'https://ok.example/x', title: 'OK' });

    const result = await h['sources:enqueue']({}, [blocked, ok]);

    expect(state.warn).toHaveBeenCalledWith(
      'sources',
      'blocked download target for Blocked',
      expect.any(Error)
    );
    expect(result).toEqual([ok]);
  });

  it('returns an empty list when source loading fails', async () => {
    const h = await load();
    state.loadSources.mockRejectedValueOnce(new Error('store'));
    expect(await h['sources:enqueue']({}, [input()])).toEqual([]);
    expect(state.warn).toHaveBeenCalledWith('sources', 'sources:enqueue failed', expect.any(Error));
  });
});
