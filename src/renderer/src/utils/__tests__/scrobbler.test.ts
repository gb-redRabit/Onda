import { describe, expect, it } from 'vitest';
import type { MediaFile } from '@renderer/types/media';
import { scrobbleThreshold, shouldScrobble, toScrobbleTrack } from '../scrobbler';

function track(overrides: Partial<MediaFile> = {}): MediaFile {
  return {
    id: '/music/a.mp3',
    name: 'a.mp3',
    path: '/music/a.mp3',
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    size: 1,
    type: 'audio',
    addedAt: 0,
    playCount: 0,
    metadata: {
      artist: 'Artist',
      title: 'Title',
      album: 'Album',
      track: { no: 2 },
      ...overrides.metadata
    },
    ...overrides
  };
}

describe('scrobbleThreshold', () => {
  it('requires at least 30 seconds', () => {
    expect(scrobbleThreshold(20)).toBe(Number.POSITIVE_INFINITY);
    expect(shouldScrobble(20, 20)).toBe(false);
  });

  it('uses half the track or four minutes, whichever is earlier', () => {
    expect(scrobbleThreshold(100)).toBe(50);
    expect(scrobbleThreshold(600)).toBe(240);
    expect(scrobbleThreshold(80)).toBe(40);
  });

  it('reports when the threshold is reached', () => {
    expect(shouldScrobble(49, 100)).toBe(false);
    expect(shouldScrobble(50, 100)).toBe(true);
    expect(shouldScrobble(240, 600)).toBe(true);
  });
});

describe('toScrobbleTrack', () => {
  it('maps library metadata to the scrobble payload', () => {
    expect(toScrobbleTrack(track(), 123, 1_700_000_000)).toEqual({
      artist: 'Artist',
      title: 'Title',
      album: 'Album',
      durationSec: 123,
      trackNumber: 2,
      startedAt: 1_700_000_000
    });
  });

  it('falls back to albumArtist and the file name', () => {
    const payload = toScrobbleTrack(
      track({
        name: 'fallback.mp3',
        metadata: { albumArtist: 'Album Artist' }
      }),
      0,
      0
    );
    expect(payload).toEqual({ artist: 'Album Artist', title: 'fallback.mp3' });
  });

  it('skips tracks without an artist', () => {
    expect(toScrobbleTrack(track({ metadata: { title: 'Title' } }), 100, 1)).toBeNull();
  });
});
