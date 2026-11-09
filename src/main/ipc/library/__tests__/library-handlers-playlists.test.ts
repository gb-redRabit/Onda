import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  showSaveDialog: vi.fn(),
  fromWebContents: vi.fn(),
  getStore: vi.fn(),
  writeFile: vi.fn(),
  loggerError: vi.fn(),
  store: null as any
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) => {
      state.handlers.set(channel, handler);
    }
  },
  dialog: { showSaveDialog: state.showSaveDialog },
  BrowserWindow: { fromWebContents: state.fromWebContents }
}));
vi.mock('../../cover/cover-cache', () => ({ getStore: state.getStore }));
vi.mock('fs/promises', () => ({ writeFile: state.writeFile }));
vi.mock('../../../../shared/logger', () => ({
  logger: { error: state.loggerError, warn: vi.fn(), info: vi.fn() }
}));

import { registerPlaylistHandlers } from '../library-handlers-playlists';

const window = { id: 1 };

function call(channel: string, ...args: any[]) {
  return state.handlers.get(channel)!(...args);
}

function playlist(overrides: Record<string, unknown> = {}) {
  return { id: 'p1', name: 'List', tracks: [], ...overrides };
}

function smart(overrides: Record<string, unknown> = {}) {
  return { id: 's1', name: 'Smart', match: 'all', rules: [], ...overrides };
}

beforeEach(() => {
  state.handlers.clear();
  state.showSaveDialog.mockReset();
  state.showSaveDialog.mockResolvedValue({ canceled: false, filePath: 'C:/out/list.m3u' });
  state.fromWebContents.mockReset();
  state.fromWebContents.mockReturnValue(window);
  state.store = {
    data: {} as Record<string, unknown>,
    get(key: string, fallback: unknown) {
      return key in this.data ? this.data[key] : fallback;
    },
    set: vi.fn((key: string, value: unknown) => {
      state.store.data[key] = value;
    })
  };
  state.getStore.mockReset();
  state.getStore.mockResolvedValue(state.store);
  state.writeFile.mockReset();
  state.writeFile.mockResolvedValue(undefined);
  state.loggerError.mockReset();
  registerPlaylistHandlers();
});

describe('registration', () => {
  it('registers every playlist channel', () => {
    expect([...state.handlers.keys()]).toEqual([
      'playlist:loadAll',
      'playlist:saveAll',
      'smartPlaylists:loadAll',
      'smartPlaylists:saveAll',
      'playlist:export'
    ]);
  });
});

describe('library playlists', () => {
  it('loads a valid stored array', async () => {
    state.store.data.playlists = [playlist()];
    await expect(call('playlist:loadAll')).resolves.toEqual([playlist()]);
  });

  it('falls back for invalid or missing data', async () => {
    state.store.data.playlists = [{ id: 'x' }];
    await expect(call('playlist:loadAll')).resolves.toEqual([]);

    state.store.data.playlists = 'nope';
    await expect(call('playlist:loadAll')).resolves.toEqual([]);
  });

  it('logs load failures', async () => {
    state.getStore.mockRejectedValueOnce(new Error('no store'));
    await expect(call('playlist:loadAll')).resolves.toEqual([]);
    expect(state.loggerError).toHaveBeenCalledWith(
      'library',
      'loadPlaylists failed',
      expect.any(Error)
    );
  });

  it('saves the incoming array', async () => {
    const list = [playlist()];
    await call('playlist:saveAll', {}, list);
    expect(state.store.set).toHaveBeenCalledWith('playlists', list);
  });

  it('logs save failures', async () => {
    state.getStore.mockRejectedValueOnce(new Error('disk'));
    await expect(call('playlist:saveAll', {}, [])).resolves.toBeUndefined();
    expect(state.loggerError).toHaveBeenCalledWith(
      'library',
      'savePlaylists failed',
      expect.any(Error)
    );
  });
});

describe('smart playlists', () => {
  it('loads a valid array', async () => {
    state.store.data.smartPlaylists = [smart()];
    await expect(call('smartPlaylists:loadAll')).resolves.toEqual([smart()]);
  });

  it('rejects items without the required shape', async () => {
    state.store.data.smartPlaylists = [
      smart({ match: 'some' }),
      smart({ rules: null }),
      smart({ id: 1 }),
      null
    ];
    await expect(call('smartPlaylists:loadAll')).resolves.toEqual([]);
  });

  it('logs load failures', async () => {
    state.getStore.mockRejectedValueOnce(new Error('no store'));
    await expect(call('smartPlaylists:loadAll')).resolves.toEqual([]);
    expect(state.loggerError).toHaveBeenCalledWith(
      'library',
      'loadSmartPlaylists failed',
      expect.any(Error)
    );
  });

  it('saves valid arrays and rejects invalid ones', async () => {
    await call('smartPlaylists:saveAll', {}, [smart()]);
    expect(state.store.set).toHaveBeenCalledWith('smartPlaylists', [smart()]);

    state.store.set.mockClear();
    await call('smartPlaylists:saveAll', {}, [{ name: 'broken' }]);
    expect(state.store.set).not.toHaveBeenCalled();
  });

  it('logs save failures', async () => {
    state.getStore.mockRejectedValueOnce(new Error('disk'));
    await expect(call('smartPlaylists:saveAll', {}, [smart()])).resolves.toBeUndefined();
    expect(state.loggerError).toHaveBeenCalledWith(
      'library',
      'saveSmartPlaylists failed',
      expect.any(Error)
    );
  });
});

describe('M3U export', () => {
  const input = {
    id: 'p1',
    name: 'My List',
    tracks: ['C:/media/a.mp3', 'C:/media/b.flac']
  };

  it('requires a window and a valid payload', async () => {
    state.fromWebContents.mockReturnValueOnce(null);
    await expect(call('playlist:export', { sender: {} }, input)).resolves.toEqual({
      success: false,
      error: 'No window'
    });

    await expect(call('playlist:export', { sender: {} }, null)).resolves.toEqual({
      success: false,
      error: 'Invalid playlist payload'
    });
    await expect(call('playlist:export', { sender: {} }, { name: 1, tracks: [] })).resolves.toEqual(
      { success: false, error: 'Invalid playlist payload' }
    );
    await expect(
      call('playlist:export', { sender: {} }, { name: 'x', tracks: 'nope' })
    ).resolves.toEqual({ success: false, error: 'Invalid playlist payload' });
  });

  it('writes an extended M3U file', async () => {
    await expect(call('playlist:export', { sender: {} }, input)).resolves.toEqual({
      success: true
    });

    expect(state.showSaveDialog).toHaveBeenCalledWith(window, {
      title: 'Export playlist',
      defaultPath: 'My List.m3u',
      filters: [
        { name: 'M3U Playlist', extensions: ['m3u'] },
        { name: 'M3U8 Playlist', extensions: ['m3u8'] }
      ]
    });
    expect(state.writeFile).toHaveBeenCalledWith(
      'C:/out/list.m3u',
      '#EXTM3U\r\n#EXTINF:-1,a.mp3\r\nC:/media/a.mp3\r\n#EXTINF:-1,b.flac\r\nC:/media/b.flac\r\n',
      'utf-8'
    );
  });

  it('sanitises the file name', async () => {
    await call('playlist:export', { sender: {} }, { ...input, name: 'a<>:"/\\|?* b' });
    expect(state.showSaveDialog.mock.calls[0][1].defaultPath).toBe('a_________ b.m3u');

    await call('playlist:export', { sender: {} }, { ...input, name: '   ' });
    expect(state.showSaveDialog.mock.calls[1][1].defaultPath).toBe('playlist.m3u');
  });

  it('drops invalid tracks and caps the list', async () => {
    const tracks = [1, '', null, ...Array.from({ length: 10_050 }, (_, i) => `C:/media/${i}.mp3`)];
    await call('playlist:export', { sender: {} }, { ...input, tracks });

    const content = state.writeFile.mock.calls[0][1] as string;
    const entries = content.split('\r\n').filter((line) => line.startsWith('#EXTINF'));
    expect(entries).toHaveLength(10_000);
    expect(content).not.toContain('null');
  });

  it('reports a cancelled dialog', async () => {
    state.showSaveDialog.mockResolvedValueOnce({ canceled: true });
    await expect(call('playlist:export', { sender: {} }, input)).resolves.toEqual({
      success: false,
      canceled: true
    });

    state.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: undefined });
    await expect(call('playlist:export', { sender: {} }, input)).resolves.toEqual({
      success: false,
      canceled: true
    });
  });

  it('reports write failures', async () => {
    state.writeFile.mockRejectedValueOnce(new Error('denied'));
    await expect(call('playlist:export', { sender: {} }, input)).resolves.toEqual({
      success: false,
      error: 'denied'
    });
    expect(state.loggerError).toHaveBeenCalledWith(
      'library',
      'playlist:export failed',
      expect.any(Error)
    );

    state.writeFile.mockRejectedValueOnce('plain');
    await expect(call('playlist:export', { sender: {} }, input)).resolves.toEqual({
      success: false,
      error: 'plain'
    });
  });
});
