import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { handlePlayerShortcutKeydown, setPlayerShortcutCtx } from '../playerShortcutHandler';

const state = vi.hoisted(() => ({
  pinia: null as any,
  player: null as any,
  fx: null as any,
  settings: null as any,
  ui: null as any,
  ctxNotify: vi.fn(),
  currentTime: null as any,
  audio: null as any,
  shortcuts: {} as Record<string, string>,
  applyVolumeTarget: vi.fn(),
  seekTarget: vi.fn(),
  matchesShortcut: vi.fn(),
  constants: {
    equalizerBands: [] as any[],
    equalizerPreset: 'custom',
    equalizerSnap: false,
    equalizerMono: false,
    equalizerEnabled: true,
    equalizerVisible: false
  },
  adjustDelay: vi.fn(),
  resetDelay: vi.fn(),
  formatDelay: vi.fn((ms: number) => `${ms}ms`),
  t: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  ),
  getVideoFps: vi.fn()
}));

vi.mock('@renderer/utils/shortcuts', () => ({ matchesShortcut: state.matchesShortcut }));
vi.mock('@renderer/utils/mediaTransport', () => ({
  applyVolumeTarget: state.applyVolumeTarget,
  seekTarget: state.seekTarget
}));
vi.mock('pinia', () => ({ getActivePinia: () => state.pinia }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/stores/audioFx', () => ({ useAudioFxStore: () => state.fx }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => state.ui }));
vi.mock('../useAudioPlayer', () => ({
  useAudioPlayer: () => ({
    currentTime: state.currentTime,
    ...state.audio
  })
}));
vi.mock('@renderer/utils/constants', () => ({
  EQUALIZER_PRESETS: { flat: [{ frequency: 100, gain: 0 }] },
  EQ_LIMITS: { maxBands: 3 },
  cloneEqBands: (bands: any[]) => bands.map((band) => ({ ...band }))
}));
vi.mock('../subtitleDelay', () => ({
  SUBTITLE_DELAY_STEP_MS: 50,
  SUBTITLE_DELAY_COARSE_MS: 500,
  adjustSubtitleDelay: state.adjustDelay,
  resetSubtitleDelay: state.resetDelay,
  formatSubtitleDelay: state.formatDelay
}));
vi.mock('@renderer/i18n', () => ({ i18n: { global: { t: state.t } } }));

function event(
  key: string,
  options: { shiftKey?: boolean; target?: any; preventDefault?: boolean } = {}
) {
  const preventDefault = vi.fn();
  return {
    key,
    shiftKey: options.shiftKey ?? false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target: options.target ?? document.body,
    preventDefault
  } as unknown as KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> };
}

function video(overrides: Record<string, unknown> = {}) {
  return {
    currentTime: 10,
    duration: 100,
    ...overrides
  } as any;
}

beforeEach(() => {
  state.pinia = {};
  state.shortcuts = {
    'play-pause': 'Space',
    'skip-backward': 'ArrowLeft',
    'skip-forward': 'ArrowRight',
    'volume-up': 'ArrowUp',
    'volume-down': 'ArrowDown',
    mute: 'm',
    fullscreen: 'f',
    'speed-down': '<',
    'speed-up': '>',
    'jump-start': '0',
    'frame-back': ',',
    'frame-forward': '.',
    'prev-track': 'MediaTrackPrevious',
    'next-track': 'MediaTrackNext',
    'ab-set-a': 'a',
    'ab-set-b': 'b',
    'ab-clear': 'c',
    'eq-toggle': 'e',
    'eq-bypass': 'q',
    'eq-add-band': 'n',
    'eq-reset': 'r',
    'eq-snap': 's',
    'eq-mono': 'o',
    'subtitle-delay-down': '[',
    'subtitle-delay-up': ']',
    'subtitle-delay-reset': '\\'
  };
  state.settings = { shortcuts: state.shortcuts, playback: { playbackSpeed: 1 } };
  state.player = {
    pipActive: false,
    volume: 0.5,
    isMuted: false,
    isPlaying: false,
    currentTime: 10,
    currentTrack: { path: 'C:/media/a.mp4' },
    togglePlay: vi.fn(),
    toggleMute: vi.fn(),
    setVolume: vi.fn(),
    nextTrack: vi.fn(),
    prevTrack: vi.fn(),
    setAbA: vi.fn(),
    setAbB: vi.fn(),
    clearAb: vi.fn()
  };
  state.fx = {
    equalizerVisible: false,
    equalizerEnabled: true,
    equalizerBands: [{ frequency: 100, gain: 0 }],
    equalizerPreset: 'custom',
    equalizerSnap: false,
    equalizerMono: false
  };
  state.ui = { notify: vi.fn() };
  state.ctxNotify.mockReset();
  state.currentTime = ref(12);
  state.audio = {
    setEqEnabled: vi.fn(),
    applyEqBands: vi.fn(),
    setEqSnap: vi.fn(),
    setEqMono: vi.fn()
  };
  state.applyVolumeTarget.mockReset();
  state.seekTarget.mockReset();
  state.matchesShortcut.mockReset();
  state.matchesShortcut.mockImplementation(
    (shortcut: string, e: KeyboardEvent) => shortcut === e.key
  );
  state.adjustDelay.mockReset();
  state.adjustDelay.mockImplementation((delta: number) => delta);
  state.resetDelay.mockReset();
  state.resetDelay.mockReturnValue(0);
  state.formatDelay.mockClear();
  state.t.mockClear();
  state.getVideoFps.mockReset();
  state.getVideoFps.mockResolvedValue(50);
  (window as { api?: unknown }).api = { getVideoFps: state.getVideoFps };
  delete document.body.dataset.shortcutRecording;
  setPlayerShortcutCtx({
    player: state.player,
    settings: state.settings,
    getVideoRef: () => null,
    skip: vi.fn(),
    setSpeed: vi.fn(),
    toggleFullscreen: vi.fn(),
    notify: state.ctxNotify,
    t: state.t
  });
});

afterEach(() => {
  setPlayerShortcutCtx(null);
  delete document.body.dataset.shortcutRecording;
  delete (window as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('guards', () => {
  it('ignores recording mode and editable targets', () => {
    document.body.dataset.shortcutRecording = '1';
    expect(() => handlePlayerShortcutKeydown(event('a'))).not.toThrow();
    delete document.body.dataset.shortcutRecording;

    const input = document.createElement('input');
    handlePlayerShortcutKeydown(event('a', { target: input }));
    const textarea = document.createElement('textarea');
    handlePlayerShortcutKeydown(event('a', { target: textarea }));

    const editable = document.createElement('div');
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    handlePlayerShortcutKeydown(event('a', { target: editable }));
    expect(state.player.setAbA).not.toHaveBeenCalled();
  });

  it('does nothing without an active Pinia or context', () => {
    state.pinia = null;
    handlePlayerShortcutKeydown(event('a'));
    expect(state.player.setAbA).not.toHaveBeenCalled();

    setPlayerShortcutCtx(null);
    handlePlayerShortcutKeydown(event('Space'));
    expect(state.player.togglePlay).not.toHaveBeenCalled();
  });

  it('ignores missing shortcut bindings', () => {
    state.settings.shortcuts = {};
    handlePlayerShortcutKeydown(event('a'));
    expect(state.player.setAbA).not.toHaveBeenCalled();
  });
});

describe('A-B loop', () => {
  it('sets A and B from the video element', () => {
    setPlayerShortcutCtx({
      player: state.player,
      settings: state.settings,
      getVideoRef: () => video({ currentTime: 33 }),
      skip: vi.fn(),
      setSpeed: vi.fn(),
      toggleFullscreen: vi.fn(),
      notify: vi.fn(),
      t: state.t
    });

    const a = event('a');
    handlePlayerShortcutKeydown(a);
    expect(state.player.setAbA).toHaveBeenCalledWith(33);
    expect(a.preventDefault).toHaveBeenCalled();

    handlePlayerShortcutKeydown(event('b'));
    expect(state.player.setAbB).toHaveBeenCalledWith(33);
  });

  it('falls back to the audio engine and clears', () => {
    handlePlayerShortcutKeydown(event('a'));
    expect(state.player.setAbA).toHaveBeenCalledWith(12);
    handlePlayerShortcutKeydown(event('c'));
    expect(state.player.clearAb).toHaveBeenCalled();
  });
});

describe('equalizer shortcuts', () => {
  it('toggles visibility and bypass', () => {
    handlePlayerShortcutKeydown(event('e'));
    expect(state.fx.equalizerVisible).toBe(true);
    handlePlayerShortcutKeydown(event('q'));
    expect(state.audio.setEqEnabled).toHaveBeenCalledWith(false);
  });

  it('adds a band within the limit', () => {
    handlePlayerShortcutKeydown(event('n'));
    expect(state.audio.applyEqBands).toHaveBeenCalledWith([
      { frequency: 100, gain: 0 },
      { type: 'peaking', frequency: 1000, q: 1, gain: 0 }
    ]);
    expect(state.fx.equalizerPreset).toBe('custom');

    state.audio.applyEqBands.mockClear();
    state.fx.equalizerBands = [{}, {}, {}];
    handlePlayerShortcutKeydown(event('n'));
    expect(state.audio.applyEqBands).not.toHaveBeenCalled();
  });

  it('resets the preset, snap and mono', () => {
    handlePlayerShortcutKeydown(event('r'));
    expect(state.fx.equalizerPreset).toBe('flat');
    expect(state.audio.applyEqBands).toHaveBeenCalledWith([{ frequency: 100, gain: 0 }]);

    handlePlayerShortcutKeydown(event('s'));
    expect(state.audio.setEqSnap).toHaveBeenCalledWith(true);
    handlePlayerShortcutKeydown(event('o'));
    expect(state.audio.setEqMono).toHaveBeenCalledWith(true);
  });
});

describe('subtitle delay', () => {
  it('adjusts by fine and coarse steps', () => {
    handlePlayerShortcutKeydown(event('['));
    expect(state.adjustDelay).toHaveBeenCalledWith(-50);
    expect(state.ui.notify).toHaveBeenCalledWith(
      'info',
      'player.subtitleDelay:{"delay":"-50ms"}',
      undefined,
      1400
    );

    handlePlayerShortcutKeydown(event(']', { shiftKey: true }));
    expect(state.adjustDelay).toHaveBeenLastCalledWith(500);
  });

  it('resets the delay', () => {
    handlePlayerShortcutKeydown(event('\\'));
    expect(state.resetDelay).toHaveBeenCalled();
    expect(state.ui.notify).toHaveBeenCalledWith(
      'info',
      'player.subtitleDelay:{"delay":"0ms"}',
      undefined,
      1400
    );
  });
});

describe('transport shortcuts', () => {
  it('toggles play only outside PiP', () => {
    state.player.isPlaying = true;
    const e = event('Space');
    handlePlayerShortcutKeydown(e);
    expect(state.player.togglePlay).toHaveBeenCalled();
    expect(e.preventDefault).toHaveBeenCalled();

    state.player.togglePlay.mockClear();
    state.player.pipActive = true;
    handlePlayerShortcutKeydown(event('Space'));
    expect(state.player.togglePlay).not.toHaveBeenCalled();
  });

  it('clamps volume and applies it to the transport target', () => {
    state.player.volume = 0.98;
    handlePlayerShortcutKeydown(event('ArrowUp'));
    expect(state.player.setVolume).toHaveBeenCalledWith(1);
    expect(state.applyVolumeTarget).toHaveBeenCalledWith(null, false, 1);

    state.player.volume = 0.02;
    handlePlayerShortcutKeydown(event('ArrowDown'));
    expect(state.player.setVolume).toHaveBeenLastCalledWith(0);
  });

  it('notifies volume and mute states', () => {
    handlePlayerShortcutKeydown(event('ArrowUp'));
    expect(state.ctxNotify).toHaveBeenCalledWith('player.volume:{"n":55}', 1200);

    state.player.isMuted = false;
    handlePlayerShortcutKeydown(event('m'));
    expect(state.player.toggleMute).toHaveBeenCalled();
    expect(state.ctxNotify).toHaveBeenLastCalledWith('player.volume:{"n":50}', 1200);

    state.player.isMuted = true;
    handlePlayerShortcutKeydown(event('m'));
    expect(state.ctxNotify).toHaveBeenLastCalledWith('player.muted', 1200);
  });

  it('handles fullscreen, speed, jump and track changes', () => {
    const toggleFullscreen = vi.fn();
    const setSpeed = vi.fn();
    const notify = vi.fn();
    setPlayerShortcutCtx({
      player: state.player,
      settings: state.settings,
      getVideoRef: () => video(),
      skip: vi.fn(),
      setSpeed,
      toggleFullscreen,
      notify,
      t: state.t
    });

    handlePlayerShortcutKeydown(event('f'));
    expect(toggleFullscreen).toHaveBeenCalled();
    handlePlayerShortcutKeydown(event('>'));
    expect(setSpeed).toHaveBeenCalledWith(1.25);
    handlePlayerShortcutKeydown(event('<'));
    expect(setSpeed).toHaveBeenLastCalledWith(0.75);

    handlePlayerShortcutKeydown(event('0'));
    expect(state.seekTarget).toHaveBeenCalledWith(expect.any(Object), 0);
    expect(state.player.currentTime).toBe(0);
    expect(notify).toHaveBeenCalledWith('0:00', 1000);

    handlePlayerShortcutKeydown(event('MediaTrackNext'));
    expect(state.player.nextTrack).toHaveBeenCalled();
    handlePlayerShortcutKeydown(event('MediaTrackPrevious'));
    expect(state.player.prevTrack).toHaveBeenCalled();
  });
});

describe('frame stepping', () => {
  it('steps forward using the probed fps', async () => {
    const notify = vi.fn();
    const element = video({ currentTime: 10, duration: 100 });
    setPlayerShortcutCtx({
      player: state.player,
      settings: state.settings,
      getVideoRef: () => element,
      skip: vi.fn(),
      setSpeed: vi.fn(),
      toggleFullscreen: vi.fn(),
      notify,
      t: state.t
    });

    handlePlayerShortcutKeydown(event('.'));
    await Promise.resolve();
    await Promise.resolve();
    expect(state.getVideoFps).toHaveBeenCalledWith('C:/media/a.mp4');
    expect(element.currentTime).toBeCloseTo(10.02);
    expect(notify).toHaveBeenCalledWith('+0.020 s', 900);
  });

  it('steps backward and clamps to zero', async () => {
    const element = video({ currentTime: 0.001, duration: 100 });
    setPlayerShortcutCtx({
      player: state.player,
      settings: state.settings,
      getVideoRef: () => element,
      skip: vi.fn(),
      setSpeed: vi.fn(),
      toggleFullscreen: vi.fn(),
      notify: vi.fn(),
      t: state.t
    });

    handlePlayerShortcutKeydown(event(','));
    await Promise.resolve();
    await Promise.resolve();
    expect(element.currentTime).toBe(0);
  });

  it('falls back to 25 fps for failures and missing paths', async () => {
    const notify = vi.fn();
    const element = video({ currentTime: 10 });
    setPlayerShortcutCtx({
      player: state.player,
      settings: state.settings,
      getVideoRef: () => element,
      skip: vi.fn(),
      setSpeed: vi.fn(),
      toggleFullscreen: vi.fn(),
      notify,
      t: state.t
    });
    state.getVideoFps.mockRejectedValueOnce(new Error('probe'));
    handlePlayerShortcutKeydown(event('.'));
    await Promise.resolve();
    await Promise.resolve();
    expect(notify).toHaveBeenCalledWith('+0.040 s', 900);

    state.player.currentTrack = null;
    element.currentTime = 10;
    handlePlayerShortcutKeydown(event('.'));
    await Promise.resolve();
    await Promise.resolve();
    expect(state.getVideoFps).toHaveBeenCalledTimes(1);
  });

  it('ignores frame steps without a video element', async () => {
    setPlayerShortcutCtx({
      player: state.player,
      settings: state.settings,
      getVideoRef: () => null,
      skip: vi.fn(),
      setSpeed: vi.fn(),
      toggleFullscreen: vi.fn(),
      notify: vi.fn(),
      t: state.t
    });
    handlePlayerShortcutKeydown(event('.'));
    await Promise.resolve();
    expect(state.getVideoFps).not.toHaveBeenCalled();
  });
});
