import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  capture: vi.fn(),
  updateTracks: vi.fn(),
  maxEntries: 2000,
  settingsThrows: false,
  getCover: vi.fn(),
  getCoverStill: vi.fn(),
  getDurations: vi.fn(),
  getDuration: vi.fn()
}));

vi.mock('../library', () => ({
  useLibraryStore: () => ({ updateTracksBatch: h.updateTracks })
}));
vi.mock('../settings', () => ({
  useSettingsStore: () => {
    if (h.settingsThrows) throw new Error('no pinia');
    return { library: { coverCacheMaxEntries: h.maxEntries } };
  }
}));
vi.mock('@renderer/utils/videoFrameCapture', () => ({ captureVideoFrame: h.capture }));

import { usePlayerCover } from '../player-cover';
import type { MediaFile } from '@renderer/types/media';

function track(path: string, overrides: Record<string, unknown> = {}) {
  return {
    id: path,
    name: path,
    path,
    extension: '.mp3',
    mimeType: 'audio/mpeg',
    size: 1,
    addedAt: 0,
    playCount: 0,
    type: 'audio',
    ...overrides
  } as MediaFile;
}

async function settle(rounds = 3): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    for (let j = 0; j < 8; j += 1) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

beforeEach(() => {
  h.capture.mockReset();
  h.capture.mockResolvedValue({ type: 'image', data: 'frame' });
  h.updateTracks.mockReset();
  h.maxEntries = 2000;
  h.settingsThrows = false;
  h.getCover.mockReset();
  h.getCover.mockResolvedValue({ type: 'image', data: 'cover' });
  h.getCoverStill.mockReset();
  h.getCoverStill.mockResolvedValue({ data: 'still' });
  h.getDurations.mockReset();
  h.getDuration.mockReset();
  (window as unknown as { api?: unknown }).api = {
    getCover: h.getCover,
    getCoverStill: h.getCoverStill,
    getDurations: undefined,
    getDuration: h.getDuration
  };
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as { api?: unknown }).api;
});

describe('cover queue', () => {
  it('drops remote URLs without IPC', async () => {
    const cover = usePlayerCover();

    await cover.loadCover('https://cdn.example/a.jpg');
    await settle();

    expect(h.getCover).not.toHaveBeenCalled();
    expect(cover.getCover('https://cdn.example/a.jpg')).toEqual({ type: null, data: null });
  });

  it('processes queued covers in batches and deduplicates paths', async () => {
    const cover = usePlayerCover();

    for (const name of ['a', 'b', 'c', 'd', 'e', 'f']) {
      void cover.loadCover(`/music/${name}.mp3`);
    }
    void cover.loadCover('/music/a.mp3');
    await settle(5);

    expect(h.getCover).toHaveBeenCalledTimes(6);
    expect(cover.getCover('/music/f.mp3')).toEqual({ type: 'image', data: 'cover' });
  });

  it('returns cached covers immediately', async () => {
    const cover = usePlayerCover();
    void cover.loadCover('/music/a.mp3');
    await settle();

    h.getCover.mockClear();
    await expect(cover.loadCover('/music/a.mp3')).resolves.toEqual({
      type: 'image',
      data: 'cover'
    });
    expect(h.getCover).not.toHaveBeenCalled();
  });

  it('falls back to a captured frame when main has no cover', async () => {
    h.getCover.mockResolvedValue({ type: null, data: null });
    const cover = usePlayerCover();

    void cover.loadCover('/music/a.mp3');
    await settle();

    expect(h.capture).toHaveBeenCalledWith('/music/a.mp3');
    expect(cover.getCover('/music/a.mp3')).toEqual({ type: 'image', data: 'frame' });
  });

  it('seals empty covers and re-probes after the TTL', async () => {
    vi.useFakeTimers();
    h.capture.mockResolvedValue({ type: null, data: null });
    h.getCover.mockResolvedValue({ type: null, data: null });
    const cover = usePlayerCover();

    void cover.loadCover('/music/a.mp3');
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.getCover).toHaveBeenCalledTimes(1);

    await cover.loadCover('/music/a.mp3');
    await vi.advanceTimersByTimeAsync(0);
    expect(h.getCover).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(31_000);
    void cover.loadCover('/music/a.mp3');
    await vi.advanceTimersByTimeAsync(0);
    expect(h.getCover).toHaveBeenCalledTimes(2);
  });

  it('drops entries whose IPC call rejects', async () => {
    h.getCover.mockRejectedValue(new Error('ipc'));
    const cover = usePlayerCover();

    void cover.loadCover('/music/a.mp3');
    await settle();

    expect(cover.getCover('/music/a.mp3')).toEqual({ type: null, data: null });
    expect(h.capture).not.toHaveBeenCalled();
  });

  it('evicts least-recently-used covers above the configured limit', async () => {
    h.maxEntries = 2;
    const cover = usePlayerCover();

    for (const name of ['a', 'b', 'c']) {
      void cover.loadCover(`/music/${name}.mp3`);
    }
    await settle(10);

    expect(cover.getCover('/music/a.mp3')).toEqual({ type: null, data: null });
    expect(cover.getCover('/music/b.mp3').data).toBe('cover');
    expect(cover.getCover('/music/c.mp3').data).toBe('cover');
  });

  it('uses the built-in limit when settings are unavailable', async () => {
    h.settingsThrows = true;
    const cover = usePlayerCover();

    void cover.loadCover('/music/a.mp3');
    await settle();

    expect(cover.getCover('/music/a.mp3').data).toBe('cover');
  });
});

describe('still frames', () => {
  it('prefers the persistent still and skips extraction', async () => {
    const cover = usePlayerCover();
    cover.loadCoverStill('/music/a.mp3', '/music/a.mp4');
    await settle();

    expect(cover.getCoverStill('/music/a.mp3')).toEqual({ type: 'image', data: 'still' });
    expect(h.capture).not.toHaveBeenCalled();
  });

  it('falls back to the canvas when main cannot provide a still', async () => {
    (window as unknown as { api?: unknown }).api = {};
    const cover = usePlayerCover();

    cover.loadCoverStill('/music/a.mp3', '/music/a.mp4');
    await settle();

    expect(h.capture).toHaveBeenCalledWith('/music/a.mp4');
    expect(cover.getCoverStill('/music/a.mp3')!.data).toBe('frame');
  });

  it('falls back when the still lookup rejects or times out', async () => {
    vi.useFakeTimers();
    h.getCoverStill.mockRejectedValueOnce(new Error('ffmpeg'));
    const cover = usePlayerCover();

    cover.loadCoverStill('/music/a.mp3', '/music/a.mp4');
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(cover.getCoverStill('/music/a.mp3')!.data).toBe('frame');

    h.getCoverStill.mockReset();
    h.getCoverStill.mockImplementation(() => new Promise(() => undefined));
    cover.loadCoverStill('/music/b.mp3', '/music/b.mp4');
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(cover.getCoverStill('/music/b.mp3')!.data).toBe('frame');
  });

  it('deduplicates scheduled stills and skips cached ones', async () => {
    const cover = usePlayerCover();
    cover.loadCoverStill('/music/a.mp3', '/music/a.mp4');
    cover.loadCoverStill('/music/a.mp3', '/music/a.mp4');
    await settle();
    expect(h.getCoverStill).toHaveBeenCalledTimes(1);

    cover.loadCoverStill('/music/a.mp3', '/music/a.mp4');
    await settle();
    expect(h.getCoverStill).toHaveBeenCalledTimes(1);
  });

  it('retries a still that produced no frame', async () => {
    h.getCoverStill.mockResolvedValue(null);
    h.capture.mockResolvedValue({ type: null, data: null });
    const cover = usePlayerCover();

    cover.loadCoverStill('/music/a.mp3', '/music/a.mp4');
    await settle();
    expect(cover.getCoverStill('/music/a.mp3')).toBeNull();

    h.capture.mockResolvedValue({ type: 'image', data: 'frame' });
    cover.loadCoverStill('/music/a.mp3', '/music/a.mp4');
    await settle();
    expect(cover.getCoverStill('/music/a.mp3')!.data).toBe('frame');
  });

  it('limits still extraction concurrency to two jobs', async () => {
    const resolvers: Array<() => void> = [];
    let active = 0;
    let maxActive = 0;
    h.getCoverStill.mockImplementation(
      () =>
        new Promise((resolve) => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          resolvers.push(() => {
            active -= 1;
            resolve({ data: 'still' });
          });
        })
    );
    const cover = usePlayerCover();

    cover.loadCoverStill('/music/a.mp3', '/music/a.mp4');
    cover.loadCoverStill('/music/b.mp3', '/music/b.mp4');
    cover.loadCoverStill('/music/c.mp3', '/music/c.mp4');
    await Promise.resolve();
    expect(resolvers).toHaveLength(2);

    resolvers.shift()!();
    await settle();
    expect(resolvers).toHaveLength(2);
    expect(maxActive).toBe(2);

    while (resolvers.length) {
      resolvers.shift()!();
      await settle();
    }
    expect(cover.getCoverStill('/music/c.mp3')!.data).toBe('still');
  });

  it('evicts stills when the byte budget is exceeded', async () => {
    const megabyte = { length: 1024 * 1024 };
    h.getCoverStill.mockImplementation(async () => ({ data: megabyte }));
    const cover = usePlayerCover();

    for (let i = 0; i < 49; i += 1) {
      cover.loadCoverStill(`/music/${i}.mp3`, `/music/${i}.mp4`);
    }
    for (let i = 0; i < 60; i += 1) {
      await settle(1);
      if (cover.getCoverStill('/music/48.mp3')) break;
    }

    expect(cover.getCoverStill('/music/0.mp3')).toBeNull();
    expect(cover.getCoverStill('/music/48.mp3')).not.toBeNull();
  });
});

describe('duration batching', () => {
  it('resolves durations in one batched call and updates the library', async () => {
    vi.useFakeTimers();
    h.getDurations.mockResolvedValue({ '/music/a.mp3': 10, '/music/b.mp3': 20 });
    (window as unknown as { api?: unknown }).api = {
      getDurations: h.getDurations,
      getCoverStill: h.getCoverStill
    };
    const cover = usePlayerCover();
    const a = track('/music/a.mp3');
    const b = track('/music/b.mp3');

    const first = cover.enrichTrack(a);
    const second = cover.enrichTrack(b);
    await vi.advanceTimersByTimeAsync(50);
    await Promise.all([first, second]);

    expect(h.getDurations).toHaveBeenCalledTimes(1);
    expect(h.getDurations).toHaveBeenCalledWith(['/music/a.mp3', '/music/b.mp3']);
    expect(a.duration).toBe(10);
    expect(b.duration).toBe(20);
    expect(h.updateTracks).toHaveBeenCalledWith([
      { path: '/music/a.mp3', updater: expect.any(Function) },
      { path: '/music/b.mp3', updater: expect.any(Function) }
    ]);

    const updates = h.updateTracks.mock.calls[0][0] as Array<{
      path: string;
      updater: (track: MediaFile) => void;
    }>;
    const target = track('/music/a.mp3');
    updates[0].updater(target);
    expect(target.duration).toBe(10);
  });

  it('falls back to per-file duration lookups and ignores failures', async () => {
    vi.useFakeTimers();
    h.getDuration.mockImplementation(async (path: string) => {
      if (path.includes('bad')) throw new Error('probe');
      return 0;
    });
    (window as unknown as { api?: unknown }).api = { getDuration: h.getDuration };
    const cover = usePlayerCover();
    const good = track('/music/good.mp3');
    const bad = track('/music/bad.mp3');

    const promise = cover.enrichTrack(good);
    const badPromise = cover.enrichTrack(bad);
    await vi.advanceTimersByTimeAsync(50);
    await Promise.all([promise, badPromise]);

    expect(h.getDuration).toHaveBeenCalledTimes(2);
    expect(h.updateTracks).not.toHaveBeenCalled();
  });

  it('leaves zero durations untouched when the batch lookup fails', async () => {
    vi.useFakeTimers();
    h.getDurations.mockRejectedValue(new Error('offline'));
    (window as unknown as { api?: unknown }).api = { getDurations: h.getDurations };
    const cover = usePlayerCover();
    const trackA = track('/music/a.mp3');

    const promise = cover.enrichTrack(trackA);
    await vi.advanceTimersByTimeAsync(50);
    await promise;

    expect(trackA.duration).toBeUndefined();
    expect(h.updateTracks).not.toHaveBeenCalled();
  });

  it('skips lookups for tracks that already have a duration', async () => {
    const cover = usePlayerCover();
    const known = track('/music/a.mp3', { duration: 99 });

    await cover.enrichTrack(known);

    expect(h.getDurations).not.toHaveBeenCalled();
    expect(h.getDuration).not.toHaveBeenCalled();
  });

  it('seeds stream thumbnails without duration lookups', async () => {
    const cover = usePlayerCover();
    const stream = track('yt:abc', { type: 'stream', thumbnail: 'https://img/abc.jpg' });

    await cover.enrichTrack(stream);
    await cover.enrichTrack(track('yt:def', { type: 'stream' }));

    expect(cover.getCover('yt:abc')).toEqual({
      type: 'image',
      data: 'https://img/abc.jpg'
    });
    expect(h.getDurations).not.toHaveBeenCalled();
  });
});
