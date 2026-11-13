import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  detectYtKind: vi.fn(),
  normalizeYtUrl: vi.fn((url: string) => `yt:${url}`),
  detectScKind: vi.fn(),
  normalizeScUrl: vi.fn((url: string) => `sc:${url}`)
}));

vi.mock('../youtube', () => ({
  detectYtKind: h.detectYtKind,
  normalizeYtUrl: h.normalizeYtUrl
}));
vi.mock('../soundcloud', () => ({
  detectScKind: h.detectScKind,
  normalizeScUrl: h.normalizeScUrl
}));

import {
  buildSoundcloudProfileUrl,
  buildYouTubeChannelUrl,
  buildYouTubeHandleUrl,
  buildYouTubeWatchUrl,
  resolveProvider,
  soundcloudProvider,
  youtubeProvider
} from '../provider';

beforeEach(() => {
  h.detectYtKind.mockReset().mockReturnValue(null);
  h.detectScKind.mockReset().mockReturnValue(null);
  h.normalizeYtUrl.mockClear();
  h.normalizeScUrl.mockClear();
});

describe('providers', () => {
  it('exposes YouTube capabilities', () => {
    h.detectYtKind.mockReturnValue('video');

    expect(youtubeProvider.id).toBe('youtube');
    expect(youtubeProvider.canResolve('https://youtube.com/watch?v=1')).toBe(true);
    expect(youtubeProvider.kind('url')).toBe('video');
    expect(youtubeProvider.normalizeUrl('url', 'video')).toBe('yt:url');
    expect(youtubeProvider.buildWatchUrl('abc')).toBe('https://www.youtube.com/watch?v=abc');
  });

  it('exposes SoundCloud capabilities', () => {
    h.detectScKind.mockReturnValue('playlist');

    expect(soundcloudProvider.id).toBe('soundcloud');
    expect(soundcloudProvider.canResolve('https://soundcloud.com/x')).toBe(true);
    expect(soundcloudProvider.kind('url')).toBe('playlist');
    expect(soundcloudProvider.normalizeUrl('url', 'playlist')).toBe('sc:url');
    expect(soundcloudProvider.buildWatchUrl('123')).toBe('');
  });

  it('resolves the first matching provider', () => {
    h.detectYtKind.mockReturnValue('video');
    expect(resolveProvider('url')).toBe(youtubeProvider);

    h.detectYtKind.mockReturnValue(null);
    h.detectScKind.mockReturnValue('channel');
    expect(resolveProvider('url')).toBe(soundcloudProvider);

    h.detectScKind.mockReturnValue(null);
    expect(resolveProvider('url')).toBeNull();
  });
});

describe('URL builders', () => {
  it('builds a YouTube watch URL', () => {
    expect(buildYouTubeWatchUrl('abc 123')).toBe('https://www.youtube.com/watch?v=abc 123');
  });

  it('builds channel URLs from ids and handles', () => {
    expect(buildYouTubeChannelUrl('UC123')).toBe('https://www.youtube.com/channel/UC123');
    expect(buildYouTubeChannelUrl('@onda')).toBe('https://www.youtube.com/@onda');
    expect(buildYouTubeChannelUrl('  UC123  ')).toBe('https://www.youtube.com/channel/UC123');
    expect(buildYouTubeChannelUrl('')).toBe('');
    expect(buildYouTubeChannelUrl('   ')).toBe('');
    expect(buildYouTubeChannelUrl('a/b')).toBe('https://www.youtube.com/channel/a%2Fb');
  });

  it('builds handle URLs', () => {
    expect(buildYouTubeHandleUrl('onda')).toBe('https://www.youtube.com/@onda');
    expect(buildYouTubeHandleUrl('@onda')).toBe('https://www.youtube.com/@onda');
    expect(buildYouTubeHandleUrl(' @onda ')).toBe('https://www.youtube.com/@onda');
    expect(buildYouTubeHandleUrl('')).toBe('');
  });

  it('builds SoundCloud profile URLs from slugs and links', () => {
    expect(buildSoundcloudProfileUrl('onda')).toBe('https://soundcloud.com/onda');
    expect(buildSoundcloudProfileUrl('@onda')).toBe('https://soundcloud.com/onda');
    expect(buildSoundcloudProfileUrl('https://soundcloud.com/onda/tracks')).toBe(
      'https://soundcloud.com/onda'
    );
    expect(buildSoundcloudProfileUrl('https://www.soundcloud.com/onda')).toBe(
      'https://soundcloud.com/onda'
    );
    expect(buildSoundcloudProfileUrl('  ')).toBe('');
  });
});
