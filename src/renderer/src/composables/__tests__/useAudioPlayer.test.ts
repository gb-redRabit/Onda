import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive, ref } from 'vue';
import type { EqBand } from '@renderer/utils/constants/audio';

// useAudioPlayer ma stan modułowy — każdy test ładuje świeżą kopię (resetModules).
const state = vi.hoisted(() => ({
  coreShell: false,
  player: null as any,
  settings: null as any,
  fx: null as any,
  subtitleDelay: null as any,
  coreState: null as any,
  engine: {
    resume: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
    loadTrack: vi.fn(),
    loadRemote: vi.fn(),
    preloadNext: vi.fn(),
    setMuted: vi.fn(),
    setVolume: vi.fn(),
    setStateProvider: vi.fn(),
    setReplayGainMode: vi.fn(),
    setRememberPosition: vi.fn(),
    setEqBands: vi.fn(),
    setEqEnabled: vi.fn(),
    setEqPreamp: vi.fn(),
    setEqMono: vi.fn(),
    setNightMode: vi.fn(),
    setAudioDelayMs: vi.fn(),
    savePosition: vi.fn(),
    getAudioContext: vi.fn(() => ({ context: true })),
    getAnalyserNode: vi.fn(() => ({ analyser: true }))
  },
  wireEvents: vi.fn(),
  initCoreClient: vi.fn(),
  sendCoreCommand: vi.fn(),
  vizSetBins: vi.fn(),
  loggerInfo: vi.fn(),
  apiOn: vi.fn()
}));

vi.mock('@renderer/modules/audioEngine', () => ({ audioEngine: state.engine }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/stores/audioFx', () => ({ useAudioFxStore: () => state.fx }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/utils/constants/audio', () => ({
  cloneEqBands: (bands: Array<{ gain: number }>) => bands.map((band) => ({ ...band }))
}));
vi.mock('../subtitleDelay', () => ({ subtitleDelayMs: state.subtitleDelay }));
vi.mock('@shared/logger', () => ({
  logger: { info: state.loggerInfo, warn: vi.fn(), error: vi.fn() }
}));
vi.mock('../audioPlayerEvents', () => ({ wireAudioEvents: state.wireEvents }));
vi.mock('@renderer/utils/runtimeMode', () => ({ isCoreShell: () => state.coreShell }));
vi.mock('@renderer/core/coreClient', () => ({
  coreState: state.coreState,
  initCoreClient: state.initCoreClient,
  sendCoreCommand: state.sendCoreCommand
}));
vi.mock('@renderer/utils/vizShim', () => ({
  createVizShim: () => ({ node: { viz: true }, setBins: state.vizSetBins })
}));

function track(type: string, path = '/music/a.mp3') {
  return { type, path, name: 'Song' };
}

function band(gain: number): EqBand {
  return { type: 'peaking', frequency: 1000, q: 1, gain };
}

async function loadModule() {
  vi.resetModules();
  return import('../useAudioPlayer');
}

// Stabilne refy: mock modułów może zostać zbuforowany między testami, więc nie
// podmieniamy referencji — resetujemy tylko wartości.
state.subtitleDelay = ref(0);
state.coreState = ref(null);

beforeEach(() => {
  vi.useFakeTimers();
  state.coreShell = false;
  state.player = reactive({
    currentTrack: null as ReturnType<typeof track> | null,
    isPlaying: false,
    isMuted: false,
    volume: 0.8,
    queue: [] as Array<ReturnType<typeof track>>,
    pendingQueue: [] as Array<ReturnType<typeof track>>,
    consumeResumeIntent: vi.fn(() => false),
    enrichPendingQueue: vi.fn(),
    setVolume: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    abLoopTarget: vi.fn(() => null),
    currentTime: 0
  });
  state.settings = reactive({
    playback: {
      replayGainMode: 'off' as string | undefined,
      rememberPosition: true,
      equalizerBands: [] as Array<{ gain: number }>,
      equalizerEnabled: undefined as boolean | undefined,
      equalizerPreamp: 2,
      equalizerUserPresets: {} as Record<string, unknown>,
      equalizerMulticolor: true,
      equalizerSnap: false,
      nightMode: true,
      audioDelayMs: 100,
      subtitleDelayMs: 250,
      gaplessPlayback: false
    },
    updatePlayback: vi.fn()
  });
  state.fx = reactive({
    equalizerBands: [] as Array<{ gain: number }>,
    equalizerEnabled: true,
    equalizerPreamp: 0,
    equalizerUserPresets: {} as Record<string, unknown>,
    equalizerMulticolor: false,
    equalizerSnap: true,
    nightMode: false,
    audioDelayMs: 0,
    equalizerMono: false
  });
  state.subtitleDelay.value = 0;
  state.coreState.value = null;
  for (const fn of Object.values(state.engine)) fn.mockClear();
  state.wireEvents.mockClear();
  state.initCoreClient.mockClear();
  state.sendCoreCommand.mockClear();
  state.vizSetBins.mockClear();
  state.loggerInfo.mockClear();
  state.apiOn.mockReset();
  state.apiOn.mockReturnValue(vi.fn());
  (window as { api?: unknown }).api = { on: state.apiOn };
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (window as { api?: unknown }).api;
});

describe('local engine bootstrap', () => {
  it('applies saved playback settings and EQ to the engine', async () => {
    state.settings.playback.equalizerBands = [band(3)];
    state.settings.playback.equalizerEnabled = false;
    const mod = await loadModule();
    mod.useAudioPlayer();

    expect(state.wireEvents).toHaveBeenCalled();
    expect(state.engine.setStateProvider).toHaveBeenCalledWith(
      expect.objectContaining({ getCurrentTrackPath: expect.any(Function) })
    );
    expect(state.engine.setReplayGainMode).toHaveBeenCalledWith('off');
    expect(state.engine.setRememberPosition).toHaveBeenCalledWith(true);
    expect(state.engine.setEqBands).toHaveBeenCalledWith([band(3)]);
    expect(state.engine.setEqEnabled).toHaveBeenCalledWith(false);
    expect(state.engine.setEqPreamp).toHaveBeenCalledWith(2);
    expect(state.engine.setNightMode).toHaveBeenCalledWith(true);
    expect(state.engine.setAudioDelayMs).toHaveBeenCalledWith(100);
    expect(state.subtitleDelay.value).toBe(250);
    expect(state.fx.equalizerSnap).toBe(false);
  });

  it('loads an existing audio track and resumes playback', async () => {
    state.player.currentTrack = track('audio');
    state.player.isPlaying = true;
    state.player.consumeResumeIntent.mockReturnValue(true);
    const mod = await loadModule();
    mod.useAudioPlayer();
    vi.advanceTimersByTime(50);

    expect(state.engine.loadTrack).toHaveBeenCalledWith(state.player.currentTrack, {
      resume: true
    });
    expect(state.engine.resume).toHaveBeenCalled();
    expect(state.engine.play).toHaveBeenCalled();
  });

  it('loads an existing stream and enriches the queue', async () => {
    state.player.currentTrack = track('stream', '/live');
    state.player.isPlaying = false;
    const mod = await loadModule();
    mod.useAudioPlayer();

    expect(state.engine.loadRemote).toHaveBeenCalledWith('/live');
    expect(state.player.enrichPendingQueue).toHaveBeenCalled();
  });

  it('skips local loading for an existing video and in Core shell', async () => {
    state.player.currentTrack = track('video', '/v.mp4');
    const local = await loadModule();
    local.useAudioPlayer();
    expect(state.engine.loadTrack).not.toHaveBeenCalled();

    state.coreShell = true;
    state.player.currentTrack = track('audio');
    const remote = await loadModule();
    remote.useAudioPlayer();
    expect(state.engine.loadTrack).not.toHaveBeenCalled();
  });

  it('applies defaults for omitted playback settings', async () => {
    const playback = state.settings.playback as Record<string, unknown>;
    playback.replayGainMode = undefined;
    playback.equalizerPreamp = undefined;
    playback.equalizerUserPresets = undefined;
    playback.audioDelayMs = undefined;
    playback.subtitleDelayMs = undefined;

    const mod = await loadModule();
    mod.useAudioPlayer();

    expect(state.engine.setReplayGainMode).toHaveBeenCalledWith('off');
    expect(state.engine.setEqPreamp).toHaveBeenCalledWith(0);
    expect(state.engine.setAudioDelayMs).toHaveBeenCalledWith(0);
    expect(state.fx.equalizerUserPresets).toEqual({});
    expect(state.subtitleDelay.value).toBe(0);
  });

  it('resumes an existing stream that was already playing', async () => {
    state.player.currentTrack = track('stream', '/live');
    state.player.isPlaying = true;
    const mod = await loadModule();
    mod.useAudioPlayer();
    vi.advanceTimersByTime(50);

    expect(state.engine.loadRemote).toHaveBeenCalledWith('/live');
    expect(state.engine.resume).toHaveBeenCalled();
    expect(state.engine.play).toHaveBeenCalled();
  });

  it('initializes the module only once and wires state providers', async () => {
    const mod = await loadModule();
    mod.useAudioPlayer();
    mod.useAudioPlayer();

    expect(state.wireEvents).toHaveBeenCalledTimes(1);
    const provider = state.engine.setStateProvider.mock.calls.at(-1)![0];
    expect(provider.getCurrentTrackPath()).toBeNull();
    expect(provider.isMuted()).toBe(false);
    expect(provider.getVolume()).toBe(0.8);
    expect(provider.isPlaying()).toBe(false);

    state.player.currentTrack = track('audio', '/music/a.mp3');
    expect(provider.getCurrentTrackPath()).toBe('/music/a.mp3');
    expect(provider.getCurrentTrack()).toBe(state.player.currentTrack);
  });

  it('ignores the local video bootstrap outside Core shell', async () => {
    const mod = await loadModule();
    mod.ensureLocalVideoAudio();
    expect(state.wireEvents).not.toHaveBeenCalled();
  });
});

describe('local API', () => {
  it('resumes and pauses through the engine', async () => {
    const mod = await loadModule();
    const api = mod.useAudioPlayer();

    api.play();
    vi.advanceTimersByTime(50);
    expect(state.engine.resume).toHaveBeenCalled();
    expect(state.engine.play).toHaveBeenCalled();

    api.pause();
    expect(state.engine.pause).toHaveBeenCalled();

    api.seek(42);
    expect(state.engine.seek).toHaveBeenCalledWith(42);
  });

  it('sets volume on the store and engine, respecting mute', async () => {
    const mod = await loadModule();
    const api = mod.useAudioPlayer();

    api.setVolume(0.4);
    expect(state.player.setVolume).toHaveBeenCalledWith(0.4);
    expect(state.engine.setVolume).toHaveBeenCalledWith(0.4);

    state.player.isMuted = true;
    api.setVolume(0.7);
    expect(state.engine.setVolume).toHaveBeenLastCalledWith(0);
  });

  it('updates EQ state and debounces graph rebuilds', async () => {
    const mod = await loadModule();
    const api = mod.useAudioPlayer();

    api.applyEqBands([band(1)]);
    expect(state.fx.equalizerBands).toEqual([band(1)]);
    expect(state.settings.updatePlayback).toHaveBeenCalledWith({
      equalizerBands: [band(1)]
    });
    expect(state.engine.setEqBands).not.toHaveBeenCalled();

    vi.advanceTimersByTime(120);
    expect(state.engine.setEqBands).toHaveBeenCalledWith([band(1)]);

    api.applyEqGraph([band(2)]);
    expect(state.engine.setEqBands).toHaveBeenLastCalledWith([band(2)]);
  });

  it('applies EQ toggles, mono, night mode and delay', async () => {
    const mod = await loadModule();
    const api = mod.useAudioPlayer();

    api.setEqEnabled(false);
    expect(state.fx.equalizerEnabled).toBe(false);
    expect(state.engine.setEqEnabled).toHaveBeenCalledWith(false);

    api.setEqPreamp(-3);
    expect(state.engine.setEqPreamp).toHaveBeenCalledWith(-3);

    const presets = { custom: [band(0)] };
    api.setEqUserPresets(presets);
    expect(state.settings.updatePlayback).toHaveBeenCalledWith({ equalizerUserPresets: presets });

    api.setEqMulticolor(true);
    api.setEqSnap(false);
    api.setEqMono(true);
    expect(state.engine.setEqMono).toHaveBeenCalledWith(true);

    api.setNightMode(true);
    expect(state.engine.setNightMode).toHaveBeenCalledWith(true);

    api.setAudioDelay(900);
    expect(state.fx.audioDelayMs).toBe(500);
    expect(state.engine.setAudioDelayMs).toHaveBeenCalledWith(500);
  });

  it('exposes analysis, position and context helpers', async () => {
    const mod = await loadModule();
    const api = mod.useAudioPlayer();

    expect(api.getAnalyserNode()).toEqual({ analyser: true });
    expect(api.getAudioContext()).toEqual({ context: true });
    api.savePosition();
    expect(state.engine.savePosition).toHaveBeenCalled();
    api.setVizActive(true);
    expect(state.engine.setEqEnabled).not.toHaveBeenCalled();
  });
});

describe('local watchers', () => {
  it('loads a new audio track, resumes and preloads gapless', async () => {
    state.settings.playback.gaplessPlayback = true;
    const mod = await loadModule();
    mod.useAudioPlayer();
    const next = track('audio', '/music/next.mp3');
    state.player.pendingQueue = [next];
    state.player.consumeResumeIntent.mockReturnValue(true);

    state.player.currentTrack = track('audio', '/music/new.mp3');
    await nextTick();
    vi.advanceTimersByTime(50);

    expect(state.engine.loadTrack).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: '/music/new.mp3' }),
      { resume: true }
    );
    expect(state.player.enrichPendingQueue).toHaveBeenCalled();
    expect(state.engine.preloadNext).toHaveBeenCalledWith(next);
    expect(state.engine.play).toHaveBeenCalled();
  });

  it('skips gapless preload without a usable next track', async () => {
    state.settings.playback.gaplessPlayback = true;
    const mod = await loadModule();
    mod.useAudioPlayer();

    state.player.currentTrack = track('audio', '/music/a.mp3');
    await nextTick();
    expect(state.engine.preloadNext).not.toHaveBeenCalled();

    state.player.pendingQueue = [track('video', '/v.mp4')];
    state.player.currentTrack = track('audio', '/music/b.mp3');
    await nextTick();
    expect(state.engine.preloadNext).not.toHaveBeenCalled();
  });

  it('falls back to the main queue for gapless preload', async () => {
    state.settings.playback.gaplessPlayback = true;
    const mod = await loadModule();
    mod.useAudioPlayer();
    const next = track('audio', '/music/next.mp3');
    state.player.queue = [next];

    state.player.currentTrack = track('audio', '/music/a.mp3');
    await nextTick();

    expect(state.engine.preloadNext).toHaveBeenCalledWith(next);
  });

  it('ignores play toggles for videos and exposes progress', async () => {
    const mod = await loadModule();
    const api = mod.useAudioPlayer();

    state.player.currentTrack = track('video', '/v.mp4');
    await nextTick();
    state.engine.resume.mockClear();
    state.engine.play.mockClear();
    state.player.isPlaying = true;
    await nextTick();
    expect(state.engine.resume).not.toHaveBeenCalled();

    expect(api.progress.value).toBe(0);
    api.duration.value = 100;
    api.currentTime.value = 25;
    expect(api.progress.value).toBe(0.25);
  });

  it('resets the EQ debounce and clamps non-numeric delays', async () => {
    const mod = await loadModule();
    const api = mod.useAudioPlayer();

    api.applyEqBands([band(1)]);
    api.applyEqBands([band(2)]);
    vi.advanceTimersByTime(120);

    expect(state.engine.setEqBands).toHaveBeenCalledTimes(1);
    expect(state.engine.setEqBands).toHaveBeenCalledWith([band(2)]);

    api.setAudioDelay(Number.NaN);
    expect(state.engine.setAudioDelayMs).toHaveBeenLastCalledWith(0);
  });

  it('falls back to the default replay gain mode', async () => {
    const mod = await loadModule();
    mod.useAudioPlayer();

    state.settings.playback.replayGainMode = undefined;
    await nextTick();

    expect(state.engine.setReplayGainMode).toHaveBeenLastCalledWith('off');
  });

  it('ignores unknown track types', async () => {
    const mod = await loadModule();
    mod.useAudioPlayer();

    state.player.currentTrack = track('image', '/pics/a.jpg');
    await nextTick();

    expect(state.engine.loadTrack).not.toHaveBeenCalled();
    expect(state.engine.loadRemote).not.toHaveBeenCalled();
  });

  it('handles stream and video track changes', async () => {
    const mod = await loadModule();
    mod.useAudioPlayer();

    state.player.currentTrack = track('stream', '/live');
    await nextTick();
    expect(state.engine.loadRemote).toHaveBeenCalledWith('/live');

    state.player.currentTrack = track('video', '/v.mp4');
    await nextTick();
    expect(state.engine.pause).toHaveBeenCalled();
  });

  it('pauses the engine when the track is cleared', async () => {
    state.player.currentTrack = track('audio');
    const mod = await loadModule();
    mod.useAudioPlayer();
    state.player.currentTrack = null;
    await nextTick();
    expect(state.engine.pause).toHaveBeenCalled();
  });

  it('follows play, mute and volume changes', async () => {
    const mod = await loadModule();
    mod.useAudioPlayer();

    state.player.isPlaying = true;
    await nextTick();
    vi.advanceTimersByTime(50);
    expect(state.engine.resume).toHaveBeenCalled();

    state.player.isPlaying = false;
    await nextTick();
    expect(state.engine.pause).toHaveBeenCalled();

    state.player.isMuted = true;
    await nextTick();
    expect(state.engine.setMuted).toHaveBeenCalledWith(true);

    state.player.volume = 0.2;
    await nextTick();
    expect(state.engine.setVolume).toHaveBeenCalledWith(0.2);
  });

  it('updates engine settings and persists subtitle delay', async () => {
    const mod = await loadModule();
    mod.useAudioPlayer();

    state.settings.playback.replayGainMode = 'album';
    await nextTick();
    expect(state.engine.setReplayGainMode).toHaveBeenCalledWith('album');

    state.settings.playback.rememberPosition = false;
    await nextTick();
    expect(state.engine.setRememberPosition).toHaveBeenCalledWith(false);

    state.subtitleDelay.value = 500;
    await nextTick();
    expect(state.settings.updatePlayback).toHaveBeenCalledWith({ subtitleDelayMs: 500 });
  });

  it('seeks for the A–B loop without a Core command', async () => {
    const mod = await loadModule();
    mod.useAudioPlayer();
    state.player.abLoopTarget.mockReturnValue(12);

    mod.currentTime.value = 30;
    await nextTick();

    expect(state.engine.seek).toHaveBeenCalledWith(12);
    expect(state.sendCoreCommand).not.toHaveBeenCalled();
  });
});

describe('Core shell remote player', () => {
  beforeEach(() => {
    state.coreShell = true;
  });

  it('seeks a video without an attached element', async () => {
    state.player.currentTrack = track('video', '/v.mp4');
    const mod = await loadModule();
    const api = mod.useAudioPlayer();
    vi.spyOn(document, 'querySelector').mockReturnValue(null);

    api.seek(5);

    expect(state.player.currentTime).toBe(5);
  });

  it('initializes the core client once and returns a null audio context', async () => {
    const mod = await loadModule();
    mod.useAudioPlayer();
    mod.ensureLocalVideoAudio();
    const second = mod.useAudioPlayer();

    expect(state.initCoreClient).toHaveBeenCalledTimes(1);
    expect(second.getAudioContext()).toBeNull();
  });

  it('re-subscribes viz after core ready and the first state tick', async () => {
    const mod = await loadModule();
    const api = mod.useAudioPlayer();
    api.setVizActive(true);
    state.sendCoreCommand.mockClear();

    const ready = state.apiOn.mock.calls.find((c) => c[0] === 'core:ready')![1] as () => void;
    ready();
    expect(state.sendCoreCommand).toHaveBeenCalledWith({ type: 'viz', active: true });

    state.sendCoreCommand.mockClear();
    state.coreState.value = {
      current: track('audio'),
      currentTime: 1,
      duration: 10,
      buffered: 0,
      enginePlaying: true,
      volume: 0.6,
      isLoading: false,
      error: null
    };
    await nextTick();
    expect(state.sendCoreCommand).toHaveBeenCalledWith({ type: 'viz', active: true });

    state.sendCoreCommand.mockClear();
    state.coreState.value = null;
    await nextTick();
    state.coreState.value = {
      current: track('audio'),
      currentTime: 2,
      duration: 10,
      buffered: 0,
      enginePlaying: true,
      volume: 0.6,
      isLoading: false,
      error: null
    };
    await nextTick();
    expect(state.sendCoreCommand).toHaveBeenCalledWith({ type: 'viz', active: true });
  });

  it('ignores viz toggles for video and reports remote progress', async () => {
    state.player.currentTrack = track('video', '/v.mp4');
    const mod = await loadModule();
    const api = mod.useAudioPlayer();

    state.sendCoreCommand.mockClear();
    api.setVizActive(true);
    expect(state.sendCoreCommand).not.toHaveBeenCalled();
    expect(api.progress.value).toBe(0);
    api.duration.value = 200;
    api.currentTime.value = 50;
    expect(api.progress.value).toBe(0.25);
  });

  it('ignores local watchers in Core shell', async () => {
    const mod = await loadModule();
    mod.ensureLocalVideoAudio();
    mod.ensureLocalVideoAudio();
    expect(state.wireEvents).toHaveBeenCalledTimes(1);

    state.player.currentTrack = track('video', '');
    await nextTick();
    state.engine.pause.mockClear();
    state.player.currentTrack = null;
    await nextTick();
    expect(state.engine.pause).not.toHaveBeenCalled();

    state.player.currentTrack = track('audio');
    await nextTick();
    state.player.isPlaying = true;
    state.player.isMuted = true;
    state.player.volume = 0.1;
    await nextTick();

    expect(state.engine.resume).not.toHaveBeenCalled();
    expect(state.engine.setMuted).not.toHaveBeenCalled();
    expect(state.engine.setVolume).not.toHaveBeenCalled();
  });

  it('initializes the core client and listens for viz/ready', async () => {
    const mod = await loadModule();
    const api = mod.useAudioPlayer();

    expect(state.initCoreClient).toHaveBeenCalled();
    expect(state.apiOn).toHaveBeenCalledWith('core:viz', expect.any(Function));
    expect(state.apiOn).toHaveBeenCalledWith('core:ready', expect.any(Function));
    expect(api.getAnalyserNode()).toEqual({ viz: true });

    const vizListener = state.apiOn.mock.calls.find((c) => c[0] === 'core:viz')![1];
    vizListener([1, 2, 3]);
    expect(state.vizSetBins).toHaveBeenCalledWith([1, 2, 3]);
    vizListener('nope');
    expect(state.vizSetBins).toHaveBeenCalledTimes(1);
  });

  it('mirrors core state into shared refs', async () => {
    const mod = await loadModule();
    const api = mod.useAudioPlayer();

    state.coreState.value = {
      current: track('audio'),
      currentTime: 33,
      duration: 120,
      buffered: 60,
      enginePlaying: true,
      volume: 0.5,
      isLoading: false,
      error: null
    };
    await nextTick();

    expect(api.currentTime.value).toBe(33);
    expect(api.duration.value).toBe(120);
    expect(api.buffered.value).toBe(60);
    expect(api.isPlaying.value).toBe(true);
    expect(api.volume.value).toBe(0.5);
    expect(api.isReady.value).toBe(true);

    state.coreState.value = {
      current: track('audio'),
      currentTime: 44,
      duration: 120,
      buffered: 61,
      enginePlaying: true,
      volume: 0.5,
      isLoading: false,
      error: null
    };
    await nextTick();
    expect(api.currentTime.value).toBe(44);
  });

  it('ignores core ticks for video and tracks readiness resets', async () => {
    const mod = await loadModule();
    const api = mod.useAudioPlayer();

    state.coreState.value = {
      current: track('video', '/v.mp4'),
      currentTime: 10,
      duration: 20,
      buffered: 5,
      enginePlaying: true,
      volume: 0.5,
      isLoading: false,
      error: null
    };
    await nextTick();
    expect(api.currentTime.value).toBe(0);

    const ready = state.apiOn.mock.calls.find((c) => c[0] === 'core:ready')![1] as () => void;
    state.sendCoreCommand.mockClear();
    ready();
    expect(state.sendCoreCommand).not.toHaveBeenCalled();
  });

  it('sends play/pause/seek/volume commands with clamps', async () => {
    const mod = await loadModule();
    const api = mod.useAudioPlayer();

    api.play();
    api.pause();
    api.seek(-5);
    api.setVolume(2);

    expect(state.sendCoreCommand).toHaveBeenCalledWith({ type: 'play' });
    expect(state.sendCoreCommand).toHaveBeenCalledWith({ type: 'pause' });
    expect(state.sendCoreCommand).toHaveBeenCalledWith({ type: 'seek', time: 0 });
    expect(state.sendCoreCommand).toHaveBeenCalledWith({ type: 'setVolume', value: 1 });
  });

  it('sends EQ and effect commands', async () => {
    const mod = await loadModule();
    const api = mod.useAudioPlayer();

    api.applyEqBands([band(1)]);
    api.setEqEnabled(true);
    api.setEqPreamp(1);
    api.applyEqGraph([band(2)]);
    api.setEqMono(true);
    api.setNightMode(true);
    api.setAudioDelay(900);
    api.setEqUserPresets({ p: [] });
    api.setEqMulticolor(true);
    api.setEqSnap(true);
    api.setAudioDelay(Number.NaN);

    expect(state.sendCoreCommand).toHaveBeenCalledWith({
      type: 'eqBands',
      bands: [band(1)]
    });
    expect(state.sendCoreCommand).toHaveBeenCalledWith({ type: 'eqEnabled', enabled: true });
    expect(state.sendCoreCommand).toHaveBeenCalledWith({ type: 'eqPreamp', db: 1 });
    expect(state.sendCoreCommand).toHaveBeenCalledWith({
      type: 'applyEqGraph',
      bands: [band(2)]
    });
    expect(state.sendCoreCommand).toHaveBeenCalledWith({ type: 'eqMono', on: true });
    expect(state.sendCoreCommand).toHaveBeenCalledWith({ type: 'nightMode', on: true });
    expect(state.sendCoreCommand).toHaveBeenCalledWith({ type: 'audioDelay', ms: 500 });
    expect(state.sendCoreCommand).toHaveBeenLastCalledWith({ type: 'audioDelay', ms: 0 });
    expect(state.settings.updatePlayback).toHaveBeenCalledWith({ equalizerUserPresets: { p: [] } });
  });

  it('counts viz consumers and subscribes once', async () => {
    const mod = await loadModule();
    const api = mod.useAudioPlayer();

    api.setVizActive(true);
    api.setVizActive(true);
    expect(state.sendCoreCommand).toHaveBeenCalledWith({ type: 'viz', active: true });
    expect(state.sendCoreCommand.mock.calls.filter((c) => c[0]?.type === 'viz')).toHaveLength(1);

    api.setVizActive(false);
    expect(state.sendCoreCommand).toHaveBeenLastCalledWith({ type: 'viz', active: true });

    api.setVizActive(false);
    expect(state.sendCoreCommand).toHaveBeenLastCalledWith({ type: 'viz', active: false });
  });

  it('uses the local engine for video playback and effects', async () => {
    state.player.currentTrack = track('video', '/v.mp4');
    const mod = await loadModule();
    const api = mod.useAudioPlayer();
    const video = { currentTime: 0 };
    vi.spyOn(document, 'querySelector').mockReturnValue(video as never);

    api.play();
    api.pause();
    api.seek(15);
    api.setVolume(0.5);
    api.applyEqBands([band(1)]);
    api.setEqEnabled(false);
    api.setEqPreamp(2);
    api.applyEqGraph([band(3)]);
    api.setEqMono(true);
    api.setNightMode(true);
    api.setAudioDelay(90);

    expect(state.player.play).toHaveBeenCalled();
    expect(state.player.pause).toHaveBeenCalled();
    expect(state.player.currentTime).toBe(15);
    expect(video.currentTime).toBe(15);
    expect(state.player.setVolume).toHaveBeenCalledWith(0.5);
    expect(state.engine.setEqBands).toHaveBeenCalledWith([band(3)]);
    expect(state.engine.setEqEnabled).toHaveBeenCalledWith(false);
    expect(state.engine.setEqPreamp).toHaveBeenCalledWith(2);
    expect(state.engine.setEqMono).toHaveBeenCalledWith(true);
    expect(state.engine.setNightMode).toHaveBeenCalledWith(true);
    expect(state.engine.setAudioDelayMs).toHaveBeenCalledWith(90);
    expect(api.getAnalyserNode()).toEqual({ analyser: true });
    expect(api.getAudioContext()).toEqual({ context: true });
    expect(api.savePosition()).toBeUndefined();
  });

  it('seeks for the A–B loop through Core', async () => {
    const mod = await loadModule();
    mod.useAudioPlayer();
    state.player.abLoopTarget.mockReturnValue(7);

    mod.currentTime.value = 30;
    await nextTick();

    expect(state.sendCoreCommand).toHaveBeenCalledWith({ type: 'seek', time: 7 });
  });
});
