import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import WaveformLayer from '../WaveformLayer.vue';

const state = vi.hoisted(() => ({
  invoke: vi.fn(),
  downsample: vi.fn((peaks: number[]) => peaks),
  waveformColor: vi.fn(() => '#neutral'),
  playedColor: vi.fn(() => '#played'),
  getCached: vi.fn(),
  hasCached: vi.fn(),
  setCached: vi.fn(),
  ctx: null as any,
  rafCb: null as FrameRequestCallback | null,
  rafId: 0,
  cancelRaf: vi.fn(),
  ro: null as any
}));

vi.mock('@renderer/utils/waveform', () => ({
  downsamplePeaks: state.downsample,
  waveformColor: state.waveformColor,
  waveformPlayedColor: state.playedColor
}));
vi.mock('@renderer/utils/peaksCache', () => ({
  getCachedPeaks: state.getCached,
  hasCachedPeaks: state.hasCached,
  setCachedPeaks: state.setCached
}));

let wrapper: VueWrapper | null = null;

function context() {
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    globalAlpha: 1
  };
}

class FakeResizeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  constructor(cb: ResizeObserverCallback) {
    state.ro = this;
    (state as any).roCb = cb;
  }
}

function mountLayer(props: Record<string, unknown> = {}) {
  wrapper = mount(WaveformLayer, {
    props: { path: null, duration: 0, progress: 0, ...props } as never,
    attachTo: document.body
  });
  return wrapper;
}

function canvas(): HTMLCanvasElement {
  return wrapper!.get('[data-testid="audio-waveform"]').element as HTMLCanvasElement;
}

function sizeCanvas(width = 100, height = 50): void {
  const el = canvas();
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: height });
}

function flushFrame(): void {
  const cb = state.rafCb;
  state.rafCb = null;
  cb?.(0);
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  await nextTick();
}

beforeEach(() => {
  vi.useFakeTimers();
  state.invoke.mockReset();
  state.invoke.mockResolvedValue([]);
  state.downsample.mockReset();
  state.downsample.mockImplementation((peaks: number[]) => peaks);
  state.waveformColor.mockReset();
  state.waveformColor.mockReturnValue('#neutral');
  state.playedColor.mockReset();
  state.playedColor.mockReturnValue('#played');
  state.getCached.mockReset();
  state.getCached.mockReturnValue([0.5, 1]);
  state.hasCached.mockReset();
  state.hasCached.mockReturnValue(false);
  state.setCached.mockReset();
  state.ctx = context();
  state.rafCb = null;
  state.rafId = 0;
  state.cancelRaf.mockReset();
  state.ro = null;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => state.ctx as unknown as CanvasRenderingContext2D
  );
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    state.rafCb = cb;
    return ++state.rafId;
  });
  vi.stubGlobal('cancelAnimationFrame', state.cancelRaf);
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
  (window as { api?: unknown }).api = { invoke: state.invoke };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
});

describe('empty waveforms', () => {
  it('draws nothing without a path', async () => {
    mountLayer();
    await flush();
    sizeCanvas();
    flushFrame();

    expect(state.invoke).not.toHaveBeenCalled();
    expect(state.ctx.clearRect).toHaveBeenCalledWith(0, 0, 100, 50);
    expect(state.ctx.fillRect).not.toHaveBeenCalled();
  });

  it('ignores radio streams', async () => {
    mountLayer({ path: 'radio:station' });
    await flush();
    expect(state.invoke).not.toHaveBeenCalled();
  });

  it('does nothing for a missing canvas or context', async () => {
    state.ctx = null;
    mountLayer({ path: null });
    await flush();
    sizeCanvas();
    expect(() => flushFrame()).not.toThrow();

    wrapper!.unmount();
    wrapper = null;
    state.ctx = context();
    mountLayer({ path: null });
    await flush();
    sizeCanvas(0, 0);
    flushFrame();
    expect(state.ctx.clearRect).not.toHaveBeenCalled();
  });
});

describe('cache and loading', () => {
  it('draws cached peaks without calling the bridge', async () => {
    state.hasCached.mockReturnValue(true);
    mountLayer({ path: 'C:/audio/a.mp3', duration: 60 });
    await flush();
    sizeCanvas();
    flushFrame();

    expect(state.invoke).not.toHaveBeenCalled();
    expect(state.downsample).toHaveBeenCalledWith([0.5, 1], 100);
    expect(state.ctx.fillRect).toHaveBeenCalledTimes(2);
    expect(state.ctx.fillStyle).toBe('#neutral');
    expect(state.ctx.globalAlpha).toBe(1);
  });

  it('loads, caches and draws decoded peaks', async () => {
    state.invoke.mockResolvedValueOnce([0.25, 0.75, 1]);
    mountLayer({ path: 'C:/audio/a.mp3', duration: 60 });
    await flush();
    sizeCanvas();
    flushFrame();

    expect(state.invoke).toHaveBeenCalledWith('media:getWaveform', 'C:/audio/a.mp3', 60);
    expect(state.setCached).toHaveBeenCalledWith('C:/audio/a.mp3', [0.25, 0.75, 1]);
    expect(state.ctx.fillRect).toHaveBeenCalledTimes(3);
  });

  it('treats empty and failed decodes as empty waveforms', async () => {
    mountLayer({ path: 'C:/a.mp3', duration: 1 });
    await flush();
    expect(state.setCached).toHaveBeenCalledWith('C:/a.mp3', null);

    wrapper!.unmount();
    state.invoke.mockRejectedValueOnce(new Error('ffmpeg'));
    state.ctx = context();
    mountLayer({ path: 'C:/b.mp3', duration: 1 });
    await flush();
    sizeCanvas();
    flushFrame();
    expect(state.ctx.fillRect).not.toHaveBeenCalled();
  });

  it('deduplicates in-flight requests for the same path', async () => {
    let resolve!: (value: number[]) => void;
    state.invoke.mockReturnValueOnce(new Promise((res) => (resolve = res)));
    mountLayer({ path: 'C:/a.mp3', duration: 1 });
    await flush();

    await wrapper!.setProps({ duration: 2 });
    await flush();
    resolve([0.5]);
    await flush();

    expect(state.invoke).toHaveBeenCalledTimes(1);
  });

  it('ignores results for a path that changed during decoding', async () => {
    let resolve!: (value: number[]) => void;
    state.invoke
      .mockReturnValueOnce(new Promise((res) => (resolve = res)))
      .mockResolvedValueOnce([0.9]);
    mountLayer({ path: 'C:/a.mp3', duration: 1 });
    await flush();

    await wrapper!.setProps({ path: 'C:/b.mp3', duration: 2 });
    await flush();
    resolve([0.1]);
    await flush();
    sizeCanvas();
    flushFrame();

    expect(state.setCached).toHaveBeenCalledWith('C:/a.mp3', [0.1]);
    expect(state.setCached).toHaveBeenCalledWith('C:/b.mp3', [0.9]);
    expect(state.ctx.fillRect).toHaveBeenCalledTimes(1);
  });

  it('retries after a completed load when the cache still misses', async () => {
    state.invoke.mockResolvedValue([0.5]);
    mountLayer({ path: 'C:/a.mp3', duration: 1 });
    await flush();
    await wrapper!.setProps({ duration: 2 });
    await flush();
    expect(state.invoke).toHaveBeenCalledTimes(2);
  });
});

describe('drawing', () => {
  it('scales for the device pixel ratio', async () => {
    state.hasCached.mockReturnValue(true);
    mountLayer({ path: 'C:/a.mp3' });
    await flush();
    sizeCanvas();
    flushFrame();

    const el = canvas();
    expect(el.width).toBe(200);
    expect(el.height).toBe(100);
    expect(state.ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(state.ctx.clearRect).toHaveBeenCalledWith(0, 0, 100, 50);
  });

  it('paints the played portion when progress is set', async () => {
    state.hasCached.mockReturnValue(true);
    mountLayer({ path: 'C:/a.mp3', progress: 0.5 });
    await flush();
    sizeCanvas();
    flushFrame();

    expect(state.ctx.save).toHaveBeenCalled();
    expect(state.ctx.rect).toHaveBeenCalledWith(0, 0, 50, 50);
    expect(state.ctx.clip).toHaveBeenCalled();
    expect(state.ctx.fillRect).toHaveBeenCalledTimes(4);
    expect(state.ctx.fillStyle).toBe('#played');
    expect(state.ctx.restore).toHaveBeenCalled();
  });

  it('clamps progress above one and skips the overlay at zero', async () => {
    state.hasCached.mockReturnValue(true);
    mountLayer({ path: 'C:/a.mp3', progress: 2 });
    await flush();
    sizeCanvas();
    flushFrame();
    expect(state.ctx.rect).toHaveBeenCalledWith(0, 0, 100, 50);

    state.ctx = context();
    await wrapper!.setProps({ progress: 0 });
    await flush();
    flushFrame();
    expect(state.ctx.rect).not.toHaveBeenCalled();
    expect(state.ctx.fillRect).toHaveBeenCalledTimes(2);
  });

  it('redraws on progress without reloading peaks', async () => {
    state.hasCached.mockReturnValue(true);
    mountLayer({ path: 'C:/a.mp3', progress: 0 });
    await flush();
    sizeCanvas();
    flushFrame();
    state.invoke.mockClear();
    state.ctx.fillRect.mockClear();

    await wrapper!.setProps({ progress: 0.25 });
    await flush();
    flushFrame();
    expect(state.invoke).not.toHaveBeenCalled();
    expect(state.ctx.fillRect).toHaveBeenCalled();
  });

  it('redraws on resize observer callbacks', async () => {
    state.hasCached.mockReturnValue(true);
    mountLayer({ path: 'C:/a.mp3' });
    await flush();
    sizeCanvas();
    flushFrame();
    state.ctx.fillRect.mockClear();

    (state as any).roCb();
    flushFrame();
    expect(state.ctx.fillRect).toHaveBeenCalled();
    expect(state.ro.observe).toHaveBeenCalled();
  });

  it('coalesces multiple redraw requests into one frame', async () => {
    state.hasCached.mockReturnValue(true);
    mountLayer({ path: 'C:/a.mp3', progress: 0 });
    await flush();
    sizeCanvas();
    const first = state.rafCb;

    await wrapper!.setProps({ progress: 0.1 });
    await flush();
    expect(state.rafCb).toBe(first);
  });
});

describe('cleanup', () => {
  it('disconnects the observer and cancels the pending frame', async () => {
    state.hasCached.mockReturnValue(true);
    mountLayer({ path: 'C:/a.mp3' });
    await flush();
    sizeCanvas();
    expect(state.rafCb).not.toBeNull();

    wrapper!.unmount();
    wrapper = null;
    expect(state.ro.disconnect).toHaveBeenCalled();
    expect(state.cancelRaf).toHaveBeenCalled();
  });
});
