import { describe, it, expect } from 'vitest';
import { detectScKind, isSoundcloudUrl, normalizeScUrl } from '../soundcloud';

describe('detectScKind', () => {
  it('classifies track permalinks', () => {
    expect(detectScKind('https://soundcloud.com/artist/song-title')).toBe('video');
    expect(detectScKind('http://soundcloud.com/artist/song')).toBe('video');
  });

  it('classifies sets (playlists)', () => {
    expect(detectScKind('https://soundcloud.com/artist/sets/summer-mix')).toBe('playlist');
    expect(detectScKind('https://soundcloud.com/artist/sets/a/b')).toBe('playlist');
    // Personalized discover sets are recognized as playlists too — the API
    // then rejects them with a clear "unsupported" instead of silent junk.
    expect(detectScKind('https://soundcloud.com/discover/sets/your-moods:267441895:1')).toBe(
      'playlist'
    );
  });

  it('classifies user profiles', () => {
    expect(detectScKind('https://soundcloud.com/some-artist')).toBe('channel');
  });

  it('treats short links as tracks', () => {
    expect(detectScKind('https://on.soundcloud.com/xYz12')).toBe('video');
    expect(detectScKind('https://snd.sc/xYz12')).toBe('video');
  });

  it('rejects reserved site paths', () => {
    for (const path of [
      'discover',
      'search',
      'upload',
      'you',
      'following',
      'terms-of-use',
      'privacy',
      'pages',
      'jobs',
      'charts',
      'settings',
      'login'
    ]) {
      expect(detectScKind(`https://soundcloud.com/${path}`)).toBeNull();
    }
  });

  it('rejects non-SC hosts and junk input', () => {
    expect(detectScKind('https://youtube.com/watch?v=x')).toBeNull();
    expect(detectScKind('https://example.com/artist/song')).toBeNull();
    expect(detectScKind('not a url')).toBeNull();
    expect(detectScKind('')).toBeNull();
    expect(detectScKind('https://soundcloud.com/')).toBeNull();
  });
});

describe('isSoundcloudUrl / normalizeScUrl', () => {
  it('recognizes all SC host forms', () => {
    expect(isSoundcloudUrl('https://soundcloud.com/a/b')).toBe(true);
    expect(isSoundcloudUrl('https://www.soundcloud.com/a/b')).toBe(true);
    expect(isSoundcloudUrl('https://on.soundcloud.com/abc')).toBe(true);
    expect(isSoundcloudUrl('https://snd.sc/abc')).toBe(true);
    expect(isSoundcloudUrl('https://example.com/a/b')).toBe(false);
    expect(isSoundcloudUrl('junk')).toBe(false);
  });

  it('normalizes by passing the URL through', () => {
    const url = 'https://on.soundcloud.com/xYz12 ';
    expect(normalizeScUrl(url)).toBe('https://on.soundcloud.com/xYz12');
  });
});
