import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { audioEngine } from '../audioEngine';
import { audioEvents } from '@renderer/utils/audioEvents';
import { usePlayerStore } from '@renderer/stores/player';

type Listener = (event?: unknown) => void;

class FakeAudio {
  preload = '';
  crossOrigin: string | null = '';
  src = '';
  currentTime = 0;
  duration = 0;
  readyState = 0;
  paused = true;
  volume = 1;
  error: { code: number; message: string } | null = null;
  removeAttribute = vi.fn();
  pause = vi.fn();
  load = vi.fn();
  play = vi.fn().mockResolvedValue(undefined);
  listeners = new Map<string, Listener>();
  removeEventListener = vi.fn();

  addEventListener = vi.fn((type: string, handler: Listener) => {
    this.listeners.set(type, handler);
  });

  fire(type: string): void {
    this.listeners.get(type)?.();
  }
}

function node() {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: { value: 0 },
    frequency: { value: 0 },
    Q: { value: 0 },
    threshold: { value: 0 },
    knee: { value: 0 },
    ratio: { value: 0 },
    attack: { value: 0 },
    release: { value: 0 },
    delayTime: { value: 0 },
    type: '',
    fftSize: 2048,
    state: 'running'
  };
}

class FakeAudioContext {
  state = 'running';
  destination = node();
  createAnalyser = () => node();
  createGain = () => node();
  createBiquadFilter = () => node();
  createDynamicsCompressor = () => node();
  createDelay = () => node();
  createIIRFilter = () => node();
  createMediaElementSource = () => node();
  resume = () => {
    this.state = 'running';
    return Promise.resolve();
  };
  close = () => {
    this.state = 'closed';
    return Promise.resolve();
  };
}

const track = {
  id: 'a',
  name: 'a.mp3',
  path: 'D:/music/a.mp3',
  extension: 'mp3',
  mimeType: 'audio/mpeg',
  size: 1,
  type: 'audio' as const,
  addedAt: 0,
  playCount: 0
};

const internals = audioEngine as unknown as {
  desiredPlay: boolean;
  setRememberPosition(enabled: boolean): void;
  createAudioElement(): HTMLAudioElement;
  applySavedPosition(path: string, position: number): void;
  loadSource(src: string, opts?: { mode?: 'proxy' | 'direct' }): void;
};

let api: {
  setPlaybackPosition: ReturnType<typeof vi.fn>;
  clearPlaybackPosition: ReturnType<typeof vi.fn>;
  getPlaybackPosition: ReturnType<typeof vi.fn>;
};

function element(): FakeAudio {
  return audioEngine.getMediaElement() as unknown as FakeAudio;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('Audio', FakeAudio);
  api = {
    setPlaybackPosition: vi.fn(),
    clearPlaybackPosition: vi.fn(),
    getPlaybackPosition: vi.fn(async () => 0)
  };
  (window as unknown as { api: unknown }).api = api;
  const player = usePlayerStore();
  player.currentTrack = track as never;
});

afterEach(async () => {
  vi.unstubAllGlobals();
  audioEngine.setStateProvider(null);
  await audioEngine.destroy().catch(() => {});
  delete (window as unknown as { api?: unknown }).api;
});

describe('remember position toggling', () => {
  it('resumes from an in-memory position when enabled', () => {
    internals.setRememberPosition(true);
    audioEngine.loadTrack(track as never);
    const el = element();
    el.currentTime = 30;
    audioEngine.savePosition();
    expect(api.setPlaybackPosition).toHaveBeenCalledWith(track.path, 30);

    el.currentTime = 0;
    el.readyState = 1;
    audioEngine.loadTrack(track as never, { resume: true });

    expect(el.currentTime).toBe(30);
    expect(api.getPlaybackPosition).not.toHaveBeenCalled();
  });

  it('returns early from applying a saved position without an element', () => {
    expect(() => internals.applySavedPosition(track.path, 10)).not.toThrow();
  });

  it('ignores deferred seeks after the element or track changed', async () => {
    audioEngine.loadTrack(track as never);
    const el = element();

    // Ścieżka już nie jest aktywna — odroczony seek nie może przeskoczyć nowego utworu.
    internals.applySavedPosition('D:/other.mp3', 20);
    el.fire('loadedmetadata');
    expect(el.currentTime).toBe(0);

    // Element zniknął przed zdarzeniem metadanych.
    internals.applySavedPosition(track.path, 20);
    await audioEngine.destroy();
    el.fire('loadedmetadata');
    expect(el.currentTime).toBe(0);
  });

  it('ignores a non-positive restored position', async () => {
    api.getPlaybackPosition.mockResolvedValue(0);
    internals.setRememberPosition(true);

    audioEngine.loadTrack(track as never, { resume: true });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(api.getPlaybackPosition).toHaveBeenCalledWith(track.path);
    expect(element().currentTime).toBe(0);
  });
});

describe('direct stream source', () => {
  it('routes playback without WebAudio and applies the effective volume', () => {
    audioEngine.loadTrack(track as never);
    const el = element();
    audioEngine.setMuted(true);

    internals.loadSource('https://cdn.example/raw', { mode: 'direct' });

    expect(el.crossOrigin).toBeNull();
    expect(el.volume).toBe(0);
    expect(el.src).toBe('https://cdn.example/raw');
    expect(el.load).toHaveBeenCalled();
  });
});

describe('audio element replacement', () => {
  it('pauses and detaches the previous element before creating a new one', () => {
    audioEngine.loadTrack(track as never);
    const previous = element();

    const next = internals.createAudioElement();

    expect(previous.pause).toHaveBeenCalledTimes(1);
    expect(previous.removeAttribute).toHaveBeenCalledWith('src');
    expect(next).not.toBe(previous);
  });
});

describe('media element listeners', () => {
  it('clears the saved position and emits trackEnd on ended', () => {
    const onTrackEnd = vi.fn();
    const off = audioEvents.on('trackEnd', onTrackEnd);
    audioEngine.loadTrack(track as never);
    const el = element();

    el.currentTime = 12;
    el.fire('ended');

    expect(api.clearPlaybackPosition).toHaveBeenCalledWith(track.path);
    expect(onTrackEnd).toHaveBeenCalledTimes(1);
    off();
  });

  it('persists the position on pause and on meaningful time updates', () => {
    audioEngine.loadTrack(track as never);
    const el = element();

    el.currentTime = 20;
    el.fire('pause');
    expect(api.setPlaybackPosition).toHaveBeenLastCalledWith(track.path, 20);

    api.setPlaybackPosition.mockClear();
    el.currentTime = 25;
    el.fire('timeupdate');
    expect(api.setPlaybackPosition).toHaveBeenLastCalledWith(track.path, 25);

    api.setPlaybackPosition.mockClear();
    el.currentTime = 26;
    el.fire('timeupdate');
    expect(api.setPlaybackPosition).not.toHaveBeenCalled();
  });

  it('forwards element errors to the stream error handler', () => {
    audioEngine.loadTrack(track as never);
    const el = element();
    el.error = { code: 4, message: 'missing' } as never;
    const onTrackError = vi.fn();
    const off = audioEvents.on('trackError', onTrackError);

    el.fire('error');

    expect(onTrackError).toHaveBeenCalledWith('4');
    off();
  });

  it('replays on canplay only while a stream should be playing', () => {
    audioEngine.loadRemote('https://cdn.example/video');
    const el = element();
    audioEngine.play();
    el.play.mockClear();
    el.paused = true;

    el.fire('canplay');
    expect(el.play).toHaveBeenCalledTimes(1);

    audioEngine.pause();
    el.play.mockClear();
    el.fire('canplay');
    expect(el.play).not.toHaveBeenCalled();
  });

  it('does not replay a local (non-stream) element', () => {
    audioEngine.loadTrack(track as never);
    const el = element();
    audioEngine.play();
    el.play.mockClear();
    el.paused = true;

    el.fire('canplay');

    expect(el.play).not.toHaveBeenCalled();
  });
});
