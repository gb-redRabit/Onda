import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => void>(),
  on: vi.fn(),
  getMediaElement: vi.fn(),
  seek: vi.fn(),
  play: vi.fn(),
  player: null as any
}));

vi.mock('@renderer/utils/audioEvents', () => ({
  audioEvents: {
    on: (event: string, handler: (...args: any[]) => void) => {
      state.handlers.set(event, handler);
      return () => state.handlers.delete(event);
    }
  }
}));
vi.mock('@renderer/modules/audioEngine', () => ({
  audioEngine: {
    getMediaElement: state.getMediaElement,
    seek: state.seek,
    play: state.play
  }
}));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));

import { wireAudioEvents, type AudioEventRefs } from '../audioPlayerEvents';

function refs(): AudioEventRefs {
  return {
    currentTime: ref(0),
    duration: ref(0),
    isPlaying: ref(false),
    mediaEl: ref(null),
    isReady: ref(false),
    error: ref(null),
    isLoading: ref(false),
    buffered: ref(0)
  };
}

function emit(event: string, ...args: unknown[]) {
  state.handlers.get(event)!(...args);
}

beforeEach(() => {
  state.handlers.clear();
  state.on.mockReset();
  state.getMediaElement.mockReset();
  state.getMediaElement.mockReturnValue({ id: 'media' });
  state.seek.mockReset();
  state.play.mockReset();
  state.player = {
    currentTrack: { type: 'audio', path: 'D:/a.mp3' },
    isPlaying: false,
    repeat: 'off',
    pause: vi.fn(),
    nextTrack: vi.fn()
  };
});

describe('wiring', () => {
  it('registers every audio engine event', () => {
    wireAudioEvents(refs());
    expect([...state.handlers.keys()].sort()).toEqual([
      'bufferChange',
      'durationChange',
      'playStateChange',
      'playable',
      'streamError',
      'timeUpdate',
      'trackEnd',
      'trackError',
      'trackLoaded'
    ]);
  });
});

describe('state updates', () => {
  it('tracks time, duration and buffer', () => {
    const r = refs();
    wireAudioEvents(r);

    emit('timeUpdate', 42);
    expect(r.currentTime.value).toBe(42);

    emit('durationChange', 120);
    expect(r.duration.value).toBe(120);

    emit('durationChange', Infinity);
    expect(r.duration.value).toBe(0);

    emit('durationChange', -1);
    expect(r.duration.value).toBe(0);

    emit('bufferChange', 0.5);
    expect(r.buffered.value).toBe(0.5);
  });

  it('syncs playback state only for audio tracks', () => {
    const r = refs();
    wireAudioEvents(r);

    emit('playStateChange', true);
    expect(r.isPlaying.value).toBe(true);
    expect(state.player.isPlaying).toBe(true);

    state.player.currentTrack = { type: 'video', path: 'v' };
    emit('playStateChange', false);
    expect(r.isPlaying.value).toBe(false);
    expect(state.player.isPlaying).toBe(true);

    state.player.currentTrack = null;
    emit('playStateChange', true);
    expect(r.isPlaying.value).toBe(true);
  });

  it('resets readiness on load and clears loading when playable', () => {
    const r = refs();
    r.error.value = 'old';
    r.buffered.value = 0.4;
    wireAudioEvents(r);

    emit('trackLoaded');
    expect(r.mediaEl.value).toEqual({ id: 'media' });
    expect(r.isReady.value).toBe(true);
    expect(r.error.value).toBeNull();
    expect(r.buffered.value).toBe(0);
    expect(r.isLoading.value).toBe(true);

    emit('playable');
    expect(r.isLoading.value).toBe(false);
  });

  it('reports stream errors', () => {
    const r = refs();
    r.isLoading.value = true;
    wireAudioEvents(r);

    emit('streamError');

    expect(r.isLoading.value).toBe(false);
    expect(r.error.value).toBe('stream-failed');
  });
});

describe('track errors', () => {
  beforeEach(() => {
    vi.spyOn(performance, 'now').mockReturnValue(10_000);
  });

  it('does nothing destructive while paused', () => {
    state.player.isPlaying = false;
    const r = refs();
    wireAudioEvents(r);

    emit('trackError');

    expect(r.error.value).toBe('track-failed');
    expect(state.player.nextTrack).not.toHaveBeenCalled();
    expect(state.player.pause).not.toHaveBeenCalled();
  });

  it('skips to the next track', () => {
    state.player.isPlaying = true;
    state.player.nextTrack.mockReturnValue({ path: 'D:/b.mp3' });
    wireAudioEvents(refs());

    emit('trackError');

    expect(state.player.nextTrack).toHaveBeenCalledTimes(1);
    expect(state.player.pause).not.toHaveBeenCalled();
  });

  it('pauses when there is no next track', () => {
    state.player.isPlaying = true;
    state.player.nextTrack.mockReturnValue(null);
    wireAudioEvents(refs());

    emit('trackError');

    expect(state.player.pause).toHaveBeenCalledTimes(1);
  });

  it('pauses when the next track is the same file', () => {
    state.player.isPlaying = true;
    state.player.nextTrack.mockReturnValue({ path: 'D:/a.mp3' });
    wireAudioEvents(refs());

    emit('trackError');

    expect(state.player.pause).toHaveBeenCalledTimes(1);
  });

  it('throttles repeated failures to a pause', () => {
    state.player.isPlaying = true;
    state.player.nextTrack.mockReturnValue({ path: 'D:/b.mp3' });
    const now = vi.mocked(performance.now);
    wireAudioEvents(refs());

    emit('trackError');
    expect(state.player.nextTrack).toHaveBeenCalledTimes(1);

    now.mockReturnValue(11_000);
    emit('trackError');
    expect(state.player.pause).toHaveBeenCalledTimes(1);
    expect(state.player.nextTrack).toHaveBeenCalledTimes(1);

    now.mockReturnValue(13_500);
    emit('trackError');
    expect(state.player.nextTrack).toHaveBeenCalledTimes(2);
  });
});

describe('track end', () => {
  it('loops audio when repeat-one is set', () => {
    state.player.repeat = 'one';
    wireAudioEvents(refs());

    emit('trackEnd');

    expect(state.seek).toHaveBeenCalledWith(0);
    expect(state.play).toHaveBeenCalledTimes(1);
    expect(state.player.nextTrack).not.toHaveBeenCalled();
  });

  it('advances otherwise', () => {
    state.player.repeat = 'all';
    wireAudioEvents(refs());

    emit('trackEnd');

    expect(state.player.nextTrack).toHaveBeenCalledTimes(1);
    expect(state.seek).not.toHaveBeenCalled();
  });

  it('advances for non-audio tracks even with repeat-one', () => {
    state.player.repeat = 'one';
    state.player.currentTrack = { type: 'video', path: 'v' };
    wireAudioEvents(refs());

    emit('trackEnd');

    expect(state.player.nextTrack).toHaveBeenCalledTimes(1);
  });
});
