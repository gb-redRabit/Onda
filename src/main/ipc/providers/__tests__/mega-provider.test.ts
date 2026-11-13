import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Siatka regresyjna providera MEGA: mapowanie plików/folderów po stabilnym id
// (handle dziecka z `downloadId[1]`, nodeId korzenia) i strumień pobierania. `megajs` mockowany.

const mega = vi.hoisted(() => ({ fromURL: vi.fn() }));
vi.mock('megajs', () => ({ default: { File: { fromURL: mega.fromURL } } }));

import { megaProvider, __resetMegaRootCache } from '../mega';

interface FakeNode {
  name: string | null;
  size?: number;
  nodeId?: string;
  downloadId?: string | string[];
  directory: boolean;
  children?: FakeNode[];
  loadAttributes: () => Promise<void>;
  download: () => unknown;
}

function node(over: Partial<FakeNode>): FakeNode {
  return {
    name: 'x',
    size: 100,
    nodeId: undefined,
    downloadId: undefined,
    directory: false,
    loadAttributes: async () => {},
    download: () => ({ fake: 'stream' }),
    ...over
  };
}

const REF = { provider: 'mega', shareId: 'https://mega.nz/folder/root#key' };

beforeEach(() => {
  mega.fromURL.mockReset();
  __resetMegaRootCache();
});
afterEach(() => vi.clearAllMocks());

describe('match/parse', () => {
  it('matches mega file and folder links', () => {
    expect(megaProvider.match('https://mega.nz/file/abc#key')).toBe(true);
    expect(megaProvider.match('https://mega.nz/folder/abc#key')).toBe(true);
    expect(megaProvider.match('https://example.com/x')).toBe(false);
  });

  it('parses the share url into a ref', () => {
    expect(megaProvider.parse('https://mega.nz/file/abc#key')).toEqual({
      provider: 'mega',
      shareId: 'https://mega.nz/file/abc#key'
    });
    expect(megaProvider.parse('https://example.com/x')).toBeNull();
  });
});

describe('listFolder', () => {
  it('returns a single item (by nodeId) for a file link', async () => {
    mega.fromURL.mockReturnValue(node({ name: 'clip.mp4', nodeId: 'F1', size: 2048 }));
    const items = await megaProvider.listFolder(REF);
    expect(items).toEqual([
      { id: 'F1', name: 'clip.mp4', kind: 'file', size: 2048, parentId: null }
    ]);
  });

  it('falls back to the name when a node has no stable id or name', async () => {
    mega.fromURL.mockReturnValue(node({ name: null, size: 50 }));
    expect(await megaProvider.listFolder(REF)).toEqual([
      { id: 'file', name: 'file', kind: 'file', size: 50, parentId: null }
    ]);
  });

  it('returns an empty root when a shared folder has no children', async () => {
    mega.fromURL.mockReturnValue(
      node({ name: 'root', nodeId: 'ROOT', directory: true, children: undefined })
    );
    expect(await megaProvider.listFolder(REF)).toEqual([]);
  });

  it('uses the name as id for children without a stable id', async () => {
    mega.fromURL.mockReturnValue(
      node({
        name: 'root',
        nodeId: 'ROOT',
        directory: true,
        children: [node({ name: 'raw' })]
      })
    );

    const items = await megaProvider.listFolder(REF);

    expect(items).toEqual([{ id: 'raw', name: 'raw', kind: 'file', size: 100, parentId: null }]);
  });

  it('returns no items for a subfolder without children', async () => {
    mega.fromURL.mockReturnValue(
      node({
        name: 'root',
        nodeId: 'ROOT',
        directory: true,
        children: [
          node({ name: 'sub', downloadId: ['ROOT', 'SUB'], directory: true, children: undefined })
        ]
      })
    );

    expect(await megaProvider.listFolder(REF, 'SUB')).toEqual([]);
  });

  it('lists a folder root and navigates into a subfolder by handle', async () => {
    const sub = node({
      name: 'sub',
      downloadId: ['ROOT', 'SUB'],
      directory: true,
      children: [node({ name: 'inner.txt', downloadId: ['ROOT', 'INNER'], size: 10 })]
    });
    const root = node({
      name: 'root',
      nodeId: 'ROOT',
      directory: true,
      children: [node({ name: 'a.mp4', downloadId: ['ROOT', 'A'], size: 1 }), sub]
    });
    mega.fromURL.mockReturnValue(root);

    const rootItems = await megaProvider.listFolder(REF);
    expect(rootItems.map((i) => i.id)).toEqual(['A', 'SUB']);
    expect(rootItems.find((i) => i.id === 'SUB')?.kind).toBe('folder');

    const subItems = await megaProvider.listFolder(REF, 'SUB');
    expect(subItems).toEqual([
      { id: 'INNER', name: 'inner.txt', kind: 'file', size: 10, parentId: 'SUB' }
    ]);
  });

  it('throws for an unknown folder id', async () => {
    mega.fromURL.mockReturnValue(
      node({ name: 'root', nodeId: 'ROOT', directory: true, children: [] })
    );
    await expect(megaProvider.listFolder(REF, 'NOPE')).rejects.toThrow();
  });
});

describe('resolveFileUrl', () => {
  it('returns a decrypted download stream for a file handle', async () => {
    const root = node({
      name: 'root',
      nodeId: 'ROOT',
      directory: true,
      children: [node({ name: 'clip.mp4', downloadId: ['ROOT', 'F1'], size: 2048 })]
    });
    mega.fromURL.mockReturnValue(root);
    const res = await megaProvider.resolveFileUrl(REF, 'F1');
    expect(res.stream).toBeTruthy();
    expect(res.size).toBe(2048);
    expect(res.url).toBeUndefined();
  });

  it('rejects when the target is a folder', async () => {
    const root = node({
      name: 'root',
      nodeId: 'ROOT',
      directory: true,
      children: [node({ name: 'dir', downloadId: ['ROOT', 'D1'], directory: true, children: [] })]
    });
    mega.fromURL.mockReturnValue(root);
    await expect(megaProvider.resolveFileUrl(REF, 'D1')).rejects.toThrow();
  });

  it('passes the byte range to megajs download', async () => {
    const download = vi.fn(() => ({ fake: 'stream' }));
    const root = node({
      name: 'root',
      nodeId: 'ROOT',
      directory: true,
      children: [node({ name: 'clip.mp4', downloadId: ['ROOT', 'F1'], size: 100, download })]
    });
    mega.fromURL.mockReturnValue(root);
    await megaProvider.resolveFileUrl(REF, 'F1', { start: 10, end: 20 });
    expect(download).toHaveBeenCalledWith({ start: 10, end: 20 });
  });

  it('streams the root directly for a single-file link', async () => {
    mega.fromURL.mockReturnValue(node({ name: 'clip.mp4', nodeId: 'F1', size: 2048 }));

    const res = await megaProvider.resolveFileUrl(REF, 'ignored');

    expect(res.size).toBe(2048);
    expect(res.stream).toBeTruthy();
  });

  it('throws for an unknown item id', async () => {
    mega.fromURL.mockReturnValue(
      node({ name: 'root', nodeId: 'ROOT', directory: true, children: [] })
    );

    await expect(megaProvider.resolveFileUrl(REF, 'NOPE')).rejects.toThrow(/pliku/i);
  });
});

describe('root cache', () => {
  it('reloads and evicts expired roots after the ttl', async () => {
    let now = 1_000_000;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      mega.fromURL.mockReturnValue(node({ name: 'a', nodeId: 'A', size: 1 }));

      await megaProvider.listFolder(REF);
      await megaProvider.listFolder(REF);
      expect(mega.fromURL).toHaveBeenCalledTimes(1);

      now += 5 * 60 * 1000;
      await megaProvider.listFolder(REF);
      expect(mega.fromURL).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });

  it('evicts the oldest root once the cache is full', async () => {
    const spy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    try {
      mega.fromURL.mockReturnValue(node({ name: 'a', nodeId: 'A', size: 1 }));

      for (let i = 0; i < 65; i += 1) {
        await megaProvider.listFolder({ provider: 'mega', shareId: `https://mega.nz/file/${i}` });
      }
      expect(mega.fromURL).toHaveBeenCalledTimes(65);

      await megaProvider.listFolder({ provider: 'mega', shareId: 'https://mega.nz/file/0' });
      expect(mega.fromURL).toHaveBeenCalledTimes(66);
    } finally {
      spy.mockRestore();
    }
  });
});
