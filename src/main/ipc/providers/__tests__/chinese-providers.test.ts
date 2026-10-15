import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const cookieRef = { value: '' };
vi.mock('../provider-credentials', () => ({
  getProviderCookie: vi.fn(async () => cookieRef.value)
}));

import { pan123Provider } from '../pan123';

// Siatka regresyjna 123pan: listowanie, hasło, podfoldery oraz rozwiązywanie URL pobierania.
// `fetch` mockowany.

const fetchMock = vi.fn(async (raw: unknown) => {
  const url = String(raw);
  let body: unknown = {};
  if (url.includes('/api/share/download/info'))
    body = { code: 0, data: { DownloadUrl: 'https://cdn.example/123.mp4' } };
  else if (url.includes('/api/share/get') && url.includes('parentFileId='))
    body = {
      code: 0,
      data: { InfoList: [{ FileId: 3, FileName: 'inner.mp4', Type: 0, Size: 50 }] }
    };
  else if (url.includes('/api/share/get'))
    body = {
      code: 0,
      data: {
        InfoList: [
          { FileId: 1, FileName: 'a.mp4', Type: 0, Size: 100 },
          { FileId: 2, FileName: 'sub', Type: 1 }
        ]
      }
    };
  return { ok: true, status: 200, text: async () => JSON.stringify(body) };
});

beforeEach(() => {
  cookieRef.value = '';
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe('123pan', () => {
  it('matches and lists the share', async () => {
    expect(pan123Provider.match('https://www.123pan.com/s/ABC')).toBe(true);
    const items = await pan123Provider.listFolder({ provider: '123pan', shareId: 'ABC' });
    expect(items).toEqual([
      { id: '1', name: 'a.mp4', kind: 'file', size: 100, parentId: null },
      { id: '2', name: 'sub', kind: 'folder', size: undefined, parentId: null }
    ]);
  });

  it('carries the share password in the ref and lists subfolders by parentFileId', async () => {
    expect(pan123Provider.parse('https://www.123pan.com/s/ABC?pwd=1234')).toEqual({
      provider: '123pan',
      shareId: 'ABC#1234'
    });
    const items = await pan123Provider.listFolder({ provider: '123pan', shareId: 'ABC#1234' }, '2');
    expect(items).toEqual([{ id: '3', name: 'inner.mp4', kind: 'file', size: 50, parentId: '2' }]);
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain('parentFileId=2');
  });

  it('resolves a download URL with provider headers', async () => {
    const out = await pan123Provider.resolveFileUrl({ provider: '123pan', shareId: 'ABC' }, '1');
    expect(out.url).toBe('https://cdn.example/123.mp4');
    expect(out.headers?.Referer).toContain('123pan.com');
  });

  it('throws a clear error when no download URL is returned', async () => {
    fetchMock.mockImplementationOnce(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ code: 1, message: 'need login' })
    }));
    await expect(
      pan123Provider.resolveFileUrl({ provider: '123pan', shareId: 'ABC' }, '1')
    ).rejects.toThrow(/URL|logowania/i);
  });
});
