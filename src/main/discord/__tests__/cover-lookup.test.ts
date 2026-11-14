import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  normalizeCoverQuery,
  pickCoverUrl,
  resolveCoverUrl,
  upgradeArtworkUrl
} from '../cover-lookup';

const ART_100 = 'https://is1-ssl.mzstatic.com/image/thumb/Music6/v4/38/af/10/cover/100x100bb.jpg';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('normalizeCoverQuery', () => {
  it('rejects incomplete payloads and trims text', () => {
    expect(normalizeCoverQuery(null)).toBeNull();
    expect(normalizeCoverQuery({ title: 'Song' })).toBeNull();
    expect(normalizeCoverQuery({ artist: 'Artist' })).toBeNull();
    expect(normalizeCoverQuery({ artist: '  Artist ', title: ' Song ', album: '' })).toEqual({
      artist: 'Artist',
      title: 'Song'
    });
    expect(normalizeCoverQuery({ artist: 'A', title: 'T', album: ' Album ' })).toEqual({
      artist: 'A',
      title: 'T',
      album: 'Album'
    });
  });
});

describe('upgradeArtworkUrl', () => {
  it('upgrades the iTunes thumbnail and keeps https mzstatic URLs only', () => {
    expect(upgradeArtworkUrl(ART_100)).toBe(ART_100.replace('100x100bb', '600x600bb'));
    expect(upgradeArtworkUrl('https://example.com/cover/100x100bb.jpg')).toBeNull();
    expect(upgradeArtworkUrl(ART_100.replace('https://', 'http://'))).toBeNull();
    expect(upgradeArtworkUrl(42)).toBeNull();
    expect(upgradeArtworkUrl('not a url')).toBeNull();
  });
});

describe('pickCoverUrl', () => {
  const query = { artist: 'Skillet', title: 'Monster' };

  it('prefers an exact title and artist match', () => {
    const url = pickCoverUrl(
      [
        { trackName: 'Monster (Radio Edit)', artistName: 'Other', artworkUrl100: ART_100 },
        { trackName: 'Monster', artistName: 'Skillet', artworkUrl100: ART_100 }
      ],
      query
    );
    expect(url).toBe(ART_100.replace('100x100bb', '600x600bb'));
  });

  it('ignores results that do not match the title', () => {
    expect(
      pickCoverUrl(
        [{ trackName: 'Completely Different', artistName: 'Skillet', artworkUrl100: ART_100 }],
        query
      )
    ).toBeNull();
    expect(pickCoverUrl([], query)).toBeNull();
  });

  it('skips artwork from a host other than mzstatic', () => {
    expect(
      pickCoverUrl(
        [
          {
            trackName: 'Monster',
            artistName: 'Skillet',
            artworkUrl100: 'https://evil.test/a/100x100bb.jpg'
          }
        ],
        query
      )
    ).toBeNull();
  });

  it('handles non-arrays, malformed items and missing fields', () => {
    expect(pickCoverUrl(null, query)).toBeNull();
    expect(
      pickCoverUrl(
        [
          null,
          'x',
          { artworkUrl100: ART_100 },
          { trackName: 'Monster', artistName: 'Other', artworkUrl100: ART_100 }
        ],
        { artist: '', title: 'Monster' }
      )
    ).toBe(ART_100.replace('100x100bb', '600x600bb'));
  });

  it('scores partial title and artist matches', () => {
    expect(
      pickCoverUrl(
        [{ trackName: 'Monster Remix', artistName: 'Skillet Band', artworkUrl100: ART_100 }],
        query
      )
    ).toBe(ART_100.replace('100x100bb', '600x600bb'));
  });

  it('keeps the highest-scoring match', () => {
    const better =
      'https://is1-ssl.mzstatic.com/image/thumb/Music6/v4/aa/bb/cc/better/100x100bb.jpg';
    expect(
      pickCoverUrl(
        [
          { trackName: 'Monster', artistName: 'Skillet', artworkUrl100: better },
          { trackName: 'Monster', artistName: 'Other', artworkUrl100: ART_100 }
        ],
        query
      )
    ).toBe(better.replace('100x100bb', '600x600bb'));
  });
});

describe('resolveCoverUrl', () => {
  it('queries iTunes once per track and caches the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ trackName: 'Monster', artistName: 'Skillet', artworkUrl100: ART_100 }]
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const query = { artist: 'Skillet', title: 'Monster', album: 'Awake' };
    const first = await resolveCoverUrl(query);
    const second = await resolveCoverUrl(query);

    expect(first).toBe(ART_100.replace('100x100bb', '600x600bb'));
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('entity=song');
  });

  it('returns null when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await resolveCoverUrl({ artist: 'Nobody', title: 'Nothing' })).toBeNull();
  });

  it('queries without an album', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ trackName: 'Solo', artistName: 'NoAlbum', artworkUrl100: ART_100 }]
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveCoverUrl({ artist: 'NoAlbum', title: 'Solo' })).resolves.toBe(
      ART_100.replace('100x100bb', '600x600bb')
    );
  });

  it('tolerates a missing artist field', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveCoverUrl({ title: 'No artist' } as never)).resolves.toBeNull();
    expect(String(fetchMock.mock.calls[0][0])).toContain('term=No%20artist');
  });

  it('does not cache failed responses or network errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    await resolveCoverUrl({ artist: 'A', title: 'Http failure' });
    await resolveCoverUrl({ artist: 'A', title: 'Http failure' });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('plain failure'));
    expect(await resolveCoverUrl({ artist: 'B', title: 'Plain failure' })).toBeNull();
  });

  it('aborts a stalled iTunes lookup', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(
        (_url: unknown, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(new Error('aborted')));
          })
      );
      vi.stubGlobal('fetch', fetchMock);

      const pending = resolveCoverUrl({ artist: 'A', title: 'Slow lookup' });
      const expectation = expect(pending).resolves.toBeNull();
      await vi.advanceTimersByTimeAsync(4000);
      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });

  it('evicts the oldest cached cover past the limit', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    for (let i = 0; i < 501; i += 1) {
      await resolveCoverUrl({ artist: 'Evict', title: `track ${i}` });
    }
    expect(fetchMock).toHaveBeenCalledTimes(501);

    await resolveCoverUrl({ artist: 'Evict', title: 'track 0' });
    expect(fetchMock).toHaveBeenCalledTimes(502);
  });
});
