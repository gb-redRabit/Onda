import { beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  getPath: vi.fn(() => 'C:/user'),
  readFile: vi.fn(),
  writeJson: vi.fn(),
  loggerWarn: vi.fn()
}));

vi.mock('electron', () => ({
  app: { getPath: state.getPath },
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) => {
      state.handlers.set(channel, handler);
    }
  }
}));
vi.mock('fs/promises', () => ({ readFile: state.readFile }));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: state.loggerWarn, info: vi.fn(), error: vi.fn() }
}));
vi.mock('../../utils/write-queue', () => ({
  createWriteLock: () => (fn: () => Promise<void>) => fn(),
  writeJsonAtomic: state.writeJson
}));

import {
  loadSavedData,
  persistSaved,
  registerSavedHandlers,
  savedFilePath
} from '../saved-streams';

const FILE = join('C:/user', 'saved-streams.json');

function stream(id: string) {
  return { id, title: `T${id}`, url: `https://y/${id}`, kind: 'video' } as never;
}

function playlist(id: string, items: unknown[] = [stream('a')]) {
  return { id, url: `https://y/p/${id}`, kind: 'playlist', title: `P${id}`, items } as never;
}

function call(channel: string, ...args: any[]) {
  return state.handlers.get(channel)!(...args);
}

beforeEach(() => {
  state.handlers.clear();
  state.getPath.mockClear();
  state.readFile.mockReset();
  state.readFile.mockResolvedValue(
    JSON.stringify({ version: 1, tracks: [stream('a')], playlists: [playlist('p')] })
  );
  state.writeJson.mockReset();
  state.writeJson.mockResolvedValue(undefined);
  state.loggerWarn.mockReset();
  registerSavedHandlers();
});

describe('registration', () => {
  it('registers every saved-stream channel', () => {
    expect([...state.handlers.keys()]).toEqual([
      'saved:load',
      'saved:saveTrack',
      'saved:removeTrack',
      'saved:savePlaylist',
      'saved:removePlaylist'
    ]);
    expect(savedFilePath()).toBe(FILE);
  });
});

describe('load', () => {
  it('loads once and caches the data', async () => {
    const first = await call('saved:load');
    const second = await call('saved:load');

    expect(first.tracks).toHaveLength(1);
    expect(second).toBe(first);
    expect(state.readFile).toHaveBeenCalledTimes(1);
    expect(state.readFile).toHaveBeenCalledWith(FILE, 'utf-8');
  });

  it('returns empty data when the file cannot be read', async () => {
    state.readFile.mockRejectedValueOnce(new Error('ENOENT'));
    await expect(call('saved:load')).resolves.toEqual({ tracks: [], playlists: [] });
  });
});

describe('tracks', () => {
  it('validates the payload', async () => {
    expect(await call('saved:saveTrack', {}, null)).toBe(false);
    expect(await call('saved:saveTrack', {}, { id: '', title: 'x' })).toBe(false);
    expect(await call('saved:saveTrack', {}, { id: 'x' })).toBe(false);
    expect(state.writeJson).not.toHaveBeenCalled();
  });

  it('adds a track and persists', async () => {
    await call('saved:load');
    expect(await call('saved:saveTrack', {}, stream('b'))).toBe(true);

    expect(state.writeJson).toHaveBeenCalledWith(FILE, {
      version: 1,
      tracks: [stream('a'), stream('b')],
      playlists: [playlist('p')]
    });
  });

  it('initialises the store when saving before a load', async () => {
    await call('saved:saveTrack', {}, stream('a'));
    expect(state.writeJson).toHaveBeenCalledWith(FILE, {
      version: 1,
      tracks: [stream('a')],
      playlists: []
    });
  });

  it('ignores duplicates', async () => {
    await call('saved:load');
    expect(await call('saved:saveTrack', {}, stream('a'))).toBe(true);
    expect(state.writeJson).not.toHaveBeenCalled();
  });

  it('caps the stored tracks', async () => {
    state.readFile.mockResolvedValueOnce(
      JSON.stringify({
        version: 1,
        tracks: Array.from({ length: 500 }, (_, i) => stream(`t${i}`)),
        playlists: []
      })
    );
    await call('saved:load');

    await call('saved:saveTrack', {}, stream('new'));

    const persisted = state.writeJson.mock.calls[0][1];
    expect(persisted.tracks).toHaveLength(500);
    expect(persisted.tracks[0].id).toBe('t1');
    expect(persisted.tracks.at(-1).id).toBe('new');
  });

  it('removes tracks only when present', async () => {
    expect(await call('saved:removeTrack', {}, 'a')).toBe(false);

    await call('saved:load');
    expect(await call('saved:removeTrack', {}, 'missing')).toBe(true);
    expect(state.writeJson).not.toHaveBeenCalled();

    expect(await call('saved:removeTrack', {}, 'a')).toBe(true);
    expect(state.writeJson).toHaveBeenCalledWith(FILE, expect.objectContaining({ tracks: [] }));
  });
});

describe('playlists', () => {
  it('validates the payload', async () => {
    for (const bad of [
      null,
      { id: '', url: 'u', kind: 'playlist', title: 't' },
      { id: 'i', url: '', kind: 'playlist', title: 't' },
      { id: 'i', url: 'u', kind: 'other', title: 't' },
      { id: 'i', url: 'u', kind: 'playlist' }
    ]) {
      expect(await call('saved:savePlaylist', {}, bad)).toBe(false);
    }
    expect(state.writeJson).not.toHaveBeenCalled();
  });

  it('upserts and sanitizes playlist items', async () => {
    await call('saved:load');

    await call('saved:savePlaylist', {}, playlist('p', [stream('b'), null, { id: '' }]));

    const persisted = state.writeJson.mock.calls[0][1];
    expect(persisted.playlists).toHaveLength(1);
    expect(persisted.playlists[0].items).toEqual([stream('b')]);
  });

  it('caps playlist items and playlist count', async () => {
    state.readFile.mockResolvedValueOnce(
      JSON.stringify({
        version: 1,
        tracks: [],
        playlists: Array.from({ length: 100 }, (_, i) => playlist(`p${i}`))
      })
    );
    await call('saved:load');

    await call(
      'saved:savePlaylist',
      {},
      playlist(
        'new',
        Array.from({ length: 600 }, (_, i) => stream(`s${i}`))
      )
    );

    const persisted = state.writeJson.mock.calls[0][1];
    expect(persisted.playlists).toHaveLength(100);
    expect(persisted.playlists.at(-1).id).toBe('new');
    expect(persisted.playlists.at(-1).items).toHaveLength(500);
  });

  it('removes playlists only when present', async () => {
    expect(await call('saved:removePlaylist', {}, 'p')).toBe(false);

    await call('saved:load');
    expect(await call('saved:removePlaylist', {}, 'missing')).toBe(true);
    expect(state.writeJson).not.toHaveBeenCalled();

    expect(await call('saved:removePlaylist', {}, 'p')).toBe(true);
    expect(state.writeJson).toHaveBeenCalledWith(FILE, expect.objectContaining({ playlists: [] }));
  });
});

describe('persistence failures', () => {
  it('logs and swallows write errors', async () => {
    state.writeJson.mockRejectedValueOnce(new Error('disk'));

    await expect(persistSaved(FILE, { tracks: [], playlists: [] })).resolves.toBeUndefined();

    expect(state.loggerWarn).toHaveBeenCalledWith(
      'saved',
      'failed to persist saved streams',
      expect.any(Error)
    );
  });

  it('loads empty data from a corrupt file', async () => {
    state.readFile.mockResolvedValueOnce('{not json');
    await expect(loadSavedData(FILE)).resolves.toEqual({ tracks: [], playlists: [] });
  });
});
