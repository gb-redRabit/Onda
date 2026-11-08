import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSmartPlaylists } from '../smart-playlists';
import type { SmartPlaylist, SmartPlaylistRule } from '@shared/types/smart-playlist';

const api = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn()
}));

function installApi() {
  (window as unknown as { api?: unknown }).api = {
    loadSmartPlaylists: api.load,
    saveSmartPlaylists: api.save
  };
}

function rules(): SmartPlaylistRule[] {
  return [{ field: 'artist', operator: 'contains', value: 'Onda' }];
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    name: '  Focus  ',
    match: 'all' as const,
    rules: rules(),
    sort: 'title' as const,
    sortDir: 'asc' as const,
    limit: 25,
    ...overrides
  };
}

function saved(): SmartPlaylist[] {
  return api.save.mock.calls[0][0] as SmartPlaylist[];
}

let uuidCounter = 0;

beforeEach(() => {
  setActivePinia(createPinia());
  api.load.mockReset();
  api.load.mockResolvedValue([]);
  api.save.mockReset();
  api.save.mockResolvedValue(undefined);
  installApi();
  uuidCounter = 0;
  vi.spyOn(crypto, 'randomUUID').mockImplementation(
    () => `uuid-${++uuidCounter}` as unknown as ReturnType<typeof crypto.randomUUID>
  );
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('ensureLoaded', () => {
  it('loads the stored playlists once', async () => {
    const stored = [{ id: 'p1', name: 'Stored' } as SmartPlaylist];
    api.load.mockResolvedValueOnce(stored);
    const store = useSmartPlaylists();

    expect(store.loading).toBe(false);
    const pending = store.ensureLoaded();
    expect(store.loading).toBe(true);
    await pending;

    expect(api.load).toHaveBeenCalledTimes(1);
    expect(store.smartPlaylists).toEqual(stored);
    expect(store.loaded).toBe(true);
    expect(store.loading).toBe(false);

    await store.ensureLoaded();
    expect(api.load).toHaveBeenCalledTimes(1);
  });

  it('shares a single in-flight load between callers', async () => {
    let resolveLoad: ((value: SmartPlaylist[]) => void) | null = null;
    api.load.mockImplementationOnce(
      () =>
        new Promise<SmartPlaylist[]>((resolve) => {
          resolveLoad = resolve;
        })
    );
    const store = useSmartPlaylists();

    const first = store.ensureLoaded();
    const second = store.ensureLoaded();
    expect(api.load).toHaveBeenCalledTimes(1);

    resolveLoad!([{ id: 'p1', name: 'Shared' } as SmartPlaylist]);
    await Promise.all([first, second]);
    expect(store.smartPlaylists).toHaveLength(1);
  });

  it('ignores non-array payloads', async () => {
    api.load.mockResolvedValueOnce({ nope: true });
    const store = useSmartPlaylists();

    await store.ensureLoaded();
    expect(store.smartPlaylists).toEqual([]);
    expect(store.loaded).toBe(true);
  });

  it('marks the store loaded even when the bridge throws', async () => {
    api.load.mockRejectedValueOnce(new Error('ipc'));
    const store = useSmartPlaylists();

    await expect(store.ensureLoaded()).resolves.toBeUndefined();
    expect(store.smartPlaylists).toEqual([]);
    expect(store.loaded).toBe(true);
    expect(store.loading).toBe(false);
  });

  it('works without the bridge', async () => {
    delete (window as unknown as { api?: unknown }).api;
    const store = useSmartPlaylists();

    await store.ensureLoaded();
    expect(store.loaded).toBe(true);
  });
});

describe('create', () => {
  it('trims the name, clones the rules and schedules a save', async () => {
    vi.useFakeTimers();
    const store = useSmartPlaylists();
    const sourceRules = rules();

    const created = store.create(input({ rules: sourceRules }));

    expect(created).toMatchObject({
      id: 'smart-uuid-1',
      name: 'Focus',
      match: 'all',
      sort: 'title',
      sortDir: 'asc',
      limit: 25
    });
    expect(created.rules).toEqual(sourceRules);
    expect(created.rules).not.toBe(sourceRules);
    expect(created.rules[0]).not.toBe(sourceRules[0]);
    expect(created.createdAt).toBe(created.updatedAt);
    expect(store.smartPlaylists.map((playlist) => playlist.id)).toContain(created.id);
    // Debounced: nothing written yet.
    expect(api.save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(399);
    expect(api.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(saved()[0]).toMatchObject({ id: 'smart-uuid-1', name: 'Focus' });
  });

  it('coalesces rapid saves into one write', async () => {
    vi.useFakeTimers();
    const store = useSmartPlaylists();

    store.create(input({ name: 'One' }));
    await vi.advanceTimersByTimeAsync(200);
    store.create(input({ name: 'Two' }));
    await vi.advanceTimersByTimeAsync(399);
    expect(api.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(api.save).toHaveBeenCalledTimes(1);
    expect(saved().map((playlist) => playlist.name)).toEqual(['One', 'Two']);
  });
});

describe('update', () => {
  it('returns null for an unknown playlist', () => {
    const store = useSmartPlaylists();
    expect(store.update('missing', { name: 'X' })).toBeNull();
    expect(api.save).not.toHaveBeenCalled();
  });

  it('applies only the provided fields and clones rules', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const store = useSmartPlaylists();
    const created = store.create(input());
    const replacement = rules();
    vi.setSystemTime(2000);

    const updated = store.update(created.id, {
      name: '  Renamed ',
      sortDir: 'desc',
      rules: replacement
    });

    expect(updated).not.toBeNull();
    expect(updated!.id).toBe(created.id);
    expect(created.name).toBe('Renamed');
    expect(created.sortDir).toBe('desc');
    expect(created.match).toBe('all');
    expect(created.limit).toBe(25);
    expect(created.rules).toEqual(replacement);
    expect(created.rules).not.toBe(replacement);
    expect(created.updatedAt).toBe(2000);
    expect(created.createdAt).toBe(1000);

    await vi.advanceTimersByTimeAsync(400);
    expect(api.save).toHaveBeenCalledTimes(1);
  });

  it('supports every editable field individually', () => {
    vi.useFakeTimers();
    const store = useSmartPlaylists();
    const created = store.create(input());

    store.update(created.id, {
      match: 'any',
      sort: 'artist',
      limit: 0
    });

    expect(created).toMatchObject({ match: 'any', sort: 'artist', limit: 0 });
    expect(created.name).toBe('Focus');
  });
});

describe('remove', () => {
  it('removes an existing playlist and saves', async () => {
    vi.useFakeTimers();
    const store = useSmartPlaylists();
    const first = store.create(input({ name: 'One' }));
    store.create(input({ name: 'Two' }));

    expect(store.remove(first.id)).toBe(true);
    expect(store.smartPlaylists.map((playlist) => playlist.name)).toEqual(['Two']);

    await vi.advanceTimersByTimeAsync(400);
    expect(saved().map((playlist) => playlist.name)).toEqual(['Two']);
  });

  it('reports a miss without scheduling a save', () => {
    vi.useFakeTimers();
    const store = useSmartPlaylists();

    expect(store.remove('missing')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('saveNow', () => {
  it('flushes a pending debounce immediately', async () => {
    vi.useFakeTimers();
    const store = useSmartPlaylists();
    store.create(input());

    await store.saveNow();

    expect(api.save).toHaveBeenCalledTimes(1);
    // The pending timer must be cancelled, not fired again.
    await vi.advanceTimersByTimeAsync(500);
    expect(api.save).toHaveBeenCalledTimes(1);
  });

  it('can be called with no pending save', async () => {
    const store = useSmartPlaylists();
    await store.saveNow();
    expect(api.save).toHaveBeenCalledWith([]);
  });

  it('saves a plain copy of the state', async () => {
    const store = useSmartPlaylists();
    store.create(input());

    await store.saveNow();

    expect(api.save.mock.calls[0][0]).toEqual(store.smartPlaylists);
    expect(api.save.mock.calls[0][0]).not.toBe(store.smartPlaylists);
  });

  it('swallows persistence failures', async () => {
    api.save.mockRejectedValueOnce(new Error('disk'));
    const store = useSmartPlaylists();
    store.create(input());

    await expect(store.saveNow()).resolves.toBeUndefined();
    expect(store.smartPlaylists).toHaveLength(1);
  });

  it('works without the bridge', async () => {
    delete (window as unknown as { api?: unknown }).api;
    const store = useSmartPlaylists();
    store.create(input());

    await expect(store.saveNow()).resolves.toBeUndefined();
  });
});
