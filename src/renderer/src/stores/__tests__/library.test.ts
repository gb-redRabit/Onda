import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useLibraryStore } from '../library';
import type { MediaFile } from '@renderer/types/media';

function makeTrack(id: string, overrides: Partial<MediaFile> = {}): MediaFile {
  return {
    id,
    name: `Track ${id}`,
    path: `/music/${id}.mp3`,
    extension: '.mp3',
    mimeType: 'audio/mpeg',
    size: 1000,
    addedAt: Date.now(),
    playCount: 0,
    type: 'audio',
    ...overrides
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('initial state', () => {
  it('starts with empty tracks, playlists, folders', () => {
    const store = useLibraryStore();
    expect(store.tracks).toHaveLength(0);
    expect(store.playlists).toHaveLength(0);
    expect(store.folders).toHaveLength(0);
    expect(store.isLoaded).toBe(false);
    expect(store.isScanning).toBe(false);
  });
});

describe('computed counts', () => {
  it('totalCount returns track length', () => {
    const store = useLibraryStore();
    store.tracks = [makeTrack('1'), makeTrack('2')];
    expect(store.totalCount).toBe(2);
  });

  it('audioCount / videoCount filters by type', () => {
    const store = useLibraryStore();
    store.tracks = [
      makeTrack('1', { type: 'audio' }),
      makeTrack('2', { type: 'video' }),
      makeTrack('3', { type: 'audio' })
    ];
    expect(store.audioCount).toBe(2);
    expect(store.videoCount).toBe(1);
  });

  it('audioTracks / videoTracks returns filtered arrays', () => {
    const store = useLibraryStore();
    const a = makeTrack('1', { type: 'audio' });
    const v = makeTrack('2', { type: 'video' });
    store.tracks = [a, v];
    expect(store.audioTracks.map((t) => t.id)).toEqual(['1']);
    expect(store.videoTracks.map((t) => t.id)).toEqual(['2']);
  });
});

describe('recentTracks / mostPlayed', () => {
  it('recentTracks returns up to 20 tracks sorted by lastPlayed desc', () => {
    const store = useLibraryStore();
    store.tracks = [
      makeTrack('a', { lastPlayed: 100 }),
      makeTrack('b', { lastPlayed: 200 }),
      makeTrack('c', {})
    ];
    expect(store.recentTracks.map((t) => t.id)).toEqual(['b', 'a']);
    expect(store.recentTracks).toHaveLength(2);
  });

  it('mostPlayed returns up to 20 tracks sorted by playCount desc', () => {
    const store = useLibraryStore();
    store.tracks = [
      makeTrack('1', { playCount: 5 }),
      makeTrack('2', { playCount: 10 }),
      makeTrack('3', { playCount: 1 })
    ];
    expect(store.mostPlayed.map((t) => t.id)).toEqual(['2', '1', '3']);
  });
});

describe('artists / albums', () => {
  it('artists groups tracks by metadata.artist', () => {
    const store = useLibraryStore();
    const a = makeTrack('a', { metadata: { artist: 'Artist A' } });
    const b1 = makeTrack('b1', { metadata: { artist: 'Artist B' } });
    const b2 = makeTrack('b2', { metadata: { artist: 'Artist B' } });
    store.tracks = [a, b1, b2];
    const result = store.artists;
    expect(result).toHaveLength(2);
    expect(result[0][0]).toBe('Artist A');
    expect(result[0][1]).toHaveLength(1);
    expect(result[1][0]).toBe('Artist B');
    expect(result[1][1]).toHaveLength(2);
  });

  it('artists uses Unknown Artist for missing metadata', () => {
    const store = useLibraryStore();
    store.tracks = [makeTrack('1')];
    expect(store.artists[0][0]).toBe('Unknown Artist');
  });

  it('albums groups tracks by metadata.album', () => {
    const store = useLibraryStore();
    const a = makeTrack('a', { metadata: { album: 'Album X' } });
    const b = makeTrack('b', { metadata: { album: 'Album Y' } });
    store.tracks = [a, b];
    expect(store.albums).toHaveLength(2);
    expect(store.albums[0][0]).toBe('Album X');
    expect(store.albums[1][0]).toBe('Album Y');
  });
});

describe('addTrack / removeTrack', () => {
  it('addTrack adds a new track', () => {
    const store = useLibraryStore();
    const t = makeTrack('1');
    store.addTrack(t);
    expect(store.tracks).toHaveLength(1);
    expect(store.tracks[0]!.id).toBe('1');
  });

  it('addTrack updates existing track with same path', () => {
    const store = useLibraryStore();
    store.addTrack(makeTrack('1', { path: '/same.mp3', playCount: 1 }));
    store.addTrack(makeTrack('1', { path: '/same.mp3', playCount: 99 }));
    expect(store.tracks).toHaveLength(1);
    expect(store.tracks[0]!.playCount).toBe(99);
  });

  it('removeTrack removes by path', () => {
    const store = useLibraryStore();
    store.addTrack(makeTrack('1'));
    store.removeTrack('/music/1.mp3');
    expect(store.tracks).toHaveLength(0);
  });
});

describe('folder management', () => {
  it('addFolder adds a folder path', async () => {
    const store = useLibraryStore();
    await store.addFolder('/music');
    expect(store.folders).toContain('/music');
  });

  it('addFolder skips duplicates', async () => {
    const store = useLibraryStore();
    await store.addFolder('/music');
    await store.addFolder('/music');
    expect(store.folders).toHaveLength(1);
  });

  it('addFolder persists via library:saveFolders', async () => {
    const store = useLibraryStore();
    await store.addFolder('/music');
    expect((window as any).api.invoke).toHaveBeenCalledWith('library:saveFolders', ['/music']);
  });

  it('removeFolder removes folder and its tracks', async () => {
    const store = useLibraryStore();
    store.folders = ['/music', '/video'];
    store.folderTypes = { '/music': 'audio', '/video': 'video' };
    store.tracks = [
      makeTrack('1', { path: '/music/song.mp3' }),
      makeTrack('2', { path: '/video/clip.mp4' })
    ];
    await store.removeFolder('/music');
    expect(store.folders).toEqual(['/video']);
    expect(store.tracks).toHaveLength(1);
    expect(store.tracks[0]!.id).toBe('2');
    expect(store.folderTypes['/music']).toBeUndefined();
  });

  it('getFolderType returns type or unknown', () => {
    const store = useLibraryStore();
    store.folderTypes = { '/music': 'audio' };
    expect(store.getFolderType('/music')).toBe('audio');
    expect(store.getFolderType('/other')).toBe('unknown');
  });
});

describe('playlist CRUD', () => {
  it('createPlaylist adds a new playlist', () => {
    const store = useLibraryStore();
    const pl = store.createPlaylist('My Playlist', 'A description');
    expect(pl.name).toBe('My Playlist');
    expect(pl.description).toBe('A description');
    expect(store.playlists).toHaveLength(1);
    expect(store.playlists[0]!.id).toBe(pl.id);
  });

  it('addToPlaylist adds track if not duplicate', () => {
    const store = useLibraryStore();
    const pl = store.createPlaylist('Test');
    const t = makeTrack('1');
    store.addToPlaylist(pl.id, t);
    expect(pl.tracks).toHaveLength(1);
    store.addToPlaylist(pl.id, t);
    expect(pl.tracks).toHaveLength(1);
  });

  it('removeFromPlaylist removes track by path', () => {
    const store = useLibraryStore();
    const pl = store.createPlaylist('Test');
    store.addToPlaylist(pl.id, makeTrack('1'));
    store.removeFromPlaylist(pl.id, '/music/1.mp3');
    expect(pl.tracks).toHaveLength(0);
  });

  it('deletePlaylist removes playlist by id', () => {
    const store = useLibraryStore();
    const pl = store.createPlaylist('Test');
    expect(store.playlists).toHaveLength(1);
    store.deletePlaylist(pl.id);
    expect(store.playlists).toHaveLength(0);
  });
});

describe('search', () => {
  it('finds tracks by name', () => {
    const store = useLibraryStore();
    store.tracks = [makeTrack('1', { name: 'Hello World' }), makeTrack('2', { name: 'Goodbye' })];
    expect(store.search('hello')).toHaveLength(1);
    expect(store.search('hello')[0]!.name).toBe('Hello World');
  });

  it('finds tracks by metadata title', () => {
    const store = useLibraryStore();
    store.tracks = [
      makeTrack('1', { metadata: { title: 'Bohemian Rhapsody' } }),
      makeTrack('2', { metadata: { title: 'Another One' } })
    ];
    expect(store.search('rhapsody')).toHaveLength(1);
  });

  it('finds tracks by artist', () => {
    const store = useLibraryStore();
    store.tracks = [makeTrack('1', { metadata: { artist: 'Queen' } })];
    expect(store.search('queen')).toHaveLength(1);
  });

  it('finds tracks by album', () => {
    const store = useLibraryStore();
    store.tracks = [makeTrack('1', { metadata: { album: 'Night at the Opera' } })];
    expect(store.search('opera')).toHaveLength(1);
  });

  it('is case insensitive', () => {
    const store = useLibraryStore();
    store.tracks = [makeTrack('1', { name: 'SONG' })];
    expect(store.search('song')).toHaveLength(1);
    expect(store.search('SONG')).toHaveLength(1);
  });

  it('returns empty array when no match', () => {
    const store = useLibraryStore();
    store.tracks = [makeTrack('1', { name: 'ABC' })];
    expect(store.search('XYZ')).toHaveLength(0);
  });
});

describe('loadFromDisk', () => {
  it('loads playlists and folders', async () => {
    const store = useLibraryStore();
    const api = (window as any).api;
    api.invoke.mockImplementation((channel: string) => {
      if (channel === 'playlist:loadAll')
        return Promise.resolve([
          { id: 'pl1', name: 'Test', tracks: [], createdAt: 0, updatedAt: 0 }
        ]);
      if (channel === 'library:loadFolders') return Promise.resolve(['/music']);
      return Promise.resolve(undefined);
    });

    await store.loadFromDisk();

    expect(store.playlists).toHaveLength(1);
    expect(store.playlists[0]!.name).toBe('Test');
    expect(store.folders).toContain('/music');
  });
});

describe('scanFolders', () => {
  it('does nothing when no folders', async () => {
    const store = useLibraryStore();
    await store.scanFolders();
    expect(store.isScanning).toBe(false);
  });

  it('scans folders and updates folderTypes', async () => {
    const store = useLibraryStore();
    store.folders = ['/music'];
    const api = (window as any).api;
    api.invoke.mockResolvedValue({ count: 10, folderTypes: { '/music': 'audio' } });

    await store.scanFolders();

    expect(store.folderTypes['/music']).toBe('audio');
  });
});

describe('savePlaylists', () => {
  it('persists via playlist:saveAll', async () => {
    const store = useLibraryStore();
    store.createPlaylist('Test');
    await store.savePlaylists();
    expect((window as any).api.invoke).toHaveBeenCalledWith('playlist:saveAll', expect.any(Array));
  });
});

describe('refreshDerived', () => {
  it('calls triggerRef on tracks (does not throw)', () => {
    const store = useLibraryStore();
    expect(() => store.refreshDerived()).not.toThrow();
  });
});
