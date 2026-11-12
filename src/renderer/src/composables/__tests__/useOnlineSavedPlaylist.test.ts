import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { flushPromises } from '@vue/test-utils';

const h = vi.hoisted(() => ({
  state: null as any,
  loadAllResolvedItems: vi.fn(),
  isPlaylistSaved: vi.fn(),
  savePlaylist: vi.fn(),
  removePlaylist: vi.fn(),
  notify: vi.fn(),
  t: vi.fn((key: string) => key),
  savedPlaylistId: vi.fn(() => 'playlist:1')
}));

vi.mock('@renderer/stores/online', () => ({ useOnlineStore: () => h.state }));
vi.mock('@renderer/stores/saved', () => ({
  useSavedStore: () => ({
    isPlaylistSaved: h.isPlaylistSaved,
    savePlaylist: h.savePlaylist,
    removePlaylist: h.removePlaylist
  })
}));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => ({ notify: h.notify }) }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock('@renderer/utils/onlineSavedPlaylist', () => ({ savedPlaylistId: h.savedPlaylistId }));

import { useOnlineSavedPlaylist } from '../useOnlineSavedPlaylist';

function resolved(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'playlist',
    sourceUrl: 'https://youtube.com/playlist?list=PL1',
    title: 'My Playlist',
    items: [{ id: 'a', title: 'A', thumbnail: 'thumb-a', channelTitle: 'Chan', channelId: 'c' }],
    meta: { channelTitle: 'Owner', totalItems: 12 },
    ...overrides
  } as never;
}

beforeEach(() => {
  h.loadAllResolvedItems.mockReset().mockResolvedValue({
    items: [
      { id: 'a', title: 'A', thumbnail: 'thumb-a' },
      { id: 'b', title: 'B', thumbnail: 'thumb-b' }
    ],
    totalItems: 2
  });
  h.isPlaylistSaved.mockReset().mockReturnValue(false);
  h.savePlaylist.mockReset().mockResolvedValue(true);
  h.removePlaylist.mockReset().mockResolvedValue(true);
  h.notify.mockClear();
  h.savedPlaylistId.mockClear();
  h.state = reactive({ resolved: resolved(), loadAllResolvedItems: h.loadAllResolvedItems });
});

describe('saving a resolved playlist', () => {
  it('does nothing without a resolved playlist', () => {
    h.state.resolved = null;
    const { saveResolvedPlaylist } = useOnlineSavedPlaylist();

    saveResolvedPlaylist();

    expect(h.loadAllResolvedItems).not.toHaveBeenCalled();
    expect(h.savePlaylist).not.toHaveBeenCalled();
  });

  it('ignores single videos', () => {
    h.state.resolved = resolved({ kind: 'video' });
    const { saveResolvedPlaylist } = useOnlineSavedPlaylist();

    saveResolvedPlaylist();

    expect(h.savePlaylist).not.toHaveBeenCalled();
  });

  it('removes an already saved playlist', () => {
    h.isPlaylistSaved.mockReturnValue(true);
    const { saveResolvedPlaylist } = useOnlineSavedPlaylist();

    saveResolvedPlaylist();

    expect(h.removePlaylist).toHaveBeenCalledWith('playlist:1');
    expect(h.savePlaylist).not.toHaveBeenCalled();
  });

  it('saves every loaded item and reports success', async () => {
    const { saveResolvedPlaylist, savingPlaylist } = useOnlineSavedPlaylist();

    saveResolvedPlaylist();
    expect(savingPlaylist.value).toBe(true);
    await flushPromises();

    expect(h.loadAllResolvedItems).toHaveBeenCalledWith('https://youtube.com/playlist?list=PL1');
    expect(h.savePlaylist).toHaveBeenCalledWith({
      kind: 'playlist',
      url: 'https://youtube.com/playlist?list=PL1',
      title: 'My Playlist',
      thumbnail: 'thumb-a',
      channelTitle: 'Owner',
      totalItems: 2,
      items: [expect.objectContaining({ id: 'a' }), expect.objectContaining({ id: 'b' })]
    });
    expect(h.notify).toHaveBeenCalledWith('success', 'My Playlist', 'saved.playlistSaved');
    expect(savingPlaylist.value).toBe(false);
  });

  it('falls back to resolved items and metadata counts', async () => {
    h.loadAllResolvedItems.mockResolvedValue({ items: [], totalItems: undefined });
    const { saveResolvedPlaylist } = useOnlineSavedPlaylist();

    saveResolvedPlaylist();
    await flushPromises();

    expect(h.savePlaylist).toHaveBeenCalledWith(
      expect.objectContaining({
        totalItems: 12,
        items: [expect.objectContaining({ id: 'a' })]
      })
    );
  });

  it('stays quiet when the save is rejected', async () => {
    h.savePlaylist.mockResolvedValue(false);
    const { saveResolvedPlaylist, savingPlaylist } = useOnlineSavedPlaylist();

    saveResolvedPlaylist();
    await flushPromises();

    expect(h.notify).not.toHaveBeenCalled();
    expect(savingPlaylist.value).toBe(false);
  });

  it('ignores repeat clicks while saving', async () => {
    let release!: (value: { items: unknown[]; totalItems: number }) => void;
    h.loadAllResolvedItems.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      })
    );
    const { saveResolvedPlaylist } = useOnlineSavedPlaylist();

    saveResolvedPlaylist();
    saveResolvedPlaylist();
    expect(h.loadAllResolvedItems).toHaveBeenCalledTimes(1);

    release({ items: [], totalItems: 1 });
    await flushPromises();
  });
});

describe('resolvedSaved', () => {
  it('tracks saved state for playlists only', () => {
    h.isPlaylistSaved.mockReturnValue(true);
    const { resolvedSaved } = useOnlineSavedPlaylist();
    expect(resolvedSaved.value).toBe(true);

    h.state.resolved = resolved({ kind: 'video' });
    expect(resolvedSaved.value).toBe(false);

    h.state.resolved = null;
    expect(resolvedSaved.value).toBe(false);
  });
});
