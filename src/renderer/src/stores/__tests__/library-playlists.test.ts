import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibraryPlaylists } from '../library-playlists';
import type { MediaFile } from '@renderer/types/media';

// Playlist mutations are optimistic; saves collapse bursts into one debounced
// IPC write, while explicit saves cancel a pending timer.

const invoke = vi.fn();

function track(path: string): MediaFile {
  return { id: path, path, name: path, type: 'audio' } as MediaFile;
}

beforeEach(() => {
  vi.useFakeTimers();
  invoke.mockReset().mockResolvedValue(undefined);
  (window as unknown as { api: unknown }).api = { invoke };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createPlaylist', () => {
  it('creates a playlist with a generated id and schedules a save', async () => {
    const store = useLibraryPlaylists();

    const playlist = store.createPlaylist('Road trip', 'driving');

    expect(playlist.id).toMatch(/^playlist-/);
    expect(playlist).toMatchObject({
      name: 'Road trip',
      description: 'driving',
      tracks: []
    });
    expect(store.playlists.value).toEqual([playlist]);

    await vi.advanceTimersByTimeAsync(500);
    expect(invoke).toHaveBeenCalledWith('playlist:saveAll', [playlist]);
  });

  it('resets the debounce window when several mutations happen quickly', async () => {
    const store = useLibraryPlaylists();
    store.createPlaylist('A');

    await vi.advanceTimersByTimeAsync(300);
    store.createPlaylist('B');
    await vi.advanceTimersByTimeAsync(300);
    expect(invoke).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0]![1]).toHaveLength(2);
  });
});

describe('playlist mutations', () => {
  it('adds unique tracks and bumps updatedAt', () => {
    const store = useLibraryPlaylists();
    const playlist = store.createPlaylist('P');
    const originalUpdatedAt = playlist.updatedAt;

    store.addToPlaylist(playlist.id, track('/a.mp3'));
    store.addToPlaylist(playlist.id, track('/a.mp3'));

    expect(playlist.tracks.map((t) => t.path)).toEqual(['/a.mp3']);
    expect(playlist.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt);
  });

  it('ignores operations for unknown playlists', () => {
    const store = useLibraryPlaylists();

    expect(() => store.addToPlaylist('missing', track('/a.mp3'))).not.toThrow();
    expect(() => store.removeFromPlaylist('missing', '/a.mp3')).not.toThrow();
    expect(() => store.reorderPlaylistTrack('missing', 0, 1)).not.toThrow();
    expect(() => store.renamePlaylist('missing', 'X')).not.toThrow();
  });

  it('removes a track by path', () => {
    const store = useLibraryPlaylists();
    const playlist = store.createPlaylist('P');
    store.addToPlaylist(playlist.id, track('/a.mp3'));
    store.addToPlaylist(playlist.id, track('/b.mp3'));

    store.removeFromPlaylist(playlist.id, '/a.mp3');

    expect(playlist.tracks.map((t) => t.path)).toEqual(['/b.mp3']);
  });

  it('reorders tracks only for valid, distinct indices', () => {
    const store = useLibraryPlaylists();
    const playlist = store.createPlaylist('P');
    for (const path of ['/a', '/b', '/c']) store.addToPlaylist(playlist.id, track(path));

    store.reorderPlaylistTrack(playlist.id, -1, 0);
    store.reorderPlaylistTrack(playlist.id, 0, 9);
    store.reorderPlaylistTrack(playlist.id, 1, 1);
    expect(playlist.tracks.map((t) => t.path)).toEqual(['/a', '/b', '/c']);

    store.reorderPlaylistTrack(playlist.id, 2, 0);
    expect(playlist.tracks.map((t) => t.path)).toEqual(['/c', '/a', '/b']);
  });

  it('renames with a trimmed, non-empty and changed value', () => {
    const store = useLibraryPlaylists();
    const playlist = store.createPlaylist('Old');

    store.renamePlaylist(playlist.id, '   ');
    expect(playlist.name).toBe('Old');

    store.renamePlaylist(playlist.id, ' Old ');
    expect(playlist.name).toBe('Old');

    store.renamePlaylist(playlist.id, '  New name  ');
    expect(playlist.name).toBe('New name');
  });

  it('deletes a playlist', () => {
    const store = useLibraryPlaylists();
    const first = store.createPlaylist('A');
    store.createPlaylist('B');

    store.deletePlaylist(first.id);

    expect(store.playlists.value.map((p) => p.name)).toEqual(['B']);
  });
});

describe('savePlaylists', () => {
  it('cancels a pending debounce and saves immediately', async () => {
    const store = useLibraryPlaylists();
    store.createPlaylist('P');

    await store.savePlaylists();

    expect(invoke).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(600);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('swallows IPC failures', async () => {
    invoke.mockRejectedValueOnce(new Error('disk full'));
    const store = useLibraryPlaylists();
    store.createPlaylist('P');

    await expect(store.savePlaylists()).resolves.toBeUndefined();
  });
});
