import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Siatka regresyjna klienta/resolvera PikPak (anonimowe API udostępnień).
// `fetch` jest mockowany — test offline i deterministyczny. Pilnuje kontraktu
// captcha → share/detail → share/file_info oraz mapowania na RemoteItem.

import { PikPakClient, PikPakError } from '../pikpak/pikpak-client';
import { pikpakProvider } from '../pikpak';

vi.mock('../provider-credentials', () => ({
  getProviderCookie: vi.fn(async () => ''),
  getProviderToken: vi.fn(async () => ''),
  getProviderRefresh: vi.fn(async () => ''),
  setProviderToken: vi.fn(async () => true)
}));
import { getProviderCookie, getProviderToken } from '../provider-credentials';

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

const defaultRouter = async (raw: unknown) => {
  const url = String(raw);
  if (url.includes('/v1/shield/captcha/init')) return json({ captcha_token: 'tok' });
  if (url.includes('/drive/v1/share/detail')) {
    return json({
      share_status: 'OK',
      files: [
        {
          id: 'f1',
          name: 'clip.mp4',
          kind: 'drive#file',
          size: '295880000',
          thumbnail_link: 'https://t/f1.jpg'
        },
        { id: 'd1', name: 'folder', kind: 'drive#folder' }
      ],
      next_page_token: ''
    });
  }
  if (url.includes('/drive/v1/share/file_info')) {
    return json({ file_info: { web_content_link: 'https://dl-abc.mypikpak.com/download/?fid=1' } });
  }
  return json({}, 404);
};

const fetchMock = vi.fn(defaultRouter);

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  fetchMock.mockImplementation(defaultRouter);
  vi.mocked(getProviderCookie).mockResolvedValue('');
  vi.mocked(getProviderToken).mockResolvedValue('');
});
afterEach(() => vi.unstubAllGlobals());

describe('PikPakClient.listFolder', () => {
  it('returns raw entries from share/detail', async () => {
    const client = new PikPakClient();
    const entries = await client.listFolder('SHARE1');
    expect(entries.map((e) => e.id)).toEqual(['f1', 'd1']);
  });

  it('throws when share_status is not OK', async () => {
    fetchMock.mockImplementationOnce(async () => json({ captcha_token: 'tok' }));
    fetchMock.mockImplementationOnce(async () => json({ share_status: 'PROHIBITED' }));
    const client = new PikPakClient();
    await expect(client.listFolder('SHARE1')).rejects.toBeInstanceOf(PikPakError);
  });

  it('falls back to the .net host on a network error', async () => {
    // captcha na .com rzuca; .net zwraca token, potem share/detail.
    fetchMock.mockImplementation(async (raw: unknown) => {
      const url = String(raw);
      if (url.includes('user.mypikpak.com')) throw new Error('network');
      if (url.includes('user.mypikpak.net') && url.includes('captcha/init'))
        return json({ captcha_token: 'tok' });
      if (url.includes('api-drive.mypikpak.net') && url.includes('share/detail')) {
        return json({
          share_status: 'OK',
          files: [{ id: 'x', name: 'a.mp4', kind: 'drive#file' }]
        });
      }
      return json({}, 404);
    });
    const client = new PikPakClient();
    const entries = await client.listFolder('SHARE1');
    expect(entries[0].id).toBe('x');
  });

  it('wraps host fallback back to .com when .net fails on a subsequent call', async () => {
    const client = new PikPakClient(1);
    fetchMock.mockImplementation(async (raw: unknown) => {
      const url = String(raw);
      if (url.includes('mypikpak.net')) throw new Error('network');
      if (url.includes('user.mypikpak.com') && url.includes('captcha/init'))
        return json({ captcha_token: 'tok' });
      if (url.includes('api-drive.mypikpak.com') && url.includes('share/detail')) {
        return json({
          share_status: 'OK',
          files: [{ id: 'back-to-com', name: 'a.mp4', kind: 'drive#file' }]
        });
      }
      return json({}, 404);
    });
    const entries = await client.listFolder('SHARE1');
    expect(entries[0].id).toBe('back-to-com');
  });
});

describe('PikPakClient.getFileInfo', () => {
  it('returns the direct web_content_link', async () => {
    const client = new PikPakClient();
    const url = await client.getFileInfo('SHARE1', 'f1');
    expect(url).toBe('https://dl-abc.mypikpak.com/download/?fid=1');
  });

  it('falls back to an anonymous file_info when the Bearer response has no URL', async () => {
    const client = new PikPakClient();
    client.setAccessToken('EXPIRED');
    fetchMock.mockImplementation(
      async (raw: unknown, init?: { headers?: Record<string, string> }) => {
        const url = String(raw);
        if (url.includes('/v1/shield/captcha/init')) return json({ captcha_token: 'tok' });
        if (url.includes('/drive/v1/share/file_info')) {
          const auth = (init?.headers || {})['Authorization'];
          return json({
            file_info: auth ? {} : { web_content_link: 'https://dl-abc.mypikpak.com/anon' }
          });
        }
        return json({}, 404);
      }
    );
    const url = await client.getFileInfo('SHARE1', 'f1');
    expect(url).toBe('https://dl-abc.mypikpak.com/anon');
  });

  it('picks the first media rendition that actually has a link', async () => {
    fetchMock.mockImplementation(async (raw: unknown) => {
      const url = String(raw);
      if (url.includes('/v1/shield/captcha/init')) return json({ captcha_token: 'tok' });
      if (url.includes('/drive/v1/share/file_info'))
        return json({
          file_info: {
            web_content_link: '',
            medias: [
              { media_name: 'Original', need_more_quota: true },
              { media_name: '1080P', need_more_quota: true },
              { media_name: '720P', link: { url: 'https://dl.mypikpak.com/720' } },
              { media_name: '480P', link: { url: 'https://dl.mypikpak.com/480' } }
            ]
          }
        });
      return json({}, 404);
    });
    const client = new PikPakClient();
    const url = await client.getFileInfo('SHARE1', 'f1');
    expect(url).toBe('https://dl.mypikpak.com/720');
  });
});

describe('pikpakProvider', () => {
  it('maps entries into RemoteItem (folders vs files, size, thumbnail)', async () => {
    const items = await pikpakProvider.listFolder({ provider: 'pikpak', shareId: 'SHARE1' });
    expect(items).toEqual([
      {
        id: 'f1',
        name: 'clip.mp4',
        kind: 'file',
        size: 295880000,
        thumbnail: 'https://t/f1.jpg',
        parentId: ''
      },
      {
        id: 'd1',
        name: 'folder',
        kind: 'folder',
        size: undefined,
        thumbnail: undefined,
        parentId: ''
      }
    ]);
  });

  it('returns a direct URL with download headers', async () => {
    const res = await pikpakProvider.resolveFileUrl(
      { provider: 'pikpak', shareId: 'SHARE1' },
      'f1'
    );
    expect(res.url).toContain('mypikpak.com/download');
    expect(res.headers).toMatchObject({ Referer: 'https://mypikpak.com/' });
    expect(res.headers?.['User-Agent']).toBeTruthy();
  });

  it('exposes anonymous + expiring capabilities', () => {
    expect(pikpakProvider.capabilities).toMatchObject({
      anonymous: true,
      expiringLink: true,
      folders: true,
      auth: 'none'
    });
  });

  it('attaches the session cookie to API requests when configured', async () => {
    vi.mocked(getProviderCookie).mockResolvedValue('lt=abc; token=xyz');
    const seen: Record<string, string>[] = [];
    fetchMock.mockImplementation(
      async (raw: unknown, init?: { headers?: Record<string, string> }) => {
        seen.push(init?.headers || {});
        return defaultRouter(raw);
      }
    );

    await pikpakProvider.listFolder({ provider: 'pikpak', shareId: 'SHARE1' });
    const withCookie = seen.filter((h) => h['X-Client-ID']);
    expect(withCookie.length).toBeGreaterThan(0);
    for (const h of withCookie) expect(h.Cookie).toBe('lt=abc; token=xyz');

    seen.length = 0;
    await pikpakProvider.resolveFileUrl({ provider: 'pikpak', shareId: 'SHARE1' }, 'f1');
    expect(seen.find((h) => h['X-Client-ID'])?.Cookie).toBe('lt=abc; token=xyz');
  });

  it('attaches the access token as Bearer when configured', async () => {
    vi.mocked(getProviderToken).mockResolvedValue('TOK123');
    const seen: Record<string, string>[] = [];
    fetchMock.mockImplementation(
      async (raw: unknown, init?: { headers?: Record<string, string> }) => {
        seen.push(init?.headers || {});
        return defaultRouter(raw);
      }
    );

    await pikpakProvider.listFolder({ provider: 'pikpak', shareId: 'SHARE1' });
    const h = seen.find((x) => x['X-Client-ID']);
    expect(h?.Authorization).toBe('Bearer TOK123');
  });

  it('download path restores to drive, returns the original url, then cleans up', async () => {
    vi.mocked(getProviderToken).mockResolvedValue('TOK');
    const calls: string[] = [];
    fetchMock.mockImplementation(async (raw: unknown, init?: { method?: string }) => {
      const url = String(raw);
      const method = init?.method || 'GET';
      if (url.includes('captcha/init')) return json({ captcha_token: 'tok' });
      if (url.includes('/drive/v1/share/file_info'))
        return json({ file_info: { name: 'clip.mp4' } });
      if (url.includes('/drive/v1/share/restore')) return json({ file_id: 'PLACEHOLDER' });
      if (url.includes('/drive/v1/events'))
        return json({
          events: [{ type: 'TYPE_RESTORE', file_id: 'NEW1', file_name: 'clip.mp4' }]
        });
      if (url.includes('/drive/v1/files/NEW1') && method === 'GET')
        return json({ size: 999, web_content_link: 'https://dl.mypikpak.com/orig' });
      if (url.includes('files:batchTrash')) {
        calls.push('trash');
        return json({ task_id: 't1' });
      }
      if (url.includes('files:batchDelete')) {
        calls.push('delete');
        return json({ task_id: 't2' });
      }
      return json({}, 404);
    });

    const ref = { provider: 'pikpak', shareId: 'SHARE1' };
    const statuses: string[] = [];
    const res = await pikpakProvider.resolveFileUrl(ref, 'f1', undefined, true, (k) =>
      statuses.push(k)
    );
    expect(res.url).toBe('https://dl.mypikpak.com/orig');
    expect(statuses).toContain('downloads.statusSaving');
    expect(statuses).toContain('downloads.statusWaiting');

    await pikpakProvider.onDownloadSettled?.(ref, 'f1');
    expect(calls).toEqual(['trash', 'delete']);
  });
});

describe('PikPakClient — dysk (转存)', () => {
  it('getShareFileMeta zwraca nazwę i link', async () => {
    fetchMock.mockImplementation(async (raw: unknown) => {
      const url = String(raw);
      if (url.includes('captcha/init')) return json({ captcha_token: 't' });
      if (url.includes('/drive/v1/share/file_info'))
        return json({ file_info: { name: 'a.mp4', web_content_link: 'https://dl/a' } });
      return json({}, 404);
    });
    const client = new PikPakClient();
    await expect(client.getShareFileMeta('S', 'I')).resolves.toEqual({
      name: 'a.mp4',
      url: 'https://dl/a'
    });
  });

  it('waitDriveFileUrl zwraca URL, gdy plik gotowy', async () => {
    fetchMock.mockImplementation(async (raw: unknown) => {
      const url = String(raw);
      if (url.includes('captcha/init')) return json({ captcha_token: 't' });
      if (url.includes('/drive/v1/files/READY'))
        return json({ size: 10, web_content_link: 'https://dl/ok' });
      return json({}, 404);
    });
    const client = new PikPakClient();
    await expect(client.waitDriveFileUrl('READY', 500)).resolves.toBe('https://dl/ok');
  });

  it('waitDriveFileUrl zwraca undefined po timeoucie (plik size=0)', async () => {
    fetchMock.mockImplementation(async (raw: unknown) => {
      const url = String(raw);
      if (url.includes('captcha/init')) return json({ captcha_token: 't' });
      if (url.includes('/drive/v1/files/EMPTY')) return json({ size: 0 });
      return json({}, 404);
    });
    const client = new PikPakClient();
    await expect(client.waitDriveFileUrl('EMPTY', 0)).resolves.toBeUndefined();
  });

  it('cleanupDriveFiles usuwa do kosza i trwale', async () => {
    const calls: string[] = [];
    fetchMock.mockImplementation(async (raw: unknown) => {
      const url = String(raw);
      if (url.includes('captcha/init')) return json({ captcha_token: 't' });
      if (url.includes('files:batchTrash')) {
        calls.push('trash');
        return json({ task_id: 't' });
      }
      if (url.includes('files:batchDelete')) {
        calls.push('delete');
        return json({ task_id: 'd' });
      }
      return json({}, 404);
    });
    const client = new PikPakClient();
    await client.cleanupDriveFiles(['X']);
    expect(calls).toEqual(['trash', 'delete']);
  });

  it('refreshAccessToken zwraca nowy access_token', async () => {
    fetchMock.mockImplementation(async (raw: unknown) => {
      const url = String(raw);
      if (url.includes('/v1/auth/token')) return json({ access_token: 'NEW' });
      return json({}, 404);
    });
    const client = new PikPakClient();
    await expect(client.refreshAccessToken('R')).resolves.toBe('NEW');
  });
});
