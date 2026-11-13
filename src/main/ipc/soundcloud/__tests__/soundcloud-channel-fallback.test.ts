import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  pickChannelThumbnail: vi.fn((e: { thumbnail?: string }) => e.thumbnail ?? ''),
  runYtDlp: vi.fn(),
  readNetworkArgs: vi.fn(async () => ['--proxy', 'p']),
  scVideoFromEntry: vi.fn((e: { id?: string }) => ({ id: e.id })),
  entryUrl: vi.fn((e: { webpage_url?: string }) => e.webpage_url)
}));

vi.mock('../../youtube/youtube-utils', () => ({
  pickChannelThumbnail: h.pickChannelThumbnail
}));
vi.mock('../../youtube/youtube-handlers', () => ({ runYtDlp: h.runYtDlp }));
vi.mock('../../proxy-utils', () => ({ readNetworkArgs: h.readNetworkArgs }));
vi.mock('../soundcloud-entries', () => ({
  scVideoFromEntry: h.scVideoFromEntry,
  entryUrl: h.entryUrl
}));

import { fallbackChannelAll, fallbackChannelPage } from '../soundcloud-channel-fallback';

beforeEach(() => {
  h.runYtDlp.mockReset().mockResolvedValue('{}');
  h.readNetworkArgs.mockClear();
  h.scVideoFromEntry.mockClear();
  h.entryUrl.mockClear();
  h.pickChannelThumbnail.mockClear();
});

describe('fallbackChannelPage', () => {
  it('requests a playlist range and maps the profile', async () => {
    h.runYtDlp.mockResolvedValue(
      JSON.stringify({
        uploader_id: 'user-1',
        channel: 'Channel name',
        thumbnail: 'thumb.png',
        channel_follower_count: 12,
        description: 'About',
        playlist_count: 3,
        entries: [{ id: 'a', title: 'A' }, { title: 'no id' }, { id: 'b', title: 'B' }]
      })
    );

    const result = await fallbackChannelPage('https://sc/user', 1, 20, 20);

    expect(h.runYtDlp).toHaveBeenCalledWith(
      [
        'https://sc/user',
        '--flat-playlist',
        '--playlist-start',
        '1',
        '--playlist-end',
        '20',
        '--no-warnings',
        '-J',
        '--proxy',
        'p'
      ],
      60000
    );
    expect(result.channel).toEqual({
      id: 'user-1',
      url: 'https://sc/user',
      title: 'Channel name',
      thumbnail: 'thumb.png',
      bannerUrl: 'thumb.png',
      subscriberCount: 12,
      description: 'About',
      videoCount: 3
    });
    expect(result.items).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(result.hasMore).toBe(false);
  });

  it('falls back through channel fields and counts mapped items', async () => {
    h.runYtDlp.mockResolvedValue(
      JSON.stringify({
        uploader: 'uploader-name',
        entries: [{ id: 'a', title: 'A' }]
      })
    );

    const result = await fallbackChannelPage('https://sc/user', 5, 9, 5);

    expect(result.channel).toMatchObject({
      id: 'uploader-name',
      title: 'uploader-name',
      thumbnail: '',
      bannerUrl: undefined,
      subscriberCount: undefined,
      description: '',
      videoCount: 1
    });
    expect(result.hasMore).toBe(false);
  });

  it('uses the target as id and an empty title when metadata is missing', async () => {
    h.runYtDlp.mockResolvedValue('{}');

    const result = await fallbackChannelPage('https://sc/user', 1, 2, 2);

    expect(result.channel).toMatchObject({ id: 'https://sc/user', title: '', videoCount: 0 });
  });

  it('reports more pages when the batch fills the limit', async () => {
    h.runYtDlp.mockResolvedValue(
      JSON.stringify({
        entries: Array.from({ length: 5 }, (_, i) => ({ id: String(i), title: 'x' }))
      })
    );

    await expect(fallbackChannelPage('t', 1, 5, 5)).resolves.toMatchObject({ hasMore: true });
  });
});

describe('fallbackChannelAll', () => {
  it('fetches every entry, caps at five hundred and maps the channel', async () => {
    const entries = Array.from({ length: 520 }, (_, i) => ({ id: `e${i}`, title: `T${i}` }));
    h.runYtDlp.mockResolvedValue(
      JSON.stringify({
        title: 'Title fallback',
        thumbnail: 'thumb',
        playlist_count: 520,
        entries: [...entries, { title: 'skip' }]
      })
    );

    const result = await fallbackChannelAll('https://sc/user');

    expect(h.runYtDlp).toHaveBeenCalledWith(
      ['https://sc/user', '--flat-playlist', '--no-warnings', '-J', '--proxy', 'p'],
      120000
    );
    expect(result.items).toHaveLength(500);
    expect(result.channel).toMatchObject({
      id: 'https://sc/user',
      title: 'Title fallback',
      thumbnail: 'thumb',
      bannerUrl: 'thumb',
      videoCount: 520
    });
  });

  it('falls back to the item count when the playlist count is absent', async () => {
    h.runYtDlp.mockResolvedValue(
      JSON.stringify({
        entries: [
          { id: 'a', title: 'A' },
          { id: 'b', title: 'B' }
        ]
      })
    );

    const result = await fallbackChannelAll('target');

    expect(result.channel.videoCount).toBe(2);
    expect(result.channel.id).toBe('target');
  });

  it('handles a response without entries', async () => {
    h.runYtDlp.mockResolvedValue('{}');

    const result = await fallbackChannelAll('target');

    expect(result.items).toEqual([]);
    expect(result.channel.videoCount).toBe(0);
  });
});
