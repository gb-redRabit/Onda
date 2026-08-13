import { describe, it, expect } from 'vitest';
import { resolveProvider, youtubeProvider } from '../provider';

describe('resolveProvider', () => {
  it('resolves the YouTube provider for YouTube URLs', () => {
    expect(resolveProvider('https://www.youtube.com/watch?v=abc')?.id).toBe('youtube');
    expect(resolveProvider('https://youtu.be/abc')?.id).toBe('youtube');
  });

  it('returns null for non-YouTube URLs', () => {
    expect(resolveProvider('https://example.com/watch?v=abc')).toBeNull();
    expect(resolveProvider('not a url')).toBeNull();
  });
});

describe('youtubeProvider', () => {
  it('builds a watch URL from a video id', () => {
    expect(youtubeProvider.buildWatchUrl('abc')).toBe('https://www.youtube.com/watch?v=abc');
  });

  it('classifies and normalizes', () => {
    expect(youtubeProvider.kind('https://www.youtube.com/watch?v=LpNVf8sczqU')).toBe('video');
    expect(youtubeProvider.normalizeUrl('LpNVf8sczqU', 'video')).toBe(
      'https://www.youtube.com/watch?v=LpNVf8sczqU'
    );
  });
});
