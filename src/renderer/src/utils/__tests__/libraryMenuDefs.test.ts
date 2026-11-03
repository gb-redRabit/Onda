import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { MediaFile } from '@renderer/types/media';
import { createLibraryMenuDefs, type LibraryMenuDeps } from '@renderer/utils/libraryMenuDefs';
import { useContextMenu } from '@renderer/composables/useContextMenu';

const menuActions = vi.hoisted(() => ({
  revealInFolder: vi.fn(),
  copyPathToClipboard: vi.fn()
}));

vi.mock('@renderer/utils/menuActions', () => ({
  revealInFolder: menuActions.revealInFolder,
  copyPathToClipboard: menuActions.copyPathToClipboard
}));

function track(path = 'D:/music/a.mp3'): MediaFile {
  return {
    id: path,
    path,
    name: 'a.mp3',
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    size: 1024,
    type: 'audio',
    addedAt: 0,
    playCount: 0
  };
}

function makeDeps(playlists: LibraryMenuDeps['library']['playlists'] = []) {
  return {
    t: (key: string) => key,
    player: {
      isFavorite: () => false,
      toggleFavorite: vi.fn(),
      addToQueue: vi.fn(),
      clearQueue: vi.fn(),
      addToQueueMultiple: vi.fn(),
      setTrack: vi.fn(),
      play: vi.fn(),
      queue: [],
      currentTrack: null,
      insertInQueue: vi.fn()
    },
    library: {
      playlists,
      addToPlaylist: vi.fn(),
      removeFromPlaylist: vi.fn(),
      deletePlaylist: vi.fn()
    },
    plugins: { commandsIn: () => [] },
    revealInExplorer: vi.fn()
  } as unknown as LibraryMenuDeps;
}

beforeEach(() => {
  setActivePinia(createPinia());
  menuActions.copyPathToClipboard.mockClear();
});

describe('library track menu', () => {
  it('hides "edit tags" when no handler is provided (video rows)', () => {
    const { trackMenu } = createLibraryMenuDefs(makeDeps());
    const { defs } = trackMenu(track());
    const edit = defs.find((d) => d.label === 'common.editTags');
    expect(edit?.when?.({ track: track() })).toBe(false);
  });

  it('shows "edit tags" when a handler is provided', () => {
    const { trackMenu } = createLibraryMenuDefs(makeDeps());
    const { defs } = trackMenu(track(), { onEdit: vi.fn() });
    const edit = defs.find((d) => d.label === 'common.editTags');
    expect(edit?.when?.({ track: track() })).toBe(true);
  });

  it('ends without a dangling separator when there are no playlists', () => {
    const { trackMenu } = createLibraryMenuDefs(makeDeps());
    const { defs, ctx } = trackMenu(track());
    const items = useContextMenu().build(defs, ctx);
    expect(items.at(-1)?.separator).toBeUndefined();
    expect(items.some((item, i) => item.separator && items[i - 1]?.separator)).toBe(false);
  });
});

describe('library album menu', () => {
  it('copies the first track path, not the album name', () => {
    const { albumMenu } = createLibraryMenuDefs(makeDeps());
    const first = track('D:/music/one.flac');
    const { defs, ctx } = albumMenu('Album', [first, track('D:/music/two.flac')]);
    const copy = defs.find((d) => d.label === 'explorer.copyPath');
    expect(copy?.when?.(ctx)).toBe(true);
    copy?.action?.(ctx);
    expect(menuActions.copyPathToClipboard).toHaveBeenCalledWith('D:/music/one.flac');
  });

  it('hides copy path for an empty album', () => {
    const { albumMenu } = createLibraryMenuDefs(makeDeps());
    const { defs, ctx } = albumMenu('Album', []);
    const copy = defs.find((d) => d.label === 'explorer.copyPath');
    expect(copy?.when?.(ctx)).toBe(false);
  });
});
