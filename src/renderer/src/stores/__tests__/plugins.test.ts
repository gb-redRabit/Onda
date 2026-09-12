import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { usePluginsStore, snapshotTrack } from '../plugins';
import { useUIStore } from '../ui';
import { usePlayerStore } from '../player';
import { useLibraryStore } from '../library';
import type { MediaFile } from '@renderer/types/media';
import { wrapIntoWorker } from '@renderer/modules/plugins/plugin-shim';

class FakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  posts: unknown[] = [];
  postMessage(data: unknown): void {
    this.posts.push(data);
  }
  terminate(): void {
    this.onmessage = null;
  }
}

function makeTrack(id: string): MediaFile {
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
    metadata: { title: `Title ${id}`, artist: 'Artist' }
  };
}

let fakeWorkers: FakeWorker[];

beforeEach(() => {
  setActivePinia(createPinia());
  fakeWorkers = [];
  const URLStub = URL as unknown as {
    createObjectURL: (b: Blob) => string;
    revokeObjectURL: (u: string) => void;
  };
  URLStub.createObjectURL = vi.fn(() => 'blob:fake');
  URLStub.revokeObjectURL = vi.fn();
  vi.stubGlobal(
    'Worker',
    class extends FakeWorker {
      constructor(_url: string) {
        super();
        fakeWorkers.push(this);
      }
    }
  );
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function apiMock() {
  const api = (window as unknown as Record<string, Record<string, unknown>>).api;
  api.pluginsList = vi.fn().mockResolvedValue([]);
  api.pluginsGet = vi.fn().mockResolvedValue({ success: true, code: '' });
  api.pluginsToggle = vi.fn().mockResolvedValue(true);
  api.pluginsUninstall = vi.fn().mockResolvedValue({ success: true });
  api.pluginsStorageKeys = vi.fn().mockResolvedValue([]);
  api.pluginsStorageGet = vi.fn().mockResolvedValue(null);
  api.pluginsStorageSet = vi.fn().mockResolvedValue(true);
  api.pluginsStorageRemove = vi.fn().mockResolvedValue(true);
  api.pluginsSettingsGet = vi.fn().mockResolvedValue({});
  api.pluginsSettingsSet = vi.fn().mockResolvedValue(true);
  api.pluginsFetch = vi.fn().mockResolvedValue({
    success: true,
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    data: { ok: 1 }
  });
}

describe('snapshotTrack', () => {
  it('maps a local audio track', () => {
    const snap = snapshotTrack(makeTrack('1'));
    expect(snap).toMatchObject({ id: '1', title: 'Title 1', artist: 'Artist', isOnline: false });
  });
  it('returns null for null track', () => {
    expect(snapshotTrack(null)).toBeNull();
  });
  it('marks stream tracks as online', () => {
    const t = { ...makeTrack('2'), type: 'stream' as const, path: 'https://x/y' };
    expect(snapshotTrack(t)?.isOnline).toBe(true);
  });
});

describe('purely local API dispatch', () => {
  it('player:status query returns player state', async () => {
    apiMock();
    const store = usePluginsStore();
    const player = usePlayerStore();
    player.setTrack(makeTrack('1'));
    player.play();
    player.isPlaying = true;
    const status = (await store.dispatchApi('query', ['player:status', {}], 'hello')) as {
      currentTrack: { title: string };
      isPlaying: boolean;
      queueLength: number;
    };
    expect(status.currentTrack.title).toBe('Title 1');
    expect(status.isPlaying).toBe(true);
  });

  it('library:count query forwards counters', async () => {
    apiMock();
    const store = usePluginsStore();
    const count = (await store.dispatchApi('query', ['library:count', {}], 'hello')) as {
      tracks: number;
      audio: number;
    };
    expect(typeof count.tracks).toBe('number');
  });

  it('unknown query throws unknown-query', async () => {
    apiMock();
    const store = usePluginsStore();
    await expect(store.dispatchApi('query', ['nope', {}], 'hello')).rejects.toThrow(
      'unknown-query'
    );
  });
});

describe('player extension actions', () => {
  function loadPlayerPlugin() {
    (window as any).api.pluginsList = vi
      .fn()
      .mockResolvedValue([
        { id: 'ctrl', name: 'Ctrl', version: '1', enabled: true, permissions: { player: true } }
      ]);
    (window as any).api.pluginsGet = vi.fn().mockResolvedValue({
      success: true,
      manifest: {
        id: 'ctrl',
        name: 'Ctrl',
        version: '1',
        entry: 'i.js',
        permissions: { player: true }
      },
      code: '// plugin'
    });
  }

  it('player:seek needs player permission', async () => {
    apiMock();
    const store = usePluginsStore();
    await expect(
      store.dispatchApi('action', ['player:seek', { seconds: 12 }], 'no-perms')
    ).rejects.toThrow('permission-denied:player');
  });

  it('player:enqueue matches library tracks by path', async () => {
    apiMock();
    loadPlayerPlugin();
    const store = usePluginsStore();
    await store.load();
    const player = usePlayerStore();
    const library = useLibraryStore();
    const t1 = makeTrack('1');
    const t2 = makeTrack('2');
    library.tracks.splice(0, library.tracks.length, t1, t2);
    player.clearQueue();
    const added = await store.dispatchApi(
      'action',
      ['player:enqueue', { tracks: [t1.path, t2.path, '/nope.mp3'] }],
      'ctrl'
    );
    expect(added).toBe(2);
    expect(player.queue).toHaveLength(2);
  });

  it('track:toggleFavorite toggles the path', async () => {
    apiMock();
    loadPlayerPlugin();
    const store = usePluginsStore();
    await store.load();
    const player = usePlayerStore();
    await store.dispatchApi('action', ['track:toggleFavorite', { path: '/music/1.mp3' }], 'ctrl');
    expect(player.isFavorite('/music/1.mp3')).toBe(true);
    await store.dispatchApi('action', ['track:toggleFavorite', { path: '/music/1.mp3' }], 'ctrl');
    expect(player.isFavorite('/music/1.mp3')).toBe(false);
  });
});

describe('permission gating', () => {
  it('player action without player permission is rejected', async () => {
    apiMock();
    const store = usePluginsStore();
    await expect(store.dispatchApi('action', ['player:play', {}], 'no-perms')).rejects.toThrow(
      'permission-denied:player'
    );
  });

  it('player action with permission runs', async () => {
    apiMock();
    (window as any).api.pluginsList = vi
      .fn()
      .mockResolvedValue([
        { id: 'ctrl', name: 'Ctrl', version: '1', enabled: true, permissions: { player: true } }
      ]);
    (window as any).api.pluginsGet = vi.fn().mockResolvedValue({
      success: true,
      manifest: {
        id: 'ctrl',
        name: 'Ctrl',
        version: '1',
        entry: 'i.js',
        permissions: { player: true }
      },
      code: '// plugin'
    });
    const store = usePluginsStore();
    const player = usePlayerStore();
    const t1 = makeTrack('1');
    const t2 = makeTrack('2');
    player.clearQueue();
    player.addToQueueMultiple([t1, t2]);
    player.setTrack(t1);

    await store.load();
    const worker = fakeWorkers[0];
    if (!worker) throw new Error('no worker');

    await worker.onmessage?.({
      data: wrapIntoWorker({ type: 'api-request', id: 1, op: 'action', args: ['player:next', {}] })
    });
    await vi.waitFor(() => {
      const resp = worker.posts.find(
        (p) => (p as { __onda?: { type?: string } }).__onda?.type === 'api-response'
      ) as { __onda: { type: string; ok: boolean; data: unknown } } | undefined;
      expect(resp).toBeDefined();
      expect(resp?.__onda.ok).toBe(true);
    });
  });

  it('notify without notifications permission is rejected', async () => {
    apiMock();
    const store = usePluginsStore();
    await expect(
      store.dispatchApi('action', ['notify', { title: 'x' }], 'no-perms')
    ).rejects.toThrow('permission-denied:notifications');
  });

  it('notify with permission adds a UI notification', async () => {
    apiMock();
    (window as any).api.pluginsList = vi
      .fn()
      .mockResolvedValue([
        { id: 'p', name: 'P', version: '1', enabled: true, permissions: { notifications: true } }
      ]);
    (window as any).api.pluginsGet = vi.fn().mockResolvedValue({
      success: true,
      manifest: {
        id: 'p',
        name: 'P',
        version: '1',
        entry: 'a.js',
        permissions: { notifications: true }
      },
      code: '// x'
    });
    const store = usePluginsStore();
    await store.load();
    await store.dispatchApi('action', ['notify', { title: 'T', message: 'M' }], 'p');
    const ui = useUIStore();
    expect(ui.notifications.some((n) => n.title === 'T' && n.message === 'M')).toBe(true);
  });
});

describe('IPC forwarding', () => {
  it('storage:get forwards to window.api', async () => {
    apiMock();
    (window as any).api.pluginsStorageGet = vi.fn().mockResolvedValue('v');
    const store = usePluginsStore();
    await expect(store.dispatchApi('storage:get', ['k'], 'p')).resolves.toBe('v');
    expect((window as any).api.pluginsStorageGet).toHaveBeenCalledWith('p', 'k');
  });

  it('storage:set forwards key and value', async () => {
    apiMock();
    const store = usePluginsStore();
    await store.dispatchApi('storage:set', ['k', { a: 1 }], 'p');
    expect((window as any).api.pluginsStorageSet).toHaveBeenCalledWith('p', 'k', { a: 1 });
  });

  it('fetch maps success result to {ok,status,...}', async () => {
    apiMock();
    const store = usePluginsStore();
    const res = (await store.dispatchApi(
      'fetch',
      ['https://x/y', { responseType: 'json' }],
      'p'
    )) as {
      ok: boolean;
      status: number;
      data: unknown;
    };
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ ok: 1 });
  });

  it('fetch throws on failure result', async () => {
    apiMock();
    (window as any).api.pluginsFetch = vi
      .fn()
      .mockResolvedValue({ success: false, error: 'forbidden', code: 'forbidden' });
    const store = usePluginsStore();
    await expect(store.dispatchApi('fetch', ['https://x/y', {}], 'p')).rejects.toThrow('forbidden');
  });

  it('unknown op throws', async () => {
    apiMock();
    const store = usePluginsStore();
    await expect(store.dispatchApi('storage:wipe', [], 'p')).rejects.toThrow('unknown-op');
  });
});

describe('plugin settings (api.settings)', () => {
  function loadConfiguredPlugin(): void {
    (window as any).api.pluginsList = vi
      .fn()
      .mockResolvedValue([
        { id: 'cfg', name: 'Cfg', version: '1', enabled: true, permissions: {} }
      ]);
    (window as any).api.pluginsGet = vi.fn().mockResolvedValue({
      success: true,
      manifest: {
        id: 'cfg',
        name: 'Cfg',
        version: '1',
        entry: 'i.js',
        permissions: {},
        settings: [
          { key: 'shape', label: 'Shape', type: 'text', default: 'triangle' },
          { key: 'notifyOnChange', label: 'Notify', type: 'boolean', default: true },
          { key: 'volume', label: 'Volume', type: 'number', default: 50, min: 0, max: 100 }
        ]
      },
      code: '// plugin'
    });
  }

  it('loads stored settings for each plugin', async () => {
    apiMock();
    (window as any).api.pluginsList = vi.fn().mockResolvedValue([
      { id: 'a', name: 'A', version: '1', enabled: false, permissions: {} },
      { id: 'b', name: 'B', version: '1', enabled: false, permissions: {} }
    ]);
    (window as any).api.pluginsSettingsGet = vi
      .fn()
      .mockImplementation(async (id: string) => (id === 'a' ? { volume: 10 } : {}));
    const store = usePluginsStore();
    await store.load();
    expect(store.pluginSettings.a).toEqual({ volume: 10 });
    expect(store.pluginSettings.b).toEqual({});
  });

  it('settings:get returns merged defaults and stored value', async () => {
    apiMock();
    loadConfiguredPlugin();
    (window as any).api.pluginsSettingsGet = vi.fn().mockResolvedValue({ shape: 'circle' });
    const store = usePluginsStore();
    await store.load();
    await expect(store.dispatchApi('settings:get', ['shape'], 'cfg')).resolves.toBe('circle');
    await expect(store.dispatchApi('settings:get', ['notifyOnChange'], 'cfg')).resolves.toBe(true);
    await expect(store.dispatchApi('settings:get', ['missing'], 'cfg')).resolves.toBeNull();
  });

  it('settings:set persists via IPC and updates state', async () => {
    apiMock();
    loadConfiguredPlugin();
    const store = usePluginsStore();
    await store.load();
    await expect(store.dispatchApi('settings:set', ['shape', 'hexagon'], 'cfg')).resolves.toBe(
      true
    );
    expect((window as any).api.pluginsSettingsSet).toHaveBeenCalledWith('cfg', 'shape', 'hexagon');
    expect(store.settingsOf('cfg').shape).toBe('hexagon');
  });

  it('settingFields exposes manifest schema', async () => {
    apiMock();
    loadConfiguredPlugin();
    const store = usePluginsStore();
    await store.load();
    expect(store.settingFields('cfg').map((f) => f.key)).toEqual([
      'shape',
      'notifyOnChange',
      'volume'
    ]);
    expect(store.settingFields('cfg')[2].min).toBe(0);
  });
});

describe('ui:set visual capability', () => {
  function loadVisualPlugin(_store: ReturnType<typeof usePluginsStore>): void {
    (window as any).api.pluginsList = vi
      .fn()
      .mockResolvedValue([
        {
          id: 'triangle',
          name: 'Triangle',
          version: '1',
          enabled: true,
          permissions: { visual: true }
        }
      ]);
    (window as any).api.pluginsGet = vi.fn().mockResolvedValue({
      success: true,
      manifest: {
        id: 'triangle',
        name: 'Triangle',
        version: '1',
        entry: 'i.js',
        permissions: { visual: true }
      },
      code: '// plugin'
    });
  }

  it('rejects visual change without visual permission', async () => {
    apiMock();
    const store = usePluginsStore();
    await expect(
      store.dispatchApi(
        'ui:set',
        ['element.decoration', { element: 'cover', value: 'triangle' }],
        'no-perms'
      )
    ).rejects.toThrow('permission-denied:visual');
  });

  it('sets a decoration and applies it', async () => {
    apiMock();
    loadVisualPlugin(usePluginsStore());
    const store = usePluginsStore();
    await store.load();
    await store.dispatchApi(
      'ui:set',
      ['element.decoration', { element: 'cover', value: 'triangle' }],
      'triangle'
    );
    expect(store.decorations.cover).toBe('triangle');
    await store.dispatchApi(
      'ui:set',
      ['element.decoration', { element: 'cover', value: 'none' }],
      'triangle'
    );
    expect(store.decorations.cover).toBeUndefined();
  });

  it('applies decorations per element independently', async () => {
    apiMock();
    loadVisualPlugin(usePluginsStore());
    const store = usePluginsStore();
    await store.load();
    await store.dispatchApi(
      'ui:set',
      ['element.decoration', { element: 'cover', value: 'diamond' }],
      'triangle'
    );
    await store.dispatchApi(
      'ui:set',
      ['element.decoration', { element: 'visualization', value: 'glow' }],
      'triangle'
    );
    expect(store.decorations.cover).toBe('diamond');
    expect(store.decorations.visualization).toBe('glow');
    expect(store.decorations.progress).toBeUndefined();
  });

  it('rejects unknown decoration, element, and key', async () => {
    apiMock();
    loadVisualPlugin(usePluginsStore());
    const store = usePluginsStore();
    await store.load();
    await expect(
      store.dispatchApi(
        'ui:set',
        ['element.decoration', { element: 'cover', value: 'donut' }],
        'triangle'
      )
    ).rejects.toThrow('unknown-decoration');
    await expect(
      store.dispatchApi(
        'ui:set',
        ['element.decoration', { element: 'navbar', value: 'glow' }],
        'triangle'
      )
    ).rejects.toThrow('unknown-visual-element');
    await expect(
      store.dispatchApi(
        'ui:set',
        ['navbar-width', { element: 'cover', value: 'triangle' }],
        'triangle'
      )
    ).rejects.toThrow('unknown-visual-key');
  });

  it('clears visuals when plugin is disabled', async () => {
    apiMock();
    loadVisualPlugin(usePluginsStore());
    const store = usePluginsStore();
    await store.load();
    await store.dispatchApi(
      'ui:set',
      ['element.decoration', { element: 'cover', value: 'diamond' }],
      'triangle'
    );
    expect(store.decorations.cover).toBe('diamond');
    await store.toggle('triangle');
    expect(store.decorations.cover).toBeUndefined();
  });

  it('lists host-known plugin layout variants only', async () => {
    apiMock();
    (window as any).api.pluginsList = vi
      .fn()
      .mockResolvedValue([
        { id: 'viz', name: 'Viz', version: '1', enabled: true, permissions: { visual: true } }
      ]);
    (window as any).api.pluginsGet = vi.fn().mockResolvedValue({
      success: true,
      manifest: {
        id: 'viz',
        name: 'Viz',
        version: '1',
        entry: 'i.js',
        permissions: { visual: true },
        layoutElements: [
          { element: 'cover', variant: 'flip-x', label: 'Flip' },
          { element: 'progress', variant: 'not-host-known' }
        ]
      },
      code: '// plugin'
    });
    const store = usePluginsStore();
    await store.load();
    expect(store.layoutVariants.cover).toEqual([
      { value: 'plugin:cover:flip-x', label: 'Flip', plugin: 'Viz' }
    ]);
    expect(store.layoutVariants.progress).toBeUndefined();
  });

  it('rejects a plugin decoration not declared in the manifest or not host-known', async () => {
    apiMock();
    (window as any).api.pluginsList = vi
      .fn()
      .mockResolvedValue([
        { id: 'viz', name: 'Viz', version: '1', enabled: true, permissions: { visual: true } }
      ]);
    (window as any).api.pluginsGet = vi.fn().mockResolvedValue({
      success: true,
      manifest: {
        id: 'viz',
        name: 'Viz',
        version: '1',
        entry: 'i.js',
        permissions: { visual: true },
        layoutElements: [{ element: 'cover', variant: 'flip-x', label: 'Flip' }]
      },
      code: '// plugin'
    });
    const store = usePluginsStore();
    await store.load();
    await expect(
      store.dispatchApi(
        'ui:set',
        ['element.decoration', { element: 'cover', value: 'plugin:cover:flip-x' }],
        'viz'
      )
    ).resolves.toBe(true);
    expect(store.decorations.cover).toBe('plugin:cover:flip-x');
    await expect(
      store.dispatchApi(
        'ui:set',
        ['element.decoration', { element: 'cover', value: 'plugin:cover:evil' }],
        'viz'
      )
    ).rejects.toThrow('unknown-decoration');
  });
});

describe('commandsIn (toolbar locations)', () => {
  it('returns only commands registered for the given location', async () => {
    apiMock();
    (window as any).api.pluginsList = vi
      .fn()
      .mockResolvedValue([
        { id: 'triangle', name: 'Triangle', version: '1', enabled: true, permissions: {} }
      ]);
    (window as any).api.pluginsGet = vi.fn().mockResolvedValue({
      success: true,
      manifest: { id: 'triangle', name: 'Triangle', version: '1', entry: 'i.js', permissions: {} },
      code: '// plugin'
    });
    const store = usePluginsStore();
    await store.load();
    const worker = fakeWorkers[0];
    if (!worker) throw new Error('no worker');

    await worker.onmessage?.({
      data: wrapIntoWorker({
        type: 'register-command',
        command: { id: 'triangle:cycle', label: 'Kształt', location: 'audio-view' }
      })
    });
    await worker.onmessage?.({
      data: wrapIntoWorker({
        type: 'register-command',
        command: { id: 'triangle:shape-none', label: 'Oryginał' }
      })
    });

    expect(store.commandsIn('audio-view').map((c) => c.id)).toEqual(['triangle:cycle']);
    expect(store.commandsIn('sidebar')).toEqual([]);
    expect(store.commands.length).toBe(2);
  });
});

describe('track-menu context commands', () => {
  it('lists commands for the track-menu location', async () => {
    apiMock();
    (window as any).api.pluginsList = vi
      .fn()
      .mockResolvedValue([
        { id: 'hygge', name: 'Hygge', version: '1', enabled: true, permissions: {} }
      ]);
    (window as any).api.pluginsGet = vi.fn().mockResolvedValue({
      success: true,
      manifest: { id: 'hygge', name: 'Hygge', version: '1', entry: 'i.js', permissions: {} },
      code: '// plugin'
    });
    (window as any).api.pluginsStorageGet = vi.fn().mockResolvedValue(undefined);
    const store = usePluginsStore();
    await store.load();
    const worker = fakeWorkers[0];
    if (!worker) throw new Error('no worker');
    await worker.onmessage?.({ data: wrapIntoWorker({ type: 'ready' }) });

    await worker.onmessage?.({
      data: wrapIntoWorker({
        type: 'register-command',
        command: { id: 'hygge:rate', label: 'Oceń', location: 'track-menu' }
      })
    });
    await worker.onmessage?.({
      data: wrapIntoWorker({
        type: 'register-command',
        command: { id: 'hygge:other', label: 'Coś' }
      })
    });

    expect(store.commandsIn('track-menu').map((c) => c.id)).toEqual(['hygge:rate']);
  });

  it('invokes the command worker with the track context payload', async () => {
    apiMock();
    (window as any).api.pluginsList = vi
      .fn()
      .mockResolvedValue([
        { id: 'hygge', name: 'Hygge', version: '1', enabled: true, permissions: {} }
      ]);
    (window as any).api.pluginsGet = vi.fn().mockResolvedValue({
      success: true,
      manifest: { id: 'hygge', name: 'Hygge', version: '1', entry: 'i.js', permissions: {} },
      code: '// plugin'
    });
    (window as any).api.pluginsStorageGet = vi.fn().mockResolvedValue(undefined);
    const store = usePluginsStore();
    await store.load();
    const worker = fakeWorkers[0];
    if (!worker) throw new Error('no worker');
    await worker.onmessage?.({ data: wrapIntoWorker({ type: 'ready' }) });
    await worker.onmessage?.({
      data: wrapIntoWorker({
        type: 'register-command',
        command: { id: 'hygge:rate', label: 'Oceń', location: 'track-menu' }
      })
    });

    const ctx = { id: 't1', path: '/a/b.mp3', title: 'Utwór', artist: 'Artysta', isOnline: false };
    store.invokeCommandWithContext('hygge:rate', ctx as never);
    const msg = worker.posts.at(-1) as {
      __onda: { type: string; commandId: string; payload: unknown };
    };
    expect(msg.__onda.type).toBe('invoke-command');
    expect(msg.__onda.commandId).toBe('hygge:rate');
    expect(msg.__onda.payload).toEqual(ctx);
  });
});

describe('command shortcuts', () => {
  async function loadWithCommands(commands: { id: string; shortcut?: string }[]): Promise<{
    store: ReturnType<typeof usePluginsStore>;
    worker: FakeWorker;
  }> {
    apiMock();
    (window as any).api.pluginsList = vi
      .fn()
      .mockResolvedValue([{ id: 'sc', name: 'Sc', version: '1', enabled: true, permissions: {} }]);
    (window as any).api.pluginsGet = vi.fn().mockResolvedValue({
      success: true,
      manifest: { id: 'sc', name: 'Sc', version: '1', entry: 'i.js', permissions: {} },
      code: '// plugin'
    });
    const store = usePluginsStore();
    await store.load();
    const worker = fakeWorkers[0];
    if (!worker) throw new Error('no worker');
    await worker.onmessage?.({ data: wrapIntoWorker({ type: 'ready' }) });
    for (const c of commands) {
      await worker.onmessage?.({
        data: wrapIntoWorker({ type: 'register-command', command: c as never })
      });
    }
    return { store, worker };
  }

  it('keeps valid shortcuts and drops invalid ones with a warning', async () => {
    const { store } = await loadWithCommands([
      { id: 'good', shortcut: 'Ctrl+Alt+K' },
      { id: 'bad', shortcut: 'nonsense' }
    ]);
    const good = store.commands.find((c) => c.id === 'good');
    expect(good?.shortcut).toBe('Ctrl+Alt+K');
    const bad = store.commands.find((c) => c.id === 'bad');
    expect(bad?.shortcut).toBeUndefined();
    expect(store.logs.sc.join('\n')).toContain('odrzucony');
  });

  it('drops a shortcut that collides with another command', async () => {
    const { store } = await loadWithCommands([
      { id: 'a', shortcut: 'Ctrl+L' },
      { id: 'b', shortcut: 'Ctrl+L' }
    ]);
    expect(store.commands.find((c) => c.id === 'a')?.shortcut).toBe('Ctrl+L');
    expect(store.commands.find((c) => c.id === 'b')?.shortcut).toBeUndefined();
    expect(store.logs.sc.join('\n')).toContain('konflikt');
  });

  it('dispatchShortcut invokes the matching command and returns false on miss', async () => {
    const { store, worker } = await loadWithCommands([{ id: 'run', shortcut: 'Ctrl+R' }]);
    expect(store.dispatchShortcut('Ctrl+R')).toBe(true);
    const invoke = worker.posts.find(
      (p) => (p as { __onda?: { type?: string } }).__onda?.type === 'invoke-command'
    ) as { __onda: { type: string; commandId: string } } | undefined;
    expect(invoke?.__onda.commandId).toBe('run');
    const before = worker.posts.length;
    expect(store.dispatchShortcut('Ctrl+Z')).toBe(false);
    expect(worker.posts.length).toBe(before);
  });
});

describe('worker lifecycle', () => {
  it('spawns enabled plugin and forwards hooks + api-request', async () => {
    apiMock();
    (window as any).api.pluginsList = vi.fn().mockResolvedValue([
      {
        id: 'hello',
        name: 'Hello',
        version: '1.0.0',
        description: 'd',
        author: 'a',
        enabled: true,
        permissions: { notifications: true }
      }
    ]);
    (window as any).api.pluginsGet = vi.fn().mockResolvedValue({
      success: true,
      manifest: {
        id: 'hello',
        name: 'Hello',
        version: '1.0.0',
        entry: 'i.js',
        permissions: { notifications: true }
      },
      code: '// plugin'
    });
    const store = usePluginsStore();
    await store.load();
    expect(store.plugins[0].id).toBe('hello');
    expect(fakeWorkers.length).toBe(1);
    const worker = fakeWorkers[0];
    worker.onmessage?.({ data: wrapIntoWorker({ type: 'ready' }) });
    expect(store.plugins[0].status).toBe('loaded');

    store.emitHook('track:play', { title: 'X' });
    const hookMsg = worker.posts.find(
      (p) => (p as { __onda?: { type?: string } }).__onda?.type === 'hook'
    ) as { __onda: { type: string; name: string } };
    expect(hookMsg.__onda).toMatchObject({ type: 'hook', name: 'track:play' });

    (window as any).api.pluginsStorageGet = vi.fn().mockResolvedValue(41);
    await worker.onmessage?.({
      data: wrapIntoWorker({ type: 'api-request', id: 7, op: 'storage:get', args: ['answer'] })
    });
    await vi.waitFor(() => {
      const resp = worker.posts.find(
        (p) => (p as { __onda?: { type?: string } }).__onda?.type === 'api-response'
      ) as { __onda: { type: string; id: number; ok: boolean; data: unknown } } | undefined;
      expect(resp).toBeDefined();
      expect(resp?.__onda.id).toBe(7);
      expect(resp?.__onda.ok).toBe(true);
      expect(resp?.__onda.data).toBe(41);
    });
  });

  it('disabled plugins are not spawned', async () => {
    apiMock();
    (window as any).api.pluginsList = vi
      .fn()
      .mockResolvedValue([
        { id: 'off', name: 'Off', version: '1', enabled: false, permissions: {} }
      ]);
    const store = usePluginsStore();
    await store.load();
    expect(fakeWorkers.length).toBe(0);
    expect(store.plugins[0].enabled).toBe(false);
  });
});
