import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive, ref } from 'vue';
import PlayerView from '../PlayerView.vue';

const state = vi.hoisted(() => ({
  player: null as any,
  settings: null as any,
  ui: {} as any,
  plugins: null as any,
  router: { back: vi.fn(), push: vi.fn(), replace: vi.fn() },
  pinned: null as any,
  togglePin: vi.fn(),
  vp: null as any,
  ctl: null as any,
  videoOptions: null as any,
  controlsOptions: null as any,
  pipOptions: null as any,
  setShortcutCtx: vi.fn(),
  setPiPHandler: vi.fn(),
  showVideoMenu: vi.fn(),
  showAudioMenu: vi.fn(),
  warn: vi.fn(),
  setPlaybackPosition: vi.fn(),
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-router', () => ({ useRouter: () => state.router }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@shared/logger', () => ({ logger: { warn: state.warn, info: vi.fn(), error: vi.fn() } }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => state.ui }));
vi.mock('@renderer/stores/plugins', () => ({ usePluginsStore: () => state.plugins }));
vi.mock('@renderer/composables/useAlwaysOnTop', () => ({
  useAlwaysOnTop: () => ({ pinned: state.pinned, togglePin: state.togglePin })
}));
vi.mock('@renderer/composables/usePiP', () => ({
  usePiP: (options: unknown) => {
    state.pipOptions = options;
    return { onClosed: 'pip' };
  }
}));
vi.mock('@renderer/composables/useVideoPlayer', () => ({
  useVideoPlayer: (options: unknown) => {
    state.videoOptions = options;
    return state.vp;
  }
}));
vi.mock('@renderer/composables/usePlayerControls', () => ({
  usePlayerControls: (options: unknown) => {
    state.controlsOptions = options;
    return state.ctl;
  }
}));
vi.mock('@renderer/composables/playerShortcutHandler', () => ({
  setPlayerShortcutCtx: state.setShortcutCtx
}));
vi.mock('@renderer/composables/playerPiPHandler', () => ({
  setPlayerPiPHandler: state.setPiPHandler
}));
vi.mock('@renderer/composables/usePlayerContextMenu', () => ({
  usePlayerContextMenu: () => ({
    showVideoMenu: state.showVideoMenu,
    showAudioMenu: state.showAudioMenu
  })
}));

const TopBarStub = defineComponent({
  props: ['showControls', 'track', 'pinned'],
  emits: ['back', 'pip', 'fullscreen', 'toggle-pin'],
  template: '<div data-testid="top-bar" />'
});
const ControlsStub = defineComponent({
  props: ['showControls', 'speed', 'videoRef'],
  emits: ['seek', 'volume-change', 'set-speed', 'skip'],
  template: '<div data-testid="controls" />'
});
const ResumeStub = defineComponent({
  props: ['position'],
  emits: ['continue', 'start', 'pause', 'resume'],
  template: '<div data-testid="resume" />'
});
const CoverStub = defineComponent({
  props: ['size', 'variant', 'decoration'],
  template: '<div data-testid="cover" />'
});
const VisualizerStub = { template: '<div data-testid="visualizer" />' };

let wrapper: VueWrapper | null = null;

function audioTrack(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    name: 'Song.mp3',
    path: 'C:/music/Song.mp3',
    type: 'audio',
    metadata: { title: 'Song title', artist: 'Artist' },
    ...overrides
  } as any;
}

function videoTrack(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v1',
    name: 'Clip.mp4',
    path: 'C:/video/Clip.mp4',
    type: 'video',
    ...overrides
  } as any;
}

function mountView() {
  wrapper = mount(PlayerView, {
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        PlayerTopBar: TopBarStub,
        PlayerControls: ControlsStub,
        ResumePrompt: ResumeStub,
        AudioCover: CoverStub,
        AudioVisualizer: VisualizerStub
      }
    }
  });
  return wrapper;
}

beforeEach(() => {
  state.player = reactive({
    currentTrack: audioTrack(),
    resumePrompt: null,
    pendingFullscreen: false,
    pipActive: false,
    abLoopTarget: vi.fn(() => null),
    exitPiP: vi.fn(),
    clearTrack: vi.fn()
  });
  state.settings = reactive({ playback: { playbackSpeed: 1.25 } });
  state.plugins = reactive({ decorations: { cover: { style: 'glow' } } });
  state.pinned = ref(false);
  state.togglePin.mockReset();
  state.router.back.mockReset();
  state.router.push.mockReset();
  state.router.replace.mockReset();
  state.setShortcutCtx.mockReset();
  state.setPiPHandler.mockReset();
  state.showVideoMenu.mockReset();
  state.showAudioMenu.mockReset();
  state.warn.mockReset();
  state.setPlaybackPosition.mockReset();
  state.setPlaybackPosition.mockResolvedValue(undefined);
  state.vp = {
    videoRef: ref(null),
    videoFilterStyle: ref({ filter: 'brightness(1)' }),
    init: vi.fn(),
    togglePiP: vi.fn(),
    syncSubtitlesWithPiP: vi.fn(),
    onVideoRef: vi.fn(),
    destroy: vi.fn()
  };
  state.ctl = {
    showControls: ref(true),
    isFullscreen: ref(false),
    onWheel: vi.fn(),
    onMouseMove: vi.fn(),
    handleClick: vi.fn(),
    handleDoubleClick: vi.fn(),
    skip: vi.fn(),
    setSpeed: vi.fn(),
    toggleFullscreen: vi.fn(),
    showToast: vi.fn(),
    onSeek: vi.fn(),
    onVolumeChange: vi.fn(),
    onResumeContinue: vi.fn(),
    onResumeStart: vi.fn(),
    pauseResumePrompt: vi.fn(),
    resumeResumePrompt: vi.fn(),
    cleanup: vi.fn()
  };
  state.videoOptions = null;
  state.controlsOptions = null;
  state.pipOptions = null;
  document.body.style.cursor = 'default';
  window.history.replaceState({}, '');
  (window as { api?: unknown }).api = { setPlaybackPosition: state.setPlaybackPosition };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  document.body.style.cursor = 'default';
  delete (window as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('guards', () => {
  it('returns home when there is no playable track', () => {
    state.player.currentTrack = null;
    mountView();
    expect(state.router.replace).toHaveBeenCalledWith('/');
    expect(state.vp.init).not.toHaveBeenCalled();
    expect(wrapper!.find('[data-testid="player-view"]').exists()).toBe(true);
  });

  it('returns home for unsupported track types', () => {
    state.player.currentTrack = { type: 'image' };
    mountView();
    expect(state.router.replace).toHaveBeenCalledWith('/');
    expect(state.vp.init).not.toHaveBeenCalled();
  });
});

describe('mount wiring', () => {
  it('initialises the video player and registers global handlers', () => {
    mountView();
    expect(state.vp.init).toHaveBeenCalledWith(state.player.currentTrack);
    expect(state.setShortcutCtx).toHaveBeenCalledWith(
      expect.objectContaining({
        player: state.player,
        settings: state.settings,
        skip: state.ctl.skip,
        setSpeed: state.ctl.setSpeed,
        toggleFullscreen: state.ctl.toggleFullscreen,
        notify: state.ctl.showToast
      })
    );
    expect(state.setPiPHandler).toHaveBeenCalledWith(state.vp.togglePiP);
    expect(state.videoOptions).toMatchObject({ player: state.player, settings: state.settings });
    expect(state.controlsOptions).toMatchObject({
      player: state.player,
      settings: state.settings,
      ui: state.ui
    });
  });

  it('toggles fullscreen after mount when requested', async () => {
    state.player.pendingFullscreen = true;
    mountView();
    await flushPromises();
    expect(state.ctl.toggleFullscreen).toHaveBeenCalled();
    expect(state.player.pendingFullscreen).toBe(false);
  });

  it('adds a passive wheel listener with an abort signal', () => {
    const addSpy = vi.spyOn(HTMLElement.prototype, 'addEventListener');
    mountView();
    const wheelCall = addSpy.mock.calls.find((call) => call[0] === 'wheel');
    expect(wheelCall?.[2]).toMatchObject({ passive: true, signal: expect.any(AbortSignal) });
  });

  it('updates fullscreen state on fullscreenchange', async () => {
    mountView();
    const element = document.createElement('div');
    Object.defineProperty(document, 'fullscreenElement', { value: element, configurable: true });
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(state.ctl.isFullscreen.value).toBe(true);

    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(state.ctl.isFullscreen.value).toBe(false);
  });
});

describe('audio surface', () => {
  it('renders the cover, metadata and visualizer', () => {
    mountView();
    expect(wrapper!.find('[data-testid="player-audio-surface"]').exists()).toBe(true);
    expect(wrapper!.text()).toContain('Song title');
    expect(wrapper!.text()).toContain('Artist');
    expect(wrapper!.findComponent(CoverStub).props()).toMatchObject({
      size: 'w-72 h-72',
      variant: 'rounded',
      decoration: state.plugins.decorations.cover
    });
    expect(wrapper!.find('[data-testid="visualizer"]').exists()).toBe(true);
  });

  it('falls back to the file name and empty artist', () => {
    state.player.currentTrack = audioTrack({ metadata: {} });
    mountView();
    expect(wrapper!.text()).toContain('Song.mp3');
  });

  it('opens the audio context menu with playback speed', async () => {
    mountView();
    await wrapper!.get('[data-testid="player-audio-surface"]').trigger('contextmenu');
    expect(state.showAudioMenu).toHaveBeenCalledWith(expect.any(MouseEvent), {
      setSpeed: state.ctl.setSpeed,
      currentSpeed: 1.25
    });
  });
});

describe('video surface', () => {
  it('renders the video element and skip zones', async () => {
    state.player.currentTrack = videoTrack();
    mountView();
    const video = wrapper!.get('video');
    expect(video.attributes('aria-label')).toBe('Clip.mp4');
    expect(video.attributes('style')).toContain('brightness(1)');

    const zones = wrapper!.findAll('button[aria-label]');
    expect(zones).toHaveLength(2);
    expect(zones[0].attributes('aria-label')).toBe('playerView.seekBackward');
    await zones[0].trigger('click');
    expect(state.ctl.skip).toHaveBeenCalledWith(-10);
    await zones[1].trigger('click');
    expect(state.ctl.skip).toHaveBeenLastCalledWith(10);
  });

  it('uses metadata for the accessible label', () => {
    state.player.currentTrack = videoTrack({ metadata: { title: 'My clip' } });
    mountView();
    expect(wrapper!.get('video').attributes('aria-label')).toBe('My clip');
  });

  it('delegates click and double click to controls', async () => {
    state.player.currentTrack = videoTrack();
    mountView();
    await wrapper!.get('video').trigger('click');
    await wrapper!.get('video').trigger('dblclick');
    expect(state.ctl.handleClick).toHaveBeenCalled();
    expect(state.ctl.handleDoubleClick).toHaveBeenCalled();
  });

  it('loops back to the A-B target on timeupdate', async () => {
    state.player.currentTrack = videoTrack();
    state.player.abLoopTarget.mockReturnValue(5);
    mountView();
    const video = wrapper!.get('video').element as HTMLVideoElement;
    video.currentTime = 30;
    await wrapper!.get('video').trigger('timeupdate');
    expect(state.player.abLoopTarget).toHaveBeenCalledWith(30);
    expect(video.currentTime).toBe(5);
  });

  it('leaves the time alone when no A-B loop applies', async () => {
    state.player.currentTrack = videoTrack();
    state.player.abLoopTarget.mockReturnValue(null);
    mountView();
    const video = wrapper!.get('video').element as HTMLVideoElement;
    video.currentTime = 30;
    await wrapper!.get('video').trigger('timeupdate');
    expect(video.currentTime).toBe(30);
  });

  it('opens the video context menu with speed and video player', async () => {
    state.player.currentTrack = videoTrack();
    mountView();
    await wrapper!.get('video').trigger('contextmenu');
    expect(state.showVideoMenu).toHaveBeenCalledWith(expect.any(MouseEvent), {
      vp: state.vp,
      setSpeed: state.ctl.setSpeed,
      currentSpeed: 1.25
    });
  });
});

describe('fallback surface', () => {
  it('shows the empty state and navigates to the explorer', async () => {
    state.player.currentTrack = audioTrack({ type: 'unknown' });
    state.vp.init.mockClear();
    mountView();
    expect(wrapper!.text()).toContain('playerView.noVideo');
    await wrapper!.get('button').trigger('click');
    expect(state.router.push).toHaveBeenCalledWith('/explorer');
  });
});

describe('top bar actions', () => {
  it('goes back in history when possible and falls back to home', async () => {
    mountView();
    const bar = wrapper!.findComponent(TopBarStub);
    window.history.replaceState({ back: '/library' }, '');
    bar.vm.$emit('back');
    expect(state.router.back).toHaveBeenCalled();

    window.history.replaceState({}, '');
    bar.vm.$emit('back');
    expect(state.router.push).toHaveBeenCalledWith('/');
  });

  it('forwards pip, fullscreen and pin actions', () => {
    mountView();
    const bar = wrapper!.findComponent(TopBarStub);
    bar.vm.$emit('pip');
    bar.vm.$emit('fullscreen');
    bar.vm.$emit('toggle-pin');
    expect(state.vp.togglePiP).toHaveBeenCalled();
    expect(state.ctl.toggleFullscreen).toHaveBeenCalled();
    expect(state.togglePin).toHaveBeenCalled();
  });

  it('passes controls, track and pin state', () => {
    mountView();
    expect(wrapper!.findComponent(TopBarStub).props()).toMatchObject({
      showControls: true,
      track: state.player.currentTrack,
      pinned: false
    });
    expect(wrapper!.findComponent(ControlsStub).props()).toMatchObject({
      showControls: true,
      speed: 1.25
    });
  });
});

describe('PiP callbacks', () => {
  function fakeVideo() {
    const video = { currentTime: 0, play: vi.fn().mockResolvedValue(undefined) };
    state.vp.videoRef.value = video;
    return video;
  }

  it('restores playback when PiP closes', () => {
    mountView();
    const video = fakeVideo();
    state.pipOptions.onClosed(42);
    expect(state.player.exitPiP).toHaveBeenCalledWith(42);
    expect(video.currentTime).toBe(42);
    expect(video.play).toHaveBeenCalled();
    expect(state.vp.syncSubtitlesWithPiP).toHaveBeenCalled();
  });

  it('maximises from PiP', () => {
    mountView();
    const video = fakeVideo();
    state.pipOptions.onMaximize(12);
    expect(state.player.exitPiP).toHaveBeenCalledWith(12);
    expect(video.currentTime).toBe(12);
    expect(state.ctl.toggleFullscreen).toHaveBeenCalled();
  });

  it('tolerates missing video elements and rejected play calls', async () => {
    mountView();
    state.vp.videoRef.value = null;
    expect(() => state.pipOptions.onClosed(1)).not.toThrow();

    const video = { currentTime: 0, play: vi.fn().mockRejectedValue(new Error('blocked')) };
    state.vp.videoRef.value = video;
    state.pipOptions.onClosed(2);
    await Promise.resolve();
    expect(video.play).toHaveBeenCalled();
  });
});

describe('resume prompt and controls', () => {
  it('renders the resume prompt and forwards its actions', async () => {
    state.player.resumePrompt = { position: 30 };
    mountView();
    const prompt = wrapper!.findComponent(ResumeStub);
    expect(prompt.props('position')).toBe(30);
    prompt.vm.$emit('continue');
    prompt.vm.$emit('start');
    prompt.vm.$emit('pause');
    prompt.vm.$emit('resume');
    expect(state.ctl.onResumeContinue).toHaveBeenCalled();
    expect(state.ctl.onResumeStart).toHaveBeenCalled();
    expect(state.ctl.pauseResumePrompt).toHaveBeenCalled();
    expect(state.ctl.resumeResumePrompt).toHaveBeenCalled();
  });

  it('forwards control events', () => {
    mountView();
    const controls = wrapper!.findComponent(ControlsStub);
    controls.vm.$emit('seek', 10);
    controls.vm.$emit('volume-change', 0.5);
    controls.vm.$emit('set-speed', 2);
    controls.vm.$emit('skip', 15);
    expect(state.ctl.onSeek).toHaveBeenCalledWith(10);
    expect(state.ctl.onVolumeChange).toHaveBeenCalledWith(0.5);
    expect(state.ctl.setSpeed).toHaveBeenCalledWith(2);
    expect(state.ctl.skip).toHaveBeenCalledWith(15);
  });
});

describe('unmount cleanup', () => {
  function fakeVideo(currentTime: number) {
    const video = { currentTime, play: vi.fn() };
    state.vp.videoRef.value = video;
    return video;
  }

  it('clears handlers, destroys the player and resets the cursor', () => {
    state.player.currentTrack = videoTrack();
    mountView();
    fakeVideo(30);
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    wrapper!.unmount();
    wrapper = null;

    expect(state.setShortcutCtx).toHaveBeenLastCalledWith(null);
    expect(state.setPiPHandler).toHaveBeenLastCalledWith(null);
    expect(removeSpy).toHaveBeenCalledWith('fullscreenchange', expect.any(Function));
    expect(state.ctl.cleanup).toHaveBeenCalled();
    expect(state.vp.destroy).toHaveBeenCalled();
    expect(document.body.style.cursor).toBe('default');
    expect(state.player.clearTrack).toHaveBeenCalled();
  });

  it('saves local playback positions above five seconds', () => {
    state.player.currentTrack = videoTrack();
    mountView();
    fakeVideo(30);
    wrapper!.unmount();
    wrapper = null;
    expect(state.setPlaybackPosition).toHaveBeenCalledWith('C:/video/Clip.mp4', 30);
  });

  it('skips saving for short positions and remote URLs', () => {
    state.player.currentTrack = videoTrack();
    mountView();
    fakeVideo(5);
    wrapper!.unmount();
    wrapper = null;
    expect(state.setPlaybackPosition).not.toHaveBeenCalled();

    state.player.currentTrack = videoTrack({ path: 'https://cdn.example/clip.mp4' });
    mountView();
    fakeVideo(30);
    wrapper!.unmount();
    wrapper = null;
    expect(state.setPlaybackPosition).not.toHaveBeenCalled();
  });

  it('logs position save failures', async () => {
    state.player.currentTrack = videoTrack();
    state.setPlaybackPosition.mockRejectedValueOnce(new Error('disk'));
    mountView();
    fakeVideo(30);
    wrapper!.unmount();
    wrapper = null;
    await flushPromises();
    expect(state.warn).toHaveBeenCalledWith(
      'player',
      'saving playback position failed',
      expect.any(Error)
    );
  });

  it('keeps the track when the user stays in PiP', () => {
    state.player.currentTrack = videoTrack();
    state.player.pipActive = true;
    mountView();
    fakeVideo(10);
    wrapper!.unmount();
    wrapper = null;
    expect(state.player.clearTrack).not.toHaveBeenCalled();
  });

  it('keeps audio tracks when leaving the player', () => {
    mountView();
    wrapper!.unmount();
    wrapper = null;
    expect(state.player.clearTrack).not.toHaveBeenCalled();
  });
});
