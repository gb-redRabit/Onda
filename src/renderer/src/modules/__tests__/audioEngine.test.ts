import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { audioEngine } from '../audioEngine';
import { audioEvents } from '@renderer/utils/audioEvents';
import { usePlayerStore } from '@renderer/stores/player';

type FakeNode = {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  gain: { value: number };
  frequency: { value: number };
  Q: { value: number };
  threshold: { value: number };
  knee: { value: number };
  ratio: { value: number };
  attack: { value: number };
  release: { value: number };
  type: string;
  fftSize: number;
  state: string;
  feedforward?: number[];
  feedback?: number[];
};

type TestableAudioEngine = {
  sourceNode: FakeNode | null;
  videoSourceNode: FakeNode | null;
  videoGainNode: FakeNode | null;
  eqFilters: FakeNode[];
  connectAudio(el: unknown): void;
  connectVideoElement(el: unknown): void;
  disconnectVideoElement(): void;
  handleEnded(): void;
};

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
    type: '',
    fftSize: 2048,
    state: 'running'
  };
}

class FakeAudioContext {
  state = 'running';
  destination = createFakeNode();
  createAnalyser = (): FakeNode => createFakeNode();
  createGain = (): FakeNode => createFakeNode();
  createBiquadFilter = (): FakeNode => createFakeNode();
  createDynamicsCompressor = (): FakeNode => createFakeNode();
  createIIRFilter = (ff: number[], fb: number[]): FakeNode => {
    const node = createFakeNode();
    node.feedforward = ff;
    node.feedback = fb;
    return node;
  };
  createMediaElementSource = (): FakeNode => createFakeNode();
  resume = (): Promise<void> => {
    this.state = 'running';
    return Promise.resolve();
  };
  close = (): Promise<void> => {
    this.state = 'closed';
    return Promise.resolve();
  };
}

class FakeAudio {
  preload = '';
  crossOrigin = '';
  src = '';
  currentTime = 0;
  duration = 0;
  readyState = 0;
  paused = true;
  volume = 1;
  removeAttribute = vi.fn();
  pause = vi.fn();
  load = vi.fn();
  play = vi.fn().mockResolvedValue(undefined);
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
}

const engine = audioEngine as unknown as TestableAudioEngine;

describe('audioEngine video element routing', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('Audio', FakeAudio);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await audioEngine.destroy().catch(() => {});
  });

  it('connectVideoElement disconnects the source node from the graph', () => {
    const el = new FakeAudio() as unknown as HTMLAudioElement;
    engine.connectAudio(el);
    expect(engine.sourceNode).not.toBeNull();

    engine.connectVideoElement(el);
    expect(engine.sourceNode?.disconnect).toHaveBeenCalled();
  });

  it('disconnectVideoElement reconnects the source node to the EQ chain', () => {
    const el = new FakeAudio() as unknown as HTMLAudioElement;
    engine.connectAudio(el);
    expect(engine.sourceNode).not.toBeNull();

    engine.connectVideoElement(el);
    engine.sourceNode!.disconnect.mockClear();

    engine.disconnectVideoElement();
    const firstFilter = engine.eqFilters[0];
    expect(engine.sourceNode?.connect).toHaveBeenCalledWith(firstFilter);
  });

  it('setEqBands (re)builds the IIR chain from the band definitions', () => {
    const el = new FakeAudio() as unknown as HTMLAudioElement;
    engine.connectAudio(el);
    const before = engine.eqFilters[0];

    audioEngine.setEqBands([
      { type: 'lowshelf', frequency: 60, q: 0.7, gain: 4 },
      { type: 'peaking', frequency: 2000, q: 2, gain: -3 }
    ]);

    // Łańcuch jest przebudowywany (nowe węzły IIR), więc pierwszy filtr się zmienia.
    expect(engine.eqFilters[0]).not.toBe(before);
    const first = engine.eqFilters[0] as unknown as { feedforward: number[] };
    expect(Array.isArray(first.feedforward)).toBe(true);
    expect(first.feedforward).toHaveLength(3);
  });

  it('disconnectVideoElement is a no-op without a source node', () => {
    expect(() => engine.disconnectVideoElement()).not.toThrow();
  });

  it('setNightMode applies compression + dialogue boost, and clears them when off', () => {
    const el = new FakeAudio() as unknown as HTMLAudioElement;
    engine.connectAudio(el);
    const graph = (
      audioEngine as unknown as {
        graph: { nightCompressor: FakeNode; nightDialogueEq: FakeNode; nightMakeup: FakeNode };
      }
    ).graph;

    audioEngine.setNightMode(true);
    expect(graph.nightCompressor.ratio.value).toBeGreaterThan(1);
    expect(graph.nightCompressor.threshold.value).toBeLessThan(0);
    expect(graph.nightDialogueEq.gain.value).toBeGreaterThan(0);

    audioEngine.setNightMode(false);
    expect(graph.nightCompressor.ratio.value).toBe(1);
    expect(graph.nightCompressor.threshold.value).toBe(0);
    expect(graph.nightDialogueEq.gain.value).toBe(0);
  });

  it('connectVideoElement is a no-op without a source node', () => {
    const el = new FakeAudio() as unknown as HTMLAudioElement;
    expect(() => engine.connectVideoElement(el)).not.toThrow();
  });

  it('routes the video element through the video gain node into the EQ chain', () => {
    const el = new FakeAudio() as unknown as HTMLAudioElement;

    engine.connectVideoElement(el);

    const videoSource = engine.videoSourceNode;
    const videoGain = engine.videoGainNode;
    expect(videoSource).not.toBeNull();
    expect(videoGain).not.toBeNull();
    expect(videoSource!.connect).toHaveBeenCalledWith(videoGain);
    const firstFilter = engine.eqFilters[0];
    expect(videoGain!.connect).toHaveBeenCalledWith(firstFilter);
  });

  it('emits trackEnd when the audio element ends', () => {
    const spy = vi.fn();
    const off = audioEvents.on('trackEnd', spy);
    (engine as unknown as { handleEnded(): void }).handleEnded();
    expect(spy).toHaveBeenCalledTimes(1);
    off();
  });

  it('loadRemote proxies the stream through the media server', () => {
    (audioEngine as unknown as { loadRemote(url: string): void }).loadRemote(
      'https://rr1.googlevideo.com/videoplayback?x=1'
    );

    const el = audioEngine.getMediaElement() as unknown as {
      src: string;
      crossOrigin: string | null;
    };
    expect(el.src).toContain('/stream?url=');
    expect(el.src).toContain('rr1.googlevideo.com');
    expect(el.crossOrigin).toBe('anonymous');
    expect(engine.sourceNode).not.toBeNull();
  });

  it('setVolume drives the graph gain in proxied stream mode', () => {
    (audioEngine as unknown as { loadRemote(url: string): void }).loadRemote(
      'https://rr1.googlevideo.com/videoplayback?x=1'
    );
    (audioEngine as unknown as { setVolume(v: number): void }).setVolume(0.4);
    const graph = (audioEngine as unknown as { graph: { gainNode: FakeNode } }).graph;
    expect(graph.gainNode.gain.value).toBeCloseTo(0.4);
  });

  it('stream error ladder: proxy -> direct -> proxy retry -> streamError', () => {
    const spy = vi.fn();
    const off = audioEvents.on('streamError', spy);
    const handle = (el: HTMLAudioElement): void =>
      (
        audioEngine as unknown as { handleStreamError(el: HTMLAudioElement): void }
      ).handleStreamError(el);

    (audioEngine as unknown as { loadRemote(url: string): void }).loadRemote(
      'https://rr1.googlevideo.com/videoplayback?x=1'
    );
    const el = audioEngine.getMediaElement() as unknown as {
      src: string;
      crossOrigin: string | null;
    };
    expect(el.src).toContain('/stream?url=');
    expect(el.crossOrigin).toBe('anonymous');

    handle(audioEngine.getMediaElement() as unknown as HTMLAudioElement);
    expect(el.src).not.toContain('/stream?url=');
    expect(el.crossOrigin).toBeNull();

    handle(audioEngine.getMediaElement() as unknown as HTMLAudioElement);
    expect(el.src).toContain('/stream?url=');
    expect(el.crossOrigin).toBe('anonymous');

    handle(audioEngine.getMediaElement() as unknown as HTMLAudioElement);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('stream-failed');
    off();
  });

  it('emits trackError when a local (non-stream) load errors', () => {
    const spy = vi.fn();
    const off = audioEvents.on('trackError', spy);
    const el = new FakeAudio() as unknown as HTMLAudioElement;
    Object.defineProperty(el, 'error', {
      value: { code: 4, message: 'MEDIA_ELEMENT_ERROR: Format error' },
      configurable: true
    });
    // Symuluj lokalne (nie-strumieniowe) wczytanie: nie ustawiono stream URL.
    (audioEngine as unknown as { streamUrl: string | null }).streamUrl = null;
    (audioEngine as unknown as { handleStreamError(el: HTMLAudioElement): void }).handleStreamError(
      el
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('4');
    off();
  });
});

describe('audioEngine saved position restore', () => {
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

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('Audio', FakeAudio);
    audioEngine.setStateProvider({
      getCurrentTrackPath: () => usePlayerStore().currentTrack?.path ?? null,
      getCurrentTrack: () => usePlayerStore().currentTrack,
      isMuted: () => usePlayerStore().isMuted,
      getVolume: () => usePlayerStore().volume,
      isPlaying: () => usePlayerStore().isPlaying
    });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    delete (window as unknown as { api?: unknown }).api;
    audioEngine.setStateProvider(null);
    await audioEngine.destroy().catch(() => {});
  });

  it('seeks to the position persisted by a previous session', async () => {
    const getPlaybackPosition = vi.fn(async () => 42);
    (window as unknown as { api: unknown }).api = { getPlaybackPosition };

    const player = usePlayerStore();
    player.currentTrack = track;

    audioEngine.loadTrack(track, { resume: true });
    const el = audioEngine.getMediaElement() as unknown as FakeAudio;
    // Metadane zdążyły się zdekodować, zanim dotarła zapisana pozycja.
    el.readyState = 4;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getPlaybackPosition).toHaveBeenCalledWith(track.path);
    expect(el.currentTime).toBe(42);
  });

  it('waits for metadata before seeking when the element is not ready yet', async () => {
    const getPlaybackPosition = vi.fn(async () => 42);
    (window as unknown as { api: unknown }).api = { getPlaybackPosition };

    const player = usePlayerStore();
    player.currentTrack = track;

    audioEngine.loadTrack(track, { resume: true });
    const el = audioEngine.getMediaElement() as unknown as FakeAudio;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(el.currentTime).toBe(0);
    const listeners = (el.addEventListener as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call) => call[0] === 'loadedmetadata'
    );
    expect(listeners.length).toBeGreaterThan(0);

    el.currentTime = 0;
    listeners[listeners.length - 1][1]();
    expect(el.currentTime).toBe(42);
  });

  it('does not seek when the track already changed', async () => {
    const getPlaybackPosition = vi.fn(async () => 42);
    (window as unknown as { api: unknown }).api = { getPlaybackPosition };

    const player = usePlayerStore();
    player.currentTrack = track;

    audioEngine.loadTrack(track, { resume: true });
    const el = audioEngine.getMediaElement() as unknown as FakeAudio;
    el.readyState = 4;
    // Użytkownik już przeszedł dalej, zanim wróciła zapisana pozycja.
    player.currentTrack = { ...track, path: 'D:/music/b.mp3' };
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(el.currentTime).toBe(0);
  });

  it('does not resume by default — a plain play starts from the beginning', async () => {
    const getPlaybackPosition = vi.fn(async () => 42);
    (window as unknown as { api: unknown }).api = { getPlaybackPosition };

    const player = usePlayerStore();
    player.currentTrack = track;

    audioEngine.loadTrack(track);
    const el = audioEngine.getMediaElement() as unknown as FakeAudio;
    el.readyState = 4;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getPlaybackPosition).not.toHaveBeenCalled();
    expect(el.currentTime).toBe(0);
  });

  it('saves position via setPlaybackPosition when currentTime > 5', () => {
    const setPlaybackPosition = vi.fn();
    (window as unknown as { api: unknown }).api = { setPlaybackPosition };

    const player = usePlayerStore();
    player.currentTrack = track;

    audioEngine.loadTrack(track);
    const el = audioEngine.getMediaElement() as unknown as FakeAudio;
    el.currentTime = 120;

    audioEngine.savePosition();
    expect(setPlaybackPosition).toHaveBeenCalledWith(track.path, 120);
  });

  it('clears position via clearPlaybackPosition on clearSavedPosition', () => {
    const clearPlaybackPosition = vi.fn();
    (window as unknown as { api: unknown }).api = { clearPlaybackPosition };

    audioEngine.clearSavedPosition(track.path);
    expect(clearPlaybackPosition).toHaveBeenCalledWith(track.path);
  });

  it('saves previous track position when loading a different track', () => {
    const setPlaybackPosition = vi.fn();
    (window as unknown as { api: unknown }).api = { setPlaybackPosition };

    const player = usePlayerStore();
    player.currentTrack = track;

    audioEngine.loadTrack(track);
    const el = audioEngine.getMediaElement() as unknown as FakeAudio;
    el.currentTime = 45;

    const track2 = { ...track, id: 'b', path: 'D:/music/b.mp3' };
    player.currentTrack = track2;
    audioEngine.loadTrack(track2);

    expect(setPlaybackPosition).toHaveBeenCalledWith(track.path, 45);
  });
});
