import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  detectPlatform: vi.fn(),
  scProfile: vi.fn((id: string) => `https://soundcloud.com/${id}`),
  ytChannel: vi.fn((id: string) => `https://youtube.com/channel/${id}`)
}));

vi.mock('@shared/platform', () => ({ detectPlatform: h.detectPlatform }));
vi.mock('@shared/provider', () => ({
  buildSoundcloudProfileUrl: h.scProfile,
  buildYouTubeChannelUrl: h.ytChannel
}));

import { buildChannelUrl, countSkippedBatchLines, isScItem } from '../onlineView';

beforeEach(() => {
  h.detectPlatform.mockReset();
  h.scProfile.mockClear();
  h.ytChannel.mockClear();
});

describe('isScItem', () => {
  it('treats legacy numeric ids without a url as SoundCloud', () => {
    expect(isScItem({ id: '12345' }, '')).toBe(true);
  });

  it('does not treat non-numeric ids without a url as SoundCloud', () => {
    h.detectPlatform.mockReturnValue({ platform: 'youtube' });
    expect(isScItem({ id: 'abc' }, '')).toBe(false);
  });

  it('detects SoundCloud from the url', () => {
    h.detectPlatform.mockReturnValue({ platform: 'soundcloud' });
    expect(isScItem({ id: '1', url: 'https://soundcloud.com/x' }, 'https://soundcloud.com/x')).toBe(
      true
    );
    expect(h.detectPlatform).toHaveBeenCalledWith('https://soundcloud.com/x');
  });

  it('returns false for other platforms or unknown urls', () => {
    h.detectPlatform.mockReturnValue({ platform: 'youtube' });
    expect(isScItem({ id: '1', url: 'https://youtube.com/x' }, 'https://youtube.com/x')).toBe(
      false
    );

    h.detectPlatform.mockReturnValue(null);
    expect(isScItem({ id: '1', url: 'x' }, 'x')).toBe(false);
  });
});

describe('buildChannelUrl', () => {
  it('builds SoundCloud profile urls', () => {
    expect(buildChannelUrl('user', 'soundcloud')).toBe('https://soundcloud.com/user');
    expect(h.scProfile).toHaveBeenCalledWith('user');
  });

  it('defaults to a YouTube channel url', () => {
    expect(buildChannelUrl('UC123')).toBe('https://youtube.com/channel/UC123');
    expect(buildChannelUrl('UC123', 'youtube')).toBe('https://youtube.com/channel/UC123');
  });
});

describe('countSkippedBatchLines', () => {
  it('counts non-empty lines and comma-separated entries', () => {
    expect(countSkippedBatchLines('a\nb, c\n\n d \n', 2)).toBe(2);
  });

  it('never returns a negative count', () => {
    expect(countSkippedBatchLines('a\nb', 5)).toBe(0);
  });

  it('handles empty input', () => {
    expect(countSkippedBatchLines('', 0)).toBe(0);
  });
});
