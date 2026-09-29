import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaFile } from '@renderer/types/media';

const player = vi.hoisted(() => ({
  clearQueue: vi.fn(),
  addToQueueMultiple: vi.fn(),
  setTrack: vi.fn(),
  play: vi.fn()
}));

vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => player }));

const { playTrackList } = await import('../playTracks');

function track(path: string): MediaFile {
  return {
    id: path,
    name: path,
    path,
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    size: 1,
    type: 'audio',
    addedAt: 0,
    playCount: 0
  };
}

beforeEach(() => {
  player.clearQueue.mockClear();
  player.addToQueueMultiple.mockClear();
  player.setTrack.mockClear();
  player.play.mockClear();
});

describe('playTrackList', () => {
  it('does nothing for an empty list', () => {
    playTrackList([]);

    expect(player.clearQueue).not.toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
  });

  it('plays the first track and queues the rest', () => {
    const tracks = [track('a.mp3'), track('b.mp3'), track('c.mp3')];
    playTrackList(tracks);

    expect(player.clearQueue).toHaveBeenCalledTimes(1);
    expect(player.addToQueueMultiple).toHaveBeenCalledWith(tracks.slice(1));
    expect(player.setTrack).toHaveBeenCalledWith(tracks[0]);
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('does not touch the queue for a single track', () => {
    const single = track('a.mp3');
    playTrackList([single]);

    expect(player.addToQueueMultiple).not.toHaveBeenCalled();
    expect(player.setTrack).toHaveBeenCalledWith(single);
    expect(player.play).toHaveBeenCalledTimes(1);
  });
});
