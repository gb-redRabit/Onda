import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  player: null as any,
  library: null as any,
  plugins: null as any,
  selection: null as any,
  revealInExplorer: vi.fn(),
  revealInFolder: vi.fn(),
  copyPath: vi.fn(),
  snapshotTrack: vi.fn(),
  invoke: vi.fn(),
  t: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  )
}));

vi.mock('@renderer/utils/menuActions', () => ({
  revealInFolder: state.revealInFolder,
  copyPathToClipboard: state.copyPath
}));
vi.mock('@renderer/stores/plugins', () => ({
  snapshotTrack: state.snapshotTrack
}));

function track(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    path: `C:/music/${id}.mp3`,
    name: `${id}.mp3`,
    type: 'audio',
    metadata: { artist: 'Artist', album: 'Album', title: 'Title' },
    ...overrides
  } as any;
}

function playlist(id: string, tracks: any[], overrides: Record<string, unknown> = {}) {
  return { id, name: `Playlist ${id}`, tracks, ...overrides } as any;
}

function deps() {
  return {
    t: state.t as never,
    player: state.player,
    library: state.library,
    plugins: state.plugins,
    revealInExplorer: state.revealInExplorer,
    selection: state.selection
  };
}

async function menuDefs() {
  const { createLibraryMenuDefs } = await import('../libraryMenuDefs');
  return createLibraryMenuDefs(deps());
}

function byLabel(defs: any[], label: string) {
  return defs.find((def) => def.label === label);
}

function firstAction(defs: any[]) {
  return defs.find((def) => typeof def.action === 'function')!;
}

let dispatchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  state.player = {
    queue: [track('q1'), track('q2')],
    currentTrack: track('q1'),
    isFavorite: vi.fn(() => false),
    setTrack: vi.fn(),
    play: vi.fn(),
    toggleFavorite: vi.fn(),
    addToQueue: vi.fn(),
    addToQueueMultiple: vi.fn(),
    insertInQueue: vi.fn(),
    clearQueue: vi.fn()
  };
  state.library = {
    playlists: [playlist('p1', [track('a')]), playlist('p2', [])],
    addToPlaylist: vi.fn(),
    removeFromPlaylist: vi.fn(),
    deletePlaylist: vi.fn()
  };
  state.plugins = {
    commandsIn: vi.fn(() => []),
    invokeCommandWithContext: vi.fn()
  };
  state.selection = {
    has: vi.fn(() => false),
    toggle: vi.fn()
  };
  state.revealInExplorer.mockReset();
  state.revealInFolder.mockReset();
  state.copyPath.mockReset();
  state.snapshotTrack.mockReset();
  state.snapshotTrack.mockImplementation((tr: any) => ({ snap: tr.id }));
  state.invoke.mockReset();
  state.t.mockClear();
  (window as { api?: unknown }).api = { invoke: state.invoke };
  dispatchSpy = vi.spyOn(window, 'dispatchEvent');
});

afterEach(() => {
  delete (window as { api?: unknown }).api;
  dispatchSpy.mockRestore();
  vi.restoreAllMocks();
});

describe('track menu', () => {
  it('builds labels from favourites, selection and options', async () => {
    const { trackMenu } = await menuDefs();
    const item = track('a');
    let menu = trackMenu(item, { onEdit: vi.fn() });
    expect(menu.defs.map((d) => d.label)).toEqual(
      expect.arrayContaining([
        'common.play',
        'common.addFav',
        'ctx.selectTrack',
        'common.addToQueue',
        'ctx.playNext',
        'common.editTags',
        'ctx.musicBrainzSearch',
        'common.showInFolder',
        'ctx.showInExplorer',
        'explorer.copyPath'
      ])
    );

    state.player.isFavorite.mockReturnValue(true);
    state.selection.has.mockReturnValue(true);
    menu = trackMenu(item, { onEdit: vi.fn() });
    expect(menu.defs.some((d) => d.label === 'common.removeFav')).toBe(true);
    expect(menu.defs.some((d) => d.label === 'ctx.deselectTrack')).toBe(true);
  });

  it('gates optional entries with predicates', async () => {
    const { trackMenu } = await menuDefs();
    const selectionEntry = trackMenu(track('a')).defs.find((d) => d.label === 'ctx.selectTrack')!;
    expect(selectionEntry.when?.({} as never)).toBe(true);

    const noSelection = await (async () => {
      const { createLibraryMenuDefs } = await import('../libraryMenuDefs');
      return createLibraryMenuDefs({ ...deps(), selection: undefined });
    })();
    const gated = noSelection
      .trackMenu(track('a'))
      .defs.find((d) => d.label === 'ctx.selectTrack')!;
    expect(gated.when?.({} as never)).toBe(false);

    const edit = trackMenu(track('a')).defs.find((d) => d.label === 'common.editTags')!;
    expect(edit.when?.({} as never)).toBe(false);
    expect(
      trackMenu(track('a'), { onEdit: vi.fn() })
        .defs.find((d) => d.label === 'common.editTags')!
        .when?.({} as never)
    ).toBe(true);

    const mb = trackMenu(track('a')).defs.find((d) => d.label === 'ctx.musicBrainzSearch')!;
    expect(mb.when?.({ track: track('x', { type: 'video' }) } as never)).toBe(false);
    expect(mb.when?.({ track: track('x') } as never)).toBe(true);
  });

  it('plays, queues and favourites through the context argument', async () => {
    const { trackMenu } = await menuDefs();
    const item = track('a');
    const { defs, ctx } = trackMenu(item);

    firstAction(defs).action?.(ctx);
    expect(state.player.setTrack).toHaveBeenCalledWith(item);
    expect(state.player.play).toHaveBeenCalled();

    byLabel(defs, 'common.addFav')!.action?.(ctx);
    expect(state.player.toggleFavorite).toHaveBeenCalledWith(item.path);

    byLabel(defs, 'ctx.selectTrack')!.action?.(ctx);
    expect(state.selection.toggle).toHaveBeenCalledWith(item.path);

    byLabel(defs, 'common.addToQueue')!.action?.(ctx);
    expect(state.player.addToQueue).toHaveBeenCalledWith(item);
  });

  it('inserts after the current track or appends when it is missing', async () => {
    const { trackMenu } = await menuDefs();
    const item = track('a');
    let menu = trackMenu(item);
    byLabel(menu.defs, 'ctx.playNext')!.action?.(menu.ctx);
    expect(state.player.insertInQueue).toHaveBeenCalledWith(1, item);

    state.player.currentTrack = track('missing');
    menu = trackMenu(item);
    byLabel(menu.defs, 'ctx.playNext')!.action?.(menu.ctx);
    expect(state.player.addToQueue).toHaveBeenCalledWith(item);
  });

  it('invokes the edit callback', async () => {
    const { trackMenu } = await menuDefs();
    const onEdit = vi.fn();
    const menu = trackMenu(track('a'), { onEdit });
    byLabel(menu.defs, 'common.editTags')!.action?.(menu.ctx);
    expect(onEdit).toHaveBeenCalled();
    expect(menu.ctx.onEdit).toBe(onEdit);
  });

  it('dispatches MusicBrainz searches with metadata', async () => {
    const { trackMenu } = await menuDefs();
    const item = track('a');
    const menu = trackMenu(item);
    byLabel(menu.defs, 'ctx.musicBrainzSearch')!.action?.(menu.ctx);

    const event = dispatchSpy.mock.calls.at(-1)![0] as CustomEvent;
    expect(event.type).toBe('onda:openMusicbrainz');
    expect(event.detail).toEqual({ query: 'Artist Album Title', track: item });
  });

  it('falls back to the file name for the MusicBrainz query', async () => {
    const { trackMenu } = await menuDefs();
    const item = track('a', { metadata: {} });
    const menu = trackMenu(item);
    byLabel(menu.defs, 'ctx.musicBrainzSearch')!.action?.(menu.ctx);
    expect((dispatchSpy.mock.calls.at(-1)![0] as CustomEvent).detail.query).toBe('a');
  });

  it('reveals and copies paths', async () => {
    const { trackMenu } = await menuDefs();
    const item = track('a');
    const menu = trackMenu(item);
    byLabel(menu.defs, 'common.showInFolder')!.action?.(menu.ctx);
    byLabel(menu.defs, 'ctx.showInExplorer')!.action?.(menu.ctx);
    byLabel(menu.defs, 'explorer.copyPath')!.action?.(menu.ctx);
    expect(state.revealInFolder).toHaveBeenCalledWith(item.path);
    expect(state.revealInExplorer).toHaveBeenCalledWith(item.path);
    expect(state.copyPath).toHaveBeenCalledWith(item.path);
  });
});

describe('playlist entries in the track menu', () => {
  it('shows a separator when there are no playlists', async () => {
    state.library.playlists = [];
    const { trackMenu } = await menuDefs();
    const labels = trackMenu(track('a')).defs.map((d) => d.label);
    expect(labels.filter((label) => label === '')).toHaveLength(1);
  });

  it('adds and removes tracks from playlists', async () => {
    const { trackMenu } = await menuDefs();
    const item = track('new');
    const menu = trackMenu(item);

    byLabel(menu.defs, '+ Playlist p1')!.action?.(menu.ctx);
    expect(state.library.addToPlaylist).toHaveBeenCalledWith('p1', item);

    byLabel(menu.defs, '+ Playlist p2')!.action?.(menu.ctx);
    expect(state.library.addToPlaylist).toHaveBeenCalledWith('p2', item);

    state.library.playlists = [playlist('p1', [item])];
    const withTrack = (await menuDefs()).trackMenu(item);
    expect(withTrack.defs.some((d) => d.label === '− Playlist p1')).toBe(true);
    byLabel(withTrack.defs, '− Playlist p1')!.action?.(withTrack.ctx);
    expect(state.library.removeFromPlaylist).toHaveBeenCalledWith('p1', item.path);
  });

  it('appends plugin commands with a snapshot', async () => {
    state.plugins.commandsIn.mockReturnValue([
      { id: 'cmd1', label: 'Plugin One' },
      { id: 'cmd2', label: 'Plugin Two' }
    ]);
    const { trackMenu } = await menuDefs();
    const item = track('a');
    const menu = trackMenu(item);

    expect(state.plugins.commandsIn).toHaveBeenCalledWith('track-menu');
    expect(state.snapshotTrack).toHaveBeenCalledWith(item);
    byLabel(menu.defs, 'Plugin One')!.action?.(menu.ctx);
    expect(state.plugins.invokeCommandWithContext).toHaveBeenCalledWith('cmd1', { snap: 'a' });
  });
});

describe('album menu', () => {
  it('builds labels and gates path copying', async () => {
    const { albumMenu } = await menuDefs();
    const tracks = [track('a'), track('b')];
    const menu = albumMenu('Album X', tracks);
    expect(menu.defs.map((d) => d.label)).toEqual([
      'common.playAlbum (2)',
      'common.addAllToQueue',
      'ctx.musicBrainzAlbum',
      'ctx.showInExplorer',
      'explorer.copyPath'
    ]);
    expect(byLabel(menu.defs, 'explorer.copyPath')!.when?.(menu.ctx)).toBe(true);
    const empty = albumMenu('Empty', []);
    expect(byLabel(empty.defs, 'explorer.copyPath')!.when?.(empty.ctx)).toBe(false);
  });

  it('plays, queues and searches the album', async () => {
    const { albumMenu } = await menuDefs();
    const tracks = [track('a'), track('b'), track('c')];
    const menu = albumMenu('Album X', tracks);

    byLabel(menu.defs, 'common.playAlbum (3)')!.action?.(menu.ctx);
    expect(state.player.clearQueue).toHaveBeenCalled();
    expect(state.player.addToQueueMultiple).toHaveBeenCalledWith([tracks[1], tracks[2]]);
    expect(state.player.setTrack).toHaveBeenCalledWith(tracks[0]);
    expect(state.player.play).toHaveBeenCalled();

    byLabel(menu.defs, 'common.addAllToQueue')!.action?.(menu.ctx);
    expect(state.player.addToQueue).toHaveBeenCalledTimes(3);

    byLabel(menu.defs, 'ctx.musicBrainzAlbum')!.action?.(menu.ctx);
    expect((dispatchSpy.mock.calls.at(-1)![0] as CustomEvent).detail).toEqual({
      query: 'Album X',
      batchTracks: tracks
    });

    byLabel(menu.defs, 'ctx.showInExplorer')!.action?.(menu.ctx);
    byLabel(menu.defs, 'explorer.copyPath')!.action?.(menu.ctx);
    expect(state.revealInExplorer).toHaveBeenCalledWith(tracks[0].path);
    expect(state.copyPath).toHaveBeenCalledWith(tracks[0].path);
  });

  it('handles empty album lists safely', async () => {
    const { albumMenu } = await menuDefs();
    const menu = albumMenu('Empty', []);
    byLabel(menu.defs, 'common.playAlbum (0)')!.action?.(menu.ctx);
    byLabel(menu.defs, 'ctx.showInExplorer')!.action?.(menu.ctx);
    byLabel(menu.defs, 'explorer.copyPath')!.action?.(menu.ctx);
    expect(state.player.clearQueue).not.toHaveBeenCalled();
    expect(state.revealInExplorer).not.toHaveBeenCalled();
    expect(state.copyPath).not.toHaveBeenCalled();
  });
});

describe('folder menu', () => {
  it('offers play actions only with playable tracks', async () => {
    const { folderMenu } = await menuDefs();
    const tracks = [track('a'), track('b', { type: 'image' })];
    const menu = folderMenu('C:/music/Album', tracks);
    expect(menu.defs[0].label).toBe('ctx.playFolder:{"count":1}');
    expect(menu.defs[0].when?.({} as never)).toBe(true);
    expect(byLabel(menu.defs, 'ctx.playShuffle')!.when?.({} as never)).toBe(true);
    expect(byLabel(menu.defs, 'common.addAllToQueue')!.when?.({} as never)).toBe(true);
    expect(byLabel(menu.defs, 'ctx.musicBrainzFolder')!.when?.({} as never)).toBe(true);

    const empty = folderMenu('C:/empty', [track('i', { type: 'image' })]);
    expect(empty.defs[0].when?.({} as never)).toBe(false);
    expect(byLabel(empty.defs, 'ctx.playShuffle')!.when?.({} as never)).toBe(false);
  });

  it('plays, shuffles, queues and searches without images', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { folderMenu } = await menuDefs();
    const tracks = [track('a'), track('b'), track('image', { type: 'image' })];
    const menu = folderMenu('C:/music/Album', tracks);

    menu.defs[0].action?.(menu.ctx);
    expect(state.player.addToQueueMultiple).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'b' })
    ]);
    expect(state.player.setTrack).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));

    byLabel(menu.defs, 'ctx.playShuffle')!.action?.();
    expect(state.player.clearQueue).toHaveBeenCalled();

    byLabel(menu.defs, 'common.addAllToQueue')!.action?.();
    expect(state.player.addToQueue).toHaveBeenCalledTimes(2);

    byLabel(menu.defs, 'ctx.musicBrainzFolder')!.action?.();
    expect((dispatchSpy.mock.calls.at(-1)![0] as CustomEvent).detail).toEqual({
      query: 'Album',
      batchTracks: [expect.objectContaining({ id: 'a' }), expect.objectContaining({ id: 'b' })]
    });
  });

  it('reveals and copies the folder path', async () => {
    const { folderMenu } = await menuDefs();
    const menu = folderMenu('C:/music/Album', [track('a')]);
    byLabel(menu.defs, 'ctx.showInExplorer')!.action?.();
    byLabel(menu.defs, 'common.showInFolder')!.action?.();
    byLabel(menu.defs, 'explorer.copyPath')!.action?.();
    expect(state.revealInExplorer).toHaveBeenCalledWith('C:/music/Album');
    expect(state.revealInFolder).toHaveBeenCalledWith('C:/music/Album');
    expect(state.copyPath).toHaveBeenCalledWith('C:/music/Album');
  });
});

describe('image menu', () => {
  it('opens, reveals and copies image paths', async () => {
    const { imageMenu } = await menuDefs();
    const file = track('pic', { type: 'image', path: 'C:/pics/pic.png' });
    const onOpen = vi.fn();
    const menu = imageMenu(file, onOpen);

    expect(menu.defs.map((d) => d.label)).toEqual([
      'explorer.openImage',
      'ctx.showInExplorer',
      'common.showInFolder',
      'explorer.copyPath'
    ]);
    byLabel(menu.defs, 'explorer.openImage')!.action?.(menu.ctx);
    byLabel(menu.defs, 'ctx.showInExplorer')!.action?.(menu.ctx);
    byLabel(menu.defs, 'common.showInFolder')!.action?.(menu.ctx);
    byLabel(menu.defs, 'explorer.copyPath')!.action?.(menu.ctx);
    expect(onOpen).toHaveBeenCalled();
    expect(state.revealInExplorer).toHaveBeenCalledWith(file.path);
    expect(state.revealInFolder).toHaveBeenCalledWith(file.path);
    expect(state.copyPath).toHaveBeenCalledWith(file.path);
  });

  it('is safe without an opener', async () => {
    const { imageMenu } = await menuDefs();
    const menu = imageMenu(track('pic', { type: 'image' }));
    expect(() => byLabel(menu.defs, 'explorer.openImage')!.action?.(menu.ctx)).not.toThrow();
  });
});

describe('playlist menu', () => {
  it('offers playback only for non-empty playlists', async () => {
    const { playlistMenu } = await menuDefs();
    const onRename = vi.fn();
    const full = playlistMenu(playlist('p1', [track('a')]), onRename);
    expect(byLabel(full.defs, 'common.play')!.when?.(full.ctx)).toBe(true);
    expect(byLabel(full.defs, 'common.addAllToQueue')!.when?.(full.ctx)).toBe(true);

    const empty = playlistMenu(playlist('p2', []), onRename);
    expect(byLabel(empty.defs, 'common.play')!.when?.(empty.ctx)).toBe(false);
    expect(byLabel(empty.defs, 'common.addAllToQueue')!.when?.(empty.ctx)).toBe(false);
    expect(empty.defs.filter((d) => d.label === '')).toHaveLength(2);
  });

  it('plays, queues, exports, renames and deletes', async () => {
    const { playlistMenu } = await menuDefs();
    const pl = playlist('p1', [track('a'), track('b')]);
    const onRename = vi.fn();
    const menu = playlistMenu(pl, onRename);

    byLabel(menu.defs, 'common.play')!.action?.(menu.ctx);
    expect(state.player.setTrack).toHaveBeenCalledWith(pl.tracks[0]);

    byLabel(menu.defs, 'common.addAllToQueue')!.action?.(menu.ctx);
    expect(state.player.addToQueue).toHaveBeenCalledTimes(2);

    byLabel(menu.defs, 'ctx.playlistRename')!.action?.(menu.ctx);
    expect(onRename).toHaveBeenCalledWith(pl);

    byLabel(menu.defs, 'ctx.playlistExport')!.action?.(menu.ctx);
    expect(state.invoke).toHaveBeenCalledWith('playlist:export', {
      id: 'p1',
      name: 'Playlist p1',
      tracks: ['C:/music/a.mp3', 'C:/music/b.mp3']
    });

    byLabel(menu.defs, 'ctx.playlistDelete')!.action?.(menu.ctx);
    expect(state.library.deletePlaylist).toHaveBeenCalledWith('p1');
    expect(menu.ctx.onRename).toBe(onRename);
  });
});
