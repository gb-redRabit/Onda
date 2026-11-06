import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

// Kontrolki playera: transport, resume prompt i urządzenia są podstawione.
const state = vi.hoisted(() => ({
  clampSpeed: vi.fn((value: number) => value),
  applyVolumeTarget: vi.fn(),
  seekTarget: vi.fn(),
  skipTarget: vi.fn((): number | null => 42),
  resumeOptions: null as null | {
    onContinue: (prompt: { position: number; path: string }) => void;
    onStart: (prompt: { path: string }) => void;
  },
  pausePrompt: vi.fn(),
  resumePrompt: vi.fn(),
  onContinue: vi.fn(),
  onStart: vi.fn(),
  clearSavedPosition: vi.fn(),
  audioSeek: vi.fn(),
  audioPlay: vi.fn(),
  isCoreShell: vi.fn(() => false),
  setPlaybackPosition: vi.fn(),
  clearPlaybackPosition: vi.fn(),
  t: vi.fn((key: string, params?: { n?: number }) =>
    params && params.n !== undefined ? `${key}:${params.n}` : key
  )
}));

vi.mock('@renderer/utils/mediaTransport', () => ({
  applyVolumeTarget: state.applyVolumeTarget,
  seekTarget: state.seekTarget,
  skipTarget: state.skipTarget,
  clampSpeed: state.clampSpeed
}));
vi.mock('@renderer/composables/useVideoPlayer', () => ({ useVideoPlayer: vi.fn() }));
vi.mock('@renderer/composables/useResumePrompt', () => ({
  useResumePrompt: (options: typeof state.resumeOptions) => {
    state.resumeOptions = options;
    return {
      pause: state.pausePrompt,
      resume: state.resumePrompt,
      onContinue: state.onContinue,
      onStart: state.onStart
    };
  }
}));
vi.mock('@renderer/modules/audioEngine', () => ({
  audioEngine: { clearSavedPosition: state.clearSavedPosition }
}));
vi.mock('@renderer/composables/useAudioPlayer', () => ({
  useAudioPlayer: () => ({ seek: state.audioSeek, play: state.audioPlay })
}));
vi.mock('@renderer/utils/runtimeMode', () => ({ isCoreShell: () => state.isCoreShell() }));

const { usePlayerControls } = await import('../usePlayerControls');

function fakeVideo() {
  return {
    currentTime: 0,
    playbackRate: 1,
    play: vi.fn(() => Promise.resolve())
  };
}

function fakeContainer() {
  return { classList: { add: vi.fn(), remove: vi.fn() } };
}

let video = fakeVideo();
let container = fakeContainer();
let fullscreenElement: unknown = null;

interface Ctx {
  player: Record<string, any>;
  settings: Record<string, any>;
  ui: { notify: ReturnType<typeof vi.fn> };
  vp: { videoRef: { value: typeof video | null } };
  playerContainerRef: { value: typeof container | null };
}

function createContext(overrides: Partial<Ctx> = {}): Ctx {
  const player = {
    volume: 0.5,
    isMuted: false,
    isPlaying: false,
    currentTime: 0,
    pipActive: false,
    currentTrack: { type: 'video' } as { type: string } | null,
    setVolume: vi.fn(),
    seek: vi.fn(),
    clearResumePrompt: vi.fn(),
    togglePlay: vi.fn(() => {
      player.isPlaying = !player.isPlaying;
    }),
    ...(overrides.player ?? {})
  };
  return {
    player,
    settings: overrides.settings ?? {
      playback: { cursorHide: true, cursorTimeout: 3 },
      updatePlayback: vi.fn()
    },
    ui: overrides.ui ?? { notify: vi.fn() },
    vp: overrides.vp ?? { videoRef: ref(video) },
    playerContainerRef: overrides.playerContainerRef ?? { value: container }
  };
}

function createControls(ctx: Ctx = createContext()) {
  const controls = usePlayerControls({
    player: ctx.player as never,
    settings: ctx.settings as never,
    ui: ctx.ui as never,
    t: state.t as never,
    vp: ctx.vp as never,
    playerContainerRef: ctx.playerContainerRef as never
  });
  return { controls, ctx };
}

function wheel(deltaY: number, target: unknown = { closest: () => null }): WheelEvent {
  return { deltaY, target } as unknown as WheelEvent;
}

beforeEach(() => {
  vi.useFakeTimers();
  video = fakeVideo();
  container = fakeContainer();
  fullscreenElement = null;
  state.clampSpeed.mockReset();
  state.clampSpeed.mockImplementation((value: number) => value);
  state.applyVolumeTarget.mockClear();
  state.seekTarget.mockClear();
  state.skipTarget.mockReset();
  state.skipTarget.mockReturnValue(42);
  state.resumeOptions = null;
  state.pausePrompt.mockClear();
  state.resumePrompt.mockClear();
  state.clearSavedPosition.mockClear();
  state.audioSeek.mockClear();
  state.audioPlay.mockClear();
  state.isCoreShell.mockReset();
  state.isCoreShell.mockReturnValue(false);
  state.setPlaybackPosition.mockClear();
  state.clearPlaybackPosition.mockClear();
  state.t.mockClear();
  (window as { api?: unknown }).api = {
    setPlaybackPosition: state.setPlaybackPosition,
    clearPlaybackPosition: state.clearPlaybackPosition
  };
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => fullscreenElement
  });
  (document as unknown as Record<string, unknown>).exitFullscreen = vi.fn(() => Promise.resolve());
  (document.documentElement as unknown as Record<string, unknown>).requestFullscreen = vi.fn(() =>
    Promise.resolve()
  );
  (container as unknown as Record<string, unknown>).requestFullscreen = vi.fn(() =>
    Promise.resolve()
  );
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('toast and wheel', () => {
  it('shows a toast with the requested duration', () => {
    const { controls, ctx } = createControls();
    controls.showToast('hello', 2000);
    expect(ctx.ui.notify).toHaveBeenCalledWith('info', 'hello', undefined, 2000);
  });

  it('changes volume with the wheel and clamps it', () => {
    const { controls, ctx } = createControls();
    ctx.player.volume = 0.5;

    controls.onWheel(wheel(-1));

    expect(ctx.player.clearResumePrompt).toHaveBeenCalled();
    expect(ctx.player.setVolume).toHaveBeenCalledWith(0.55);
    expect(state.applyVolumeTarget).toHaveBeenCalledWith(video, false, 0.55);
    expect(ctx.ui.notify).toHaveBeenCalledWith('info', 'player.volume:55', undefined, 1200);
  });

  it('clamps volume at both ends', () => {
    const { controls, ctx } = createControls();
    ctx.player.volume = 0.98;
    controls.onWheel(wheel(-1));
    expect(ctx.player.setVolume).toHaveBeenLastCalledWith(1);

    ctx.player.volume = 0.01;
    controls.onWheel(wheel(1));
    expect(ctx.player.setVolume).toHaveBeenLastCalledWith(0);
  });

  it('ignores wheel over a data-wheel-ignore target', () => {
    const { controls, ctx } = createControls();
    controls.onWheel(wheel(-1, { closest: () => ({}) }));

    expect(ctx.player.clearResumePrompt).toHaveBeenCalled();
    expect(ctx.player.setVolume).not.toHaveBeenCalled();
  });
});

describe('seek, volume and speed', () => {
  it('seeks the store and video and clears the resume prompt', () => {
    const { controls, ctx } = createControls();
    controls.onSeek(30);

    expect(ctx.player.seek).toHaveBeenCalledWith(30);
    expect(state.seekTarget).toHaveBeenCalledWith(video, 30);
    expect(ctx.player.clearResumePrompt).toHaveBeenCalled();
  });

  it('applies volume directly', () => {
    const { controls, ctx } = createControls();
    controls.onVolumeChange(0.25);

    expect(ctx.player.setVolume).toHaveBeenCalledWith(0.25);
    expect(state.applyVolumeTarget).toHaveBeenCalledWith(video, false, 0.25);
    expect(ctx.player.clearResumePrompt).toHaveBeenCalled();
  });

  it('skips forward and backward with a toast', () => {
    const { controls, ctx } = createControls();

    controls.skip(10);
    expect(ctx.player.currentTime).toBe(42);
    expect(state.skipTarget).toHaveBeenCalledWith(video, 10);
    expect(ctx.ui.notify).toHaveBeenCalledWith('info', '+10s', undefined, 1000);

    controls.skip(-5);
    expect(ctx.ui.notify).toHaveBeenLastCalledWith('info', '-5s', undefined, 1000);
  });

  it('does nothing when the skip target is unavailable', () => {
    state.skipTarget.mockReturnValue(null);
    const { controls, ctx } = createControls();

    controls.skip(10);

    expect(ctx.player.currentTime).toBe(0);
    expect(ctx.ui.notify).not.toHaveBeenCalled();
  });

  it('clamps and applies playback speed', () => {
    state.clampSpeed.mockImplementation((value: number) => Math.min(2, value));
    const { controls, ctx } = createControls();

    controls.setSpeed(3);

    expect(ctx.settings.updatePlayback).toHaveBeenCalledWith({ playbackSpeed: 2 });
    expect(video.playbackRate).toBe(2);
    expect(ctx.player.clearResumePrompt).toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith('info', '2x', undefined, 1200);
  });

  it('changes speed without a video element', () => {
    const ctx = createContext({ vp: { videoRef: ref(null) } });
    const { controls } = createControls(ctx);
    controls.setSpeed(1.5);
    expect(ctx.settings.updatePlayback).toHaveBeenCalledWith({ playbackSpeed: 1.5 });
  });
});

describe('fullscreen', () => {
  it('requests fullscreen on the player container', () => {
    const { controls } = createControls();
    controls.toggleFullscreen();
    expect(
      (container as unknown as { requestFullscreen: ReturnType<typeof vi.fn> }).requestFullscreen
    ).toHaveBeenCalled();
  });

  it('falls back to the document element when the container rejects', async () => {
    (container as unknown as { requestFullscreen: ReturnType<typeof vi.fn> }).requestFullscreen =
      vi.fn(() => Promise.reject(new Error('denied')));
    const { controls } = createControls();

    controls.toggleFullscreen();
    await Promise.resolve();
    await Promise.resolve();

    expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
  });

  it('exits fullscreen when already active', () => {
    fullscreenElement = {};
    const { controls } = createControls();
    controls.toggleFullscreen();
    expect(document.exitFullscreen).toHaveBeenCalled();
  });
});

describe('controls visibility', () => {
  it('hides controls after the configured timeout while playing', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    const { controls, ctx } = createControls();
    ctx.player.isPlaying = true;
    controls.isFullscreen.value = true;

    controls.onMouseMove();
    expect(container.classList.remove).toHaveBeenCalledWith('hide-cursor');
    expect(controls.showControls.value).toBe(true);

    vi.advanceTimersByTime(2999);
    expect(controls.showControls.value).toBe(true);
    vi.advanceTimersByTime(1);

    expect(controls.showControls.value).toBe(false);
    expect(container.classList.add).toHaveBeenCalledWith('hide-cursor');
    now.mockRestore();
  });

  it('does not hide controls while paused', () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const { controls, ctx } = createControls();
    ctx.player.isPlaying = false;

    controls.onMouseMove();
    vi.advanceTimersByTime(3000);

    expect(controls.showControls.value).toBe(true);
  });

  it('skips rescheduling for moves inside the grace window', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const { controls, ctx } = createControls();
    ctx.player.isPlaying = true;

    controls.onMouseMove();
    now = 100;
    controls.onMouseMove();

    vi.advanceTimersByTime(2900);
    expect(controls.showControls.value).toBe(true);
    vi.advanceTimersByTime(100);
    expect(controls.showControls.value).toBe(false);
  });

  it('does not touch cursor classes when cursor hiding is off', () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const ctx = createContext({
      settings: { playback: { cursorHide: false, cursorTimeout: 1 }, updatePlayback: vi.fn() }
    });
    ctx.player.isPlaying = true;
    const { controls } = createControls(ctx);

    controls.onMouseMove();
    vi.advanceTimersByTime(1000);

    expect(container.classList.add).not.toHaveBeenCalled();
    expect(container.classList.remove).not.toHaveBeenCalled();
  });
});

describe('clicks', () => {
  it('toggles playback after the single-click delay', () => {
    const { controls, ctx } = createControls();

    controls.handleClick();
    vi.advanceTimersByTime(179);
    expect(ctx.player.togglePlay).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(ctx.player.togglePlay).toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith('info', 'player.playing', undefined, 1000);
  });

  it('ignores clicks while PiP is active', () => {
    const { controls, ctx } = createControls();
    ctx.player.pipActive = true;

    controls.handleClick();
    vi.advanceTimersByTime(200);

    expect(ctx.player.togglePlay).not.toHaveBeenCalled();
  });

  it('cancels a pending single click on double click and toggles fullscreen', () => {
    const { controls, ctx } = createControls();

    controls.handleClick();
    controls.handleDoubleClick();
    vi.advanceTimersByTime(200);

    expect(ctx.player.togglePlay).not.toHaveBeenCalled();
    expect(
      (container as unknown as { requestFullscreen: ReturnType<typeof vi.fn> }).requestFullscreen
    ).toHaveBeenCalled();
  });

  it('clears timers on cleanup', () => {
    const { controls, ctx } = createControls();
    ctx.player.isPlaying = true;
    vi.spyOn(performance, 'now').mockReturnValue(0);

    controls.handleClick();
    controls.onMouseMove();
    controls.cleanup();

    vi.advanceTimersByTime(5000);
    expect(ctx.player.togglePlay).not.toHaveBeenCalled();
    expect(controls.showControls.value).toBe(true);
  });
});

describe('resume prompt callbacks', () => {
  it('resumes a video at the saved position', async () => {
    const { ctx } = createControls();
    void ctx;
    expect(state.resumeOptions).not.toBeNull();

    state.resumeOptions!.onContinue({ position: 12, path: '/v.mp4' });
    await Promise.resolve();

    expect(video.currentTime).toBe(12);
    expect(ctx.player.currentTime).toBe(12);
    expect(video.play).toHaveBeenCalled();
    expect(state.setPlaybackPosition).toHaveBeenCalledWith('/v.mp4', 12);
  });

  it('resumes audio through the audio player', () => {
    const { ctx } = createControls();
    ctx.player.currentTrack = { type: 'audio' };

    state.resumeOptions!.onContinue({ position: 8, path: '/a.mp3' });

    expect(state.audioSeek).toHaveBeenCalledWith(8);
    expect(ctx.player.currentTime).toBe(8);
    expect(state.audioPlay).toHaveBeenCalled();
    expect(state.setPlaybackPosition).toHaveBeenCalledWith('/a.mp3', 8);
  });

  it('clears saved positions when starting over', () => {
    const { ctx } = createControls();
    void ctx;

    state.resumeOptions!.onStart({ path: '/a.mp3' });

    expect(state.clearPlaybackPosition).toHaveBeenCalledWith('/a.mp3');
    expect(state.clearSavedPosition).toHaveBeenCalledWith('/a.mp3');
  });

  it('skips the local audio engine reset in Core shell', () => {
    state.isCoreShell.mockReturnValue(true);
    createControls();

    state.resumeOptions!.onStart({ path: '/a.mp3' });

    expect(state.clearSavedPosition).not.toHaveBeenCalled();
  });

  it('exposes the prompt controls', () => {
    const { controls } = createControls();
    expect(controls.pauseResumePrompt).toBe(state.pausePrompt);
    expect(controls.resumeResumePrompt).toBe(state.resumePrompt);
    expect(controls.isFullscreen.value).toBe(false);
  });
});
