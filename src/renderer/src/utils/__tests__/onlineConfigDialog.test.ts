import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  isScItem: vi.fn(),
  detectPlatform: vi.fn(),
  isHttpUrl: vi.fn()
}));

vi.mock('@renderer/utils/onlineView', () => ({ isScItem: h.isScItem }));
vi.mock('@shared/platform', () => ({
  detectPlatform: h.detectPlatform,
  isHttpUrl: h.isHttpUrl
}));

import {
  configDialogChannelTitle,
  configDialogPlatform,
  configDialogPlaylistTitle,
  configDialogTitle
} from '../onlineConfigDialog';

const t = (key: string, params?: Record<string, unknown>) => `${key}:${params?.count}`;
const itemUrl = (item: { url?: string }) => item.url ?? '';

const video = { title: 'Video', channelTitle: 'Channel', url: 'https://youtube.com/x' };

beforeEach(() => {
  h.isScItem.mockReset().mockReturnValue(false);
  h.detectPlatform.mockReset().mockReturnValue({ platform: 'youtube' });
  h.isHttpUrl.mockReset().mockReturnValue(true);
});

describe('configDialogTitle', () => {
  it('returns an empty title without a target', () => {
    expect(configDialogTitle(null, 0, t)).toBe('');
  });

  it('uses the video title for a single item', () => {
    expect(configDialogTitle({ mode: 'single', video: video as never }, 1, t)).toBe('Video');
  });

  it('uses the selected count for resolved items', () => {
    expect(configDialogTitle({ mode: 'resolved' }, 4, t)).toBe('youtube.itemsCount:4');
  });
});

describe('configDialogChannelTitle', () => {
  it('handles missing targets and resolved channels', () => {
    expect(configDialogChannelTitle(null, null)).toBe('');
    expect(configDialogChannelTitle({ mode: 'resolved' }, null)).toBe('');
    expect(
      configDialogChannelTitle({ mode: 'resolved' }, {
        meta: { channelTitle: 'Resolved' }
      } as never)
    ).toBe('Resolved');
  });

  it('uses the video channel for a single item', () => {
    expect(configDialogChannelTitle({ mode: 'single', video: video as never }, null)).toBe(
      'Channel'
    );
  });

  it('defaults a missing channel to empty', () => {
    expect(configDialogChannelTitle({ mode: 'single', video: { title: 'V' } as never }, null)).toBe(
      ''
    );
  });
});

describe('configDialogPlaylistTitle', () => {
  it('defaults missing playlist titles to empty', () => {
    expect(configDialogPlaylistTitle({ mode: 'resolved' }, null)).toBe('');
    expect(configDialogPlaylistTitle({ mode: 'resolved' }, { meta: {} } as never)).toBe('');
    expect(
      configDialogPlaylistTitle({ mode: 'single', video: { title: 'V' } as never }, null)
    ).toBe('');
  });

  it('mirrors the channel title rules', () => {
    expect(configDialogPlaylistTitle(null, null)).toBe('');
    expect(configDialogPlaylistTitle({ mode: 'single', video: video as never }, null)).toBe(
      'Channel'
    );
    expect(
      configDialogPlaylistTitle({ mode: 'resolved' }, {
        meta: { channelTitle: 'Resolved' }
      } as never)
    ).toBe('Resolved');
  });
});

describe('configDialogPlatform', () => {
  it('defaults to youtube without target or item', () => {
    expect(configDialogPlatform(null, null, itemUrl)).toBe('youtube');
    expect(configDialogPlatform({ mode: 'resolved' }, { items: [] } as never, itemUrl)).toBe(
      'youtube'
    );
  });

  it('detects SoundCloud items', () => {
    h.isScItem.mockReturnValue(true);

    expect(configDialogPlatform({ mode: 'single', video: video as never }, null, itemUrl)).toBe(
      'soundcloud'
    );
  });

  it('detects YouTube links', () => {
    expect(configDialogPlatform({ mode: 'single', video: video as never }, null, itemUrl)).toBe(
      'youtube'
    );
  });

  it('detects generic http links', () => {
    h.detectPlatform.mockReturnValue(null);
    h.isHttpUrl.mockReturnValue(true);

    expect(configDialogPlatform({ mode: 'single', video: video as never }, null, itemUrl)).toBe(
      'generic'
    );
  });

  it('falls back to youtube for unsupported links', () => {
    h.detectPlatform.mockReturnValue(null);
    h.isHttpUrl.mockReturnValue(false);

    expect(configDialogPlatform({ mode: 'single', video: video as never }, null, itemUrl)).toBe(
      'youtube'
    );
  });

  it('resolves the platform from the first resolved item', () => {
    const resolved = { items: [{ url: 'https://soundcloud.com/x' }], meta: {} };

    configDialogPlatform({ mode: 'resolved' }, resolved as never, itemUrl);

    expect(h.isScItem).toHaveBeenCalledWith(resolved.items[0], 'https://soundcloud.com/x');
  });
});
