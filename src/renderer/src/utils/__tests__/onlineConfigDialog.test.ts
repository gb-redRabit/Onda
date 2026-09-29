import { describe, expect, it } from 'vitest';
import { configDialogPlatform } from '../onlineConfigDialog';
import type { YouTubeResolvedItem } from '@renderer/types/online';

function target(url: string): { mode: 'single'; video: YouTubeResolvedItem } {
  return {
    mode: 'single',
    video: {
      id: 'item-1',
      title: 'Item',
      thumbnail: '',
      channelTitle: '',
      channelId: '',
      url
    }
  };
}

describe('configDialogPlatform', () => {
  it('distinguishes YouTube, SoundCloud and generic yt-dlp URLs', () => {
    const noResolved = null;
    const itemUrl = (item: YouTubeResolvedItem) => item.url || '';

    expect(
      configDialogPlatform(
        target('https://www.youtube.com/watch?v=abcdefghijk'),
        noResolved,
        itemUrl
      )
    ).toBe('youtube');
    expect(
      configDialogPlatform(target('https://soundcloud.com/artist/song'), noResolved, itemUrl)
    ).toBe('soundcloud');
    expect(configDialogPlatform(target('https://vimeo.com/12345'), noResolved, itemUrl)).toBe(
      'generic'
    );
  });
});
