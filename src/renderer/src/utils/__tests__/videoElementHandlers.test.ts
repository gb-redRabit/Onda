import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachVideoTranscodeFallback, connectVideoEvents } from '../videoElementHandlers';

const state = vi.hoisted(() => ({
  audioEngine: {
    hasSecondaryAudio: false,
    seekSecondaryAudio: vi.fn()
  },
  audioCurrentTime: null as any,
  audioDuration: null as any,
  audioIsPlaying: null as any,
  audioBuffered: null as any,
  core: true,
  setPlaybackPosition: vi.fn(),
  clearPlaybackPosition: vi.fn(),
  transcodeVideo: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  t: vi.fn((key: string) => key)
}));

vi.mock('@renderer/modules/audioEngine', () => ({ audioEngine: state.audioEngine }));
vi.mock('@renderer/composables/useAudioPlayer', async () => {
  const { ref } = await import('vue');
  state.audioCurrentTime = ref(0);
  state.audioDuration = ref(0);
  state.audioIsPlaying = ref(false);
  state.audioBuffered = ref(0);
  return {
    currentTime: state.audioCurrentTime,
    duration: state.audioDuration,
    isPlaying: state.audioIsPlaying,
    buffered: state.audioBuffered
  };
});
vi.mock('@renderer/utils/runtimeMode', () => ({ isCoreShell: () => state.core }));
vi.mock('@shared/logger', () => ({
  logger: { warn: state.warn, info: state.info, error: state.error }
}));
vi.mock('@renderer/utils/mediaUrl', () => ({
  toMediaServerUrl: (path: string) => `media://${path}`
}));
vi.mock('@renderer/i18n', () => ({
  i18n: { global: { t: state.t } }
}));

function track(id: string, type = 'video') {
  return { id, path: `C:/media/${id}.mp4`, name: `${id}.mp4`, type } as any;
}

function player(overrides: Record<string, unknown> = {}) {
  return {
    currentTime: 0,
    duration: 0,
    currentTrack: track('a'),
    isPlaying: false,
    pipActive: false,
    repeat: 'off',
    nextTrack: vi.fn(),
    ...overrides
  } as any;
}

function video() {
  const el = document.createElement('video') as any;
  el.play = vi.fn().mockResolvedValue(undefined);
  el.pause = vi.fn();
  el.load = vi.fn();
  Object.defineProperty(el, 'duration', { configurable: true, value: 100 });
  Object.defineProperty(el, 'paused', { configurable: true, value: true });
  Object.defineProperty(el, 'buffered', {
    configurable: true,
    value: { length: 1, end: () => 50 }
  });
  Object.defineProperty(el, 'currentTime', { configurable: true, writable: true, value: 0 });
  return el as HTMLVideoElement & { play: any; pause: any; load: any };
}

function event(name: string, init?: EventInit) {
  return new Event(name, init);
}

beforeEach(() => {
  state.audioEngine.hasSecondaryAudio = false;
  state.audioEngine.seekSecondaryAudio.mockReset();
  state.audioCurrentTime.value = 0;
  state.audioDuration.value = 0;
  state.audioIsPlaying.value = false;
  state.audioBuffered.value = 0;
  state.core = true;
  state.setPlaybackPosition.mockReset();
  state.clearPlaybackPosition.mockReset();
  state.transcodeVideo.mockReset();
  state.transcodeVideo.mockResolvedValue('C:/media/out.mp4');
  state.warn.mockReset();
  state.t.mockClear();
  (window as { api?: unknown }).api = {
    setPlaybackPosition: state.setPlaybackPosition,
    clearPlaybackPosition: state.clearPlaybackPosition,
    transcodeVideo: state.transcodeVideo
  };
  vi.stubGlobal('MediaError', {
    MEDIA_ERR_SRC_NOT_SUPPORTED: 4,
    MEDIA_ERR_DECODE: 3
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as { api?: unknown }).api;
});

async function load() {
  return { connectVideoEvents, attachVideoTranscodeFallback };
}

describe('connectVideoEvents', () => {
  it('updates the player and audio refs on timeupdate', async () => {
    const { connectVideoEvents } = await load();
    const el = video();
    const p = player();
    connectVideoEvents(el, p);

    el.currentTime = 12;
    Object.defineProperty(el, 'paused', { configurable: true, value: false });
    el.dispatchEvent(event('timeupdate'));

    expect(p.currentTime).toBe(12);
    expect(state.audioCurrentTime.value).toBe(12);
    expect(state.audioDuration.value).toBe(100);
    expect(state.audioIsPlaying.value).toBe(true);
    expect(state.audioBuffered.value).toBe(0.5);
    expect(state.setPlaybackPosition).toHaveBeenCalledWith('C:/media/a.mp4', 12);
  });

  it('saves positions only after three seconds of progress', async () => {
    const { connectVideoEvents } = await load();
    const el = video();
    const p = player();
    connectVideoEvents(el, p);

    el.currentTime = 2;
    el.dispatchEvent(event('timeupdate'));
    expect(state.setPlaybackPosition).not.toHaveBeenCalled();

    el.currentTime = 5;
    el.dispatchEvent(event('timeupdate'));
    expect(state.setPlaybackPosition).toHaveBeenCalledTimes(1);

    el.currentTime = 7;
    el.dispatchEvent(event('timeupdate'));
    expect(state.setPlaybackPosition).toHaveBeenCalledTimes(1);

    el.currentTime = 9;
    el.dispatchEvent(event('timeupdate'));
    expect(state.setPlaybackPosition).toHaveBeenCalledTimes(2);
  });

  it('does not save without a current track', async () => {
    const { connectVideoEvents } = await load();
    const el = video();
    const p = player({ currentTrack: null });
    connectVideoEvents(el, p);
    el.currentTime = 10;
    el.dispatchEvent(event('timeupdate'));
    expect(state.setPlaybackPosition).not.toHaveBeenCalled();
  });

  it('throttles secondary audio seeks to 0.5s', async () => {
    const { connectVideoEvents } = await load();
    state.audioEngine.hasSecondaryAudio = true;
    const el = video();
    const p = player();
    connectVideoEvents(el, p);

    el.currentTime = 1;
    el.dispatchEvent(event('timeupdate'));
    expect(state.audioEngine.seekSecondaryAudio).toHaveBeenCalledWith(1);

    el.currentTime = 1.2;
    el.dispatchEvent(event('timeupdate'));
    expect(state.audioEngine.seekSecondaryAudio).toHaveBeenCalledTimes(1);

    el.currentTime = 2;
    el.dispatchEvent(event('timeupdate'));
    expect(state.audioEngine.seekSecondaryAudio).toHaveBeenCalledTimes(2);
  });

  it('ignores secondary audio when none is connected', async () => {
    const { connectVideoEvents } = await load();
    const el = video();
    connectVideoEvents(el, player());
    el.currentTime = 3;
    el.dispatchEvent(event('timeupdate'));
    expect(state.audioEngine.seekSecondaryAudio).not.toHaveBeenCalled();
  });

  it('falls back to zero buffered progress for empty ranges', async () => {
    const { connectVideoEvents } = await load();
    const el = video();
    Object.defineProperty(el, 'buffered', { configurable: true, value: { length: 0 } });
    connectVideoEvents(el, player());
    el.dispatchEvent(event('timeupdate'));
    expect(state.audioBuffered.value).toBe(0);

    Object.defineProperty(el, 'buffered', {
      configurable: true,
      value: { length: 1, end: () => 50 }
    });
    Object.defineProperty(el, 'duration', { configurable: true, value: 0 });
    el.dispatchEvent(event('timeupdate'));
    expect(state.audioBuffered.value).toBe(0);
  });

  it('handles non-finite durations', async () => {
    const { connectVideoEvents } = await load();
    const el = video();
    Object.defineProperty(el, 'duration', { configurable: true, value: Number.NaN });
    const p = player();
    connectVideoEvents(el, p);
    el.dispatchEvent(event('timeupdate'));
    expect(state.audioDuration.value).toBe(0);
    el.dispatchEvent(event('durationchange'));
    expect(p.duration).toBe(0);
  });

  it('updates duration on durationchange and loadedmetadata', async () => {
    const { connectVideoEvents } = await load();
    const el = video();
    const p = player();
    connectVideoEvents(el, p);

    el.dispatchEvent(event('durationchange'));
    expect(p.duration).toBe(100);
    expect(p.currentTrack.duration).toBe(100);

    Object.defineProperty(el, 'duration', { configurable: true, value: 50 });
    el.dispatchEvent(event('loadedmetadata'));
    expect(p.duration).toBe(50);
    expect(p.currentTrack.duration).toBe(50);
  });

  it('tracks play and pause in the core shell', async () => {
    const { connectVideoEvents } = await load();
    const el = video();
    const p = player();
    connectVideoEvents(el, p);

    el.dispatchEvent(event('play'));
    expect(state.audioIsPlaying.value).toBe(true);

    el.currentTime = 30;
    Object.defineProperty(el, 'paused', { configurable: true, value: true });
    el.dispatchEvent(event('pause'));
    expect(state.audioIsPlaying.value).toBe(false);
    expect(state.setPlaybackPosition).toHaveBeenCalledWith('C:/media/a.mp4', 30);
  });

  it('skips audio-ref updates outside the core shell', async () => {
    state.core = false;
    const { connectVideoEvents } = await load();
    const el = video();
    const p = player({ currentTrack: track('a', 'audio') });
    connectVideoEvents(el, p);

    el.dispatchEvent(event('play'));
    expect(state.audioIsPlaying.value).toBe(false);

    el.currentTime = 30;
    el.dispatchEvent(event('pause'));
    expect(state.setPlaybackPosition).not.toHaveBeenCalled();
  });

  it('does not save pauses for non-video tracks', async () => {
    const { connectVideoEvents } = await load();
    const el = video();
    const p = player({ currentTrack: track('a', 'audio') });
    connectVideoEvents(el, p);
    el.dispatchEvent(event('pause'));
    expect(state.setPlaybackPosition).not.toHaveBeenCalled();
  });

  it('clears positions and advances on end', async () => {
    const { connectVideoEvents } = await load();
    const el = video();
    const p = player();
    connectVideoEvents(el, p);

    el.dispatchEvent(event('ended'));
    expect(state.clearPlaybackPosition).toHaveBeenCalledWith('C:/media/a.mp4');
    expect(p.isPlaying).toBe(false);
    expect(p.nextTrack).toHaveBeenCalled();
  });

  it('repeats the current video when repeat is one', async () => {
    const { connectVideoEvents } = await load();
    const el = video();
    const p = player({ repeat: 'one' });
    connectVideoEvents(el, p);

    el.currentTime = 90;
    el.dispatchEvent(event('ended'));
    expect(el.currentTime).toBe(0);
    expect(el.play).toHaveBeenCalled();
    expect(p.nextTrack).not.toHaveBeenCalled();
  });

  it('logs repeat play failures and respects picture-in-picture', async () => {
    const { connectVideoEvents } = await load();
    const el = video();
    el.play.mockRejectedValueOnce(new Error('blocked'));
    const p = player({ repeat: 'one' });
    connectVideoEvents(el, p);
    el.dispatchEvent(event('ended'));
    await Promise.resolve();
    expect(state.warn).toHaveBeenCalledWith('video', 'repeat play rejected', expect.any(Error));

    const pip = player({ pipActive: true });
    el.dispatchEvent(event('ended'));
    expect(pip.nextTrack).not.toHaveBeenCalled();
  });
});

describe('attachVideoTranscodeFallback', () => {
  function sourceTrack(id = 'a') {
    return { path: `C:/media/${id}.mp4` };
  }

  function errorEl(code: number | null) {
    const el = video();
    Object.defineProperty(el, 'error', {
      configurable: true,
      value: code === null ? null : { code }
    });
    return el;
  }

  it('transcodes unsupported files and resumes on canplay', async () => {
    const { attachVideoTranscodeFallback } = await load();
    const el = errorEl(4);
    const p = player();
    const notify = vi.fn();
    const transcodeState = { attempted: '' };
    attachVideoTranscodeFallback(el, sourceTrack(), p, notify, transcodeState);

    el.dispatchEvent(event('error'));
    await Promise.resolve();
    await Promise.resolve();

    expect(el.pause).toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('player.transcodingVideo', 8000);
    expect(state.transcodeVideo).toHaveBeenCalledWith('C:/media/a.mp4');
    expect(el.src).toContain('media://');
    expect(el.load).toHaveBeenCalled();

    el.dispatchEvent(event('canplay'));
    expect(el.play).toHaveBeenCalled();
  });

  it('handles decode errors and reports a missing output', async () => {
    const { attachVideoTranscodeFallback } = await load();
    state.transcodeVideo.mockResolvedValue(null);
    const el = errorEl(3);
    const notify = vi.fn();
    attachVideoTranscodeFallback(el, sourceTrack(), player(), notify, { attempted: '' });
    el.dispatchEvent(event('error'));
    await Promise.resolve();
    await Promise.resolve();
    expect(notify).toHaveBeenCalledWith('player.videoUnsupported', 4000);
  });

  it('ignores unrelated or missing media errors', async () => {
    const { attachVideoTranscodeFallback } = await load();
    const notify = vi.fn();
    let el = errorEl(1);
    attachVideoTranscodeFallback(el, sourceTrack(), player(), notify, { attempted: '' });
    el.dispatchEvent(event('error'));
    expect(state.transcodeVideo).not.toHaveBeenCalled();

    el = errorEl(null);
    attachVideoTranscodeFallback(el, sourceTrack(), player(), notify, { attempted: '' });
    el.dispatchEvent(event('error'));
    expect(state.transcodeVideo).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('attempts each path only once and only for the active track', async () => {
    const { attachVideoTranscodeFallback } = await load();
    const transcodeState = { attempted: 'C:/media/a.mp4' };
    let el = errorEl(4);
    attachVideoTranscodeFallback(el, sourceTrack(), player(), vi.fn(), transcodeState);
    el.dispatchEvent(event('error'));
    expect(state.transcodeVideo).not.toHaveBeenCalled();

    el = errorEl(4);
    attachVideoTranscodeFallback(
      el,
      sourceTrack('b'),
      player({ currentTrack: track('a') }),
      vi.fn(),
      { attempted: '' }
    );
    el.dispatchEvent(event('error'));
    expect(state.transcodeVideo).not.toHaveBeenCalled();
  });

  it('drops the result when the track changed during transcoding', async () => {
    const { attachVideoTranscodeFallback } = await load();
    let resolveTranscode: (value: string) => void = () => {};
    state.transcodeVideo.mockImplementation(
      () => new Promise((resolve) => (resolveTranscode = resolve))
    );
    const el = errorEl(4);
    const p = player();
    const notify = vi.fn();
    attachVideoTranscodeFallback(el, sourceTrack(), p, notify, { attempted: '' });
    el.dispatchEvent(event('error'));

    p.currentTrack = track('b');
    resolveTranscode('C:/media/out.mp4');
    await Promise.resolve();
    await Promise.resolve();
    expect(el.src).not.toContain('media://');
  });

  it('notifies on rejection and logs resume failures', async () => {
    const { attachVideoTranscodeFallback } = await load();
    state.transcodeVideo.mockRejectedValueOnce(new Error('ffmpeg'));
    const el = errorEl(4);
    const notify = vi.fn();
    attachVideoTranscodeFallback(el, sourceTrack(), player(), notify, { attempted: '' });
    el.dispatchEvent(event('error'));
    await Promise.resolve();
    await Promise.resolve();
    expect(notify).toHaveBeenCalledWith('player.videoUnsupported', 4000);

    state.transcodeVideo.mockResolvedValue('C:/media/out.mp4');
    const el2 = errorEl(4);
    el2.play.mockRejectedValueOnce(new Error('blocked'));
    attachVideoTranscodeFallback(el2, sourceTrack(), player(), vi.fn(), { attempted: '' });
    el2.dispatchEvent(event('error'));
    await Promise.resolve();
    await Promise.resolve();
    el2.dispatchEvent(event('canplay'));
    await Promise.resolve();
    expect(state.warn).toHaveBeenCalledWith('video', 'transcoded play rejected', expect.any(Error));
  });

  it('passes the abort signal to both listeners', async () => {
    const { attachVideoTranscodeFallback } = await load();
    const el = errorEl(4);
    const controller = new AbortController();
    attachVideoTranscodeFallback(
      el,
      sourceTrack(),
      player(),
      vi.fn(),
      { attempted: '' },
      controller.signal
    );
    el.dispatchEvent(event('error'));
    expect(controller.signal.aborted).toBe(false);
  });
});
