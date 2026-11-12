import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useProvidersStore } from '../providers';
import { usePlayerStore } from '../player';
import type { ProviderDetectResult, RemoteItem } from '@shared/types/providers';

// Siatka regresyjna store providerów renderera: auto-detekcja, przeglądanie
// folderów, pobieranie 1:1 z source.mode='provider' i oznaczanie „✓ Pobrano"
// (teraz z trwałego magazynu main). `window.api` mockowane routerem po kanale.

const invoke = vi.fn();
const onHandlers = new Map<string, (payload: unknown) => void>();
const on = vi.fn((channel: string, cb: (payload: unknown) => void) => {
  onHandlers.set(channel, cb);
  return () => {};
});

let detectResult: ProviderDetectResult | null = null;
let listResult: { success: boolean; items: RemoteItem[] } = { success: true, items: [] };
let listByFolder: Record<string, { success: boolean; items: RemoteItem[] }> = {};
let downloadedIds: string[] = [];
let addResult: unknown = [{ id: 'task-1' }];
let streamResult: unknown = { success: true, streamToken: 'TOK' };

beforeEach(() => {
  setActivePinia(createPinia());
  invoke.mockReset();
  on.mockClear();
  onHandlers.clear();
  detectResult = null;
  listResult = { success: true, items: [] };
  listByFolder = {};
  downloadedIds = [];
  addResult = [{ id: 'task-1' }];
  (window as unknown as { api: unknown }).api = { invoke, on };
  invoke.mockImplementation(async (channel: string, args?: unknown) => {
    if (channel === 'providers:detect') return detectResult;
    if (channel === 'providers:list') {
      const fid = (args as { folderId?: string } | undefined)?.folderId ?? 'root';
      return listByFolder[fid] ?? listResult;
    }
    if (channel === 'providers:downloaded') return downloadedIds;
    if (channel === 'yt:download:add') return addResult;
    if (channel === 'providers:streamUrl') return streamResult;
    return undefined;
  });
});

const DETECT: ProviderDetectResult = {
  id: 'pikpak',
  label: 'PikPak',
  icon: 'pikpak',
  capabilities: {
    folders: true,
    thumbnails: true,
    anonymous: true,
    expiringLink: true,
    auth: 'none'
  },
  ref: { provider: 'pikpak', shareId: 'S1' }
};

const FOLDER: RemoteItem = { id: 'd1', name: 'folder', kind: 'folder' };
const FILE: RemoteItem = { id: 'f1', name: 'clip.mp4', kind: 'file', size: 1000 };

describe('detect', () => {
  it('detects a provider and loads the root folder', async () => {
    detectResult = DETECT;
    listResult = { success: true, items: [FOLDER, FILE] };
    const store = useProvidersStore();
    const ok = await store.detect('https://mypikpak.com/s/S1');
    expect(ok).toBe(true);
    expect(store.detected?.label).toBe('PikPak');
    expect(store.crumbs).toEqual([{ id: null, name: 'PikPak' }]);
    expect(store.folders.map((i) => i.id)).toEqual(['d1']);
    expect(store.files.map((i) => i.id)).toEqual(['f1']);
  });

  it('seeds downloaded marks from the persistent store', async () => {
    detectResult = DETECT;
    listResult = { success: true, items: [FILE] };
    downloadedIds = ['f1'];
    const store = useProvidersStore();
    await store.detect('https://mypikpak.com/s/S1');
    expect(store.isDownloaded('f1')).toBe(true);
  });

  it('reports no provider for an unknown link', async () => {
    detectResult = null;
    const store = useProvidersStore();
    expect(await store.detect('https://example.com/x')).toBe(false);
    expect(store.detected).toBeNull();
  });
});

describe('navigation', () => {
  it('opens a folder, extends the breadcrumb and can go back', async () => {
    detectResult = DETECT;
    listResult = { success: true, items: [FOLDER] };
    const store = useProvidersStore();
    await store.detect('https://mypikpak.com/s/S1');
    listResult = { success: true, items: [FILE] };
    await store.openFolder(FOLDER);
    expect(store.crumbs).toHaveLength(2);
    expect(store.items.map((i) => i.id)).toEqual(['f1']);
    listResult = { success: true, items: [FOLDER] };
    await store.goUp();
    expect(store.crumbs).toHaveLength(1);
    expect(store.items.map((i) => i.id)).toEqual(['d1']);
  });

  it('supports jumping to an earlier crumb', async () => {
    detectResult = DETECT;
    listResult = { success: true, items: [FOLDER] };
    const store = useProvidersStore();
    await store.detect('https://mypikpak.com/s/S1');
    await store.openFolder(FOLDER);
    await store.goToCrumb(0);
    expect(store.crumbs).toHaveLength(1);
  });
});

describe('download', () => {
  it('enqueues a provider job with source.mode=provider', async () => {
    detectResult = DETECT;
    listResult = { success: true, items: [FILE] };
    const store = useProvidersStore();
    await store.detect('https://mypikpak.com/s/S1');
    await store.download(FILE);
    const call = invoke.mock.calls.find((c) => c[0] === 'yt:download:add');
    expect(call).toBeTruthy();
    const input = (call![1] as Array<{ source: Record<string, unknown> }>)[0];
    expect(input.source).toMatchObject({
      mode: 'provider',
      providerId: 'pikpak',
      providerRef: { provider: 'pikpak', shareId: 'S1' },
      providerItemId: 'f1',
      fileName: 'clip.mp4'
    });
  });

  it('marks an item downloaded when a provider task completes', async () => {
    detectResult = DETECT;
    listResult = { success: true, items: [FILE] };
    const store = useProvidersStore();
    await store.detect('https://mypikpak.com/s/S1');
    expect(store.isDownloaded('f1')).toBe(false);
    const cb = onHandlers.get('yt:downloadProgress');
    expect(cb).toBeTypeOf('function');
    cb!({
      status: 'completed',
      source: {
        mode: 'provider',
        providerRef: { provider: 'pikpak', shareId: 'S1' },
        providerItemId: 'f1'
      }
    });
    expect(store.isDownloaded('f1')).toBe(true);
  });

  it('does not mark an item for a non-completed task', async () => {
    detectResult = DETECT;
    listResult = { success: true, items: [FILE] };
    const store = useProvidersStore();
    await store.detect('https://mypikpak.com/s/S1');
    const cb = onHandlers.get('yt:downloadProgress')!;
    cb({
      status: 'downloading',
      source: { mode: 'provider', providerRef: DETECT.ref, providerItemId: 'f1' }
    });
    expect(store.isDownloaded('f1')).toBe(false);
  });

  it('downloadFolder walks the folder and subfolders and enqueues every file', async () => {
    detectResult = DETECT;
    listResult = { success: true, items: [FOLDER, FILE] };
    listByFolder = {
      d1: {
        success: true,
        items: [
          { id: 'f2', name: 'b.mp4', kind: 'file' },
          { id: 'd2', name: 'sub2', kind: 'folder' }
        ]
      },
      d2: { success: true, items: [{ id: 'f3', name: 'c.mp4', kind: 'file' }] }
    };
    const store = useProvidersStore();
    await store.detect('https://mypikpak.com/s/S1');
    const res = await store.downloadFolder();
    expect(res.queued).toBe(3);
    expect(res.truncated).toBe(false);
    const addCalls = invoke.mock.calls.filter((c) => c[0] === 'yt:download:add');
    expect(addCalls).toHaveLength(1);
    const ids = addCalls
      .flatMap((c) =>
        (c[1] as Array<{ source: { providerItemId: string } }>).map((x) => x.source.providerItemId)
      )
      .sort();
    expect(ids).toEqual(['f1', 'f2', 'f3']);
  });

  it('downloadFolderById downloads only the chosen folder subtree', async () => {
    detectResult = DETECT;
    listResult = { success: true, items: [FOLDER, FILE] };
    listByFolder = {
      d1: {
        success: true,
        items: [
          { id: 'f2', name: 'b.mp4', kind: 'file' },
          { id: 'd2', name: 'sub2', kind: 'folder' }
        ]
      },
      d2: { success: true, items: [{ id: 'f3', name: 'c.mp4', kind: 'file' }] }
    };
    const store = useProvidersStore();
    await store.detect('https://mypikpak.com/s/S1');
    const res = await store.downloadFolderById('d1');
    expect(res.queued).toBe(2);
    const addCalls = invoke.mock.calls.filter((c) => c[0] === 'yt:download:add');
    expect(addCalls).toHaveLength(1);
    const ids = addCalls
      .flatMap((c) =>
        (c[1] as Array<{ source: { providerItemId: string } }>).map((x) => x.source.providerItemId)
      )
      .sort();
    expect(ids).toEqual(['f2', 'f3']);
  });

  it('batches >20 files in a single yt:download:add IPC call to avoid rate-limit failures', async () => {
    detectResult = DETECT;
    listResult = {
      success: true,
      items: Array.from({ length: 30 }, (_, i) => ({
        id: `file-${i + 1}`,
        name: `ep-${i + 1}.mp4`,
        kind: 'file' as const
      }))
    };
    const store = useProvidersStore();
    await store.detect('https://mypikpak.com/s/S1');
    const res = await store.downloadFolder();
    expect(res.queued).toBe(30);
    const addCalls = invoke.mock.calls.filter((c) => c[0] === 'yt:download:add');
    expect(addCalls).toHaveLength(1);
    expect((addCalls[0][1] as unknown[]).length).toBe(30);
  });

  it('discards stale loadFolder responses when a newer navigation supersedes it', async () => {
    detectResult = DETECT;
    listResult = { success: true, items: [FOLDER] };
    const store = useProvidersStore();
    await store.detect('https://mypikpak.com/s/S1');

    let resolveSlow!: (v: unknown) => void;
    const slowPromise = new Promise((r) => {
      resolveSlow = r;
    });
    invoke.mockImplementationOnce(() => slowPromise);
    listByFolder = {
      d2: { success: true, items: [{ id: 'fresh', name: 'fresh.mp4', kind: 'file' }] }
    };

    const pSlow = store.loadFolder('d1');
    const pFast = store.loadFolder('d2');
    await pFast;
    expect(store.items.map((i) => i.id)).toEqual(['fresh']);

    resolveSlow({ success: true, items: [{ id: 'stale', name: 'stale.mp4', kind: 'file' }] });
    await pSlow;
    expect(store.items.map((i) => i.id)).toEqual(['fresh']);
  });

  it('plays an audio file by resolving the stream URL and setting a track', async () => {
    detectResult = DETECT;
    listResult = { success: true, items: [{ id: 'a1', name: 'song.mp3', kind: 'file' }] };
    streamResult = { success: true, streamToken: 'TOK' };
    const store = useProvidersStore();
    await store.detect('https://mypikpak.com/s/S1');
    const ok = await store.play({ id: 'a1', name: 'song.mp3', kind: 'file' });
    expect(ok).toBe(true);
    expect(invoke).toHaveBeenCalledWith(
      'providers:streamUrl',
      expect.objectContaining({ ref: DETECT.ref, itemId: 'a1' })
    );
    expect(usePlayerStore().currentTrack?.path).toContain('/stream?provider=TOK');
  });
});

describe('store edges', () => {
  it('exposes playable detection and breadcrumb state', async () => {
    const store = useProvidersStore();
    expect(store.canGoUp).toBe(false);
    expect(store.isPlayable('movie.MP4')).toBe(true);
    expect(store.isPlayable('song.flac')).toBe(true);
    expect(store.isPlayable('archive.zip')).toBe(false);
    expect(store.itemKey('x')).toBe('x');
    expect(store.isDownloaded('x')).toBe(false);

    detectResult = DETECT;
    const detected = useProvidersStore();
    await detected.detect('https://mypikpak.com/s/S1');
    expect(detected.canGoUp).toBe(false);
    listResult = { success: true, items: [FOLDER] };
    await detected.openFolder(FOLDER);
    expect(detected.canGoUp).toBe(true);
  });

  it('registers the progress listener only once', async () => {
    detectResult = DETECT;
    const store = useProvidersStore();
    await store.detect('https://mypikpak.com/s/S1');
    await store.detect('https://mypikpak.com/s/S1');

    expect(on.mock.calls.filter(([channel]) => channel === 'yt:downloadProgress')).toHaveLength(1);
  });

  it('ignores progress payloads that are not completed provider tasks', async () => {
    detectResult = DETECT;
    const store = useProvidersStore();
    await store.detect('https://mypikpak.com/s/S1');
    const cb = onHandlers.get('yt:downloadProgress')!;

    cb(null);
    cb({ status: 'completed' });
    cb({
      status: 'completed',
      source: { mode: 'youtube', providerItemId: 'x', providerRef: DETECT.ref }
    });
    cb({
      status: 'completed',
      source: { mode: 'provider', providerItemId: '', providerRef: DETECT.ref }
    });
    cb({ status: 'completed', source: { mode: 'provider', providerItemId: 'x' } });

    expect(store.downloaded.size).toBe(0);
  });

  it('ignores stale rejected responses', async () => {
    detectResult = DETECT;
    listResult = { success: true, items: [FOLDER] };
    const store = useProvidersStore();
    await store.detect('https://mypikpak.com/s/S1');

    let rejectSlow!: (error: Error) => void;
    invoke.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectSlow = reject;
        })
    );
    listByFolder = {
      d2: { success: true, items: [{ id: 'fresh', name: 'fresh.mp4', kind: 'file' }] }
    };

    const slow = store.loadFolder('d1');
    const fast = store.loadFolder('d2');
    await fast;
    rejectSlow(new Error('stale failure'));
    await slow;

    expect(store.items.map((i) => i.id)).toEqual(['fresh']);
    expect(store.error).toBe('');
  });

  it('ignores missing sources for folders and actions', async () => {
    const store = useProvidersStore();

    await expect(store.loadFolder(null)).resolves.toBeUndefined();
    await expect(store.download(FILE)).resolves.toBe(false);
    await expect(store.play(FILE)).resolves.toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('reports folder listing failures', async () => {
    detectResult = DETECT;
    const store = useProvidersStore();
    await store.detect('https://mypikpak.com/s/S1');

    listResult = { success: false, error: 'denied', items: [FILE] } as never;
    await store.loadFolder(null);
    expect(store.error).toBe('denied');
    expect(store.items).toEqual([]);

    listResult = { success: false, items: [FILE] };
    await store.loadFolder(null);
    expect(store.error).toContain('Nie uda');

    invoke.mockRejectedValueOnce(new Error('ipc'));
    await store.loadFolder(null);
    expect(store.error).toBe('ipc');
    expect(store.items).toEqual([]);

    invoke.mockRejectedValueOnce('plain');
    await store.loadFolder(null);
    expect(store.error).toBe('plain');
  });

  it('ignores invalid crumbs and going up at root', async () => {
    detectResult = DETECT;
    const store = useProvidersStore();
    await store.detect('https://mypikpak.com/s/S1');

    await store.goToCrumb(99);
    expect(store.crumbs).toHaveLength(1);

    await store.goUp();
    expect(store.crumbs).toHaveLength(1);
  });

  it('validates empty detect input and reports failures', async () => {
    const store = useProvidersStore();
    expect(await store.detect('   ')).toBe(false);

    detectResult = DETECT;
    invoke.mockRejectedValueOnce(new Error('offline'));
    expect(await store.detect('https://mypikpak.com/s/S1')).toBe(false);
    expect(store.error).toBe('offline');

    invoke.mockRejectedValueOnce('plain');
    expect(await store.detect('https://mypikpak.com/s/S1')).toBe(false);
    expect(store.error).toBe('plain');
  });

  it('reports download failures', async () => {
    detectResult = DETECT;
    const store = useProvidersStore();
    await store.detect('https://mypikpak.com/s/S1');

    invoke.mockRejectedValueOnce(new Error('queue'));
    await expect(store.download(FILE)).resolves.toBe(false);
    expect(store.error).toBe('queue');

    invoke.mockRejectedValueOnce('plain');
    await expect(store.download(FILE)).resolves.toBe(false);
    expect(store.error).toBe('plain');
  });

  it('resets the browsing state', async () => {
    detectResult = DETECT;
    listResult = { success: true, items: [FILE] };
    const store = useProvidersStore();
    await store.detect('https://mypikpak.com/s/S1');

    store.reset();

    expect(store.detected).toBeNull();
    expect(store.source).toBeNull();
    expect(store.crumbs).toEqual([]);
    expect(store.items).toEqual([]);
    expect(store.error).toBe('');
  });

  it('reports stream failures', async () => {
    detectResult = DETECT;
    const store = useProvidersStore();
    await store.detect('https://mypikpak.com/s/S1');

    streamResult = { success: false, error: 'rate limited' };
    await expect(store.play(FILE)).resolves.toBe(false);
    expect(store.error).toBe('rate limited');

    streamResult = { success: true };
    await expect(store.play(FILE)).resolves.toBe(false);
    expect(store.error).toContain('Nie mo');

    invoke.mockRejectedValueOnce(new Error('ipc'));
    await expect(store.play(FILE)).resolves.toBe(false);
    expect(store.error).toBe('ipc');

    invoke.mockRejectedValueOnce('plain');
    await expect(store.play(FILE)).resolves.toBe(false);
    expect(store.error).toBe('plain');
  });

  it('handles empty folder downloads without a source', async () => {
    const store = useProvidersStore();
    await expect(store.downloadFolder()).resolves.toEqual({
      queued: 0,
      found: 0,
      truncated: false
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('stops walking folders at the file limit', async () => {
    detectResult = DETECT;
    listResult = {
      success: true,
      items: Array.from({ length: 501 }, (_, i) => ({
        id: `f-${i}`,
        name: `ep-${i}.mp4`,
        kind: 'file' as const
      }))
    };
    const store = useProvidersStore();
    await store.detect('https://mypikpak.com/s/S1');

    const res = await store.downloadFolder();

    expect(res.queued).toBe(500);
    expect(res.truncated).toBe(true);
  });

  it('tolerates folder listing failures during bulk collection', async () => {
    detectResult = DETECT;
    listResult = { success: true, items: [FOLDER] };
    const store = useProvidersStore();
    await store.detect('https://mypikpak.com/s/S1');

    invoke.mockImplementation(async (channel: string, args?: unknown) => {
      if (channel === 'providers:list') {
        const folderId = (args as { folderId?: string })?.folderId;
        if (folderId === 'd1') throw new Error('boom');
        return listResult;
      }
      if (channel === 'yt:download:add') return [];
      return undefined;
    });

    const res = await store.downloadFolderById('d1');
    expect(res.queued).toBe(0);
    expect(res.found).toBe(0);
  });

  it('reports bulk enqueue failures', async () => {
    detectResult = DETECT;
    listResult = { success: true, items: [FILE] };
    const store = useProvidersStore();
    await store.detect('https://mypikpak.com/s/S1');

    invoke.mockImplementation(async (channel: string) => {
      if (channel === 'providers:list') return listResult;
      if (channel === 'yt:download:add') throw new Error('queue');
      return undefined;
    });
    const res = await store.downloadFolder();
    expect(res).toMatchObject({ queued: 0, found: 1 });
    expect(store.error).toBe('queue');

    invoke.mockImplementation(async (channel: string) => {
      if (channel === 'providers:list') return listResult;
      if (channel === 'yt:download:add') throw 'plain';
      return undefined;
    });
    const plain = await store.downloadFolder();
    expect(plain.queued).toBe(0);
    expect(store.error).toBe('plain');
  });

  it('ignores non-provider list failures during collection', async () => {
    detectResult = DETECT;
    listResult = { success: false, items: [] };
    const store = useProvidersStore();
    await store.detect('https://mypikpak.com/s/S1');

    invoke.mockImplementation(async (channel: string) => {
      if (channel === 'providers:list') return { success: false, items: [FILE] };
      return undefined;
    });

    const res = await store.downloadFolderById('d1');
    expect(res.found).toBe(0);
  });
});
