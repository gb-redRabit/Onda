import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Provider } from '../types';
import type { ProviderRef, RemoteItem } from '../../../../shared/types/providers';

const h = vi.hoisted(() => ({
  cache: {
    getCachedFileUrl: vi.fn(),
    getCachedFolder: vi.fn(),
    setCachedFileUrl: vi.fn(),
    setCachedFolder: vi.fn()
  },
  provider: {
    id: 'pikpak',
    label: 'PikPak',
    icon: 'pikpak',
    capabilities: {
      folders: true,
      thumbnails: false,
      anonymous: true,
      expiringLink: true,
      auth: 'cookie'
    },
    match: vi.fn((url: string) => url.includes('pikpak')),
    parse: vi.fn((url: string) =>
      url.includes('pikpak') ? { provider: 'pikpak', shareId: 'share' } : null
    ),
    listFolder: vi.fn(),
    resolveFileUrl: vi.fn(),
    onDownloadSettled: vi.fn()
  }
}));

vi.mock('../provider-cache', () => h.cache);
vi.mock('../pikpak', () => ({ pikpakProvider: h.provider }));

function provider(id: string, overrides: Partial<Provider> = {}): Provider {
  return {
    id: id as Provider['id'],
    label: id,
    icon: id,
    capabilities: {
      folders: false,
      thumbnails: false,
      anonymous: false,
      expiringLink: false,
      auth: 'none'
    },
    match: () => false,
    parse: () => null,
    listFolder: vi.fn(async () => []),
    resolveFileUrl: vi.fn(async () => ({ url: 'https://cdn/file' })),
    ...overrides
  };
}

vi.mock('../mega', () => ({ megaProvider: provider('mega') }));
vi.mock('../gdrive', () => ({ gdriveProvider: provider('gdrive') }));
vi.mock('../terabox', () => ({ teraboxProvider: provider('terabox') }));
vi.mock('../pan123', () => ({ pan123Provider: provider('123pan') }));
vi.mock('../hoster', () => ({
  dropboxProvider: provider('dropbox'),
  yandexProvider: provider('yandex'),
  archiveProvider: provider('archive')
}));
vi.mock('../direct', () => ({ directProvider: provider('direct') }));

import {
  detectProvider,
  listProvidersRequiringAuth,
  listProviderFolder,
  settleProviderDownload,
  resolveProviderFileUrl
} from '../registry';

const REF: ProviderRef = { provider: 'pikpak', shareId: 'share' };
const ITEMS: RemoteItem[] = [{ id: 'item-1', name: 'movie.mp4', kind: 'file' }];

beforeEach(() => {
  for (const fn of Object.values(h.cache)) fn.mockReset();
  h.provider.listFolder.mockReset().mockResolvedValue(ITEMS);
  h.provider.resolveFileUrl.mockReset().mockResolvedValue({ url: 'https://cdn/file' });
  h.provider.onDownloadSettled.mockReset().mockResolvedValue(undefined);
  h.provider.match.mockClear();
  h.provider.parse.mockClear();
});

describe('detectProvider edges', () => {
  it('returns null when the provider cannot parse the url', () => {
    h.provider.match.mockReturnValueOnce(true);
    h.provider.parse.mockReturnValueOnce(null);

    expect(detectProvider('https://pikpak/broken')).toBeNull();
  });

  it('returns null when no provider matches', () => {
    h.provider.match.mockReturnValue(false);
    expect(detectProvider('https://elsewhere/x.mp4')).toBeNull();
  });
});

describe('listProvidersRequiringAuth', () => {
  it('lists only providers that need credentials', () => {
    expect(listProvidersRequiringAuth()).toEqual([
      { id: 'pikpak', label: 'PikPak', icon: 'pikpak' }
    ]);
  });
});

describe('listProviderFolder', () => {
  it('rejects unknown providers', async () => {
    await expect(
      listProviderFolder({ provider: 'unknown' as ProviderRef['provider'], shareId: 's' })
    ).rejects.toThrow('Nieznany provider');
  });

  it('serves cached folders without calling the provider', async () => {
    h.cache.getCachedFolder.mockResolvedValueOnce(ITEMS);

    await expect(listProviderFolder(REF, 'd1')).resolves.toBe(ITEMS);

    expect(h.cache.getCachedFolder).toHaveBeenCalledWith('pikpak:share:d1');
    expect(h.provider.listFolder).not.toHaveBeenCalled();
    expect(h.cache.setCachedFolder).not.toHaveBeenCalled();
  });

  it('loads fresh folders and stores them in the cache', async () => {
    h.cache.getCachedFolder.mockResolvedValueOnce(null);

    await expect(listProviderFolder(REF)).resolves.toBe(ITEMS);

    expect(h.cache.getCachedFolder).toHaveBeenCalledWith('pikpak:share:');
    expect(h.provider.listFolder).toHaveBeenCalledWith(REF, undefined);
    expect(h.cache.setCachedFolder).toHaveBeenCalledWith('pikpak:share:', ITEMS);
  });

  it('skips the cache when a refresh is forced', async () => {
    await expect(listProviderFolder(REF, 'd1', true)).resolves.toBe(ITEMS);

    expect(h.cache.getCachedFolder).not.toHaveBeenCalled();
    expect(h.cache.setCachedFolder).toHaveBeenCalledWith('pikpak:share:d1', ITEMS);
  });
});

describe('settleProviderDownload', () => {
  it('forwards settlement to the provider', async () => {
    await settleProviderDownload(REF, 'item-1');
    expect(h.provider.onDownloadSettled).toHaveBeenCalledWith(REF, 'item-1');
  });

  it('does nothing for unknown providers or providers without a hook', async () => {
    await expect(
      settleProviderDownload({ provider: 'unknown' as ProviderRef['provider'], shareId: 's' }, 'x')
    ).resolves.toBeUndefined();

    await expect(
      settleProviderDownload({ provider: 'mega', shareId: 's' }, 'x')
    ).resolves.toBeUndefined();
  });
});

describe('resolveProviderFileUrl', () => {
  it('rejects unknown providers', async () => {
    await expect(resolveProviderFileUrl('unknown', REF, 'item-1')).rejects.toThrow(
      'Nieznany provider'
    );
  });

  it('reuses a cached url for playback', async () => {
    h.cache.getCachedFileUrl.mockResolvedValueOnce({
      url: 'https://cached',
      headers: { a: 'b' }
    });

    await expect(resolveProviderFileUrl('pikpak', REF, 'item-1')).resolves.toMatchObject({
      url: 'https://cached'
    });

    expect(h.provider.resolveFileUrl).not.toHaveBeenCalled();
  });

  it('resolves and caches playback urls', async () => {
    h.cache.getCachedFileUrl.mockResolvedValueOnce(null);

    const res = await resolveProviderFileUrl('pikpak', REF, 'item-1');

    expect(res).toEqual({ url: 'https://cdn/file' });
    expect(h.cache.getCachedFileUrl).toHaveBeenCalledWith('pikpak:share:item-1');
    expect(h.cache.setCachedFileUrl).toHaveBeenCalledWith(
      'pikpak:share:item-1',
      'https://cdn/file',
      undefined
    );
  });

  it('never caches downloads, ranges, status callbacks or streams', async () => {
    const onStatus = vi.fn();
    await resolveProviderFileUrl('pikpak', REF, 'item-1', undefined, true);
    await resolveProviderFileUrl('pikpak', REF, 'item-1', { start: 0, end: 10 });
    await resolveProviderFileUrl('pikpak', REF, 'item-1', undefined, false, onStatus);
    h.provider.resolveFileUrl.mockResolvedValueOnce({ stream: {} as never });

    await resolveProviderFileUrl('pikpak', REF, 'item-1');

    expect(h.cache.getCachedFileUrl).toHaveBeenCalledTimes(1);
    expect(h.cache.setCachedFileUrl).not.toHaveBeenCalled();
  });

  it('does not cache results without a url', async () => {
    h.cache.getCachedFileUrl.mockResolvedValueOnce(null);
    h.provider.resolveFileUrl.mockResolvedValueOnce({ size: 10 });

    await resolveProviderFileUrl('pikpak', REF, 'item-1');

    expect(h.cache.setCachedFileUrl).not.toHaveBeenCalled();
  });
});
