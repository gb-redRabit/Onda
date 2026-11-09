import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  clone: vi.fn((value: unknown) => value),
  invoke: vi.fn(),
  writeCover: vi.fn(),
  invalidate: vi.fn(),
  updateTrack: vi.fn(),
  library: null as any,
  player: null as any
}));

vi.mock('@shared/logger', () => ({
  logger: { error: state.loggerError, warn: state.loggerWarn, info: vi.fn() }
}));
vi.mock('@renderer/utils/clone', () => ({ clonePlain: state.clone }));

import { useLibraryTagEditor } from '../useLibraryTagEditor';

function track(overrides: Record<string, unknown> = {}) {
  return {
    id: 'D:/music/song.flac',
    name: 'song.flac',
    path: 'D:/music/song.flac',
    type: 'audio',
    metadata: { title: 'Old', artist: 'Old artist', album: 'Old album', year: 1999 },
    ...overrides
  } as never;
}

function setup() {
  return useLibraryTagEditor(state.library, state.player);
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  state.loggerError.mockReset();
  state.loggerWarn.mockReset();
  state.clone.mockReset();
  state.clone.mockImplementation((value: unknown) => value);
  state.invoke.mockReset();
  state.invoke.mockResolvedValue(undefined);
  state.writeCover.mockReset();
  state.writeCover.mockResolvedValue(undefined);
  state.invalidate.mockReset();
  state.updateTrack.mockReset();
  state.library = {
    tracks: [track()],
    folderTypes: { 'D:/music': 'audio' },
    updateTrack: state.updateTrack
  };
  state.updateTrack.mockImplementation((path: string, fn: (item: any) => void) => {
    const target = state.library.tracks.find((item: any) => item.path === path);
    if (target) fn(target);
  });
  state.player = { invalidateCoverCache: state.invalidate };
  (window as unknown as { api?: unknown }).api = {
    invoke: state.invoke,
    writeCover: state.writeCover
  };
});

afterEach(() => {
  delete (window as unknown as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('tag edits', () => {
  it('updates metadata and renames with the original extension', () => {
    const editor = setup();
    editor.editingTrack.value = state.library.tracks[0];

    editor.onTagSaved({
      title: 'New title',
      artist: 'New artist',
      album: 'New album',
      year: 2020,
      genre: 'Rock',
      track: { no: 3 },
      name: 'Renamed'
    });

    const updated = state.library.tracks[0];
    expect(updated.metadata).toEqual({
      title: 'New title',
      artist: 'New artist',
      album: 'New album',
      year: 2020,
      genre: 'Rock',
      track: { no: 3 }
    });
    expect(updated.name).toBe('Renamed.flac');
    expect(state.invalidate).not.toHaveBeenCalled();
  });

  it('keeps metadata keys that were not edited', () => {
    const editor = setup();
    editor.editingTrack.value = state.library.tracks[0];

    editor.onTagSaved({ title: 'Only title' });

    expect(state.library.tracks[0].metadata).toEqual({
      title: 'Only title',
      artist: undefined,
      album: undefined,
      year: undefined,
      genre: undefined,
      track: undefined
    });
  });

  it('leaves the name alone when no new name is given', () => {
    const editor = setup();
    editor.editingTrack.value = state.library.tracks[0];

    editor.onTagSaved({ title: 'Title' });

    expect(state.library.tracks[0].name).toBe('song.flac');
  });

  it('handles files without an extension', () => {
    state.library.tracks[0] = track({ name: 'song' });
    const editor = setup();
    editor.editingTrack.value = state.library.tracks[0];

    editor.onTagSaved({ name: 'renamed' });

    expect(state.library.tracks[0].name).toBe('renamed');
  });

  it('moves the file and invalidates its cover', () => {
    const editor = setup();
    editor.editingTrack.value = state.library.tracks[0];

    editor.onTagSaved({ path: 'D:/music/moved.flac' });

    expect(state.library.tracks[0].path).toBe('D:/music/moved.flac');
    expect(state.library.tracks[0].id).toBe('D:/music/moved.flac');
    expect(state.invalidate).toHaveBeenCalledWith('D:/music/song.flac');
  });

  it('persists the scanned library', () => {
    const editor = setup();
    editor.editingTrack.value = state.library.tracks[0];

    editor.onTagSaved({ title: 'Title' });

    expect(state.clone).toHaveBeenCalledWith(state.library.tracks);
    expect(state.clone).toHaveBeenCalledWith(state.library.folderTypes);
    expect(state.invoke).toHaveBeenCalledWith('library:saveScanned', {
      files: state.library.tracks,
      folderTypes: state.library.folderTypes
    });
  });

  it('does nothing without an edited track', () => {
    const editor = setup();
    editor.onTagSaved({ title: 'x' });
    editor.onMBApply({ title: 'x' });

    expect(state.updateTrack).not.toHaveBeenCalled();
    expect(state.invoke).not.toHaveBeenCalled();
  });

  it('logs persistence failures', async () => {
    state.invoke.mockRejectedValueOnce(new Error('ipc'));
    const editor = setup();
    editor.editingTrack.value = state.library.tracks[0];

    editor.onTagSaved({ title: 'Title' });
    await flush();

    expect(state.loggerError).toHaveBeenCalledWith('Library', 'saveScanned', expect.any(Error));
  });

  it('swallows serialization failures', () => {
    state.clone.mockImplementationOnce(() => {
      throw new Error('clone');
    });
    const editor = setup();
    editor.editingTrack.value = state.library.tracks[0];

    expect(() => editor.onTagSaved({ title: 'Title' })).not.toThrow();
    expect(state.invoke).not.toHaveBeenCalled();
  });

  it('persists without the bridge', () => {
    delete (window as unknown as { api?: unknown }).api;
    const editor = setup();
    editor.editingTrack.value = state.library.tracks[0];

    expect(() => editor.onTagSaved({ title: 'Title' })).not.toThrow();
  });
});

describe('MusicBrainz apply', () => {
  it('merges fields and keeps existing values for missing data', () => {
    const editor = setup();
    editor.editingTrack.value = state.library.tracks[0];

    editor.onMBApply({ title: 'MB title', genre: 'Jazz' });

    expect(state.library.tracks[0].metadata).toEqual({
      title: 'MB title',
      artist: 'Old artist',
      album: 'Old album',
      year: 1999,
      genre: 'Jazz',
      track: undefined
    });
  });

  it('writes cover data and invalidates the cache', () => {
    const editor = setup();
    editor.editingTrack.value = state.library.tracks[0];
    editor.showingMBLookup.value = true;

    editor.onMBApply({ coverData: [1, 2, 3], coverMime: 'image/jpeg' });

    expect(state.writeCover).toHaveBeenCalledWith('D:/music/song.flac', [1, 2, 3]);
    expect(state.invalidate).toHaveBeenCalledWith('D:/music/song.flac');
    expect(editor.showingMBLookup.value).toBe(false);
    expect(editor.editingTrack.value).toBeNull();
  });

  it('skips cover work without cover data', () => {
    const editor = setup();
    editor.editingTrack.value = state.library.tracks[0];

    editor.onMBApply({ title: 'x' });

    expect(state.writeCover).not.toHaveBeenCalled();
    expect(state.invalidate).not.toHaveBeenCalled();
  });

  it('logs cover write and cache failures', () => {
    state.writeCover.mockImplementation(() => {
      throw new Error('write');
    });
    state.invalidate.mockImplementation(() => {
      throw new Error('cache');
    });
    const editor = setup();
    editor.editingTrack.value = state.library.tracks[0];

    editor.onMBApply({ coverData: [1] });

    expect(state.loggerWarn).toHaveBeenCalledWith(
      'Library',
      'writeCover failed',
      expect.any(Error)
    );
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'Library',
      'invalidateCoverCache failed',
      expect.any(Error)
    );
  });

  it('swallows persistence failures after apply', () => {
    state.clone.mockImplementation(() => {
      throw new Error('clone');
    });
    const editor = setup();
    editor.editingTrack.value = state.library.tracks[0];

    expect(() => editor.onMBApply({ title: 'x' })).not.toThrow();
    expect(state.invoke).not.toHaveBeenCalled();
    expect(editor.editingTrack.value).toBeNull();
  });

  it('persists after a successful apply', () => {
    const editor = setup();
    editor.editingTrack.value = state.library.tracks[0];

    editor.onMBApply({ title: 'x' });

    expect(state.invoke).toHaveBeenCalledWith('library:saveScanned', expect.any(Object));
  });
});
