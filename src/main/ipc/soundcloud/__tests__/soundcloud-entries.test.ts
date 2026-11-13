import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  formatDuration: vi.fn()
}));

vi.mock('../../../../shared/formatDuration', () => ({ formatDuration: h.formatDuration }));

import { durMs, durSec, entryUrl, scThumbFromEntry, scVideoFromEntry } from '../soundcloud-entries';

function configureDuration() {
  h.formatDuration.mockImplementation((seconds: number | undefined) =>
    seconds == null ? '' : `${seconds}s`
  );
}

configureDuration();

describe('durMs', () => {
  it('converts milliseconds to a rounded duration', () => {
    expect(durMs(1500)).toBe('2s');
    expect(durMs(0)).toBe('0s');
  });

  it('returns undefined for missing values', () => {
    expect(durMs()).toBeUndefined();
    expect(durMs(undefined)).toBeUndefined();
  });
});

describe('durSec', () => {
  it('formats seconds and hides empty output', () => {
    expect(durSec(65)).toBe('65s');
    expect(durSec(undefined)).toBeUndefined();
  });
});

describe('scThumbFromEntry', () => {
  it('prefers the widest https thumbnail', () => {
    const url = scThumbFromEntry({
      thumbnails: [
        { url: 'https://cdn/small.jpg', width: 100 },
        { url: 'http://insecure/large.jpg', width: 500 },
        { url: 'https://cdn/large.jpg', width: 300 },
        { url: '', width: 900 }
      ]
    } as never);

    expect(url).toBe('https://cdn/large.jpg');
  });

  it('falls back to the entry thumbnail when https', () => {
    expect(scThumbFromEntry({ thumbnail: 'https://cdn/t.jpg' } as never)).toBe('https://cdn/t.jpg');
    expect(scThumbFromEntry({ thumbnail: 'http://cdn/t.jpg' } as never)).toBe('');
    expect(scThumbFromEntry({} as never)).toBe('');
  });

  it('uses the first sorted thumbnail when width is missing', () => {
    expect(scThumbFromEntry({ thumbnails: [{ url: 'https://cdn/a.jpg' }] } as never)).toBe(
      'https://cdn/a.jpg'
    );

    expect(
      scThumbFromEntry({
        thumbnails: [
          { url: 'https://cdn/small.jpg', width: undefined },
          { url: 'https://cdn/large.jpg', width: 200 }
        ]
      } as never)
    ).toBe('https://cdn/large.jpg');
  });
});

describe('entryUrl', () => {
  it('prefers webpage_url, then url, then an https id', () => {
    expect(
      entryUrl({
        webpage_url: 'https://sc/a',
        url: 'https://sc/b',
        id: 'https://sc/c'
      } as never)
    ).toBe('https://sc/a');
    expect(entryUrl({ url: 'https://sc/b', id: 'https://sc/c' } as never)).toBe('https://sc/b');
    expect(entryUrl({ id: 'https://sc/c' } as never)).toBe('https://sc/c');
  });

  it('rejects insecure and relative urls', () => {
    expect(entryUrl({ webpage_url: 'http://sc/a', url: '/relative', id: '123' } as never)).toBe('');
  });
});

describe('scVideoFromEntry', () => {
  it('maps a full entry', () => {
    expect(
      scVideoFromEntry({
        id: '1',
        title: 'Track',
        description: 'Desc',
        thumbnail: 'https://cdn/t.jpg',
        channel: 'Channel',
        uploader: 'Uploader',
        uploader_id: 'u1',
        duration: 10,
        view_count: 42,
        webpage_url: 'https://sc/track'
      } as never)
    ).toEqual({
      id: '1',
      title: 'Track',
      description: 'Desc',
      thumbnail: 'https://cdn/t.jpg',
      channelTitle: 'Channel',
      channelId: 'u1',
      duration: '10s',
      viewCount: '42',
      publishedAt: '',
      url: 'https://sc/track'
    });
  });

  it('falls back for missing fields', () => {
    expect(scVideoFromEntry({} as never)).toEqual({
      id: '',
      title: '',
      description: '',
      thumbnail: '',
      channelTitle: '',
      channelId: '',
      duration: undefined,
      viewCount: undefined,
      publishedAt: '',
      url: ''
    });
  });

  it('uses uploader and the entry url when channel fields are missing', () => {
    expect(
      scVideoFromEntry({ title: 'T', uploader: 'Up', webpage_url: 'https://sc/x' } as never)
    ).toMatchObject({ id: 'https://sc/x', channelTitle: 'Up', url: 'https://sc/x' });
  });
});
