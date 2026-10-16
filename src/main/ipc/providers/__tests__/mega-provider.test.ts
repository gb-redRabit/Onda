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
});
