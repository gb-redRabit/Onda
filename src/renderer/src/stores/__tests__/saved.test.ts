import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSavedStore } from '../saved';

let mockSavedLoad: ReturnType<typeof vi.fn>;
let mockSavedSaveTrack: ReturnType<typeof vi.fn>;
let mockSavedRemoveTrack: ReturnType<typeof vi.fn>;
let mockSavedSavePlaylist: ReturnType<typeof vi.fn>;
let mockSavedRemovePlaylist: ReturnType<typeof vi.fn>;

beforeEach(() => {
  setActivePinia(createPinia());
  mockSavedLoad = vi.fn().mockResolvedValue({ tracks: [], playlists: [] });
  mockSavedSaveTrack = vi.fn().mockResolvedValue(true);
  mockSavedRemoveTrack = vi.fn().mockResolvedValue(true);
  mockSavedSavePlaylist = vi.fn().mockResolvedValue(true);
  mockSavedRemovePlaylist = vi.fn().mockResolvedValue(true);
  (window as { api?: unknown }).api = {
    savedLoad: mockSavedLoad,
    savedSaveTrack: mockSavedSaveTrack,
    savedRemoveTrack: mockSavedRemoveTrack,
    savedSavePlaylist: mockSavedSavePlaylist,
    savedRemovePlaylist: mockSavedRemovePlaylist
  };
});

describe('saved store', () => {
  it('loads persisted data once', async () => {
    mockSavedLoad.mockResolvedValue({
      tracks: [{ id: 'a', title: 'A', savedAt: 1 }],
      playlists: [{ id: 'p', kind: 'playlist', url: 'https://youtube.com/playlist?list=p', title: 'P', savedAt: 1 }]
    });
    const store = useSavedStore();
    await store.ensureLoaded();
    expect(store.tracks).toHaveLength(1);
    expect(store.playlists).toHaveLength(1);
    expect(mockSavedLoad).toHaveBeenCalledTimes(1);
    await store.ensureLoaded();
    expect(mockSavedLoad).toHaveBeenCalledTimes(1);
  });

  it('toggles a track: save, then remove', async () => {
    const store = useSavedStore();
    const video = { id: 'abc', title: 'Song', thumbnail: 'https://i.ytimg.com/vi/abc/hqdefault.jpg' };
    const ok = await store.toggleTrack(video);
    expect(ok).toBe(true);
    expect(store.isTrackSaved('abc')).toBe(true);
    expect(mockSavedSaveTrack).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'abc', title: 'Song' })
    );
    const removed = await store.toggleTrack(video);
    expect(removed).toBe(false);
    expect(store.isTrackSaved('abc')).toBe(false);
    expect(mockSavedRemoveTrack).toHaveBeenCalledWith('abc');
  });

  it('savePlaylist derives the playlist id from the url and dedupes', async () => {
    const store = useSavedStore();
    await store.savePlaylist({
      kind: 'playlist',
      url: 'https://www.youtube.com/playlist?list=PL123',
      title: 'Mix',
      totalItems: 5
    });
    expect(store.isPlaylistSaved('PL123')).toBe(true);
    expect(mockSavedSavePlaylist).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'PL123', kind: 'playlist' })
    );
    const before = mockSavedSavePlaylist.mock.calls.length;
    await store.savePlaylist({
      kind: 'playlist',
      url: 'https://www.youtube.com/playlist?list=PL123&extra=1',
      title: 'Mix 2'
    });
    // same id -> replace, not duplicate
    expect(store.playlists).toHaveLength(1);
    expect(mockSavedSavePlaylist.mock.calls.length).toBe(before + 1);
  });

  it('savePlaylist stores the full item list', async () => {
    const store = useSavedStore();
    await store.savePlaylist({
      kind: 'playlist',
      url: 'https://www.youtube.com/playlist?list=PL300',
      title: 'Big Mix',
      totalItems: 300,
      items: Array.from({ length: 300 }, (_, i) => ({ id: `v${i}`, title: `V ${i}` }))
    });
    expect(store.playlists[0]?.items).toHaveLength(300);
    expect(store.playlists[0]?.items?.[0]).toMatchObject({ id: 'v0', title: 'V 0' });
  });

  it('updatePlaylistItems replaces the snapshot after a background sync', async () => {
    mockSavedLoad.mockResolvedValue({
      tracks: [],
      playlists: [
        {
          id: 'PL1',
          kind: 'playlist',
          url: 'https://youtube.com/playlist?list=PL1',
          title: 'P',
          items: [{ id: 'gone', title: 'Gone', savedAt: 1 }],
          savedAt: 1
        }
      ]
    });
    const store = useSavedStore();
    await store.ensureLoaded();
    await store.updatePlaylistItems('PL1', [{ id: 'kept', title: 'Kept', savedAt: 2 }], 10);
    expect(store.playlists[0]?.items?.map((i) => i.id)).toEqual(['kept']);
    expect(store.playlists[0]?.totalItems).toBe(10);
    expect(mockSavedSavePlaylist).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'PL1', items: [{ id: 'kept', title: 'Kept', savedAt: 2 }] })
    );
  });

  it('removeTrack and removePlaylist update state and persist', async () => {
    mockSavedLoad.mockResolvedValue({
      tracks: [{ id: 'a', title: 'A', savedAt: 1 }],
      playlists: [{ id: 'PL1', kind: 'playlist', url: 'https://youtube.com/playlist?list=PL1', title: 'P', savedAt: 1 }]
    });
    const store = useSavedStore();
    await store.ensureLoaded();
    await store.removeTrack('a');
    expect(store.tracks).toHaveLength(0);
    expect(mockSavedRemoveTrack).toHaveBeenCalledWith('a');
    await store.removePlaylist('PL1');
    expect(store.playlists).toHaveLength(0);
    expect(mockSavedRemovePlaylist).toHaveBeenCalledWith('PL1');
  });
});
