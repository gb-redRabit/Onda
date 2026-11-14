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

  it('rejects foreign hosts and urls without a share id', () => {
    expect(teraboxProvider.parse('https://example.com/s/x')).toBeNull();
    expect(teraboxProvider.parse('https://www.terabox.com/folder/1')).toBeNull();
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

  it('skips entries without ids and normalizes names, folders and sizes', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        errno: 0,
        sign: 'S',
        timestamp: 1,
        list: [
          { server_filename: 'noid' },
          { fs_id: 5, filename: 'only-filename', isdir: 0, size: '12' },
          { fs_id: 6, isdir: 0 },
          { fs_id: 7, server_filename: '', filename: '', isdir: '0', size: 'abc' },
          { fs_id: 8, isdir: 1 },
          { fs_id: 9, isdir: true, server_filename: 'dir2' }
        ]
      })
    });

    const items = await teraboxProvider.listFolder(REF);

    expect(items).toEqual([
      { id: '5', name: 'only-filename', kind: 'file', size: 12, parentId: null },
      { id: '6', name: '6', kind: 'file', size: undefined, parentId: null },
      { id: '7', name: '7', kind: 'file', size: undefined, parentId: null },
      { id: '8', name: '8', kind: 'folder', size: undefined, parentId: null },
      { id: '9', name: 'dir2', kind: 'folder', size: undefined, parentId: null }
    ]);
  });

  it('falls back to a slash-prefixed id for an unregistered folder', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ errno: 0, sign: 'S', timestamp: 1, list: [] })
    });
    await teraboxProvider.listFolder(REF);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ errno: 0, sign: 'S', timestamp: 1 })
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ errno: 0, list: DIR_LIST.list })
    });

    const items = await teraboxProvider.listFolder(REF, '404');

    expect(items).toEqual([{ id: '3', name: 'inner.txt', kind: 'file', size: 5, parentId: '404' }]);
    const listCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/share/list'));
    expect(String(listCall?.[0])).toContain('dir=%2F404');
  });

  it('omits sign and timestamp when the share info lacks them', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ errno: 0 })
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ errno: 0 })
    });

    await expect(teraboxProvider.listFolder(REF, '/sub')).resolves.toEqual([]);

    const listUrl = String(fetchMock.mock.calls.at(-1)?.[0]);
    expect(listUrl).not.toContain('sign=');
    expect(listUrl).not.toContain('timestamp=');
  });

  it('returns no root items when the share info omits the list', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ errno: 0 })
    });

    await expect(teraboxProvider.listFolder(REF)).resolves.toEqual([]);
  });

  it('throws on HTTP errors', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({})
    });

    await expect(teraboxProvider.listFolder(REF)).rejects.toThrow(/HTTP 500/);
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

  it('accepts a plain string dlink and omits missing auth params', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ errno: 0 })
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ dlink: 'https://d.terabox.com/plain' })
    });

    await expect(teraboxProvider.resolveFileUrl(REF, '1')).resolves.toMatchObject({
      url: 'https://d.terabox.com/plain'
    });
    const downloadUrl = String(fetchMock.mock.calls.at(-1)?.[0]);
    expect(downloadUrl).not.toContain('sign=');
    expect(downloadUrl).not.toContain('timestamp=');
  });

  it('throws when the download response has no link', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ errno: 0 })
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ dlink: [{}] })
    });

    await expect(teraboxProvider.resolveFileUrl(REF, '1')).rejects.toThrow(/brak linku/);
  });
});
