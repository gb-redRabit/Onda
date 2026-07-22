import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { usePlayerStore } from '../player';
import type { MediaFile } from '@renderer/types/media';

function makeTrack(id: string): MediaFile {
  return {
    id,
    name: `Track ${id}`,
    path: `/music/${id}.mp3`,
    extension: '.mp3',
    mimeType: 'audio/mpeg',
    size: 1000,
    addedAt: Date.now(),
    playCount: 0,
    type: 'audio'
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('setTrack', () => {
  it('sets the current track and starts playing', () => {
    const store = usePlayerStore();
    const t = makeTrack('1');
    store.setTrack(t);
    expect(store.currentTrack?.id).toBe('1');
    expect(store.currentTime).toBe(0);
    expect(store.isPlaying).toBe(true);
  });

  it('pushes previous track to history', () => {
    const store = usePlayerStore();
    const t1 = makeTrack('1');
    const t2 = makeTrack('2');
    store.setTrack(t1);
    store.setTrack(t2);
    expect(store.history.map((h) => h.id)).toContain('1');
    expect(store.currentTrack?.id).toBe('2');
  });

  it('limits history to 100 entries', () => {
    const store = usePlayerStore();
    for (let i = 0; i < 101; i++) {
      store.setTrack(makeTrack(String(i)));
    }
    expect(store.history.length).toBeLessThanOrEqual(100);
  });
});

describe('play/pause/toggle', () => {
  it('play sets isPlaying true', () => {
    const store = usePlayerStore();
    store.isPlaying = false;
    store.play();
    expect(store.isPlaying).toBe(true);
  });

  it('pause sets isPlaying false', () => {
    const store = usePlayerStore();
    store.isPlaying = true;
    store.pause();
    expect(store.isPlaying).toBe(false);
  });

  it('togglePlay flips isPlaying', () => {
    const store = usePlayerStore();
    store.isPlaying = false;
    store.togglePlay();
    expect(store.isPlaying).toBe(true);
    store.togglePlay();
    expect(store.isPlaying).toBe(false);
  });
});

describe('seek / volume / mute', () => {
  it('seek sets currentTime', () => {
    const store = usePlayerStore();
    store.seek(42);
    expect(store.currentTime).toBe(42);
  });

  it('setVolume clamps between 0 and 1', () => {
    const store = usePlayerStore();
    store.setVolume(1.5);
    expect(store.volume).toBe(1);
    store.setVolume(-1);
    expect(store.volume).toBe(0);
    store.setVolume(0.5);
    expect(store.volume).toBe(0.5);
  });

  it('toggleMute flips isMuted', () => {
    const store = usePlayerStore();
    store.isMuted = false;
    store.toggleMute();
    expect(store.isMuted).toBe(true);
    store.toggleMute();
    expect(store.isMuted).toBe(false);
  });
});

describe('shuffle', () => {
  it('toggleShuffle flips shuffle', () => {
    const store = usePlayerStore();
    expect(store.shuffle).toBe(false);
    store.toggleShuffle();
    expect(store.shuffle).toBe(true);
    store.toggleShuffle();
    expect(store.shuffle).toBe(false);
  });
});

describe('repeat', () => {
  it('cycleRepeat cycles none -> all -> one -> none', () => {
    const store = usePlayerStore();
    expect(store.repeat).toBe('none');
    store.cycleRepeat();
    expect(store.repeat).toBe('all');
    store.cycleRepeat();
    expect(store.repeat).toBe('one');
    store.cycleRepeat();
    expect(store.repeat).toBe('none');
  });
});

describe('queue management', () => {
  it('addToQueue adds a track', () => {
    const store = usePlayerStore();
    store.addToQueue(makeTrack('1'));
    expect(store.queue).toHaveLength(1);
    expect(store.queue[0]!.id).toBe('1');
  });

  it('addToQueueMultiple adds multiple tracks', () => {
    const store = usePlayerStore();
    store.addToQueueMultiple([makeTrack('1'), makeTrack('2')]);
    expect(store.queue).toHaveLength(2);
  });

  it('removeFromQueue removes by index', () => {
    const store = usePlayerStore();
    store.addToQueue(makeTrack('1'));
    store.addToQueue(makeTrack('2'));
    store.removeFromQueue(0);
    expect(store.queue).toHaveLength(1);
    expect(store.queue[0]!.id).toBe('2');
  });

  it('clearQueue empties queue and pendingQueue', () => {
    const store = usePlayerStore();
    store.addToQueue(makeTrack('1'));
    store.pendingQueue.push(makeTrack('p1'));
    store.clearQueue();
    expect(store.queue).toHaveLength(0);
    expect(store.pendingQueue).toHaveLength(0);
  });

  it('flushPendingQueue enriches pending items (does not move them)', () => {
    const store = usePlayerStore();
    const p = makeTrack('p1');
    store.pendingQueue.push(p);
    store.flushPendingQueue();
    expect(store.pendingQueue).toHaveLength(1);
  });

  it('queueLength counts both queue and pendingQueue', () => {
    const store = usePlayerStore();
    store.addToQueue(makeTrack('1'));
    store.pendingQueue.push(makeTrack('p1'));
    expect(store.queueLength).toBe(2);
  });

  it('displayQueue shows pending first then queue', () => {
    const store = usePlayerStore();
    const p1 = makeTrack('p1');
    const q1 = makeTrack('q1');
    store.pendingQueue.push(p1);
    store.addToQueue(q1);
    expect(store.displayQueue.map((t) => t.id)).toEqual(['p1', 'q1']);
  });

  it('insertInQueue inserts at index', () => {
    const store = usePlayerStore();
    store.addToQueue(makeTrack('1'));
    store.addToQueue(makeTrack('3'));
    store.insertInQueue(1, makeTrack('2'));
    expect(store.queue.map((t) => t.id)).toEqual(['1', '2', '3']);
  });

  it('reorderQueue moves item from source to target', () => {
    const store = usePlayerStore();
    store.addToQueue(makeTrack('1'));
    store.addToQueue(makeTrack('2'));
    store.addToQueue(makeTrack('3'));
    store.reorderQueue(0, 2);
    expect(store.queue.map((t) => t.id)).toEqual(['2', '1', '3']);
  });

  it('removeFromQueue handles pendingQueue items', () => {
    const store = usePlayerStore();
    store.pendingQueue.push(makeTrack('p1'));
    store.addToQueue(makeTrack('q1'));
    store.removeFromQueue(0);
    expect(store.pendingQueue).toHaveLength(0);
    expect(store.queue).toHaveLength(1);
  });

  it('toggleQueue flips queueVisible', () => {
    const store = usePlayerStore();
    store.toggleQueue();
    expect(store.queueVisible).toBe(true);
    store.toggleQueue();
    expect(store.queueVisible).toBe(false);
  });

  it('toggleEqualizer flips equalizerVisible', () => {
    const store = usePlayerStore();
    store.toggleEqualizer();
    expect(store.equalizerVisible).toBe(true);
    store.toggleEqualizer();
    expect(store.equalizerVisible).toBe(false);
  });
});

describe('nextTrack', () => {
  it('returns null when queue is empty and no history', () => {
    const store = usePlayerStore();
    expect(store.nextTrack()).toBeNull();
  });

  it('takes from pendingQueue first', () => {
    const store = usePlayerStore();
    const p1 = makeTrack('p1');
    store.pendingQueue.push(p1);
    const next = store.nextTrack();
    expect(next?.id).toBe('p1');
    expect(store.pendingQueue).toHaveLength(0);
  });

  it('takes from queue when pendingQueue is empty', () => {
    const store = usePlayerStore();
    store.addToQueue(makeTrack('q1'));
    const next = store.nextTrack();
    expect(next?.id).toBe('q1');
    expect(store.queue).toHaveLength(0);
  });

  it('returns current track if repeat one', () => {
    const store = usePlayerStore();
    const t = makeTrack('1');
    store.setTrack(t);
    store.repeat = 'one';
    store.currentTime = 10;
    const next = store.nextTrack();
    expect(next?.id).toBe('1');
    expect(store.currentTime).toBe(0);
  });

  it('repeats from history when repeat all and queue empty', () => {
    const store = usePlayerStore();
    const t1 = makeTrack('1');
    const t2 = makeTrack('2');
    store.setTrack(t1);
    store.setTrack(t2);
    store.repeat = 'all';
    const next = store.nextTrack();
    expect(next?.id).toBe('1');
  });
});

describe('prevTrack', () => {
  it('returns null when history is empty', () => {
    const store = usePlayerStore();
    expect(store.prevTrack()).toBeNull();
  });

  it('returns last played track from history', () => {
    const store = usePlayerStore();
    const t1 = makeTrack('1');
    const t2 = makeTrack('2');
    store.setTrack(t1);
    store.setTrack(t2);
    const prev = store.prevTrack();
    expect(prev?.id).toBe('1');
  });
});

describe('playFromHistory', () => {
  it('pulls specific track from history and sets as current', () => {
    const store = usePlayerStore();
    const t1 = makeTrack('1');
    const t2 = makeTrack('2');
    const t3 = makeTrack('3');
    store.setTrack(t1);
    store.setTrack(t2);
    store.setTrack(t3);
    store.playFromHistory(1);
    expect(store.currentTrack?.id).toBe('1');
    expect(store.isPlaying).toBe(true);
  });
});

describe('favorites', () => {
  it('isFavorite returns true if path is in favorites', () => {
    const store = usePlayerStore();
    store.favorites = ['/path/to/song.mp3'];
    expect(store.isFavorite('/path/to/song.mp3')).toBe(true);
    expect(store.isFavorite('/other.mp3')).toBe(false);
  });

  it('toggleFavorite adds and removes paths', () => {
    const store = usePlayerStore();
    const path = '/music/test.mp3';
    store.toggleFavorite(path);
    expect(store.favorites).toContain(path);
    store.toggleFavorite(path);
    expect(store.favorites).not.toContain(path);
  });

  it('loadFavorites reads from settings:get', async () => {
    const store = usePlayerStore();
    const invokeMock = (window as any).api.invoke as ReturnType<typeof vi.fn>;
    invokeMock.mockResolvedValue({ favorites: ['/a.mp3', '/b.mp3'] });
    await store.loadFavorites();
    expect(store.favorites).toEqual(['/a.mp3', '/b.mp3']);
  });

  it('toggleFavorite persists via saveFavorites (invokes settings:set)', () => {
    const store = usePlayerStore();
    store.toggleFavorite('/x.mp3');
    expect((window as any).api.invoke).toHaveBeenCalledWith('settings:set', { favorites: ['/x.mp3'] });
  });
});

describe('subtitles', () => {
  it('clearSubtitles resets subtitleTracks and activeSubtitleId', () => {
    const store = usePlayerStore();
    store.subtitleTracks = [{ id: '1', label: 'Test', language: 'pl', format: 'srt', source: 'external', filePath: '/test.srt', content: '' }];
    store.activeSubtitleId = '1';
    store.clearSubtitles();
    expect(store.subtitleTracks).toHaveLength(0);
    expect(store.activeSubtitleId).toBeNull();
  });

  it('setActiveSubtitle sets the active subtitle id', () => {
    const store = usePlayerStore();
    store.setActiveSubtitle('ext-1');
    expect(store.activeSubtitleId).toBe('ext-1');
    store.setActiveSubtitle(null);
    expect(store.activeSubtitleId).toBeNull();
  });

  it('loadSubtitles fetches external and embedded subtitles', async () => {
    const store = usePlayerStore();
    const api = (window as any).api;
    api.findExternalSubtitles.mockResolvedValue([{ path: '/sub.srt', name: 'sub.srt', format: 'srt' }]);
    api.readSubtitleFile.mockResolvedValue('1\n00:00:01,000 --> 00:00:02,000\nHello');
    api.listEmbeddedSubtitles.mockResolvedValue([{ index: 0, language: 'eng', title: 'English' }]);

    await store.loadSubtitles('/video/test.mp4');

    expect(store.subtitleTracks.length).toBeGreaterThanOrEqual(2);
    expect(store.subtitleTracks.some((s) => s.source === 'external')).toBe(true);
    expect(store.subtitleTracks.some((s) => s.source === 'embedded')).toBe(true);
  });
});

describe('resume prompt', () => {
  it('showResumePrompt sets resumePrompt', () => {
    const store = usePlayerStore();
    store.showResumePrompt('/path', 42);
    expect(store.resumePrompt).toEqual({ path: '/path', position: 42 });
  });

  it('clearResumePrompt clears resumePrompt', () => {
    const store = usePlayerStore();
    store.showResumePrompt('/path', 42);
    store.clearResumePrompt();
    expect(store.resumePrompt).toBeNull();
  });
});

describe('cover cache', () => {
  it('getCover returns null result for uncached path', () => {
    const store = usePlayerStore();
    expect(store.getCover('/unknown.mp3')).toEqual({ type: null, data: null });
  });

  it('invalidateCoverCache removes cached entry after loadCover', () => {
    const store = usePlayerStore();
    store.loadCover('/test.mp3');
    store.invalidateCoverCache('/test.mp3');
    expect(store.getCover('/test.mp3')).toEqual({ type: null, data: null });
  });
});
