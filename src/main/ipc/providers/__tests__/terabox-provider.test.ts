import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Siatka regresyjna providera TeraBox (share API). `fetch` mockowany.

import { teraboxProvider } from '../terabox';

const SHORT_INFO = {
  errno: 0,
  sign: 'SIGN',
  timestamp: 123,
  list: [
    { fs_id: 1, server_filename: 'a.mp4', size: 100, isdir: '0' },
    { fs_id: 2, server_filename: 'sub', isdir: '1', path: '/sub' }
  ]
};
const DIR_LIST = {
  errno: 0,
  list: [{ fs_id: 3, server_filename: 'inner.txt', size: 5, isdir: 0 }]
};
const DOWNLOAD = { errno: 0, dlink: [{ dlink: 'https://d.terabox.com/file/abc?a=1' }] };

const fetchMock = vi.fn(async (raw: unknown) => {
  const url = String(raw);
  const body = url.includes('/api/shorturlinfo')
    ? SHORT_INFO
    : url.includes('/share/list')
      ? DIR_LIST
      : url.includes('/api/download')
        ? DOWNLOAD
        : {};
  return { ok: true, status: 200, json: async () => body };
});

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

const REF = { provider: 'terabox', shareId: 'ABC123' };

describe('match/parse', () => {
  it('matches terabox hosts and extracts the share id', () => {
    expect(teraboxProvider.match('https://www.terabox.com/s/ABC123')).toBe(true);
    expect(teraboxProvider.parse('https://1024terabox.com/s/XYZ')).toEqual({
      provider: 'terabox',
      shareId: 'XYZ'
    });
    expect(teraboxProvider.match('https://example.com/s/x')).toBe(false);
  });
});

describe('listFolder', () => {
  it('maps the root share list into items', async () => {
    const items = await teraboxProvider.listFolder(REF);
    expect(items).toEqual([
      { id: '1', name: 'a.mp4', kind: 'file', size: 100, parentId: null },
      { id: '2', name: 'sub', kind: 'folder', size: undefined, parentId: null }
    ]);
  });

  it('lists a subfolder via share/list using to the dir path', async () => {
    const items = await teraboxProvider.listFolder(REF, '/sub');
    expect(items).toEqual([
      { id: '3', name: 'inner.txt', kind: 'file', size: 5, parentId: '/sub' }
    ]);
  });

  it('resolves a subfolder fs_id from the root list to its dir path', async () => {
    await teraboxProvider.listFolder(REF);
    const items = await teraboxProvider.listFolder(REF, '2');
    expect(items).toEqual([{ id: '3', name: 'inner.txt', kind: 'file', size: 5, parentId: '2' }]);
    const listCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/share/list'));
    expect(String(listCall?.[0])).toContain('dir=%2Fsub');
  });

  it('throws when shorturlinfo returns a non-zero errno', async () => {
    fetchMock.mockImplementationOnce(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ errno: -9 })
    }));
    await expect(teraboxProvider.listFolder(REF)).rejects.toThrow(/errno -9/);
  });
});

describe('resolveFileUrl', () => {
  it('returns the direct dlink with download headers', async () => {
    const out = await teraboxProvider.resolveFileUrl(REF, '1');
    expect(out.url).toBe('https://d.terabox.com/file/abc?a=1');
    expect(out.headers).toMatchObject({ Referer: 'https://www.terabox.com/' });
  });
});
