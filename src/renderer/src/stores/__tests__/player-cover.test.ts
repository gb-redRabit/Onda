import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePlayerCover } from '../player-cover';
import type { MediaFile } from '@renderer/types/media';

const api = (window as any).api as {
  invoke: ReturnType<typeof vi.fn>;
  getCover: ReturnType<typeof vi.fn>;
  getDuration: ReturnType<typeof vi.fn>;
  mediaServerUrl?: string;
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getCover.mockReset();
  api.mediaServerUrl = 'http://127.0.0.1:59110';
});

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

describe('usePlayerCover hover pipeline', () => {
  it('caches a sibling-video cover returned by getCover IPC', async () => {
    api.getCover.mockResolvedValue({
      type: 'video',
      data: 'D:\\muzyka\\MrMoMMusic\\Swørn - Butterfly.mp4'
    });
    const cover = usePlayerCover();
    const AUDIO = 'D:\\muzyka\\MrMoMMusic\\Swørn - Butterfly.mp3';

    await cover.loadCover(AUDIO);
    await flush();

    expect(api.getCover).toHaveBeenCalledWith(AUDIO);
    const cached = cover.getCover(AUDIO);
    expect(cached.type).toBe('video');
    expect(cached.data).toBe('D:\\muzyka\\MrMoMMusic\\Swørn - Butterfly.mp4');
  });

  it('returns the cached result immediately on subsequent loadCover calls', async () => {
    api.getCover.mockResolvedValue({ type: 'image', data: 'data:image/jpeg;base64,AAAA' });
    const cover = usePlayerCover();
    await cover.loadCover('/a.mp3');
    await flush();

    api.getCover.mockReset();
    await cover.loadCover('/a.mp3');
    expect(api.getCover).not.toHaveBeenCalled();
    expect(cover.getCover('/a.mp3').data).toBe('data:image/jpeg;base64,AAAA');
  });

  it('caches null when getCover returns no cover', async () => {
    api.getCover.mockResolvedValue({ type: null, data: null });
    const cover = usePlayerCover();
    await cover.loadCover('/no-cover.mp3');
    await flush();
    expect(cover.getCover('/no-cover.mp3').type).toBeNull();
  });

  it('enrichTrack for a stream seeds the thumbnail directly', async () => {
    const cover = usePlayerCover();
    const stream: MediaFile = {
      id: 's1',
      name: 'Stream',
      path: 'yt:abc',
      extension: '',
      mimeType: '',
      size: 0,
      type: 'stream',
      addedAt: 0,
      playCount: 0,
      thumbnail: 'https://i.ytimg.com/vi/abc/0.jpg'
    };
    await cover.enrichTrack(stream);
    expect(cover.getCover('yt:abc').type).toBe('image');
    expect(cover.getCover('yt:abc').data).toBe('https://i.ytimg.com/vi/abc/0.jpg');
  });

  it('returns a seeded stream thumbnail without IPC for remote https track paths', async () => {
    const cover = usePlayerCover();
    const stream: MediaFile = {
      id: 's2',
      name: 'Stream',
      path: 'https://rr2---sn.googlevideo.com/videoplayback?expire=1',
      extension: '',
      mimeType: '',
      size: 0,
      type: 'stream',
      addedAt: 0,
      playCount: 0,
      thumbnail: 'https://i.ytimg.com/vi/def/0.jpg'
    };
    await cover.enrichTrack(stream);
    api.getCover.mockReset();
    await cover.loadCover(stream.path);
    expect(api.getCover).not.toHaveBeenCalled();
    expect(cover.getCover(stream.path).data).toBe('https://i.ytimg.com/vi/def/0.jpg');
  });

  it('skips IPC entirely for remote https URLs (streams/radio without thumbnail)', async () => {
    const cover = usePlayerCover();
    const url = 'https://rr2---sn.googlevideo.com/videoplayback?expire=2';
    await cover.loadCover(url);
    await flush();
    expect(api.getCover).not.toHaveBeenCalled();
    expect(cover.getCover(url).type).toBeNull();
  });

  it('invalidateCoverCache clears the entry and reloads', async () => {
    api.getCover.mockResolvedValue({ type: 'image', data: 'data:image/jpeg;base64,AAAA' });
    const cover = usePlayerCover();
    await cover.loadCover('/b.mp3');
    await flush();
    expect(cover.getCover('/b.mp3').data).toBeTruthy();

    api.getCover.mockReset();
    api.getCover.mockResolvedValue({ type: 'image', data: 'data:image/jpeg;base64,BBBB' });
    cover.invalidateCoverCache('/b.mp3');
    await flush();
    expect(cover.getCover('/b.mp3').data).toBe('data:image/jpeg;base64,BBBB');
  });

  it('recovers after a transient getCover IPC failure (no poisoned null)', async () => {
    api.getCover.mockRejectedValueOnce(new Error('ipc down'));
    const cover = usePlayerCover();
    await cover.loadCover('/c.mp3');
    await flush();
    expect(cover.getCover('/c.mp3').type).toBeNull();

    api.getCover.mockResolvedValue({ type: 'video', data: 'D:\\x.mp4' });
    await cover.loadCover('/c.mp3');
    await flush();
    expect(cover.getCover('/c.mp3').type).toBe('video');
    expect(cover.getCover('/c.mp3').data).toBe('D:\\x.mp4');
  });

  it('re-probes a null cover after the retry TTL elapses', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.now());
    try {
      api.getCover.mockResolvedValue({ type: null, data: null });
      const cover = usePlayerCover();

      await cover.loadCover('/d.mp3');
      await vi.advanceTimersByTimeAsync(0);
      expect(cover.getCover('/d.mp3').type).toBeNull();
      expect(api.getCover).toHaveBeenCalledTimes(1);

      // Fresh null is cached — no re-probe while waiting for the hover/scroll
      // reaction from the user.
      await cover.loadCover('/d.mp3');
      await vi.advanceTimersByTimeAsync(0);
      expect(api.getCover).toHaveBeenCalledTimes(1);

      vi.setSystemTime(Date.now() + 31_000);
      await cover.loadCover('/d.mp3');
      await vi.advanceTimersByTimeAsync(0);
      expect(api.getCover).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
