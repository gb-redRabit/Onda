import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Play statistics are flushed through one debounced batch instead of one IPC
// round-trip per play, so fast skips do not hammer the main process.

const h = vi.hoisted(() => ({
  updateTrackStats: vi.fn(),
  invoke: vi.fn()
}));

vi.mock('../library', () => ({
  useLibraryStore: () => ({ updateTrackStats: h.updateTrackStats })
}));

import { usePlayerStats } from '../player-stats';

interface FakeTrack {
  path: string;
  playCount?: number;
  lastPlayed?: number;
}

function libraryOf(tracks: FakeTrack[]) {
  h.updateTrackStats.mockImplementation((path: string, updater: (track: FakeTrack) => void) => {
    const track = tracks.find((t) => t.path === path);
    if (!track) return undefined;
    updater(track);
    return track;
  });
}

const api = window as unknown as { api: { invoke: typeof h.invoke } };

beforeEach(() => {
  h.updateTrackStats.mockReset();
  h.invoke.mockReset().mockResolvedValue(undefined);
  api.api = { invoke: h.invoke };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePlayerStats', () => {
  it('ignores tracks without a path', () => {
    vi.useFakeTimers();
    const { recordPlay } = usePlayerStats();

    recordPlay({} as never);
    recordPlay(null as never);
    vi.advanceTimersByTime(2000);

    expect(h.updateTrackStats).not.toHaveBeenCalled();
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('increments the library entry and flushes it after a second', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(5000);
    const tracks: FakeTrack[] = [{ path: '/a.mp3' }];
    libraryOf(tracks);
    const { recordPlay } = usePlayerStats();

    recordPlay({ path: '/a.mp3' } as never);

    expect(h.updateTrackStats).toHaveBeenCalledWith('/a.mp3', expect.any(Function));
    expect(tracks[0]).toMatchObject({ playCount: 1, lastPlayed: 5000 });

    await vi.advanceTimersByTimeAsync(999);
    expect(h.invoke).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(h.invoke).toHaveBeenCalledWith('library:updateStats', [
      { path: '/a.mp3', playCount: 1, lastPlayed: 5000 }
    ]);
  });

  it('does not schedule a flush for tracks missing from the library', async () => {
    vi.useFakeTimers();
    libraryOf([]);
    const { recordPlay } = usePlayerStats();

    recordPlay({ path: '/missing.mp3' } as never);
    await vi.advanceTimersByTimeAsync(2000);

    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('batches plays of several tracks into a single call', async () => {
    vi.useFakeTimers();
    const tracks: FakeTrack[] = [{ path: '/a.mp3' }, { path: '/b.mp3' }];
    libraryOf(tracks);
    const { recordPlay } = usePlayerStats();

    recordPlay({ path: '/a.mp3' } as never);
    recordPlay({ path: '/a.mp3' } as never);
    recordPlay({ path: '/b.mp3' } as never);
    await vi.advanceTimersByTimeAsync(1000);

    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(h.invoke.mock.calls[0][1]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '/a.mp3', playCount: 2 }),
        expect.objectContaining({ path: '/b.mp3', playCount: 1 })
      ])
    );
  });

  it('keeps the pending window open when a play arrives mid-debounce', async () => {
    vi.useFakeTimers();
    libraryOf([{ path: '/a.mp3' }, { path: '/b.mp3' }]);
    const { recordPlay } = usePlayerStats();

    recordPlay({ path: '/a.mp3' } as never);
    await vi.advanceTimersByTimeAsync(500);
    recordPlay({ path: '/b.mp3' } as never);

    expect(h.invoke).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(h.invoke.mock.calls[0][1]).toHaveLength(2);
  });

  it('swallows IPC failures because stats are not critical', async () => {
    vi.useFakeTimers();
    h.invoke.mockRejectedValue(new Error('ipc down'));
    libraryOf([{ path: '/a.mp3' }]);
    const { recordPlay } = usePlayerStats();

    recordPlay({ path: '/a.mp3' } as never);
    await vi.advanceTimersByTimeAsync(1000);

    expect(h.invoke).toHaveBeenCalledTimes(1);
  });
});
