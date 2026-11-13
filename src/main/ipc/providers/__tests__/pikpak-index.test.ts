import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  client: {
    setCookie: vi.fn(),
    setAccessToken: vi.fn(),
    hasAccessToken: vi.fn(() => false),
    refreshAccessToken: vi.fn(),
    listFolder: vi.fn(),
    getShareFileMeta: vi.fn(),
    restoreToDrive: vi.fn(),
    waitDriveFileUrl: vi.fn(),
    cleanupDriveFiles: vi.fn(),
    getFileInfo: vi.fn()
  },
  cookie: vi.fn(),
  token: vi.fn(),
  refresh: vi.fn(),
  setToken: vi.fn(),
  warn: vi.fn()
}));

vi.mock('../pikpak/pikpak-client', () => ({
  PikPakClient: class {
    constructor() {
      return h.client;
    }
  },
  PIKPAK_UA: 'PikPak-UA'
}));
vi.mock('../provider-credentials', () => ({
  getProviderCookie: h.cookie,
  getProviderToken: h.token,
  getProviderRefresh: h.refresh,
  setProviderToken: h.setToken
}));
vi.mock('../../../../shared/logger', () => ({
  logger: { warn: h.warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import { pikpakProvider } from '../pikpak/index';

const ref = { provider: 'pikpak', shareId: 'S1' } as never;

beforeEach(() => {
  vi.clearAllMocks();
  h.cookie.mockResolvedValue('');
  h.token.mockResolvedValue('token');
  h.refresh.mockResolvedValue(null);
  h.setToken.mockResolvedValue(undefined);
  h.client.hasAccessToken.mockReturnValue(false);
  h.client.listFolder.mockResolvedValue([]);
  h.client.getFileInfo.mockResolvedValue('https://cdn/file');
  h.client.cleanupDriveFiles.mockResolvedValue(undefined);
});

// PikPak provider adapter: share matching, auth/refresh, folder mapping and the
// "restore to drive" download path with its cleanup.

describe('pikpakProvider match/parse', () => {
  it('accepts mypikpak share links with or without www', () => {
    expect(pikpakProvider.match('https://mypikpak.com/s/abc')).toBe(true);
    expect(pikpakProvider.match('http://www.mypikpak.net/s/abc?x=1')).toBe(true);
    expect(pikpakProvider.match('https://example.com/s/abc')).toBe(false);
  });

  it('extracts the share id or returns null', () => {
    expect(pikpakProvider.parse('https://mypikpak.com/s/AbC123')).toEqual({
      provider: 'pikpak',
      shareId: 'AbC123'
    });
    expect(pikpakProvider.parse('https://example.com/nope')).toBeNull();
  });
});

describe('pikpakProvider listFolder', () => {
  it('maps folders and files with sizes and thumbnails', async () => {
    h.client.listFolder.mockResolvedValueOnce([
      {
        id: 'f1',
        name: 'Folder',
        kind: 'drive#folder',
        size: '10',
        thumbnail_link: undefined,
        web_thumbnail_link: 'https://thumb/folder'
      },
      {
        id: 'x1',
        name: 'Video.mp4',
        kind: 'drive#file',
        size: '2048',
        thumbnail_link: 'https://thumb/file'
      },
      { id: 42, name: 'bad' },
      { id: 'no-name' }
    ]);

    const items = await pikpakProvider.listFolder(ref, 'parent');

    expect(items).toEqual([
      {
        id: 'f1',
        name: 'Folder',
        kind: 'folder',
        size: undefined,
        thumbnail: 'https://thumb/folder',
        parentId: 'parent'
      },
      {
        id: 'x1',
        name: 'Video.mp4',
        kind: 'file',
        size: 2048,
        thumbnail: 'https://thumb/file',
        parentId: 'parent'
      }
    ]);
    expect(h.client.listFolder).toHaveBeenCalledWith('S1', 'parent');
  });

  it('defaults the parent to the root and unparsable sizes to zero', async () => {
    h.client.listFolder.mockResolvedValueOnce([
      { id: 'x', name: 'X', kind: 'drive#file', size: 'not-a-number' }
    ]);

    const [item] = await pikpakProvider.listFolder(ref);

    expect(item).toMatchObject({ parentId: '', size: 0 });
    expect(h.client.listFolder).toHaveBeenCalledWith('S1', '');
  });

  it('refreshes an expired access token and stores the fresh one', async () => {
    h.token.mockResolvedValue(null);
    h.refresh.mockResolvedValue('refresh-token');
    h.client.refreshAccessToken.mockResolvedValue('fresh-token');

    await pikpakProvider.listFolder(ref);

    expect(h.client.refreshAccessToken).toHaveBeenCalledWith('refresh-token');
    expect(h.setToken).toHaveBeenCalledWith('pikpak', 'fresh-token');
    expect(h.client.setAccessToken).toHaveBeenCalledWith('fresh-token');
  });

  it('falls back to anonymous access when the refresh fails', async () => {
    h.token.mockResolvedValue(null);
    h.refresh.mockResolvedValue('refresh-token');
    h.client.refreshAccessToken.mockRejectedValue(new Error('expired'));

    await pikpakProvider.listFolder(ref);

    expect(h.warn).toHaveBeenCalledWith(
      'providers',
      'pikpak token refresh failed',
      expect.any(Error)
    );
    expect(h.client.setAccessToken).toHaveBeenCalledWith(null);
  });

  it('skips refresh when no refresh token is stored', async () => {
    h.token.mockResolvedValue(null);
    h.refresh.mockResolvedValue(null);

    await pikpakProvider.listFolder(ref);

    expect(h.client.refreshAccessToken).not.toHaveBeenCalled();
    expect(h.client.setAccessToken).toHaveBeenCalledWith(null);
  });

  it('keeps anonymous access when the refresh returns no token', async () => {
    h.token.mockResolvedValue(null);
    h.refresh.mockResolvedValue('refresh-token');
    h.client.refreshAccessToken.mockResolvedValue(null);

    await pikpakProvider.listFolder(ref);

    expect(h.setToken).not.toHaveBeenCalled();
    expect(h.client.setAccessToken).toHaveBeenCalledWith(null);
  });

  it('defaults a missing file size to zero', async () => {
    h.client.listFolder.mockResolvedValueOnce([{ id: 'x', name: 'No size', kind: 'drive#file' }]);

    const [item] = await pikpakProvider.listFolder(ref);

    expect(item).toMatchObject({ size: 0 });
  });
});

describe('pikpakProvider resolveFileUrl', () => {
  it('plays the best rendition anonymously', async () => {
    const status = vi.fn();
    h.cookie.mockResolvedValue('sid=1');

    const result = await pikpakProvider.resolveFileUrl(ref, 'x1', undefined, false, status);

    expect(result).toEqual({
      url: 'https://cdn/file',
      headers: {
        'User-Agent': 'PikPak-UA',
        Referer: 'https://mypikpak.com/',
        Cookie: 'sid=1'
      }
    });
    expect(status).toHaveBeenCalledWith('downloads.statusChecking');
    expect(h.client.getShareFileMeta).not.toHaveBeenCalled();
  });

  it('omits the Cookie header when there is no session cookie', async () => {
    const result = await pikpakProvider.resolveFileUrl(ref, 'x1', undefined, false);

    expect(result.headers).not.toHaveProperty('Cookie');
  });

  it('restores the original to the drive for downloads and cleans it up afterwards', async () => {
    const status = vi.fn();
    h.client.hasAccessToken.mockReturnValue(true);
    h.client.getShareFileMeta.mockResolvedValue({ name: 'Original.mp4' });
    h.client.restoreToDrive.mockResolvedValue('drive-1');
    h.client.waitDriveFileUrl.mockResolvedValue('https://cdn/original');

    const result = await pikpakProvider.resolveFileUrl(ref, 'x1', undefined, true, status);

    expect(result.url).toBe('https://cdn/original');
    expect(status.mock.calls.map((c) => c[0])).toEqual([
      'downloads.statusSaving',
      'downloads.statusWaiting'
    ]);
    expect(h.client.restoreToDrive).toHaveBeenCalledWith('S1', 'x1', 'Original.mp4');

    await pikpakProvider.onDownloadSettled!(ref, 'x1');
    expect(h.client.cleanupDriveFiles).toHaveBeenCalledWith(['drive-1']);

    // Second settle is a no-op (the temp copy was already removed).
    await pikpakProvider.onDownloadSettled!(ref, 'x1');
    expect(h.client.cleanupDriveFiles).toHaveBeenCalledTimes(1);
  });

  it('cleans up and falls back when the restore never materialises', async () => {
    h.client.hasAccessToken.mockReturnValue(true);
    h.client.getShareFileMeta.mockResolvedValue({ name: 'Original.mp4' });
    h.client.restoreToDrive.mockResolvedValue('drive-2');
    h.client.waitDriveFileUrl.mockResolvedValue(null);

    const result = await pikpakProvider.resolveFileUrl(ref, 'x1', undefined, true);

    expect(result.url).toBe('https://cdn/file');
    expect(h.client.cleanupDriveFiles).toHaveBeenCalledWith(['drive-2']);
    expect(h.warn).toHaveBeenCalledWith(
      'providers',
      expect.stringContaining('fallback do renditions')
    );
  });

  it('falls back to renditions when the restore throws', async () => {
    h.client.hasAccessToken.mockReturnValue(true);
    h.client.getShareFileMeta.mockRejectedValue(new Error('quota'));

    const result = await pikpakProvider.resolveFileUrl(ref, 'x1', undefined, true);

    expect(result.url).toBe('https://cdn/file');
    expect(h.warn).toHaveBeenCalledWith(
      'providers',
      'pikpak restore failed, falling back',
      expect.any(Error)
    );
  });

  it('logs cleanup failures on settle', async () => {
    h.client.hasAccessToken.mockReturnValue(true);
    h.client.getShareFileMeta.mockResolvedValue({ name: 'X.mp4' });
    h.client.restoreToDrive.mockResolvedValue('drive-3');
    h.client.waitDriveFileUrl.mockResolvedValue('https://cdn/x');
    await pikpakProvider.resolveFileUrl(ref, 'x1', undefined, true);

    h.client.cleanupDriveFiles.mockRejectedValueOnce(new Error('locked'));
    await pikpakProvider.onDownloadSettled!(ref, 'x1');

    expect(h.warn).toHaveBeenCalledWith(
      'providers',
      'pikpak drive cleanup failed',
      expect.any(Error)
    );
  });

  it('ignores settle events for files that were never restored', async () => {
    await pikpakProvider.onDownloadSettled!(ref, 'never-restored');

    expect(h.client.cleanupDriveFiles).not.toHaveBeenCalled();
  });
});
