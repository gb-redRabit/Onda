import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref, shallowRef } from 'vue';

const h = vi.hoisted(() => ({
  loggerWarn: vi.fn(),
  handlers: new Map<string, (...args: unknown[]) => void>(),
  on: vi.fn((channel: string, callback: (...args: unknown[]) => void) => {
    h.handlers.set(channel, callback);
    return () => h.handlers.delete(channel);
  }),
  invoke: vi.fn()
}));

vi.mock('@shared/logger', () => ({
  logger: { warn: h.loggerWarn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import { createLibraryWatch } from '../library-watch';
import type { MediaFile, Playlist } from '@renderer/types/media';

function track(path: string): MediaFile {
  return {
    id: path,
    name: path,
    path,
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    size: 1,
    type: 'audio',
    addedAt: 0,
    playCount: 0
  };
}

function setup(loaded = true) {
  const deps = {
    isLoaded: ref(loaded),
    tracks: shallowRef([track('/a.mp3'), track('/b.mp3'), track('/c.mp3')]),
    folderTypes: ref<Record<string, 'audio' | 'video' | 'image' | 'mixed'>>({ '/': 'mixed' }),
    playlists: ref<Playlist[]>([]),
    scheduleLoadTracksAsync: vi.fn(async () => undefined)
  };
  const watch = createLibraryWatch(deps);
  watch.subscribeLibraryUpdates();
  return { deps, ...watch };
}

function emit(channel: string, ...args: unknown[]) {
  h.handlers.get(channel)?.(...args);
}

beforeEach(() => {
  h.handlers.clear();
  h.on.mockClear();
  h.invoke.mockReset();
  h.loggerWarn.mockClear();
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ...window.api, on: h.on, invoke: h.invoke }
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('reloadPlaylists', () => {
  it('replaces playlists with the loaded list', async () => {
    h.invoke.mockResolvedValue([{ id: 'p1', name: 'One' }]);
    const { deps, reloadPlaylists } = setup();

    await reloadPlaylists();

    expect(h.invoke).toHaveBeenCalledWith('playlist:loadAll');
    expect(deps.playlists.value).toHaveLength(1);
  });

  it('keeps the current list when the response is empty and swallows errors', async () => {
    h.invoke.mockResolvedValue(undefined);
    const { deps, reloadPlaylists } = setup();
    deps.playlists.value = [{ id: 'keep' } as Playlist];

    await reloadPlaylists();
    expect(deps.playlists.value).toEqual([{ id: 'keep' }]);

    h.invoke.mockRejectedValue(new Error('offline'));
    await expect(reloadPlaylists()).resolves.toBeUndefined();
  });
});

describe('subscription', () => {
  it('subscribes only once', () => {
    const { subscribeLibraryUpdates } = setup();

    subscribeLibraryUpdates();

    expect(h.on).toHaveBeenCalledTimes(2);
  });

  it('reloads tracks and playlists on library:updated when loaded', async () => {
    const { deps } = setup(true);
    h.invoke.mockResolvedValue([]);

    emit('library:updated');
    await Promise.resolve();

    expect(deps.scheduleLoadTracksAsync).toHaveBeenCalledTimes(1);
    expect(h.invoke).toHaveBeenCalledWith('playlist:loadAll');
  });

  it('skips the track reload before the library is loaded', async () => {
    const { deps } = setup(false);
    h.invoke.mockResolvedValue([]);

    emit('library:updated');
    await Promise.resolve();

    expect(deps.scheduleLoadTracksAsync).not.toHaveBeenCalled();
    expect(h.invoke).toHaveBeenCalledWith('playlist:loadAll');
  });
});

describe('library:fileMissing batching', () => {
  it('ignores empty or non-string paths', () => {
    const { deps } = setup();

    emit('library:fileMissing', undefined);
    emit('library:fileMissing', '');
    emit('library:fileMissing', 42);

    expect(deps.tracks.value).toHaveLength(3);
  });

  it('removes all reported files in one batch and persists the result', async () => {
    vi.useFakeTimers();
    const { deps } = setup();

    emit('library:fileMissing', '/a.mp3');
    emit('library:fileMissing', '/c.mp3');
    expect(deps.tracks.value).toHaveLength(3);
    expect(h.invoke).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);

    expect(deps.tracks.value.map((item) => item.path)).toEqual(['/b.mp3']);
    expect(h.invoke).toHaveBeenCalledWith('library:saveScanned', {
      files: [expect.objectContaining({ path: '/b.mp3' })],
      folderTypes: { '/': 'mixed' }
    });
  });

  it('does not persist when no track was removed', () => {
    vi.useFakeTimers();
    const { deps } = setup();

    emit('library:fileMissing', '/missing.mp3');
    vi.advanceTimersByTime(300);

    expect(deps.tracks.value).toHaveLength(3);
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('logs when persisting the pruned library fails', () => {
    vi.useFakeTimers();
    const { deps } = setup();
    deps.folderTypes.value = {
      '/': 1n as never,
      broken: (() => undefined) as never
    } as never;

    emit('library:fileMissing', '/a.mp3');
    vi.advanceTimersByTime(300);

    expect(h.loggerWarn).toHaveBeenCalledWith(
      'library',
      'failed to persist scanned library after missing files',
      expect.any(Error)
    );
  });

  it('starts a new batch after the previous one flushed', () => {
    vi.useFakeTimers();
    const { deps } = setup();

    emit('library:fileMissing', '/a.mp3');
    vi.advanceTimersByTime(300);
    emit('library:fileMissing', '/b.mp3');
    vi.advanceTimersByTime(300);

    expect(deps.tracks.value).toHaveLength(1);
    expect(deps.tracks.value[0].path).toBe('/c.mp3');
  });
});
