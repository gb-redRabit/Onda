import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  open: vi.fn(),
  invoke: vi.fn(),
  trackMenu: vi.fn(() => ({ defs: ['track'], ctx: { kind: 'track' } })),
  albumMenu: vi.fn(() => ({ defs: ['album'], ctx: { kind: 'album' } })),
  folderMenu: vi.fn(() => ({ defs: ['folder'], ctx: { kind: 'folder' } })),
  imageMenu: vi.fn(() => ({ defs: ['image'], ctx: { kind: 'image' } })),
  playlistMenu: vi.fn(() => ({ defs: ['playlist'], ctx: { kind: 'playlist' } }))
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock('@renderer/stores/library', () => ({ useLibraryStore: () => ({}) }));
vi.mock('@renderer/stores/library-selection', () => ({ useLibrarySelectionStore: () => ({}) }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => ({}) }));
vi.mock('@renderer/stores/plugins', () => ({ usePluginsStore: () => ({}) }));
vi.mock('../useContextMenu', () => ({ useContextMenu: () => ({ open: h.open }) }));
vi.mock('@renderer/utils/libraryMenuDefs', () => ({
  createLibraryMenuDefs: () => ({
    trackMenu: h.trackMenu,
    albumMenu: h.albumMenu,
    folderMenu: h.folderMenu,
    imageMenu: h.imageMenu,
    playlistMenu: h.playlistMenu
  })
}));

import { useLibraryContextMenu } from '../useLibraryContextMenu';
import type { MediaFile, Playlist } from '@renderer/types/media';

const track = { id: 't1', path: 'D:\\Music\\song.mp3' } as MediaFile;
const playlist = { id: 'p1', name: 'Mix' } as Playlist;
const event = {} as MouseEvent;

beforeEach(() => {
  h.open.mockClear();
  h.invoke.mockReset().mockResolvedValue(undefined);
  for (const fn of [h.trackMenu, h.albumMenu, h.folderMenu, h.imageMenu, h.playlistMenu]) {
    fn.mockClear();
  }
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ...window.api, invoke: h.invoke }
  });
});

describe('menus', () => {
  it('opens the track menu with optional edit callback', () => {
    const { showTrackMenu } = useLibraryContextMenu();
    const onEdit = vi.fn();

    showTrackMenu(event, track, { onEdit });

    expect(h.trackMenu).toHaveBeenCalledWith(track, { onEdit });
    expect(h.open).toHaveBeenCalledWith(event, ['track'], { kind: 'track' });
  });

  it('opens album, folder, image and playlist menus', () => {
    const { showAlbumMenu, showFolderMenu, showImageMenu, showPlaylistMenu } =
      useLibraryContextMenu();
    const onOpen = vi.fn();
    const onRename = vi.fn();

    showAlbumMenu(event, 'Album', [track]);
    showFolderMenu(event, 'D:\\Music', [track]);
    showImageMenu(event, track, onOpen);
    showPlaylistMenu(event, playlist, onRename);

    expect(h.albumMenu).toHaveBeenCalledWith('Album', [track]);
    expect(h.folderMenu).toHaveBeenCalledWith('D:\\Music', [track]);
    expect(h.imageMenu).toHaveBeenCalledWith(track, onOpen);
    expect(h.playlistMenu).toHaveBeenCalledWith(playlist, onRename);
    expect(h.open.mock.calls.map((call) => call[1])).toEqual([
      ['album'],
      ['folder'],
      ['image'],
      ['playlist']
    ]);
  });
});

describe('revealInExplorer', () => {
  it('opens a new explorer window at the parent directory', () => {
    const { revealInExplorer } = useLibraryContextMenu();

    revealInExplorer('D:\\Music\\Album\\song.mp3');

    expect(h.invoke).toHaveBeenCalledWith('explorer:create', 'D:/Music/Album');
  });
});
