/* eslint-disable vue/one-component-per-file -- in-file test harnesses for the composables */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { EQ_PRESETS, usePipAudioState } from '../usePipAudioState';
import { usePipVisualizer } from '../usePipVisualizer';

const state = vi.hoisted(() => ({
  send: vi.fn(),
  on: vi.fn(),
  updateAccent: vi.fn(),
  handlers: {} as Record<string, (...args: unknown[]) => void>,
  cleanups: {} as Record<string, ReturnType<typeof vi.fn>>,
  raf: null as FrameRequestCallback | null,
  rafId: 0,
  cancelRaf: vi.fn(),
  ctx: null as any,
  hidden: false
}));

const AudioHarness = defineComponent({
  setup() {
    return usePipAudioState({ updateAccent: state.updateAccent });
  },
  template: '<div />'
});

const VizHarness = defineComponent({
  setup() {
    const data = ref<number[]>([0, 0, 0, 0]);
    const vertical = ref(false);
    const api = usePipVisualizer(data, vertical);
    return { ...api, data, vertical };
  },
  template: '<div id="viz-parent"><canvas ref="vizCanvas" /></div>'
});

let wrapper: VueWrapper | null = null;

function fakeCtx() {
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    fillRect: vi.fn(),
    globalAlpha: 1,
    fillStyle: ''
  };
}

function mountAudio() {
  wrapper = mount(AudioHarness, { attachTo: document.body });
  return wrapper;
}

function mountViz() {
  wrapper = mount(VizHarness, { attachTo: document.body });
  return wrapper;
}

function vm<T = Record<string, any>>(): T {
  return wrapper!.vm as unknown as T;
}

function emit(event: string, ...args: unknown[]): void {
  state.handlers[event]?.(...args);
}

function flushFrame(): void {
  const cb = state.raf;
  state.raf = null;
  cb?.(16);
}

function canvas(): HTMLCanvasElement {
  return wrapper!.get('canvas').element as HTMLCanvasElement;
}

function parent(): HTMLElement {
  const el = wrapper!.get('#viz-parent').element as HTMLElement;
  Object.defineProperty(el, 'clientWidth', { value: 480, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 120, configurable: true });
  return el;
}

beforeEach(() => {
  vi.useFakeTimers();
  state.send.mockReset();
  state.updateAccent.mockReset();
  state.handlers = {};
  state.cleanups = {};
  state.on.mockReset();
  state.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
    state.handlers[event] = cb;
    const cleanup = vi.fn();
    state.cleanups[event] = cleanup;
    return cleanup;
  });
  state.ctx = fakeCtx();
  state.raf = null;
  state.rafId = 0;
  state.cancelRaf.mockReset();
  state.hidden = false;
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => state.hidden
  });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    state.raf = cb;
    return ++state.rafId;
  });
  vi.stubGlobal('cancelAnimationFrame', state.cancelRaf);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => state.ctx as unknown as CanvasRenderingContext2D
  );
  (window as { api?: unknown }).api = { send: state.send, on: state.on };
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete (window as { api?: unknown }).api;
});

describe('usePipAudioState', () => {
  it('starts with sane defaults and computes presentation values', () => {
    mountAudio();
    const s = vm();

    expect(s.trackName).toBe('—');
    expect(s.isPlaying).toBe(false);
    expect(s.volume).toBe(1);
    expect(s.progressPct).toBe(0);
    expect(s.volPct).toBe('100%');
    expect(s.volLabel).toBe('VOL');
    expect(s.isVertical).toBe(false);
    expect(s.isBar).toBe(false);
    expect(s.isVideoCover).toBe(false);
    expect(s.has('cover')).toBe(true);
    expect(s.has('viz')).toBe(false);
    expect(EQ_PRESETS[0]).toEqual({ id: 'flat', label: expect.any(String) });
  });

  it('derives progress, volume and video-cover values', async () => {
    mountAudio();
    emit('audio-pip:update', {
      state: {
        trackName: 'Song',
        artist: 'Artist',
        coverData: 'onda://media/1',
        coverType: 'video',
        isPlaying: true,
        currentTime: 30,
        duration: 120,
        volume: 0.5,
        isMuted: true,
        shuffle: true,
        repeat: 'all',
        equalizerPreset: 'rock',
        nextTrackName: 'Next',
        nextTrackArtist: 'Someone'
      }
    });
    await wrapper!.vm.$nextTick();
    const s = vm();

    expect(s.trackName).toBe('Song');
    expect(s.artist).toBe('Artist');
    expect(s.isPlaying).toBe(true);
    expect(s.progressPct).toBe(25);
    expect(s.volPct).toBe('50%');
    expect(s.volLabel).toBe('MUT');
    expect(s.isVideoCover).toBe(true);
    expect(s.videoCoverSrc).toBe('onda://media/1');
    expect(s.shuffle).toBe(true);
    expect(s.repeat).toBe('all');
    expect(s.eqPreset).toBe('rock');
    expect(s.nextTrackName).toBe('Next');
    expect(s.nextTrackArtist).toBe('Someone');
  });

  it('falls back for missing state fields and clamps progress', async () => {
    mountAudio();
    emit('audio-pip:update', {
      state: {
        trackName: '',
        artist: '',
        coverData: 'data:image/png;base64,x',
        isPlaying: 0,
        currentTime: 500,
        duration: 100,
        repeat: undefined,
        isMuted: 0,
        shuffle: 0
      }
    });
    await wrapper!.vm.$nextTick();
    const s = vm();

    expect(s.trackName).toBe('—');
    expect(s.coverType).toBe('image');
    expect(s.isVideoCover).toBe(false);
    expect(s.progressPct).toBe(100);
    expect(s.repeat).toBe('none');
    expect(s.isMuted).toBe(false);
    expect(s.shuffle).toBe(false);
  });

  it('derives the bar layout from the dock unless a layout kind is given', async () => {
    mountAudio();
    emit('audio-pip:update', { dock: 'left' });
    await wrapper!.vm.$nextTick();
    expect(vm().layoutKind).toBe('bar-v');
    expect(vm().isVertical).toBe(true);
    expect(vm().isBar).toBe(true);

    emit('audio-pip:update', { dock: 'top' });
    await wrapper!.vm.$nextTick();
    expect(vm().layoutKind).toBe('bar-h');

    emit('audio-pip:update', { dock: 'floating' });
    await wrapper!.vm.$nextTick();
    expect(vm().layoutKind).toBe('card');

    emit('audio-pip:update', { dock: 'right', layoutKind: 'stack' });
    await wrapper!.vm.$nextTick();
    expect(vm().layoutKind).toBe('stack');
  });

  it('updates elements, edge, peek, preview and css variables', async () => {
    mountAudio();
    const setProperty = vi.spyOn(document.documentElement.style, 'setProperty');

    emit('audio-pip:update', {
      elements: ['cover', 'viz'],
      edge: 'left',
      peeked: true,
      isPreview: true,
      cssVars: { '--accent': '#fff', '--alpha': '0.5' }
    });
    await wrapper!.vm.$nextTick();

    expect(vm().elements).toEqual(['cover', 'viz']);
    expect(vm().edge).toBe('left');
    expect(vm().peeked).toBe(true);
    expect(vm().isPreview).toBe(true);
    expect(setProperty).toHaveBeenCalledWith('--accent', '#fff');
    expect(setProperty).toHaveBeenCalledWith('--alpha', '0.5');

    emit('audio-pip:update', { edge: null, peeked: false, isPreview: false });
    await wrapper!.vm.$nextTick();
    expect(vm().edge).toBeNull();
    expect(vm().peeked).toBe(false);
    expect(vm().isPreview).toBe(false);
  });

  it('ignores empty updates and accepts only viz data when enabled', async () => {
    mountAudio();
    emit('audio-pip:update', undefined);
    emit('audio-pip:vizData', [1, 2, 3]);
    await wrapper!.vm.$nextTick();
    expect(vm().vizData).toEqual([]);

    emit('audio-pip:update', { elements: ['cover', 'viz'] });
    emit('audio-pip:vizData', []);
    emit('audio-pip:vizData', [4, 5, 6]);
    await wrapper!.vm.$nextTick();
    expect(vm().vizData).toEqual([4, 5, 6]);
  });

  it('applies theme variables and refreshes the accent', () => {
    mountAudio();
    emit('audio-pip:theme', { '--color-primary': 'red' });
    expect(state.updateAccent).toHaveBeenCalledTimes(1);
  });

  it('sends commands to the main window', () => {
    mountAudio();
    vm().showMain();
    vm().send('play');
    expect(state.send).toHaveBeenCalledWith('audio-pip:showMain');
    expect(state.send).toHaveBeenCalledWith('audio-pip:action', 'play');
  });

  it('maps progress clicks horizontally and vertically', () => {
    mountAudio();
    const bar = {
      getBoundingClientRect: () => ({ left: 100, top: 50, width: 200, height: 100 })
    } as unknown as HTMLElement;
    vm().onProgressClick({ currentTarget: bar, clientX: 200, clientY: 100 });
    expect(state.send).toHaveBeenLastCalledWith('audio-pip:progressClick', 0.5);

    vm().onProgressClick({ currentTarget: bar, clientX: 0, clientY: 0 });
    expect(state.send).toHaveBeenLastCalledWith('audio-pip:progressClick', 0);

    emit('audio-pip:update', { dock: 'left' });
    vm().onProgressClick({ currentTarget: bar, clientX: 200, clientY: 100 });
    expect(state.send).toHaveBeenLastCalledWith('audio-pip:progressClick', 0.5);

    vm().onProgressClick({ currentTarget: bar, clientX: 200, clientY: 0 });
    expect(state.send).toHaveBeenLastCalledWith('audio-pip:progressClick', 1);
  });

  it('seeks with the keyboard and ignores it without duration', () => {
    mountAudio();
    const event = (key: string) => {
      const e = { key, preventDefault: vi.fn() } as unknown as KeyboardEvent;
      vm().onProgressKeydown(e);
      return e;
    };

    event('ArrowRight');
    expect(state.send).not.toHaveBeenCalled();
    expect(event('Home').preventDefault).toHaveBeenCalled();

    emit('audio-pip:update', {
      state: {
        trackName: 'T',
        artist: '',
        coverData: null,
        isPlaying: true,
        currentTime: 10,
        duration: 100,
        volume: 1
      }
    });
    event('ArrowRight');
    expect(state.send).toHaveBeenLastCalledWith('audio-pip:progressClick', 0.15);
    event('ArrowDown');
    expect(state.send).toHaveBeenLastCalledWith('audio-pip:progressClick', 0.05);
    event('Home');
    expect(state.send).toHaveBeenLastCalledWith('audio-pip:progressClick', 0);
    event('End');
    expect(state.send).toHaveBeenLastCalledWith('audio-pip:progressClick', 1);
  });

  it('sends formatted volume and equalizer changes', () => {
    mountAudio();
    vm().onVolumeInput({ target: { value: '0.5' } });
    expect(state.send).toHaveBeenLastCalledWith('audio-pip:action', 'volume:0.50');

    vm().selectEqPreset('jazz');
    expect(vm().eqPreset).toBe('jazz');
    expect(state.send).toHaveBeenLastCalledWith('audio-pip:action', 'eqPreset:jazz');
  });

  it('manages hover reveal and peek timers', () => {
    mountAudio();

    window.dispatchEvent(new Event('mouseover'));
    vi.advanceTimersByTime(100);
    window.dispatchEvent(new Event('mouseover'));
    vi.advanceTimersByTime(249);
    expect(state.send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(state.send).toHaveBeenCalledWith('audio-pip:unpeek');

    state.send.mockClear();
    window.dispatchEvent(new MouseEvent('mouseout'));
    expect(state.send).toHaveBeenCalledWith('audio-pip:peekDelay');

    state.send.mockClear();
    window.dispatchEvent(new MouseEvent('mouseout', { relatedTarget: document.body }));
    expect(state.send).not.toHaveBeenCalled();
  });

  it('cleans listeners and timers on unmount', () => {
    mountAudio();
    window.dispatchEvent(new Event('mouseover'));
    wrapper!.unmount();
    wrapper = null;

    expect(state.cleanups['audio-pip:update']).toHaveBeenCalled();
    expect(state.cleanups['audio-pip:vizData']).toHaveBeenCalled();
    expect(state.cleanups['audio-pip:theme']).toHaveBeenCalled();

    state.send.mockClear();
    vi.advanceTimersByTime(500);
    window.dispatchEvent(new Event('mouseover'));
    expect(state.send).not.toHaveBeenCalled();
  });

  it('works without an api bridge', () => {
    delete (window as { api?: unknown }).api;
    mountAudio();
    expect(() => vm().showMain()).not.toThrow();
    expect(() => vm().send('x')).not.toThrow();
    expect(state.on).not.toHaveBeenCalled();
  });
});

describe('usePipVisualizer', () => {
  it('starts a draw loop on mount and renders bars', async () => {
    mountViz();
    parent();
    const canvasEl = canvas();

    vm().data = [0, 255, 128, 64, 32, 200, 100, 50];
    flushFrame();
    await wrapper!.vm.$nextTick();

    expect(canvasEl.width).toBe(480);
    expect(canvasEl.height).toBe(120);
    expect(state.ctx.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
    expect(state.ctx.clearRect).toHaveBeenCalledWith(0, 0, 480, 120);
    expect(state.ctx.fillRect).toHaveBeenCalled();
    expect(state.ctx.translate).not.toHaveBeenCalled();
    expect(state.ctx.rotate).not.toHaveBeenCalled();
    expect(state.raf).not.toBeNull();
  });

  it('draws rotated bars in the vertical layout', async () => {
    mountViz();
    parent();
    vm().vertical = true;
    vm().data = [0, 255, 128, 64];

    flushFrame();
    await wrapper!.vm.$nextTick();

    expect(state.ctx.translate).toHaveBeenCalledWith(480, 0);
    expect(state.ctx.rotate).toHaveBeenCalledWith(Math.PI / 2);
  });

  it('uses the accent color from the document', () => {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: () => ' #123456 '
    } as unknown as CSSStyleDeclaration);
    mountViz();
    parent();
    vm().data = [0, 255, 128, 64];
    vm().updateAccent();

    flushFrame();
    expect(state.ctx.fillStyle).toBe('#123456');
  });

  it('falls back to the default accent when none is defined', () => {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: () => ''
    } as unknown as CSSStyleDeclaration);
    mountViz();
    parent();
    vm().data = [0, 255, 128, 64];
    vm().updateAccent();

    flushFrame();
    expect(state.ctx.fillStyle).toBe('#605dff');
  });

  it('retries later when the data is too short, without stacking timers', () => {
    mountViz();
    parent();
    vm().data = [1, 2];

    flushFrame();
    flushFrame();
    expect(state.ctx.fillRect).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
  });

  it('reschedules when the canvas is disconnected or has no context', () => {
    mountViz();
    parent();
    vm().data = [0, 255, 128, 64];
    const canvasEl = canvas();
    canvasEl.remove();

    flushFrame();
    expect(vi.getTimerCount()).toBe(1);

    wrapper!.unmount();
    wrapper = null;

    state.ctx = null;
    mountViz();
    parent();
    vm().data = [0, 255, 128, 64];
    flushFrame();
    expect(vi.getTimerCount()).toBe(1);
  });

  it('pauses while the document is hidden and resumes when visible', () => {
    mountViz();
    parent();
    vm().data = [0, 255, 128, 64];
    const rafCalls = state.rafId;

    state.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(state.cancelRaf).toHaveBeenCalled();

    state.hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(state.rafId).toBeGreaterThan(rafCalls);
  });

  it('clears the idle timer when hidden', () => {
    mountViz();
    parent();
    vm().data = [1, 2];
    flushFrame();
    expect(vi.getTimerCount()).toBe(1);

    state.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops listening after unmount', () => {
    mountViz();
    parent();
    wrapper!.unmount();
    wrapper = null;
    expect(state.cancelRaf).toHaveBeenCalled();

    const before = state.rafId;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(state.rafId).toBe(before);
  });
});
