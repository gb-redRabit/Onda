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
  });
});

describe('upgradeArtworkUrl', () => {
  it('upgrades the iTunes thumbnail and keeps https mzstatic URLs only', () => {
    expect(upgradeArtworkUrl(ART_100)).toBe(ART_100.replace('100x100bb', '600x600bb'));
    expect(upgradeArtworkUrl('https://example.com/cover/100x100bb.jpg')).toBeNull();
    expect(upgradeArtworkUrl(ART_100.replace('https://', 'http://'))).toBeNull();
    expect(upgradeArtworkUrl(42)).toBeNull();
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
});
