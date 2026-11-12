import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  classify: vi.fn((message: string) => `code:${message}`),
  loggerWarn: vi.fn(),
  pickThumbnail: vi.fn(),
  resolveAvatar: vi.fn(),
  detectKind: vi.fn(),
  normalizeUrl: vi.fn(),
  mapVideo: vi.fn((entry: { id: string; title: string }) => ({
    id: entry.id,
    title: entry.title
  })),
  networkArgs: vi.fn(async () => ['--proxy', 'x']),
  runYtDlp: vi.fn(),
  e2e: vi.fn(() => false),
  e2eSearchItems: vi.fn((query: string) => [{ id: `e2e-${query}`, title: query }])
}));

vi.mock('../../../downloads/error-classifier', () => ({ classifyYtDlpError: mocks.classify }));
vi.mock('../../../../shared/logger', () => ({
  logger: { warn: mocks.loggerWarn, info: vi.fn(), error: vi.fn() }
}));
vi.mock('../youtube-utils', () => ({
  pickChannelThumbnail: mocks.pickThumbnail,
  resolveChannelAvatar: mocks.resolveAvatar,
  detectYtKind: mocks.detectKind,
  normalizeYtUrl: mocks.normalizeUrl,
  mapVideoEntry: mocks.mapVideo
}));
vi.mock('../../proxy-utils', () => ({ readNetworkArgs: mocks.networkArgs }));
vi.mock('../youtube-fetch', () => ({ runYtDlp: mocks.runYtDlp }));
vi.mock('../../../e2e-fixtures', () => ({
  e2eFixturesEnabled: mocks.e2e,
  e2eSearchItems: mocks.e2eSearchItems
}));

import {
  fetchChannelAll,
  fetchChannelItems,
  resetChannelPlaylistCache,
  searchYoutube
} from '../youtube-channel';

function playlist(overrides: Record<string, unknown> = {}) {
  return {
    id: 'uploader-id',
    channel: 'Channel Name',
    entries: [
      { id: 'a', title: 'A' },
      { id: '', title: 'skip-no-id' },
      { id: 'b', title: '' },
      { id: 'c', title: 'C' }
    ],
    playlist_count: 3,
    ...overrides
  };
}

beforeEach(() => {
  resetChannelPlaylistCache();
  for (const fn of [
    mocks.classify,
    mocks.pickThumbnail,
    mocks.resolveAvatar,
    mocks.detectKind,
    mocks.normalizeUrl,
    mocks.mapVideo,
    mocks.networkArgs,
    mocks.runYtDlp,
    mocks.e2e,
    mocks.e2eSearchItems
  ]) {
    fn.mockClear();
  }
  mocks.detectKind.mockReturnValue('channel');
  mocks.normalizeUrl.mockReturnValue('https://youtube.com/@channel');
  mocks.pickThumbnail.mockReturnValue(undefined);
  mocks.resolveAvatar.mockResolvedValue('avatar.png');
  mocks.runYtDlp.mockResolvedValue(JSON.stringify(playlist()));
  mocks.e2e.mockReturnValue(false);
});

describe('fetchChannelItems', () => {
  it('rejects non-channel urls', async () => {
    mocks.detectKind.mockReturnValue('video');

    const result = await fetchChannelItems({ url: 'https://youtube.com/watch?v=x' });

    expect(result).toMatchObject({ success: false, items: [], hasMore: false });
    expect(mocks.runYtDlp).not.toHaveBeenCalled();
  });

  it('returns deterministic fixtures in e2e mode', async () => {
    mocks.e2e.mockReturnValue(true);

    const result = await fetchChannelItems({ url: 'https://youtube.com/@e2e' });

    expect(result.success).toBe(true);
    expect(result.channel).toMatchObject({ title: 'E2E Channel' });
    expect(mocks.runYtDlp).not.toHaveBeenCalled();
  });

  it('loads a full playlist, filters invalid entries and pages it', async () => {
    const result = await fetchChannelItems({ url: 'u', start: 1, end: 2 });

    expect(mocks.runYtDlp).toHaveBeenCalledWith(
      [
        'https://youtube.com/@channel/videos',
        '--flat-playlist',
        '--no-warnings',
        '-J',
        '--proxy',
        'x'
      ],
      120000
    );
    expect(result).toEqual({
      success: true,
      channel: {
        id: 'uploader-id',
        url: 'https://youtube.com/@channel',
        title: 'Channel Name',
        thumbnail: 'avatar.png',
        subscriberCount: undefined,
        description: '',
        videoCount: 3,
        bannerUrl: undefined
      },
      items: [
        { id: 'a', title: 'A' },
        { id: 'c', title: 'C' }
      ],
      hasMore: true
    });
  });

  it('uses the shorts tab and clamps page bounds', async () => {
    mocks.runYtDlp.mockResolvedValue(
      JSON.stringify(playlist({ entries: [{ id: 's', title: 'Short' }], playlist_count: 1 }))
    );

    const result = await fetchChannelItems({ url: 'u', tab: 'shorts', start: 0, end: 999 });

    expect(mocks.runYtDlp.mock.calls[0][0][0]).toBe('https://youtube.com/@channel/shorts');
    expect(mocks.networkArgs).toHaveBeenCalledWith('youtube');
    expect(result.success).toBe(true);
    expect(result.hasMore).toBe(false);
  });

  it('falls back to playlist length when no count is provided', async () => {
    mocks.runYtDlp.mockResolvedValue(
      JSON.stringify(playlist({ playlist_count: undefined, channel: undefined, uploader: 'Up' }))
    );

    const result = await fetchChannelItems({ url: 'u' });

    expect(result.channel?.title).toBe('Up');
    expect(result.channel?.videoCount).toBe(2);
  });

  it('reports a missing shorts tab distinctly', async () => {
    mocks.runYtDlp.mockRejectedValue(new Error('This channel does not have a shorts tab'));

    const result = await fetchChannelItems({ url: 'u', tab: 'shorts' });

    expect(result).toEqual({
      success: false,
      error: 'no_shorts_tab',
      items: [],
      hasMore: false
    });
    expect(mocks.classify).not.toHaveBeenCalled();
  });

  it('classifies other failures and falls back for empty messages', async () => {
    mocks.runYtDlp.mockRejectedValue(new Error('boom'));
    await expect(fetchChannelItems({ url: 'u' })).resolves.toMatchObject({
      success: false,
      error: 'boom',
      code: 'code:boom'
    });

    mocks.runYtDlp.mockRejectedValue('');
    await expect(fetchChannelItems({ url: 'u' })).resolves.toMatchObject({
      success: false,
      error: 'Could not load this channel'
    });
  });

  it('caches the parsed playlist for five minutes per target', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-12T10:00:00Z'));
    try {
      await fetchChannelItems({ url: 'u' });
      await fetchChannelItems({ url: 'u' });
      expect(mocks.runYtDlp).toHaveBeenCalledTimes(1);

      await fetchChannelItems({ url: 'u', tab: 'shorts' });
      expect(mocks.runYtDlp).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      await fetchChannelItems({ url: 'u' });
      expect(mocks.runYtDlp).toHaveBeenCalledTimes(3);

      resetChannelPlaylistCache();
      await fetchChannelItems({ url: 'u' });
      expect(mocks.runYtDlp).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('evicts the oldest cache entry at the limit', async () => {
    mocks.normalizeUrl.mockImplementation((url: string) => `https://youtube.com/${url}`);

    for (let i = 0; i < 51; i += 1) {
      await fetchChannelItems({ url: `channel-${i}` });
    }
    expect(mocks.runYtDlp).toHaveBeenCalledTimes(51);

    // Pierwszy wpis wypadł z cache, więc wraca do yt-dlp.
    await fetchChannelItems({ url: 'channel-0' });
    expect(mocks.runYtDlp).toHaveBeenCalledTimes(52);
  });
});

describe('fetchChannelAll', () => {
  it('rejects non-channel urls', async () => {
    mocks.detectKind.mockReturnValue('playlist');

    await expect(fetchChannelAll({ url: 'u' })).resolves.toEqual({
      success: false,
      error: 'Expected a channel link or name',
      items: []
    });
  });

  it('returns every mapped item and channel metadata', async () => {
    mocks.pickThumbnail.mockReturnValue('thumb.png');

    const result = await fetchChannelAll({ url: 'u' });

    expect(result).toMatchObject({
      success: true,
      channel: {
        id: 'uploader-id',
        title: 'Channel Name',
        thumbnail: 'thumb.png',
        videoCount: 3
      },
      items: [
        { id: 'a', title: 'A' },
        { id: 'c', title: 'C' }
      ]
    });
    expect(mocks.resolveAvatar).not.toHaveBeenCalled();
  });

  it('classifies failures', async () => {
    mocks.runYtDlp.mockRejectedValue(new Error('nope'));

    await expect(fetchChannelAll({ url: 'u' })).resolves.toMatchObject({
      success: false,
      error: 'nope',
      code: 'code:nope',
      items: []
    });
  });
});

describe('searchYoutube', () => {
  it('validates the query', async () => {
    for (const query of ['', '   ', 'x'.repeat(201), 42]) {
      await expect(searchYoutube(query as never)).resolves.toMatchObject({
        success: false,
        error: 'Invalid search query',
        nextPageToken: null,
        prevPageToken: null
      });
    }
    expect(mocks.runYtDlp).not.toHaveBeenCalled();
  });

  it('returns fixtures in e2e mode', async () => {
    mocks.e2e.mockReturnValue(true);

    await expect(searchYoutube('mix')).resolves.toMatchObject({
      success: true,
      items: [{ id: 'e2e-mix', title: 'mix' }]
    });
    expect(mocks.runYtDlp).not.toHaveBeenCalled();
  });

  it('maps search results', async () => {
    mocks.runYtDlp.mockResolvedValue(
      JSON.stringify({
        entries: [
          { id: 'v1', title: 'One' },
          { id: '', title: 'skip' }
        ]
      })
    );

    await expect(searchYoutube('mix')).resolves.toMatchObject({
      success: true,
      items: [{ id: 'v1', title: 'One' }]
    });
    expect(mocks.runYtDlp).toHaveBeenCalledWith(
      ['ytsearch100:mix', '--flat-playlist', '--no-warnings', '-J', '--proxy', 'x'],
      60000
    );
  });

  it('classifies search failures', async () => {
    mocks.runYtDlp.mockRejectedValue(new Error('rate limit'));

    await expect(searchYoutube('mix')).resolves.toMatchObject({
      success: false,
      error: 'rate limit',
      code: 'code:rate limit',
      items: []
    });
  });
});
