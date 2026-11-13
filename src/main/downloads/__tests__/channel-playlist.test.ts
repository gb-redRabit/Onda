import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  getStore: vi.fn(),
  broadcast: vi.fn(),
  warn: vi.fn(),
  uuid: vi.fn(() => 'uuid-1')
}));

vi.mock('crypto', () => ({ randomUUID: mocks.uuid }));
vi.mock('../../ipc/cover/cover-cache', () => ({ getStore: mocks.getStore }));
vi.mock('../../utils/broadcast', () => ({ broadcastToAllWindows: mocks.broadcast }));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: mocks.warn, info: vi.fn(), error: vi.fn() }
}));

import { addToChannelPlaylist } from '../channel-playlist';

const file = {
  id: 'track-1',
  name: 'Song',
  path: 'D:/Music/song.mp3',
  extension: 'mp3',
  mimeType: 'audio/mpeg',
  size: 1,
  type: 'audio',
  addedAt: 0,
  playCount: 0
};

function playlist(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pl-1',
    name: 'Channel A',
    tracks: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-13T10:00:00Z'));
  mocks.get.mockReset();
  mocks.set.mockReset();
  mocks.getStore.mockReset();
  mocks.broadcast.mockClear();
  mocks.warn.mockClear();
  mocks.uuid.mockClear();
  mocks.getStore.mockResolvedValue({ get: mocks.get, set: mocks.set });
  mocks.get.mockReturnValue([]);
});

describe('addToChannelPlaylist', () => {
  it('creates a playlist for the channel when none exists', async () => {
    await addToChannelPlaylist('Channel A', file as never);

    expect(mocks.uuid).toHaveBeenCalledTimes(1);
    expect(mocks.set).toHaveBeenCalledWith('playlists', [
      expect.objectContaining({
        id: 'playlist-uuid-1',
        name: 'Channel A',
        tracks: [file],
        createdAt: Date.now(),
        updatedAt: Date.now()
      })
    ]);
    expect(mocks.broadcast).toHaveBeenCalledWith('library:updated', {
      folder: null,
      added: 1
    });
  });

  it('appends to an existing channel playlist', async () => {
    const existing = playlist({ updatedAt: 1 });
    mocks.get.mockReturnValue([existing]);

    await addToChannelPlaylist('Channel A', file as never);

    expect(existing.tracks).toEqual([file]);
    expect(existing.updatedAt).toBe(Date.now());
    expect(mocks.set).toHaveBeenCalledWith('playlists', [existing]);
    expect(mocks.broadcast).toHaveBeenCalledTimes(1);
  });

  it('deduplicates by file path without writing', async () => {
    const existing = playlist({ tracks: [file], updatedAt: 5 });
    mocks.get.mockReturnValue([existing]);

    await addToChannelPlaylist('Channel A', file as never);

    expect(existing.updatedAt).toBe(5);
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });

  it('drops invalid playlist entries from the store payload', async () => {
    mocks.get.mockReturnValue([
      null,
      { id: 'no-name', tracks: [] },
      { id: 'no-tracks', name: 'X' },
      playlist({ id: 'valid', name: 'Other', tracks: [] })
    ]);

    await addToChannelPlaylist('Channel A', file as never);

    expect(mocks.set).toHaveBeenCalledWith('playlists', [
      expect.objectContaining({ id: 'valid' }),
      expect.objectContaining({ name: 'Channel A' })
    ]);
  });

  it('ignores a non-array playlist store value', async () => {
    mocks.get.mockReturnValue({ nope: true });

    await addToChannelPlaylist('Channel A', file as never);

    expect(mocks.set).toHaveBeenCalledWith('playlists', [
      expect.objectContaining({ name: 'Channel A' })
    ]);
  });

  it('logs store failures and does not throw', async () => {
    const error = new Error('store down');
    mocks.getStore.mockRejectedValue(error);

    await expect(addToChannelPlaylist('Channel A', file as never)).resolves.toBeUndefined();

    expect(mocks.warn).toHaveBeenCalledWith('library', 'addToChannelPlaylist failed', error);
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
