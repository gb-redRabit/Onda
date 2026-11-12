import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  detectPlatform: vi.fn(),
  buildWatchUrl: vi.fn((id: string) => `https://youtube.com/watch?v=${id}`),
  buildChannelUrl: vi.fn((id: string) => (id ? `https://youtube.com/channel/${id}` : '')),
  buildHandleUrl: vi.fn((handle: string) => `https://youtube.com/${handle}`),
  buildProfileUrl: vi.fn((id: string) => (id ? `https://soundcloud.com/${id}` : ''))
}));

vi.mock('@shared/platform', () => ({ detectPlatform: h.detectPlatform }));
vi.mock('@shared/provider', () => ({
  youtubeProvider: { buildWatchUrl: h.buildWatchUrl },
  buildYouTubeChannelUrl: h.buildChannelUrl,
  buildYouTubeHandleUrl: h.buildHandleUrl,
  buildSoundcloudProfileUrl: h.buildProfileUrl
}));

import {
  buildStreamTrack,
  channelPageUrl,
  isSoundcloudItem,
  parseDurationText,
  resolvedToSavedStream,
  sanitizeFileName,
  savedStreamToItem,
  streamChannelFor,
  streamErrorMessage,
  streamTargetFor
} from '../onlineHelpers';

beforeEach(() => {
  h.detectPlatform.mockReset().mockReturnValue(null);
  h.buildWatchUrl.mockClear();
  h.buildChannelUrl.mockClear();
  h.buildHandleUrl.mockClear();
  h.buildProfileUrl.mockClear();
});

describe('streamTargetFor', () => {
  it('prefers an explicit url, keeps numeric ids and rebuilds watch urls', () => {
    expect(streamTargetFor({ id: 'x', url: 'https://sc/track' })).toBe('https://sc/track');
    expect(streamTargetFor({ id: '123456' })).toBe('123456');
    expect(streamTargetFor({ id: 'abc' })).toBe('https://youtube.com/watch?v=abc');
  });
});

describe('isSoundcloudItem', () => {
  it('treats bare numeric ids and SoundCloud urls as SoundCloud', () => {
    expect(isSoundcloudItem({ id: '42' })).toBe(true);

    h.detectPlatform.mockReturnValue({ platform: 'soundcloud' });
    expect(isSoundcloudItem({ id: 'abc' })).toBe(true);

    h.detectPlatform.mockReturnValue({ platform: 'youtube' });
    expect(isSoundcloudItem({ id: 'abc' })).toBe(false);
  });
});

describe('channelPageUrl', () => {
  it('builds a SoundCloud profile from a SoundCloud url', () => {
    h.detectPlatform.mockReturnValue({ platform: 'soundcloud' });

    expect(channelPageUrl({ channelId: 'artist', url: 'https://soundcloud.com/x' })).toBe(
      'https://soundcloud.com/artist'
    );

    h.buildProfileUrl.mockReturnValueOnce('');
    expect(channelPageUrl({ url: 'https://soundcloud.com/x' })).toBeNull();
  });

  it('builds YouTube handle and channel urls', () => {
    h.detectPlatform.mockReturnValue({ platform: 'youtube' });

    expect(channelPageUrl({ channelId: '@handle', url: 'https://youtube.com/@handle' })).toBe(
      'https://youtube.com/@handle'
    );
    expect(channelPageUrl({ channelId: 'UC123', url: 'https://youtube.com/x' })).toBe(
      'https://youtube.com/channel/UC123'
    );

    h.buildChannelUrl.mockReturnValueOnce('');
    expect(channelPageUrl({ channelId: 'UC123', url: 'https://youtube.com/x' })).toBeNull();
  });

  it('accepts a UC channel id without a url', () => {
    expect(channelPageUrl({ channelId: `UC${'a'.repeat(22)}` })).toBe(
      `https://youtube.com/channel/UC${'a'.repeat(22)}`
    );
  });

  it('returns null for unrelated pages and empty input', () => {
    expect(channelPageUrl({})).toBeNull();
    expect(channelPageUrl({ channelId: 'UC1' })).toBeNull();
    h.detectPlatform.mockReturnValue({ platform: 'soundcloud' });
    expect(channelPageUrl({ channelId: '  ', url: 'https://soundcloud.com/x' })).toBeNull();
  });
});

describe('streamChannelFor', () => {
  it('routes numeric and SoundCloud targets to sc', () => {
    expect(streamChannelFor('123')).toBe('sc:stream:get');

    h.detectPlatform.mockReturnValue({ platform: 'soundcloud' });
    expect(streamChannelFor('https://soundcloud.com/x')).toBe('sc:stream:get');

    h.detectPlatform.mockReturnValue({ platform: 'youtube' });
    expect(streamChannelFor('https://youtube.com/x')).toBe('yt:stream:get');
  });
});

describe('parseDurationText', () => {
  it('parses hh:mm:ss and mm:ss', () => {
    expect(parseDurationText(undefined)).toBeUndefined();
    expect(parseDurationText('')).toBeUndefined();
    expect(parseDurationText('1:02')).toBe(62);
    expect(parseDurationText('1:02:03')).toBe(3723);
    expect(parseDurationText('bad:1')).toBeUndefined();
  });
});

describe('streamErrorMessage', () => {
  const t = (key: string) => key;

  it('maps known error codes and falls back to network', () => {
    expect(streamErrorMessage(t, 'hls')).toBe('youtube.streamErrorHls');
    expect(streamErrorMessage(t, 'auth-required')).toBe('youtube.streamErrorAuth');
    expect(streamErrorMessage(t, 'bot-block')).toBe('youtube.streamErrorBot');
    expect(streamErrorMessage(t, 'invalid')).toBe('youtube.streamErrorInvalid');
    expect(streamErrorMessage(t, 'dependency')).toBe('youtube.streamErrorDependency');
    expect(streamErrorMessage(t, 'not-found')).toBe('youtube.streamErrorNotFound');
    expect(streamErrorMessage(t, 'something-else')).toBe('youtube.streamErrorNetwork');
  });
});

describe('buildStreamTrack', () => {
  it('marks SoundCloud tracks as MP3 and parses the duration', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);

    const track = buildStreamTrack(
      { id: '55', title: 'Song', duration: '2:30', thumbnail: 'thumb' },
      '/stream/55',
      3
    );

    expect(track).toMatchObject({
      id: 'sc:55',
      name: 'Song',
      path: '/stream/55',
      extension: '',
      mimeType: 'audio/mpeg',
      type: 'stream',
      duration: 150,
      thumbnail: 'thumb',
      addedAt: 1003
    });
    now.mockRestore();
  });

  it('marks YouTube tracks as MP4 and tolerates a missing duration', () => {
    const track = buildStreamTrack({ id: 'yt1', title: 'Video' }, '/stream/yt1', 0);

    expect(track.id).toBe('yt:yt1');
    expect(track.mimeType).toBe('audio/mp4');
    expect(track.duration).toBeUndefined();
  });
});

describe('saved streams', () => {
  it('adds a saved timestamp and normalizes missing fields', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(5000);

    const saved = resolvedToSavedStream({
      id: 'a',
      title: 'A',
      thumbnail: 't',
      channelTitle: 'C',
      channelId: 'id'
    });

    expect(saved.savedAt).toBe(5000);

    expect(savedStreamToItem({ id: 'a', title: 'A', savedAt: 1 } as never)).toEqual({
      id: 'a',
      title: 'A',
      thumbnail: '',
      channelTitle: '',
      channelId: '',
      duration: undefined,
      isPlayable: true
    });

    expect(
      savedStreamToItem({ id: 'b', title: 'B', dep: [], savedAt: 1, url: 'u' } as never)
    ).toMatchObject({
      url: 'u'
    });
    now.mockRestore();
  });

  it('exposes the shared filename sanitizer', () => {
    expect(typeof sanitizeFileName).toBe('function');
    expect(sanitizeFileName('a/b:c')).not.toContain('/');
  });
});
