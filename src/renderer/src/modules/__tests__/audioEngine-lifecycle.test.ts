import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const secondary = vi.hoisted(() => ({
  instances: [] as any[],
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn(),
  seek: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  offset: 0
}));

vi.mock('../audioSecondary', () => ({
  AudioSecondary: class {
    hasSecondaryAudio = true;
    constructor() {
      secondary.instances.push(this);
    }
    set timeOffset(value: number) {
      secondary.offset = value;
    }
    connect(...args: unknown[]): Promise<void> {
      return secondary.connect(...args);
    }
    disconnect(): void {
      secondary.disconnect();
    }
    seek(...args: unknown[]): void {
      secondary.seek(...args);
    }
    play(): void {
      secondary.play();
    }
    pause(): void {
      secondary.pause();
    }
  }
}));

type FakeNode = Record<string, any>;

function createFakeNode(): FakeNode {
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
    state: 'running',
    channelCount: 2,
    channelCountMode: '',
    channelInterpretation: ''
  };
}

const contexts: FakeAudioContext[] = [];

class FakeAudioContext {
  state = 'running';
  destination = createFakeNode();
  sampleRate = 48000;
  suspend = vi.fn(async () => {
    this.state = 'suspended';
  });
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  createAnalyser = (): FakeNode => createFakeNode();
  createGain = (): FakeNode => createFakeNode();
  createBiquadFilter = (): FakeNode => createFakeNode();
  createDynamicsCompressor = (): FakeNode => createFakeNode();
  createDelay = (): FakeNode => createFakeNode();
  createIIRFilter = (): FakeNode => createFakeNode();
  createMediaElementSource = (): FakeNode => createFakeNode();
  constructor() {
    contexts.push(this);
  }
}

class FakeAudio {
  preload = '';
  crossOrigin: string | null = '';
  src = '';
  currentTime = 0;
  duration = 0;
  readyState = 0;
  paused = true;
  volume = 1;
  removeAttribute = vi.fn();
  pause = vi.fn(() => {
    this.paused = true;
  });
  load = vi.fn();
  play = vi.fn(async () => {
    this.paused = false;
  });
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
}

function track(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a',
    name: 'a.mp3',
    path: 'D:/music/a.mp3',
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    size: 1,
    type: 'audio' as const,
    addedAt: 0,
    playCount: 0,
    ...overrides
  } as any;
}

let audioEngine: any;
let engine: any;

async function loadEngine() {
  vi.resetModules();
  ({ audioEngine } = await import('../audioEngine'));
  engine = audioEngine as any;
  return audioEngine;
}

beforeEach(async () => {
  contexts.length = 0;
  secondary.instances = [];
  secondary.connect.mockClear();
  secondary.disconnect.mockClear();
  secondary.seek.mockClear();
  secondary.play.mockClear();
  secondary.pause.mockClear();
  secondary.offset = 0;
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('Audio', FakeAudio);
  (window as { api?: unknown }).api = {
    setPlaybackPosition: vi.fn().mockResolvedValue(undefined),
    clearPlaybackPosition: vi.fn().mockResolvedValue(undefined),
    getPlaybackPosition: vi.fn().mockResolvedValue(0)
  };
  await loadEngine();
});

afterEach(async () => {
  await audioEngine.destroy().catch(() => {});
  vi.unstubAllGlobals();
  delete (window as { api?: unknown }).api;
});

function graph() {
  return engine.graph;
}

function emitContext() {
  return contexts[contexts.length - 1];
}

describe('replay gain and volume', () => {
  it('recomputes normalization when the replay-gain mode changes', async () => {
    engine.setStateProvider({
      getCurrentTrack: () => ({ metadata: { replayGainTrackGain: 0.5 } })
    });
    audioEngine.loadRemote('https://rr1.googlevideo.com/videoplayback');
    const gain = graph().gainNode;

    audioEngine.setReplayGainMode('track');
    expect(engine.normalization).toBe(0.5);
    expect(gain.gain.value).toBeCloseTo(0.5);

    audioEngine.setReplayGainMode('off');
    expect(engine.normalization).toBe(1);
    expect(gain.gain.value).toBeCloseTo(1);
  });

  it('handles a missing provider track and invalid gain values', () => {
    audioEngine.setReplayGainMode('album');
    expect(engine.normalization).toBe(1);

    engine.setStateProvider({
      getCurrentTrack: () => ({ metadata: { replayGainAlbumGain: 10 } })
    });
    audioEngine.setReplayGainMode('album');
    expect(engine.normalization).toBe(4);
  });

  it('clamps volume and honours mute without a provider', () => {
    audioEngine.loadRemote('https://rr1.googlevideo.com/videoplayback');
    const gain = graph().gainNode;

    audioEngine.setVolume(0.4);
    expect(gain.gain.value).toBeCloseTo(0.4);
    audioEngine.setVolume(-1);
    expect(gain.gain.value).toBe(0);
    audioEngine.setVolume(2);
    expect(gain.gain.value).toBeCloseTo(1);

    audioEngine.setMuted(true);
    expect(gain.gain.value).toBe(0);
    audioEngine.setMuted(false);
    expect(gain.gain.value).toBeCloseTo(1);
  });

  it('prefers provider mute and volume over local state', () => {
    engine.setStateProvider({ isMuted: () => true, getVolume: () => 0.25 });
    audioEngine.loadRemote('https://rr1.googlevideo.com/videoplayback');
    expect(graph().gainNode.gain.value).toBe(0);

    audioEngine.setMuted(false);
    expect(graph().gainNode.gain.value).toBe(0);
  });

  it('applies volume to the element in direct stream mode', () => {
    audioEngine.loadRemote('https://rr1.googlevideo.com/videoplayback');
    // Symuluj przejście na tryb bezpośredni (bez grafu) i sprawdź ścieżkę głośności.
    engine.streamMode = 'direct';
    const el = audioEngine.getMediaElement();
    audioEngine.setVolume(0.3);
    expect(el.volume).toBeCloseTo(0.3);
  });
});

describe('transport controls', () => {
  it('plays, pauses, seeks and ignores non-finite seeks', () => {
    audioEngine.loadTrack(track());
    const el = audioEngine.getMediaElement();

    audioEngine.play();
    expect(el.play).toHaveBeenCalled();
    expect(engine.desiredPlay).toBe(true);

    audioEngine.pause();
    expect(el.pause).toHaveBeenCalled();
    expect(engine.desiredPlay).toBe(false);

    audioEngine.seek(Number.NaN);
    expect(el.currentTime).toBe(0);
    audioEngine.seek(12);
    expect(el.currentTime).toBe(12);
    audioEngine.seek(Number.POSITIVE_INFINITY);
    expect(el.currentTime).toBe(12);
  });

  it('does not throw when play is rejected', async () => {
    audioEngine.loadTrack(track());
    audioEngine.getMediaElement().play.mockRejectedValueOnce(new Error('blocked'));
    expect(() => audioEngine.play()).not.toThrow();
    await Promise.resolve();
  });

  it('ignores video tracks and seeks safely without an element', () => {
    audioEngine.loadTrack(track({ type: 'video' }));
    expect(audioEngine.getMediaElement()).toBeNull();
    expect(() => audioEngine.seek(5)).not.toThrow();
    expect(() => audioEngine.play()).not.toThrow();
    expect(() => audioEngine.pause()).not.toThrow();
  });
});

describe('stream loading', () => {
  it('passes through URLs that are already media-server streams', () => {
    audioEngine.loadRemote('http://127.0.0.1:1234/stream?provider=token');
    const el = audioEngine.getMediaElement();
    expect(el.src).toBe('http://127.0.0.1:1234/stream?provider=token');
    expect(engine.streamMode).toBe('proxy');
    expect(engine.currentTrackType).toBe('stream');
  });

  it('wraps raw stream URLs and resets the retry ladder', () => {
    engine.streamTriedDirect = true;
    engine.streamFinalRetried = true;
    audioEngine.loadRemote('https://rr1.googlevideo.com/videoplayback?x=1');
    expect(engine.streamTriedDirect).toBe(false);
    expect(engine.streamFinalRetried).toBe(false);
    expect(audioEngine.getMediaElement().src).toContain('/stream?url=');
  });

  it('preloads the next track once and creates the element lazily', () => {
    audioEngine.preloadNext(track());
    const first = engine.preloadEl;
    expect(first.load).toHaveBeenCalledTimes(1);
    expect(first.crossOrigin).toBe('anonymous');

    audioEngine.preloadNext(track());
    expect(engine.preloadEl).toBe(first);
    expect(first.load).toHaveBeenCalledTimes(1);

    audioEngine.preloadNext(track({ path: 'D:/music/b.mp3' }));
    expect(engine.preloadEl).toBe(first);
    expect(first.load).toHaveBeenCalledTimes(2);
  });
});

describe('secondary audio', () => {
  it('delegates secondary audio operations', async () => {
    audioEngine.loadRemote('https://rr1.googlevideo.com/videoplayback');
    await audioEngine.connectSecondaryAudio('D:/video/a.mp4', 2.5);

    expect(secondary.connect).toHaveBeenCalledWith('D:/video/a.mp4', 2.5);
    expect(audioEngine.hasSecondaryAudio).toBe(true);
    expect(graph().sourceNode.connect).toHaveBeenCalled();

    audioEngine.secondaryAudioTimeOffset = 1.5;
    expect(secondary.offset).toBe(1.5);
    audioEngine.seekSecondaryAudio(10);
    audioEngine.playSecondaryAudio();
    audioEngine.pauseSecondaryAudio();
    expect(secondary.seek).toHaveBeenCalledWith(10);
    expect(secondary.play).toHaveBeenCalled();
    expect(secondary.pause).toHaveBeenCalled();

    audioEngine.disconnectSecondaryAudio();
    expect(secondary.disconnect).toHaveBeenCalled();
  });

  it('warns and continues when source nodes cannot be rewired', async () => {
    audioEngine.loadRemote('https://rr1.googlevideo.com/videoplayback');
    graph().sourceNode.disconnect.mockImplementationOnce(() => {
      throw new Error('disconnect');
    });
    await audioEngine.connectSecondaryAudio('D:/video/a.mp4');
    expect(secondary.connect).toHaveBeenCalled();

    graph().sourceNode.connect.mockImplementationOnce(() => {
      throw new Error('connect');
    });
    await audioEngine.connectSecondaryAudio('D:/video/b.mp4');
    expect(secondary.connect).toHaveBeenCalledTimes(2);
  });

  it('reports no secondary audio when none is connected', async () => {
    await audioEngine.connectSecondaryAudio('D:/video/a.mp4');
    expect(audioEngine.hasSecondaryAudio).toBe(true);
    await audioEngine.destroy();
    expect(audioEngine.hasSecondaryAudio).toBe(false);
  });
});

describe('graph delegation', () => {
  it('forwards EQ, night mode and delay settings', () => {
    const g = graph();
    g.setEqBands = vi.fn();
    g.setEqPreamp = vi.fn();
    g.setEqEnabled = vi.fn();
    g.setEqMono = vi.fn();
    g.setNightMode = vi.fn();
    g.setAudioDelayMs = vi.fn();
    g.connectVideoElement = vi.fn();
    g.disconnectVideoElement = vi.fn();
    g.setVideoVolume = vi.fn();
    g.resumeContext = vi.fn();
    g.ensureContext = vi.fn();

    audioEngine.setEqBands([]);
    audioEngine.setEqPreamp(3);
    audioEngine.setEqEnabled(false);
    audioEngine.setEqMono(true);
    audioEngine.setNightMode(true);
    audioEngine.setAudioDelayMs(120);
    audioEngine.connectVideoElement({ id: 'video' });
    audioEngine.disconnectVideoElement();
    audioEngine.setVideoVolume(0.6);
    audioEngine.resumeContext();
    audioEngine.warmUp();

    expect(g.setEqBands).toHaveBeenCalledWith([]);
    expect(g.setEqPreamp).toHaveBeenCalledWith(3);
    expect(g.setEqEnabled).toHaveBeenCalledWith(false);
    expect(g.setEqMono).toHaveBeenCalledWith(true);
    expect(g.setNightMode).toHaveBeenCalledWith(true);
    expect(g.setAudioDelayMs).toHaveBeenCalledWith(120);
    expect(g.connectVideoElement).toHaveBeenCalledWith({ id: 'video' }, 1);
    expect(g.disconnectVideoElement).toHaveBeenCalled();
    expect(g.setVideoVolume).toHaveBeenCalledWith(0.6);
    expect(g.resumeContext).toHaveBeenCalled();
    expect(g.ensureContext).toHaveBeenCalled();
  });

  it('exposes graph nodes and creates the context on resume', () => {
    expect(audioEngine.getAnalyserNode()).toBeNull();
    expect(audioEngine.getAudioContext()).toBeNull();

    audioEngine.resume();
    expect(audioEngine.getAudioContext()).not.toBeNull();
    expect(audioEngine.getAnalyserNode()).not.toBeNull();
    expect(engine.sourceNode).toBeNull();
    expect(engine.videoSourceNode).toBeNull();
    expect(engine.videoGainNode).toBeNull();
    expect(engine.eqFilters).toEqual([]);
  });

  it('resumes a suspended context', () => {
    audioEngine.warmUp();
    const context = emitContext();
    context.state = 'suspended';
    audioEngine.resumeContext();
    expect(context.resume).toHaveBeenCalled();
  });
});

describe('lifecycle', () => {
  it('deactivates playback and suspends the context', async () => {
    audioEngine.loadTrack(track());
    const el = audioEngine.getMediaElement();
    audioEngine.warmUp();
    const context = emitContext();

    await audioEngine.deactivate();
    expect(engine.desiredPlay).toBe(false);
    expect(el.pause).toHaveBeenCalled();
    expect(context.suspend).toHaveBeenCalled();
  });

  it('deactivates safely without a media element or context', async () => {
    await expect(audioEngine.deactivate()).resolves.toBeUndefined();
  });

  it('destroys elements, positions and the audio context', async () => {
    audioEngine.loadTrack(track());
    audioEngine.preloadNext(track({ path: 'D:/music/b.mp3' }));
    const preloadEl = engine.preloadEl;
    audioEngine.warmUp();
    const context = emitContext();
    const clearAll = vi.spyOn(engine.positionsStore, 'clearAll');

    await audioEngine.destroy();
    expect(clearAll).toHaveBeenCalled();
    expect(audioEngine.getMediaElement()).toBeNull();
    expect(engine.preloadEl).toBeNull();
    expect(engine.lastPreloadPath).toBe('');
    expect(context.close).toHaveBeenCalled();
    expect(audioEngine.getAudioContext()).toBeNull();
    expect(preloadEl.pause).toHaveBeenCalled();
    expect(preloadEl.load).toHaveBeenCalled();
  });

  it('destroys safely without any resources', async () => {
    await expect(audioEngine.destroy()).resolves.toBeUndefined();
  });

  it('does not persist positions for non-audio tracks', () => {
    const setPlaybackPosition = (window as { api: any }).api.setPlaybackPosition;
    audioEngine.loadTrack(track());
    engine.currentTrackType = 'video';
    audioEngine.getMediaElement().currentTime = 30;
    audioEngine.savePosition();
    expect(setPlaybackPosition).not.toHaveBeenCalled();
  });
});
