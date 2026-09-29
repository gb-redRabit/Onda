import { describe, expect, it } from 'vitest';
import { channelPageUrl } from '../onlineHelpers';

describe('channelPageUrl', () => {
  it('builds an internal YouTube channel URL from search-result metadata', () => {
    expect(channelPageUrl({ channelId: 'UCabcdefghijABCDEFGHIJ1234' })).toBe(
      'https://www.youtube.com/channel/UCabcdefghijABCDEFGHIJ1234'
    );
  });

  it('opens a SoundCloud artist profile, not the track page', () => {
    expect(
      channelPageUrl({ channelId: 'artist-name', url: 'https://soundcloud.com/artist-name/song' })
    ).toBe('https://soundcloud.com/artist-name');
  });

  it('does not invent a channel target for unknown providers', () => {
    expect(
      channelPageUrl({ channelId: 'creator-1', url: 'https://vimeo.example/videos/1' })
    ).toBeNull();
  });
});
