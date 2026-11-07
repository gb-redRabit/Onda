import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, reactive, ref } from 'vue';
import { useAudioImmersive } from '../useAudioImmersive';

const state = vi.hoisted(() => ({
  audio: null as any,
  player: null as any,
  settings: null as any,
  options: null as any,
  onDragMove: vi.fn(),
  dragging: false,
  holdUI: false,
  fullscreenElement: null as Element | null,
  exitFullscreen: vi.fn()
}));

vi.mock('@renderer/composables/useAudioPlayer', () => ({
  useAudioPlayer: () => state.audio
}));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));

const Harness = defineComponent({
  setup() {
    const api = useAudioImmersive(state.options);
    return api;
  },
  render() {
    return h('div');
  }
});

let wrapper: VueWrapper | null = null;

function mountImmersive() {
  wrapper = mount(Harness, { attachTo: document.body });
  return wrapper;
}

function viewElement(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  (wrapper!.vm as unknown as { setViewEl: (el: unknown) => void }).setViewEl(el);
  return el;
}

function key(init: KeyboardEventInit, target: EventTarget = document.body) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  vi.useFakeTimers();
  state.audio = {
    isPlaying: ref(false),
    currentTime: ref(0),
    duration: ref(100),
    volume: ref(0.5),
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn()
  };
  state.player = reactive({
    currentTrack: { path: 'C:\\music\\a.mp3' },
    toggleMute: vi.fn(),
    toggleFavorite: vi.fn()
  });
  state.settings = reactive({
    playback: { cursorTimeout: 1, cursorHide: true }
  });
  state.onDragMove.mockReset();
  state.dragging = false;
  state.holdUI = false;
  state.fullscreenElement = null;
  state.exitFullscreen = vi.fn(async () => undefined);
  state.options = {
    isDragging: () => state.dragging,
    onDragMove: state.onDragMove,
    showLayoutEditor: ref(false),
    holdUI: () => state.holdUI
  };
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => state.fullscreenElement
  });
  document.exitFullscreen = state.exitFullscreen;
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('auto hiding', () => {
  it('hides the UI and cursor after the configured delay', async () => {
    state.audio.isPlaying.value = true;
    mountImmersive();
    const el = viewElement();

    await vi.advanceTimersByTimeAsync(1000);
    expect((wrapper!.vm as any).showUI).toBe(false);
    expect(el.classList.contains('hide-cursor')).toBe(true);
  });

  it('keeps the UI while holdUI is active', async () => {
    state.audio.isPlaying.value = true;
    state.holdUI = true;
    mountImmersive();
    const el = viewElement();

    await vi.advanceTimersByTimeAsync(1000);
    expect((wrapper!.vm as any).showUI).toBe(true);
    expect(el.classList.contains('hide-cursor')).toBe(false);
  });

  it('keeps the UI when cursor hiding is disabled', async () => {
    state.audio.isPlaying.value = true;
    state.settings.playback.cursorHide = false;
    mountImmersive();
    viewElement();

    await vi.advanceTimersByTimeAsync(1500);
    expect((wrapper!.vm as any).showUI).toBe(true);
  });

  it('does not hide while paused', async () => {
    mountImmersive();
    viewElement();
    await vi.advanceTimersByTimeAsync(2000);
    expect((wrapper!.vm as any).showUI).toBe(true);
  });

  it('shows the UI and forwards drags on mouse move', async () => {
    state.audio.isPlaying.value = true;
    state.dragging = true;
    mountImmersive();
    const el = viewElement();

    await vi.advanceTimersByTimeAsync(1000);
    expect((wrapper!.vm as any).showUI).toBe(false);

    const event = new MouseEvent('mousemove', { clientX: 10, clientY: 20 });
    (wrapper!.vm as any).onMouseMove(event);

    expect(state.onDragMove).toHaveBeenCalledWith(event);
    expect((wrapper!.vm as any).showUI).toBe(true);
    expect(el.classList.contains('hide-cursor')).toBe(false);
  });

  it('debounces the hide timer and reschedules after a third of the delay', async () => {
    state.audio.isPlaying.value = true;
    mountImmersive();
    viewElement();

    await vi.advanceTimersByTimeAsync(700);
    (wrapper!.vm as any).onMouseMove(new MouseEvent('mousemove'));

    await vi.advanceTimersByTimeAsync(999);
    expect((wrapper!.vm as any).showUI).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    expect((wrapper!.vm as any).showUI).toBe(false);
  });

  it('reacts to playback changes', async () => {
    mountImmersive();
    const el = viewElement();

    state.audio.isPlaying.value = true;
    await wrapper!.vm.$nextTick();
    await vi.advanceTimersByTimeAsync(1000);
    expect((wrapper!.vm as any).showUI).toBe(false);

    state.audio.isPlaying.value = false;
    await wrapper!.vm.$nextTick();
    expect((wrapper!.vm as any).showUI).toBe(true);
    expect(el.classList.contains('hide-cursor')).toBe(false);

    await vi.advanceTimersByTimeAsync(2000);
    expect((wrapper!.vm as any).showUI).toBe(true);
  });

  it('uses the default cursor timeout when unset', async () => {
    state.audio.isPlaying.value = true;
    state.settings.playback.cursorTimeout = undefined;
    mountImmersive();
    viewElement();

    await vi.advanceTimersByTimeAsync(2999);
    expect((wrapper!.vm as any).showUI).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect((wrapper!.vm as any).showUI).toBe(false);
  });
});

describe('seeking and keyboard', () => {
  it('clamps skips to the media duration', () => {
    state.audio.currentTime.value = 95;
    mountImmersive();

    (wrapper!.vm as any).skip(10);
    expect(state.audio.seek).toHaveBeenLastCalledWith(100);

    (wrapper!.vm as any).skip(-200);
    expect(state.audio.seek).toHaveBeenLastCalledWith(0);
  });

  it('handles playback and seek shortcuts', () => {
    state.audio.currentTime.value = 40;
    mountImmersive();

    const event = key({ key: ' ' });
    expect(event.defaultPrevented).toBe(true);
    expect(state.audio.play).toHaveBeenCalled();

    state.audio.isPlaying.value = true;
    key({ key: 'k' });
    expect(state.audio.pause).toHaveBeenCalled();

    key({ key: 'ArrowLeft' });
    expect(state.audio.seek).toHaveBeenLastCalledWith(30);
    key({ key: 'ArrowRight', shiftKey: true });
    expect(state.audio.seek).toHaveBeenLastCalledWith(70);

    state.audio.volume.value = 0.98;
    key({ key: 'ArrowUp' });
    expect(state.audio.setVolume).toHaveBeenLastCalledWith(1);
    state.audio.volume.value = 0.02;
    key({ key: 'ArrowDown' });
    expect(state.audio.setVolume).toHaveBeenLastCalledWith(0);

    key({ key: 'm' });
    expect(state.player.toggleMute).toHaveBeenCalled();

    key({ key: '0' });
    expect(state.audio.seek).toHaveBeenLastCalledWith(0);

    key({ key: 'f' });
    expect(state.player.toggleFavorite).toHaveBeenCalledWith('C:\\music\\a.mp3');
  });

  it('ignores shortcuts for form controls and the layout editor', () => {
    state.options.showLayoutEditor.value = true;
    mountImmersive();
    state.audio.play.mockClear();
    state.audio.seek.mockClear();

    key({ key: ' ' });
    expect(state.audio.play).not.toHaveBeenCalled();

    state.options.showLayoutEditor.value = false;
    const input = document.createElement('input');
    document.body.appendChild(input);
    key({ key: ' ' }, input);
    expect(state.audio.play).not.toHaveBeenCalled();

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    key({ key: 'ArrowRight' }, textarea);
    expect(state.audio.seek).not.toHaveBeenCalled();

    const button = document.createElement('button');
    document.body.appendChild(button);
    key({ key: 'ArrowRight' }, button);
    expect(state.audio.seek).not.toHaveBeenCalled();

    const editable = document.createElement('div');
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    document.body.appendChild(editable);
    key({ key: ' ' }, editable);
    expect(state.audio.play).not.toHaveBeenCalled();
  });

  it('skips favorite when nothing is playing', () => {
    state.player.currentTrack = null;
    mountImmersive();
    key({ key: 'f' });
    expect(state.player.toggleFavorite).not.toHaveBeenCalled();
  });
});

describe('fullscreen', () => {
  it('requests and exits fullscreen', async () => {
    mountImmersive();
    const el = viewElement();
    el.requestFullscreen = vi.fn(async () => undefined);

    (wrapper!.vm as any).toggleFullscreen();
    await Promise.resolve();
    expect(el.requestFullscreen).toHaveBeenCalled();
    expect((wrapper!.vm as any).isFullscreen).toBe(true);
    expect((wrapper!.vm as any).showUI).toBe(false);

    (wrapper!.vm as any).toggleFullscreen();
    await Promise.resolve();
    expect(state.exitFullscreen).toHaveBeenCalled();
    expect((wrapper!.vm as any).isFullscreen).toBe(false);
    expect((wrapper!.vm as any).showUI).toBe(true);
  });

  it('swallows fullscreen request and exit failures', async () => {
    mountImmersive();
    const el = viewElement();
    el.requestFullscreen = vi.fn(async () => {
      throw new Error('denied');
    });

    (wrapper!.vm as any).toggleFullscreen();
    await Promise.resolve();
    expect((wrapper!.vm as any).isFullscreen).toBe(false);

    (wrapper!.vm as any).isFullscreen = true;
    state.exitFullscreen.mockRejectedValueOnce(new Error('nope'));
    (wrapper!.vm as any).toggleFullscreen();
    await Promise.resolve();
    expect((wrapper!.vm as any).isFullscreen).toBe(true);
  });

  it('does nothing without a view element', () => {
    mountImmersive();
    expect(() => (wrapper!.vm as any).toggleFullscreen()).not.toThrow();
  });

  it('handles F11/Escape only while fullscreen', async () => {
    mountImmersive();
    const el = viewElement();
    el.requestFullscreen = vi.fn(async () => undefined);

    key({ key: 'F11' });
    expect((wrapper!.vm as any).isFullscreen).toBe(false);

    (wrapper!.vm as any).toggleFullscreen();
    await Promise.resolve();
    expect((wrapper!.vm as any).isFullscreen).toBe(true);

    const event = key({ key: 'Escape' });
    expect(event.defaultPrevented).toBe(true);
    await Promise.resolve();
    expect((wrapper!.vm as any).isFullscreen).toBe(false);
  });

  it('resets state when the browser leaves fullscreen', async () => {
    mountImmersive();
    viewElement();
    (wrapper!.vm as any).isFullscreen = true;
    (wrapper!.vm as any).showUI = false;

    document.dispatchEvent(new Event('fullscreenchange'));
    expect((wrapper!.vm as any).isFullscreen).toBe(false);
    expect((wrapper!.vm as any).showUI).toBe(true);
  });
});

describe('cleanup', () => {
  it('removes listeners and exits fullscreen on unmount', async () => {
    mountImmersive();
    viewElement();
    state.fullscreenElement = document.body;

    wrapper!.unmount();
    wrapper = null;
    expect(state.exitFullscreen).toHaveBeenCalled();

    state.audio.play.mockClear();
    key({ key: ' ' });
    expect(state.audio.play).not.toHaveBeenCalled();
  });

  it('clears the pending hide timer on unmount', async () => {
    state.audio.isPlaying.value = true;
    mountImmersive();
    viewElement();

    wrapper!.unmount();
    wrapper = null;
    await vi.advanceTimersByTimeAsync(5000);
    expect(state.audio.pause).not.toHaveBeenCalled();
  });
});
