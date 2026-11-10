import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive, ref } from 'vue';

const state = vi.hoisted(() => ({
  player: null as any,
  library: null as any,
  settings: null as any,
  ui: null as any,
  audio: null as any,
  snapshot: vi.fn(),
  manifests: {} as Record<string, any>,
  settingsValues: {} as Record<string, Record<string, unknown>>,
  saveSetting: vi.fn(),
  visuals: null as any,
  slots: null as any,
  isSlot: vi.fn((slot: string) => slot === 'player.actions'),
  sanitize: vi.fn((items: unknown) => (Array.isArray(items) ? items : null)),
  pluginsFetch: vi.fn(),
  storageKeys: vi.fn(),
  storageGet: vi.fn(),
  storageSet: vi.fn(),
  storageRemove: vi.fn()
}));

vi.mock('@shared/plugin-ui-slots', () => ({
  isPluginUiSlot: state.isSlot,
  sanitizeSlotItems: state.sanitize
}));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/stores/library', () => ({ useLibraryStore: () => state.library }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => state.ui }));
vi.mock('@renderer/composables/useAudioPlayer', () => ({ useAudioPlayer: () => state.audio }));
vi.mock('@renderer/utils/plugins-helpers', () => ({
  LAYOUT_ELEMENT_IDS: ['cover', 'visualization'],
  PLUGIN_HOST_VARIANTS: { cover: ['ring'], visualization: ['bars'] },
  PLUGIN_VISUAL_KEY: 'visual',
  get snapshotTrack() {
    return state.snapshot;
  }
}));

import { createPluginApi } from '../pluginApi';

function setup(pluginId = 'plugin-1') {
  const dispatch = createPluginApi({
    getManifest: (id) => state.manifests[id],
    getSettings: (id) => state.settingsValues[id] ?? {},
    saveSetting: state.saveSetting,
    visuals: state.visuals,
    slots: state.slots
  });
  return {
    query: (name: string, args: Record<string, unknown> = {}) =>
      dispatch('query', [name, args], pluginId),
    action: (name: string, args: Record<string, unknown> = {}) =>
      dispatch('action', [name, args], pluginId),
    op: (op: string, ...args: unknown[]) => dispatch(op, args, pluginId),
    dispatch
  };
}

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    permissions: { visual: true, player: true, notifications: true, storage: true },
    layoutElements: [{ element: 'cover', variant: 'ring' }],
    uiSlots: ['player.actions'],
    settings: [{ key: 'theme' }],
    ...overrides
  };
}

beforeEach(() => {
  state.player = reactive({
    currentTrack: { path: 'D:/a.mp3', name: 'A' },
    isPlaying: true,
    volume: 0.5,
    shuffle: false,
    repeat: 'off',
    queueLength: 3,
    currentTime: 20,
    duration: 100,
    progress: 20,
    play: vi.fn(),
    pause: vi.fn(),
    togglePlay: vi.fn(),
    nextTrack: vi.fn(),
    prevTrack: vi.fn(),
    setVolume: vi.fn(),
    seek: vi.fn(),
    addToQueueMultiple: vi.fn(),
    toggleFavorite: vi.fn(async () => undefined)
  });
  state.library = {
    tracks: [
      { path: 'D:/a.mp3', name: 'A' },
      { path: 'D:/b.mp3', name: 'B' }
    ],
    audioCount: 2,
    playlists: [{ id: 'p1' }],
    search: vi.fn(() => [
      { path: 'D:/a.mp3', name: 'A' },
      { path: 'D:/b.mp3', name: 'B' }
    ])
  };
  state.settings = { playback: { playbackSpeed: 1.5 } };
  state.ui = { notify: vi.fn() };
  state.audio = { getAnalyserNode: vi.fn(() => null) };
  state.snapshot = vi.fn((track: any) =>
    track
      ? { path: track.path, title: track.name, artist: 'Artist', album: 'Album', duration: 3 }
      : null
  );
  state.manifests = { 'plugin-1': manifest() };
  state.settingsValues = { 'plugin-1': { theme: 'dark', other: 1 } };
  state.saveSetting.mockReset();
  state.saveSetting.mockResolvedValue(true);
  state.visuals = ref({});
  state.slots = ref({});
  state.isSlot.mockClear();
  state.sanitize.mockClear();
  state.pluginsFetch.mockReset();
  state.pluginsFetch.mockResolvedValue({
    success: true,
    status: 200,
    statusText: 'OK',
    headers: { h: 'v' },
    data: { ok: true }
  });
  state.storageKeys.mockReset();
  state.storageKeys.mockResolvedValue(['k']);
  state.storageGet.mockReset();
  state.storageGet.mockResolvedValue('v');
  state.storageSet.mockReset();
  state.storageSet.mockResolvedValue(true);
  state.storageRemove.mockReset();
  state.storageRemove.mockResolvedValue(true);
  (window as unknown as { api: unknown }).api = {
    pluginsFetch: state.pluginsFetch,
    pluginsStorageKeys: state.storageKeys,
    pluginsStorageGet: state.storageGet,
    pluginsStorageSet: state.storageSet,
    pluginsStorageRemove: state.storageRemove
  };
});

describe('queries', () => {
  it('reports player status and progress', async () => {
    const api = setup();

    await expect(api.query('player:status')).resolves.toEqual({
      currentTrack: {
        path: 'D:/a.mp3',
        title: 'A',
        artist: 'Artist',
        album: 'Album',
        duration: 3
      },
      isPlaying: true,
      volume: 0.5,
      shuffle: false,
      repeat: 'off',
      queueLength: 3
    });
    await expect(api.query('player:progress')).resolves.toEqual({
      position: 20,
      duration: 100,
      progress: 20,
      rate: 1.5,
      playing: true,
      track: expect.objectContaining({ path: 'D:/a.mp3' })
    });
  });

  it('returns empty spectrum data without an analyser', async () => {
    const api = setup();
    const result = (await api.query('player:spectrum', { bins: 2 })) as any;

    expect(result.available).toBe(false);
    expect(result.bins).toEqual([0, 0, 0, 0]);
  });

  it('requires the visual permission for spectrum', async () => {
    state.manifests['plugin-1'] = manifest({ permissions: { visual: false } });
    const api = setup();
    await expect(api.query('player:spectrum')).rejects.toThrow('permission-denied:visual');
  });

  it('normalises spectrum buckets', async () => {
    state.audio.getAnalyserNode.mockReturnValue({
      frequencyBinCount: 1024,
      getByteFrequencyData: (buffer: Uint8Array) => buffer.fill(128)
    });
    const api = setup();

    const result = (await api.query('player:spectrum', { bins: 200 })) as any;

    expect(result.available).toBe(true);
    expect(result.bins).toHaveLength(64);
    expect(result.bins[0]).toBeGreaterThan(0);
    expect(result.bins[0]).toBeLessThanOrEqual(1);
  });

  it('reports library counts and search', async () => {
    const api = setup();

    await expect(api.query('library:count')).resolves.toEqual({
      tracks: 2,
      audio: 2,
      playlists: 1
    });

    const search = (await api.query('library:search', { query: 'a', limit: 1 })) as any;
    expect(state.library.search).toHaveBeenCalledWith('a');
    expect(search.tracks).toHaveLength(1);
  });

  it('uses the track list for empty searches and caps the limit', async () => {
    state.snapshot.mockReturnValue(null);
    const api = setup();

    const result = (await api.query('library:search', { query: '', limit: 999 })) as any;
    expect(result.tracks).toEqual([null, null]);
  });

  it('rejects unknown queries', async () => {
    await expect(setup().query('nope')).rejects.toThrow('unknown-query');
  });
});

describe('player actions', () => {
  it('requires the player permission', async () => {
    state.manifests['plugin-1'] = manifest({ permissions: { player: false } });
    await expect(setup().action('player:play')).rejects.toThrow('permission-denied:player');
  });

  it('drives the transport', async () => {
    const api = setup();

    await api.action('player:play');
    await api.action('player:pause');
    await api.action('player:toggle');
    await api.action('player:next');
    await api.action('player:previous');

    expect(state.player.play).toHaveBeenCalledTimes(1);
    expect(state.player.pause).toHaveBeenCalledTimes(1);
    expect(state.player.togglePlay).toHaveBeenCalledTimes(1);
    expect(state.player.nextTrack).toHaveBeenCalledTimes(1);
    expect(state.player.prevTrack).toHaveBeenCalledTimes(1);
  });

  it('clamps volume and ignores invalid values', async () => {
    const api = setup();

    await api.action('player:setVolume', { volume: 2 });
    expect(state.player.setVolume).toHaveBeenLastCalledWith(1);
    await api.action('player:setVolume', { volume: -1 });
    expect(state.player.setVolume).toHaveBeenLastCalledWith(0);
    await api.action('player:setVolume', { volume: 'nope' });
    expect(state.player.setVolume).toHaveBeenCalledTimes(2);
  });

  it('seeks only to valid positions', async () => {
    const api = setup();

    await api.action('player:seek', { seconds: 4 });
    expect(state.player.seek).toHaveBeenCalledWith(4);
    await api.action('player:seek', { seconds: -1 });
    await api.action('player:seek', { seconds: 'x' });
    expect(state.player.seek).toHaveBeenCalledTimes(1);
  });

  it('enqueues only tracks found in the library', async () => {
    const api = setup();

    const count = await api.action('player:enqueue', {
      tracks: ['D:/a.mp3', 'D:/missing.mp3']
    });

    expect(count).toBe(1);
    expect(state.player.addToQueueMultiple).toHaveBeenCalledWith([{ path: 'D:/a.mp3', name: 'A' }]);
  });

  it('returns zero when nothing matches', async () => {
    const api = setup();
    await expect(api.action('player:enqueue', { tracks: ['x'] })).resolves.toBe(0);
    expect(state.player.addToQueueMultiple).not.toHaveBeenCalled();
  });

  it('rejects unknown player actions', async () => {
    await expect(setup().action('player:dance')).rejects.toThrow('unknown-action');
  });

  it('toggles favorites with a path', async () => {
    const api = setup();
    await expect(api.action('track:toggleFavorite', { path: 'D:/a' })).resolves.toBe(true);
    expect(state.player.toggleFavorite).toHaveBeenCalledWith('D:/a');

    await expect(api.action('track:toggleFavorite', {})).rejects.toThrow('track:path-required');
  });
});

describe('notifications', () => {
  it('requires permission and a title', async () => {
    state.manifests['plugin-1'] = manifest({ permissions: { notifications: false } });
    await expect(setup().action('notify', { title: 'x' })).rejects.toThrow(
      'permission-denied:notifications'
    );

    state.manifests['plugin-1'] = manifest();
    await expect(setup().action('notify', {})).rejects.toThrow('notify:missing-title');
  });

  it('normalises the notification type', async () => {
    const api = setup();

    await api.action('notify', { type: 'success', title: 'T', message: 'M' });
    expect(state.ui.notify).toHaveBeenLastCalledWith('success', 'T', 'M');

    await api.action('notify', { type: 'weird', title: 'T' });
    expect(state.ui.notify).toHaveBeenLastCalledWith('info', 'T', undefined);
  });
});

describe('storage and settings', () => {
  it('delegates storage operations', async () => {
    const api = setup();

    await expect(api.op('storage:keys')).resolves.toEqual(['k']);
    await expect(api.op('storage:get', 'key')).resolves.toBe('v');
    await expect(api.op('storage:set', 'key', { a: 1 })).resolves.toBe(true);
    await expect(api.op('storage:remove', 'key')).resolves.toBe(true);

    expect(state.storageGet).toHaveBeenCalledWith('plugin-1', 'key');
    expect(state.storageSet).toHaveBeenCalledWith('plugin-1', 'key', { a: 1 });
    expect(state.storageRemove).toHaveBeenCalledWith('plugin-1', 'key');
  });

  it('reads settings with a null fallback', async () => {
    const api = setup();

    await expect(api.op('settings:get', 'theme')).resolves.toBe('dark');
    await expect(api.op('settings:get', 'missing')).resolves.toBeNull();
  });

  it('saves only declared settings', async () => {
    const api = setup();

    await expect(api.op('settings:set', 'theme', 'light')).resolves.toBe(true);
    expect(state.saveSetting).toHaveBeenCalledWith('plugin-1', 'theme', 'light');
    await expect(api.op('settings:set', 'other', 2)).rejects.toThrow('setting-unknown');
  });
});

describe('fetch', () => {
  it('maps the response', async () => {
    const api = setup();
    const result = await api.op('fetch', 'https://api', {
      method: 'POST',
      headers: { a: 'b' },
      body: 'x',
      responseType: 'json',
      timeoutMs: 500
    });

    expect(state.pluginsFetch).toHaveBeenCalledWith('plugin-1', 'https://api', {
      method: 'POST',
      headers: { a: 'b' },
      body: 'x',
      responseType: 'json',
      timeoutMs: 500
    });
    expect(result).toEqual({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { h: 'v' },
      data: { ok: true }
    });
  });

  it('defaults to text and marks non-2xx as not ok', async () => {
    state.pluginsFetch.mockResolvedValueOnce({ success: true, status: 404 });
    const api = setup();
    const result = (await api.op('fetch', 'https://api')) as any;

    expect(state.pluginsFetch.mock.calls[0][2]).toMatchObject({ responseType: 'text' });
    expect(result.ok).toBe(false);
  });

  it('throws a coded error on failure', async () => {
    state.pluginsFetch.mockResolvedValueOnce({ success: false, error: 'blocked', code: 'denied' });
    const api = setup();

    await expect(api.op('fetch', 'https://api')).rejects.toMatchObject({
      message: 'blocked',
      code: 'denied'
    });
  });
});

describe('visuals', () => {
  it('requires permission and a known key', async () => {
    state.manifests['plugin-1'] = manifest({ permissions: { visual: false } });
    await expect(setup().op('ui:set', 'visual', {})).rejects.toThrow('permission-denied:visual');

    state.manifests['plugin-1'] = manifest();
    await expect(setup().op('ui:set', 'other', {})).rejects.toThrow('unknown-visual-key');
  });

  it('rejects unknown elements and decorations', async () => {
    const api = setup();
    await expect(api.op('ui:set', 'visual', { element: 'nope', value: 'none' })).rejects.toThrow(
      'unknown-visual-element'
    );
    await expect(api.op('ui:set', 'visual', { element: 'cover', value: 'bad' })).rejects.toThrow(
      'unknown-decoration'
    );
    await expect(
      api.op('ui:set', 'visual', { element: 'cover', value: 'plugin:visualization:ring' })
    ).rejects.toThrow('unknown-decoration');
    await expect(
      api.op('ui:set', 'visual', { element: 'cover', value: 'plugin:cover:unknown' })
    ).rejects.toThrow('unknown-decoration');
  });

  it('sets and clears declared decorations', async () => {
    const api = setup();

    await expect(
      api.op('ui:set', 'visual', { element: 'cover', value: 'plugin:cover:ring' })
    ).resolves.toBe(true);
    expect(state.visuals.value).toEqual({ 'plugin-1': { cover: 'plugin:cover:ring' } });

    await api.op('ui:set', 'visual', { element: 'cover', value: 'none' });
    expect(state.visuals.value).toEqual({ 'plugin-1': {} });
  });

  it('requires the decoration to be declared in the manifest', async () => {
    state.manifests['plugin-1'] = manifest({ layoutElements: [] });
    await expect(
      setup().op('ui:set', 'visual', { element: 'cover', value: 'plugin:cover:ring' })
    ).rejects.toThrow('unknown-decoration');
  });
});

describe('ui slots', () => {
  it('requires permission and validation', async () => {
    state.manifests['plugin-1'] = manifest({ permissions: { visual: false } });
    await expect(setup().op('ui:slot', 'player.actions', [])).rejects.toThrow(
      'permission-denied:visual'
    );

    state.manifests['plugin-1'] = manifest();
    await expect(setup().op('ui:slot', 'unknown', [])).rejects.toThrow('ui-slot:unknown-slot');
    state.manifests['plugin-1'] = manifest({ uiSlots: [] });
    await expect(setup().op('ui:slot', 'player.actions', [])).rejects.toThrow(
      'ui-slot:not-declared'
    );
  });

  it('sets and clears slot items', async () => {
    const api = setup();

    await expect(api.op('ui:slot', 'player.actions', [{ text: 'x' }])).resolves.toBe(true);
    expect(state.sanitize).toHaveBeenCalledWith([{ text: 'x' }]);
    expect(state.slots.value).toEqual({ 'plugin-1': { 'player.actions': [{ text: 'x' }] } });

    state.sanitize.mockReturnValueOnce(null);
    await api.op('ui:slot', 'player.actions', []);
    expect(state.slots.value).toEqual({ 'plugin-1': {} });
  });
});

describe('unknown operations', () => {
  it('rejects unknown ops', async () => {
    await expect(setup().op('nope')).rejects.toThrow('unknown-op');
  });
});
