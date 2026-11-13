import { describe, expect, it } from 'vitest';
import {
  extractClientIdFromBundle,
  extractSignedUrlExpiryMs,
  isPlaylist,
  isSafeImageUrl,
  isTrack,
  isUser,
  mapScTrack,
  sanitizeFileName,
  scPublishedAt,
  upgradeArtworkUrl,
  type ScApiPlaylist,
  type ScApiResource,
  type ScApiTrack
} from '../soundcloud/soundcloud-mappers';

// Czyste mappery SoundCloud: identyfikacja kształtów API, walidacja obrazków
// (https, bez loopbacku), mapowanie utworu i wygaśnięcie podpisanych URL-i CDN.

describe('extractClientIdFromBundle', () => {
  it('finds a client_id assignment in bundle JavaScript', () => {
    expect(extractClientIdFromBundle('var x=1;client_id:"abcdef0123456789",y')).toBe(
      'abcdef0123456789'
    );
    expect(extractClientIdFromBundle('client_id = "0123456789abcdef"')).toBe('0123456789abcdef');
  });

  it('returns null when the id is missing or too short', () => {
    expect(extractClientIdFromBundle('nothing here')).toBeNull();
    expect(extractClientIdFromBundle('client_id:"short"')).toBeNull();
  });
});

describe('resource shape detection', () => {
  const track = { kind: 'track', media: { transcodings: [] } } as ScApiTrack;
  const playlist = { kind: 'playlist', track_count: 3 } as ScApiPlaylist;
  const user = { kind: 'user', username: 'dj' };

  it('uses the kind field when present', () => {
    expect(isTrack(track)).toBe(true);
    expect(isTrack(playlist)).toBe(false);
    expect(isPlaylist(playlist)).toBe(true);
    expect(isPlaylist(track)).toBe(false);
    expect(isUser(user)).toBe(true);
    expect(isUser(track)).toBe(false);
  });

  it('falls back to structural detection without kind', () => {
    expect(isTrack({ media: { transcodings: [] } } as ScApiResource)).toBe(true);
    expect(isTrack({ track_count: 1 } as ScApiResource)).toBe(false);
    expect(isPlaylist({ tracks: [] } as ScApiResource)).toBe(true);
    expect(isPlaylist({} as ScApiResource)).toBe(false);
    expect(isUser({ username: 'a', followers_count: 0 } as ScApiResource)).toBe(true);
    expect(isUser({ username: 'a' } as ScApiResource)).toBe(false);
  });
});

describe('isSafeImageUrl', () => {
  it('accepts only https URLs on public hosts', () => {
    expect(isSafeImageUrl('https://i1.sndcdn.com/art.jpg')).toBe(true);
    expect(isSafeImageUrl('http://i1.sndcdn.com/art.jpg')).toBe(false);
    expect(isSafeImageUrl('https://127.0.0.1/art.jpg')).toBe(false);
    expect(isSafeImageUrl('https://[::1]/art.jpg')).toBe(false);
    expect(isSafeImageUrl('not a url')).toBe(false);
  });
});

describe('upgradeArtworkUrl', () => {
  it('upgrades large artwork to the 500px square variant', () => {
    expect(upgradeArtworkUrl('https://i1.sndcdn.com/art-large.jpg')).toBe(
      'https://i1.sndcdn.com/art-t500x500.jpg'
    );
    expect(upgradeArtworkUrl('https://i1.sndcdn.com/art-large.png')).toBe(
      'https://i1.sndcdn.com/art-t500x500.png'
    );
  });

  it('leaves other sizes and unsafe URLs alone', () => {
    expect(upgradeArtworkUrl('https://i1.sndcdn.com/art-original.jpg')).toBe(
      'https://i1.sndcdn.com/art-original.jpg'
    );
    expect(upgradeArtworkUrl(null)).toBe('');
    expect(upgradeArtworkUrl('https://localhost/art-large.jpg')).toBe('');
  });
});

describe('scPublishedAt', () => {
  it('keeps a valid ISO date', () => {
    expect(scPublishedAt('2024-05-01T12:00:00Z')).toBe('2024-05-01');
  });

  it('rejects missing or malformed dates', () => {
    expect(scPublishedAt(undefined)).toBe('');
    expect(scPublishedAt('yesterday')).toBe('');
    expect(scPublishedAt('2024-5-1')).toBe('');
  });
});

describe('mapScTrack', () => {
  it('maps the API track onto the shared video shape', () => {
    expect(
      mapScTrack({
        id: 42,
        title: 'Song',
        description: 'desc',
        duration: 183_400,
        permalink_url: 'https://soundcloud.com/a/song',
        artwork_url: 'https://i1.sndcdn.com/art-large.jpg',
        user: { username: 'Artist', permalink: 'artist' },
        playback_count: 1234,
        created_at: '2024-05-01T00:00:00Z'
      })
    ).toEqual({
      id: '42',
      title: 'Song',
      description: 'desc',
      thumbnail: 'https://i1.sndcdn.com/art-t500x500.jpg',
      channelTitle: 'Artist',
      channelId: 'artist',
      duration: '3:03',
      viewCount: '1234',
      publishedAt: '2024-05-01',
      url: 'https://soundcloud.com/a/song'
    });
  });

  it('tolerates missing optional fields', () => {
    const mapped = mapScTrack({});

    expect(mapped).toMatchObject({
      id: '',
      title: '',
      description: '',
      thumbnail: '',
      channelTitle: '',
      channelId: '',
      publishedAt: '',
      url: ''
    });
    expect(mapped.duration).toBeUndefined();
    expect(mapped.viewCount).toBeUndefined();
  });
});

describe('sanitizeFileName', () => {
  it('makes a filesystem-safe name with a fallback', () => {
    expect(sanitizeFileName('A/B: C?')).not.toMatch(/[\\/:*?"<>|]/);
    expect(sanitizeFileName('   ')).toBe('track');
  });
});

describe('extractSignedUrlExpiryMs', () => {
  it('reads the AWS epoch from the base64url Policy', () => {
    const policy = Buffer.from(
      JSON.stringify({ Statement: [{ Resource: 'x' }], DateLessThan: { 'AWS:EpochTime': 1700 } })
    ).toString('base64url');

    expect(extractSignedUrlExpiryMs(`https://cdn/x?Policy=${policy}&Signature=s`)).toBe(1_700_000);
  });

  it('returns null without a Policy or epoch', () => {
    expect(extractSignedUrlExpiryMs('https://cdn/x?Signature=s')).toBeNull();
    const noEpoch = Buffer.from('{"Statement":[]}').toString('base64url');
    expect(extractSignedUrlExpiryMs(`https://cdn/x?Policy=${noEpoch}`)).toBeNull();
  });
});
