import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, reactive } from 'vue';
import { mount } from '@vue/test-utils';

// Audio PiP: store/ustawienia, runtime, zdarzenia i preload są podstawione.
// Composable jest singletonem, więc każdy test montuje i odmontowuje właściciela.
const state = vi.hoisted(() => ({
  player: null as any,
  settings: null as any,
  pipState: { trackName: 'Song', isPlaying: true } as Record<string, unknown>,
  layout: { dock: 'bottom-right' } as Record<string, unknown>,
  mediaPlaying: { value: false },
  duration: { value: 120 },
  audioSeek: vi.fn(),
  runtime: {
    setLastState: vi.fn(),
    startCoverRetry: vi.fn(),
    startTimeTracking: vi.fn(),
    startVizTracking: vi.fn(),
    stopAll: vi.fn(),
    sendUpdate: vi.fn(),
    stopTimeTracking: vi.fn(),
    stopVizTracking: vi.fn()
  },
  dispatchAction: vi.fn(),
  isCoreShell: vi.fn(() => false),
  audioEvents: new Map<string, (value?: unknown) => void>(),
  apiListeners: new Map<string, (value?: unknown) => void>(),
  unsubscribers: [] as Array<ReturnType<typeof vi.fn>>,
  apiShow: vi.fn(async () => true),
  apiHide: vi.fn(async () => true),
  apiPrewarm: vi.fn(async () => true),
  apiRelease: vi.fn(async () => true),
  hidden: false
}));

vi.mock('@renderer/utils/audioEvents', () => ({
  audioEvents: {
    on: (event: string, listener: (value?: unknown) => void) => {
      state.audioEvents.set(event, listener);
      const unsubscribe = vi.fn();
      state.unsubscribers.push(unsubscribe);
      return unsubscribe;
    }
  }
}));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/composables/useAudioPlayer', () => ({
  duration: state.duration,
  isPlaying: state.mediaPlaying,
  useAudioPlayer: () => ({ seek: state.audioSeek })
}));
vi.mock('../audioPipState', () => ({
  buildAudioPipState: () => state.pipState,
  resolveAudioPipLayoutOpts: () => state.layout
}));
vi.mock('../audioPipRuntime', () => ({
  createAudioPipRuntime: () => state.runtime
}));
vi.mock('../audioPipActions', () => ({
  dispatchAudioPipAction: state.dispatchAction
}));
vi.mock('@renderer/utils/runtimeMode', () => ({ isCoreShell: () => state.isCoreShell() }));

const { useAudioPiP } = await import('../useAudioPiP');

interface MountOptions {
  prewarm?: boolean | 'track';
}

let wrappers: Array<{ unmount: () => void }> = [];
let lastApi: ReturnType<typeof useAudioPiP> | null = null;

function mountPiP(options: MountOptions = {}) {
  let api!: ReturnType<typeof useAudioPiP>;
  const Comp = defineComponent({
    setup() {
      api = useAudioPiP(options);
      return () => h('div');
    }
  });
  const wrapper = mount(Comp, { attachTo: document.body });
  wrappers.push(wrapper);
  lastApi = api;
  return { api, wrapper };
}

function installApi(): void {
  (window as { api?: unknown }).api = {
    audioPipShow: state.apiShow,
    audioPipHide: state.apiHide,
    audioPipPrewarm: state.apiPrewarm,
    audioPipRelease: state.apiRelease,
    on: (event: string, listener: (value?: unknown) => void) => {
      state.apiListeners.set(event, listener);
      const unsubscribe = vi.fn();
      state.unsubscribers.push(unsubscribe);
      return unsubscribe;
    }
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  state.player = reactive({
    currentTrack: null as { type: string } | null,
    isPlaying: false
  });
  state.settings = reactive({
    appearance: {
      audioPipDock: 'bottom-right',
      audioPipCornerElements: ['trackInfo'],
      audioPipEdgeElements: ['viz'],
      audioPipAutoHide: true
    }
  });
  state.pipState = { trackName: 'Song', isPlaying: true };
  state.layout = { dock: 'bottom-right' };
  state.mediaPlaying.value = false;
  state.duration.value = 120;
  state.audioSeek.mockClear();
  for (const fn of Object.values(state.runtime)) fn.mockClear();
  state.dispatchAction.mockClear();
  state.isCoreShell.mockReset();
  state.isCoreShell.mockReturnValue(false);
  state.audioEvents.clear();
  state.apiListeners.clear();
  state.unsubscribers = [];
  state.apiShow.mockClear();
  state.apiHide.mockClear();
  state.apiPrewarm.mockClear();
  state.apiRelease.mockClear();
  state.hidden = false;
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => state.hidden
  });
  installApi();
  wrappers = [];
  lastApi = null;
});

afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount();
  wrappers = [];
  if (lastApi) {
    lastApi.isActive.value = false;
    lastApi.dock.value = 'bottom-right';
    lastApi.setAutoShow(true);
  }
  delete (window as { api?: unknown }).api;
  vi.useRealTimers();
});

describe('mount and event wiring', () => {
  it('registers IPC, audio events and visibility on mount', () => {
    mountPiP();
    expect([...state.apiListeners.keys()]).toEqual([
      'audio-pip:closed',
      'audio-pip:action',
      'audio-pip:progressClick'
    ]);
    expect([...state.audioEvents.keys()]).toEqual(['trackLoaded', 'playStateChange']);
    expect(state.apiPrewarm).not.toHaveBeenCalled();
  });

  it('does nothing without the preload bridge', () => {
    delete (window as { api?: unknown }).api;
    const { wrapper } = mountPiP();
    expect(state.apiListeners.size).toBe(0);
    expect(() => wrapper.unmount()).not.toThrow();
  });

  it('prewarms immediately when requested', () => {
    mountPiP({ prewarm: true });
    expect(state.apiPrewarm).toHaveBeenCalledTimes(1);
  });

  it('prewarms on the first track when using track mode', async () => {
    const { api } = mountPiP({ prewarm: 'track' });
    expect(state.apiPrewarm).not.toHaveBeenCalled();

    state.player.currentTrack = { type: 'audio' };
    state.audioEvents.get('trackLoaded')!();
    await nextTick();

    expect(state.apiPrewarm).toHaveBeenCalledTimes(1);
    expect(api.isActive.value).toBe(false);
  });

  it('cleans up listeners and runtime on unmount', () => {
    const { wrapper } = mountPiP({ prewarm: true });
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    wrapper.unmount();
    wrappers = [];

    expect(state.runtime.stopAll).toHaveBeenCalled();
    expect(state.unsubscribers.every((fn) => fn.mock.calls.length === 1)).toBe(true);
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });
});

describe('show, hide and toggle', () => {
  it('shows only when there is a track name', async () => {
    const { api } = mountPiP();

    state.pipState = { trackName: '', isPlaying: false };
    await api.show();
    expect(state.apiShow).not.toHaveBeenCalled();

    state.pipState = { trackName: 'Song', isPlaying: true };
    await api.show();

    expect(api.isActive.value).toBe(true);
    expect(state.runtime.setLastState).toHaveBeenCalledWith(state.pipState);
    expect(state.apiShow).toHaveBeenCalledWith(state.pipState, state.layout);
    expect(state.runtime.startCoverRetry).toHaveBeenCalled();
    expect(state.runtime.startTimeTracking).toHaveBeenCalled();
    expect(state.runtime.startVizTracking).toHaveBeenCalled();
  });

  it('hides the PiP and stops runtime work', async () => {
    const { api } = mountPiP();
    await api.show();

    await api.hide();

    expect(api.isActive.value).toBe(false);
    expect(state.runtime.stopAll).toHaveBeenCalled();
    expect(state.apiHide).toHaveBeenCalled();
  });

  it('toggles based on the active flag', async () => {
    const { api } = mountPiP();

    await api.toggle();
    expect(state.apiShow).toHaveBeenCalled();
    await api.toggle();
    expect(state.apiHide).toHaveBeenCalled();
  });
});

describe('visibility and IPC events', () => {
  it('shows audio PiP when the document is hidden and audio is playing', async () => {
    const { api } = mountPiP();
    state.player.currentTrack = { type: 'audio' };
    state.mediaPlaying.value = true;
    state.hidden = true;

    document.dispatchEvent(new Event('visibilitychange'));
    await nextTick();

    expect(api.isActive.value).toBe(true);
    expect(state.apiShow).toHaveBeenCalled();
  });

  it('does not show for videos, streams without playing audio, or disabled autoshow', async () => {
    const { api } = mountPiP();
    state.player.currentTrack = { type: 'video' };
    state.mediaPlaying.value = true;
    state.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await nextTick();
    expect(api.isActive.value).toBe(false);

    state.player.currentTrack = { type: 'audio' };
    state.mediaPlaying.value = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await nextTick();
    expect(api.isActive.value).toBe(false);

    state.mediaPlaying.value = true;
    api.setAutoShow(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await nextTick();
    expect(api.isActive.value).toBe(false);
  });

  it('hides when the document becomes visible', async () => {
    const { api } = mountPiP();
    await api.show();
    state.mediaPlaying.value = false;
    state.hidden = false;

    document.dispatchEvent(new Event('visibilitychange'));
    await nextTick();

    expect(api.isActive.value).toBe(false);
    expect(state.apiHide).toHaveBeenCalled();
  });

  it('handles closed, action and progress events', async () => {
    const { api } = mountPiP();
    await api.show();

    state.apiListeners.get('audio-pip:closed')!();
    expect(api.isActive.value).toBe(false);
    expect(state.runtime.stopAll).toHaveBeenCalled();

    state.apiListeners.get('audio-pip:action')!('play');
    expect(state.dispatchAction).toHaveBeenCalledWith('play');

    state.apiListeners.get('audio-pip:progressClick')!(0.5);
    expect(state.audioSeek).toHaveBeenCalledWith(60);
  });
});

describe('audio events', () => {
  it('pushes state and refreshes tracking on track change', async () => {
    const { api } = mountPiP();
    await api.show();
    state.runtime.sendUpdate.mockClear();
    state.runtime.startCoverRetry.mockClear();

    state.audioEvents.get('trackLoaded')!();

    expect(state.runtime.sendUpdate).toHaveBeenCalledWith(state.pipState);
    expect(state.runtime.startCoverRetry).toHaveBeenCalled();
    expect(state.runtime.startTimeTracking).toHaveBeenCalled();
    expect(state.runtime.startVizTracking).toHaveBeenCalled();
  });

  it('stops tracking when playback pauses', async () => {
    const { api } = mountPiP();
    await api.show();

    state.audioEvents.get('playStateChange')!(false);

    expect(state.runtime.sendUpdate).toHaveBeenCalledWith({ ...state.pipState, isPlaying: false });
    expect(state.runtime.stopTimeTracking).toHaveBeenCalled();
    expect(state.runtime.stopVizTracking).toHaveBeenCalled();
  });

  it('auto-shows on play while hidden and inactive', async () => {
    const { api } = mountPiP();
    state.hidden = true;
    state.mediaPlaying.value = true;

    state.audioEvents.get('playStateChange')!(true);
    await nextTick();

    expect(api.isActive.value).toBe(true);
    expect(state.apiShow).toHaveBeenCalled();
  });

  it('ignores track and play events while inactive', async () => {
    mountPiP();

    state.audioEvents.get('trackLoaded')!();
    state.audioEvents.get('playStateChange')!(true);

    expect(state.runtime.sendUpdate).not.toHaveBeenCalled();
    expect(state.runtime.startTimeTracking).not.toHaveBeenCalled();
  });
});

describe('settings and Core shell', () => {
  it('tracks the dock setting and pushes updates while active', async () => {
    const { api } = mountPiP();
    expect(api.dock.value).toBe('bottom-right');
    await api.show();
    state.runtime.sendUpdate.mockClear();

    state.settings.appearance.audioPipDock = 'left';
    await nextTick();

    expect(api.dock.value).toBe('left');
    expect(state.runtime.sendUpdate).toHaveBeenCalledWith(state.pipState);
  });

  it('does not push settings updates while inactive', async () => {
    const { api } = mountPiP();
    state.runtime.sendUpdate.mockClear();

    state.settings.appearance.audioPipEdgeElements = ['controls'];
    await nextTick();

    expect(state.runtime.sendUpdate).not.toHaveBeenCalled();
    expect(api.dock.value).toBe('bottom-right');
  });

  it('watches the player store in Core shell mode', async () => {
    state.isCoreShell.mockReturnValue(true);
    const { api } = mountPiP();
    await api.show();
    state.runtime.sendUpdate.mockClear();

    state.player.currentTrack = { type: 'audio' };
    await nextTick();
    expect(state.runtime.sendUpdate).toHaveBeenCalled();

    state.player.isPlaying = true;
    await nextTick();
    state.player.isPlaying = false;
    await nextTick();
    expect(state.runtime.stopTimeTracking).toHaveBeenCalled();
    expect(state.runtime.stopVizTracking).toHaveBeenCalled();
  });
});

describe('idle window release', () => {
  it('releases an idle PiP window after five minutes', async () => {
    const { api } = mountPiP();
    await api.show();
    await api.hide();
    state.mediaPlaying.value = false;

    vi.advanceTimersByTime(5 * 60 * 1000);

    expect(state.apiRelease).toHaveBeenCalledTimes(1);
  });

  it('keeps the window while PiP is active', async () => {
    const { api } = mountPiP({ prewarm: true });
    await api.show();

    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(state.apiRelease).not.toHaveBeenCalled();

    await api.hide();
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(state.apiRelease).toHaveBeenCalledTimes(1);
  });

  it('keeps the window while audio is playing', async () => {
    mountPiP({ prewarm: true });
    state.mediaPlaying.value = true;

    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(state.apiRelease).not.toHaveBeenCalled();

    state.mediaPlaying.value = false;
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(state.apiRelease).toHaveBeenCalledTimes(1);
  });

  it('disarms the release timer on unmount', () => {
    const { wrapper } = mountPiP({ prewarm: true });
    wrapper.unmount();
    wrappers = [];

    vi.advanceTimersByTime(5 * 60 * 1000);

    expect(state.apiRelease).not.toHaveBeenCalled();
  });
});
