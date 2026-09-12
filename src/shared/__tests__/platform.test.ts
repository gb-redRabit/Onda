import { describe, it, expect } from 'vitest';
import { detectPlatform, normalizePlatformUrl, parseBatchInputAll } from '../platform';
import { resolveProvider, soundcloudProvider } from '../provider';

describe('detectPlatform', () => {
  it('routes YouTube links', () => {
    expect(detectPlatform('https://www.youtube.com/watch?v=LpNVf8sczqU')).toEqual({
      platform: 'youtube',
      kind: 'video'
    });
    expect(detectPlatform('https://youtu.be/LpNVf8sczqU')).toEqual({
      platform: 'youtube',
      kind: 'video'
    });
    expect(detectPlatform('@somechannel')).toEqual({ platform: 'youtube', kind: 'channel' });
  });

  it('routes SoundCloud links', () => {
    expect(detectPlatform('https://soundcloud.com/artist/song')).toEqual({
      platform: 'soundcloud',
      kind: 'video'
    });
    expect(detectPlatform('https://soundcloud.com/artist/sets/mix')).toEqual({
      platform: 'soundcloud',
      kind: 'playlist'
    });
    expect(detectPlatform('https://soundcloud.com/artist')).toEqual({
      platform: 'soundcloud',
      kind: 'channel'
    });
    expect(detectPlatform('https://on.soundcloud.com/xY1')).toEqual({
      platform: 'soundcloud',
      kind: 'video'
    });
  });

  it('returns null for unknown input', () => {
    expect(detectPlatform('hello world')).toBeNull();
    expect(detectPlatform('https://example.com/a')).toBeNull();
    // A bare YT-like id is still a YouTube video.
    expect(detectPlatform('LpNVf8sczqU')).toEqual({ platform: 'youtube', kind: 'video' });
  });
});

describe('normalizePlatformUrl', () => {
  it('expands bare YouTube ids and passes SC permalinks through', () => {
    const yt = detectPlatform('LpNVf8sczqU')!;
    expect(normalizePlatformUrl('LpNVf8sczqU', yt)).toBe(
      'https://www.youtube.com/watch?v=LpNVf8sczqU'
    );
    const sc = detectPlatform('https://soundcloud.com/a/b')!;
    expect(normalizePlatformUrl('https://soundcloud.com/a/b', sc)).toBe(
      'https://soundcloud.com/a/b'
    );
  });
});

describe('parseBatchInputAll', () => {
  it('accepts links of both platforms and tags them', () => {
    const entries = parseBatchInputAll(
      'https://www.youtube.com/watch?v=LpNVf8sczqU\nhttps://soundcloud.com/a/b, https://on.soundcloud.com/x1'
    );
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({ platform: 'youtube', kind: 'video' });
    expect(entries[1]).toMatchObject({ platform: 'soundcloud', kind: 'video' });
    expect(entries[2]).toMatchObject({ platform: 'soundcloud', kind: 'video' });
  });

  it('skips channels and duplicates (by video id / permalink)', () => {
    const entries = parseBatchInputAll(
      [
        'https://www.youtube.com/watch?v=abc12345678',
        'https://youtu.be/abc12345678',
        'https://youtube.com/watch?v=abc12345678&t=30',
        'https://soundcloud.com/artist',
        'https://soundcloud.com/a/b',
        'https://soundcloud.com/a/b/'
      ].join('\n')
    );
    // 1 unique YT video + 1 unique SC track; channel skipped.
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.platform).sort()).toEqual(['soundcloud', 'youtube']);
  });

  it('ignores junk lines', () => {
    expect(parseBatchInputAll('hello\n\nhttps://example.com/a')).toEqual([]);
  });
});

describe('provider registry with SoundCloud', () => {
  it('resolves the SC provider for SC links only', () => {
    expect(resolveProvider('https://soundcloud.com/artist/song')?.id).toBe('soundcloud');
    expect(resolveProvider('https://youtube.com/watch?v=x')?.id).toBe('youtube');
    expect(resolveProvider('https://example.com/x')).toBeNull();
  });

  it('cannot build an SC URL from the numeric id alone', () => {
    expect(soundcloudProvider.buildWatchUrl('12345')).toBe('');
    expect(soundcloudProvider.kind('https://snd.sc/x')).toBe('video');
  });
});
