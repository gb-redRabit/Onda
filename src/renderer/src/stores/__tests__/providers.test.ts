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
let streamResult: unknown = { success: true, url: 'https://cdn.example.com/song.mp3' };

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
    streamResult = { success: true, url: 'https://cdn.example.com/song.mp3' };
    const store = useProvidersStore();
    await store.detect('https://mypikpak.com/s/S1');
    const ok = await store.play({ id: 'a1', name: 'song.mp3', kind: 'file' });
    expect(ok).toBe(true);
    expect(invoke).toHaveBeenCalledWith(
      'providers:streamUrl',
      expect.objectContaining({ ref: DETECT.ref, itemId: 'a1' })
    );
    expect(usePlayerStore().currentTrack?.path).toBe('https://cdn.example.com/song.mp3');
  });
});
