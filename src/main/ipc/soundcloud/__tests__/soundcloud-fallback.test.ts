import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  runYtDlp: vi.fn(),
  fetchEntryJson: vi.fn(),
  readNetworkArgs: vi.fn(async () => ['--proxy', 'socks5://x']),
  mapResolvedContainer: vi.fn(({ entries }: { entries: { id?: string; title?: string }[] }) =>
    entries.map((e) => ({ id: e.id ?? '', title: e.title, thumbnail: '', url: undefined }))
  ),
  scThumbFromEntry: vi.fn((e: { thumbnail?: string }) => `thumb:${e.thumbnail ?? ''}`),
  entryUrl: vi.fn((e: { webpage_url?: string }) => e.webpage_url),
  scVideoFromEntry: vi.fn((e: { id?: string; title?: string }) => ({ id: e.id, title: e.title }))
}));

vi.mock('../../youtube/youtube-handlers', () => ({
  runYtDlp: h.runYtDlp,
  fetchEntryJson: h.fetchEntryJson
}));
vi.mock('../../proxy-utils', () => ({ readNetworkArgs: h.readNetworkArgs }));
vi.mock('../../youtube/youtube-utils', () => ({
  mapResolvedContainer: h.mapResolvedContainer
}));
vi.mock('../soundcloud-entries', () => ({
  scThumbFromEntry: h.scThumbFromEntry,
  entryUrl: h.entryUrl,
  scVideoFromEntry: h.scVideoFromEntry
}));

import { fallbackResolvePage, fallbackSearch } from '../soundcloud-fallback';

beforeEach(() => {
  h.runYtDlp.mockReset().mockResolvedValue('{}');
  h.fetchEntryJson.mockReset().mockResolvedValue({});
  h.readNetworkArgs.mockClear();
  h.mapResolvedContainer.mockClear();
  h.entryUrl.mockClear();
  h.scVideoFromEntry.mockClear();
});

describe('fallbackSearch', () => {
  it('runs scsearch with network args and maps valid entries', async () => {
    h.runYtDlp.mockResolvedValue(
      JSON.stringify({
        entries: [
          { id: '1', title: 'One' },
          { title: 'no id', webpage_url: 'https://sc/x' },
          { id: '2', title: 'Two' }
        ]
      })
    );

    const result = await fallbackSearch('lofi');

    expect(h.runYtDlp).toHaveBeenCalledWith(
      ['scsearch100:lofi', '--flat-playlist', '--no-warnings', '-J', '--proxy', 'socks5://x'],
      60000
    );
    expect(h.entryUrl).toHaveBeenCalledWith({ title: 'no id', webpage_url: 'https://sc/x' });
    expect(result).toEqual([
      { id: '1', title: 'One' },
      { id: undefined, title: 'no id' },
      { id: '2', title: 'Two' }
    ]);
  });

  it('handles a response without entries', async () => {
    h.runYtDlp.mockResolvedValue('{}');

    await expect(fallbackSearch('x')).resolves.toEqual([]);
  });
});

describe('fallbackResolvePage', () => {
  const entry = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    title: `Title ${id}`,
    ...extra
  });

  it('maps a page response with thumbnails and entry urls', async () => {
    h.fetchEntryJson.mockResolvedValue({
      title: 'Page title',
      playlist_count: 100,
      entries: [
        entry('a', { webpage_url: 'https://sc/a' }),
        { title: 'skip' },
        entry('https://sc/absolute')
      ]
    });

    const result = await fallbackResolvePage('https://sc/user', 'page30');

    expect(h.fetchEntryJson).toHaveBeenCalledWith('https://sc/user', 'page30');
    expect(result.title).toBe('Page title');
    expect(result.items).toEqual([
      { id: 'a', title: 'Title a' },
      { id: 'https://sc/absolute', title: 'Title https://sc/absolute' }
    ]);
    expect(result.resolvedItems).toEqual([
      expect.objectContaining({ thumbnail: 'thumb:', url: 'https://sc/a' }),
      expect.objectContaining({ thumbnail: 'thumb:', url: 'https://sc/absolute' })
    ]);
    expect(result.totalItems).toBe(100);
    expect(result.hasMore).toBe(false);
  });

  it('uses the absolute id as url only for https ids', async () => {
    h.fetchEntryJson.mockResolvedValue({
      entries: [entry('https://sc/absolute'), entry('relative')]
    });

    const result = await fallbackResolvePage('https://sc/user', 'full');

    expect(result.resolvedItems.map((r) => r.url)).toEqual(['https://sc/absolute', undefined]);
  });

  it('falls back through the title fields', async () => {
    h.fetchEntryJson.mockResolvedValue({ playlist_title: 'Playlist' });
    await expect(fallbackResolvePage('t', 'full')).resolves.toMatchObject({ title: 'Playlist' });

    h.fetchEntryJson.mockResolvedValue({ channel: 'Channel' });
    await expect(fallbackResolvePage('t', 'full')).resolves.toMatchObject({ title: 'Channel' });

    h.fetchEntryJson.mockResolvedValue({ uploader: 'Uploader' });
    await expect(fallbackResolvePage('t', 'full')).resolves.toMatchObject({ title: 'Uploader' });

    h.fetchEntryJson.mockResolvedValue({});
    await expect(fallbackResolvePage('t', 'full')).resolves.toMatchObject({ title: '' });
  });

  it('reports more pages while a full batch is returned', async () => {
    const entries = Array.from({ length: 30 }, (_, i) => entry(`e${i}`));
    h.fetchEntryJson.mockResolvedValue({ entries, playlist_count: 40 });

    await expect(fallbackResolvePage('t', 'page30')).resolves.toMatchObject({ hasMore: true });

    h.fetchEntryJson.mockResolvedValue({ entries, playlist_count: 30 });
    await expect(fallbackResolvePage('t', 'page30')).resolves.toMatchObject({ hasMore: false });

    h.fetchEntryJson.mockResolvedValue({ entries });
    await expect(fallbackResolvePage('t', 'page30')).resolves.toMatchObject({ hasMore: true });
  });
});
