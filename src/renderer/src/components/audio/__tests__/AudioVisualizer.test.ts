import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick, reactive, ref } from 'vue';
import AudioVisualizer from '../AudioVisualizer.vue';

// Wizualizator: canvas, RAF i funkcje rysujące są podstawione.
const state = vi.hoisted(() => ({
  isPlaying: null as any,
  setVizActive: vi.fn(),
  getAnalyserNode: vi.fn(),
  settings: null as any,
  player: null as any,
  vizCfg: {
    fpsCap: 60,
    smoothing: 0.8,
    primaryColor: '#fff',
    secondaryColor: '#000',
    sensitivity: 1
  },
  quality: null as any,
  rafCallbacks: new Map<number, FrameRequestCallback>(),
  rafId: 0,
  cancelRaf: vi.fn(),
  ctx: null as any,
  drawBars: vi.fn(),
  drawSpectrum: vi.fn(),
  drawWave: vi.fn(),
  drawRadial: vi.fn(),
  drawCircle: vi.fn(),
  drawRings: vi.fn(),
  drawSplash: vi.fn(),
  resetGradients: vi.fn(),
  getFreqData: vi.fn(() => new Uint8Array([10, 20, 30, 40])),
  smoothData: vi.fn((data: Uint8Array) => data),
  isCoreShell: false
}));

vi.mock('@renderer/composables/useAudioPlayer', () => ({
  useAudioPlayer: () => ({
    isPlaying: state.isPlaying,
    setVizActive: state.setVizActive,
    getAnalyserNode: state.getAnalyserNode
  })
}));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/utils/audioVisualizer', () => ({
  VIZ_CYCLES: ['bars', 'spectrum', 'wave', 'radial', 'circle', 'rings', 'particles', 'splash']
}));
vi.mock('@renderer/utils/visualizerDraw', () => ({
  drawBars: state.drawBars,
  drawSpectrum: state.drawSpectrum,
  drawWave: state.drawWave,
  drawRadial: state.drawRadial,
  drawCircle: state.drawCircle,
  drawRings: state.drawRings,
  drawSplash: state.drawSplash
}));
vi.mock('@renderer/utils/visualizerGradients', () => ({ resetGradients: state.resetGradients }));
vi.mock('@renderer/utils/visualizerBuffers', () => ({
  getFreqData: state.getFreqData,
  smoothData: state.smoothData
}));
vi.mock('@renderer/composables/useVizConfig', () => ({
  useVizConfig: () => ({ vizCfg: state.vizCfg, quality: state.quality })
}));
vi.mock('@renderer/utils/runtimeMode', () => ({ isCoreShell: () => state.isCoreShell }));

let wrapper: VueWrapper | null = null;
let canvas: HTMLCanvasElement;

function runFrame(timestamp: number): void {
  const callbacks = [...state.rafCallbacks.values()];
  state.rafCallbacks.clear();
  for (const callback of callbacks) callback(timestamp);
}

function mountViz(mode = 'bars') {
  state.settings.playback.visualization.mode = mode;
  wrapper = mount(AudioVisualizer, {
    attachTo: document.body,
    global: {
      directives: { activate: {} },
      mocks: { $t: (key: string) => key }
    }
  });
  canvas = wrapper.find('canvas').element as HTMLCanvasElement;
  Object.defineProperty(canvas, 'clientWidth', { value: 300, configurable: true });
  Object.defineProperty(canvas, 'clientHeight', { value: 150, configurable: true });
  return wrapper;
}

beforeEach(() => {
  state.isPlaying = ref(false);
  state.setVizActive.mockClear();
  state.getAnalyserNode.mockReset();
  state.getAnalyserNode.mockReturnValue({
    frequencyBinCount: 4,
    smoothingTimeConstant: 0.8
  });
  state.settings = reactive({
    playback: { visualization: { mode: 'bars' as string, smoothing: 0.8 } },
    updatePlayback: vi.fn()
  });
  state.player = reactive({ currentTrack: null });
  state.quality = ref({ dprCap: 2, particleCount: 5 });
  state.vizCfg.fpsCap = 60;
  state.vizCfg.smoothing = 0.8;
  state.vizCfg.sensitivity = 1;
  state.isCoreShell = false;
  state.rafCallbacks.clear();
  state.rafId = 0;
  state.cancelRaf.mockReset();
  state.cancelRaf.mockImplementation((id: number) => state.rafCallbacks.delete(id));
  state.ctx = {
    clearRect: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    globalAlpha: 1,
    fillStyle: ''
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(state.ctx as never);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      const id = ++state.rafId;
      state.rafCallbacks.set(id, callback);
      return id;
    })
  );
  vi.stubGlobal('cancelAnimationFrame', state.cancelRaf);
  Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
  state.drawBars.mockClear();
  state.drawSpectrum.mockClear();
  state.drawWave.mockClear();
  state.drawRadial.mockClear();
  state.drawCircle.mockClear();
  state.drawRings.mockClear();
  state.drawSplash.mockClear();
  state.resetGradients.mockClear();
  state.getFreqData.mockClear();
  state.smoothData.mockClear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('lifecycle', () => {
  it('marks the visualizer active and starts the loop when playing', async () => {
    state.isPlaying.value = true;
    mountViz();
    await nextTick();

    expect(state.setVizActive).toHaveBeenCalledWith(true);
    expect(state.rafCallbacks.size).toBe(1);
  });

  it('does not start without playback', () => {
    mountViz();
    expect(state.rafCallbacks.size).toBe(0);
  });

  it('stops and cleans up on unmount', () => {
    state.isPlaying.value = true;
    mountViz();
    wrapper!.unmount();
    wrapper = null;

    expect(state.setVizActive).toHaveBeenLastCalledWith(false);
    expect(state.cancelRaf).toHaveBeenCalled();
  });
});

describe('draw loop', () => {
  it('sizes the canvas with capped DPR and resets gradients only on change', () => {
    state.isPlaying.value = true;
    mountViz();

    runFrame(100);
    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(300);
    expect(state.ctx.scale).toHaveBeenCalledWith(2, 2);
    expect(state.resetGradients).toHaveBeenCalledTimes(1);

    runFrame(200);
    expect(state.resetGradients).toHaveBeenCalledTimes(1);

    Object.defineProperty(canvas, 'clientWidth', { value: 200, configurable: true });
    runFrame(300);
    expect(canvas.width).toBe(400);
    expect(state.resetGradients).toHaveBeenCalledTimes(2);
  });

  it('respects the configured FPS cap', () => {
    state.isPlaying.value = true;
    mountViz();

    runFrame(100);
    state.drawBars.mockClear();
    runFrame(110); // mniej niż 1000/60 ms
    expect(state.drawBars).not.toHaveBeenCalled();
    runFrame(120);
    expect(state.drawBars).toHaveBeenCalled();
  });

  it('dispatches each visualization style to its renderer', async () => {
    state.isPlaying.value = true;
    mountViz();

    const styles: Array<[string, ReturnType<typeof vi.fn>]> = [
      ['bars', state.drawBars],
      ['spectrum', state.drawSpectrum],
      ['wave', state.drawWave],
      ['radial', state.drawRadial],
      ['circle', state.drawCircle],
      ['rings', state.drawRings],
      ['splash', state.drawSplash]
    ];
    let timestamp = 100;
    for (const [mode, spy] of styles) {
      state.settings.playback.visualization.mode = mode;
      await nextTick();
      runFrame(timestamp);
      timestamp += 100;
      expect(spy).toHaveBeenCalled();
    }
  });

  it('crossfades when the style changes', () => {
    state.isPlaying.value = true;
    const wrapperRef = mountViz();
    let alpha = 1;
    state.drawSpectrum.mockImplementation(() => {
      alpha = state.ctx.globalAlpha;
    });

    runFrame(100);
    (wrapperRef.vm as unknown as { cycleStyle: () => void }).cycleStyle();
    runFrame(200);

    expect(alpha).toBeCloseTo(0.92);
    expect(state.drawSpectrum).toHaveBeenCalled();
    expect(state.ctx.globalAlpha).toBe(1);
  });

  it('draws particles and recycles them by count', () => {
    state.isPlaying.value = true;
    const wrapperRef = mountViz('particles');
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    runFrame(100);
    expect(state.ctx.arc).toHaveBeenCalledTimes(5);

    state.quality.value = { dprCap: 2, particleCount: 3 };
    runFrame(200);
    // Liczba cząstek przycięta do nowego limitu (3 nowe + wcześniejsze w tej klatce).
    expect(state.ctx.arc.mock.calls.length).toBeGreaterThanOrEqual(8);
    void wrapperRef;
  });

  it('stops and clears once for the none style', async () => {
    state.isPlaying.value = true;
    mountViz();

    state.settings.playback.visualization.mode = 'none';
    await nextTick();
    runFrame(100);
    expect(state.ctx.clearRect).toHaveBeenCalled();
    expect(state.rafCallbacks.size).toBe(0);
  });

  it('keeps retrying while the analyser is missing outside Core shell', () => {
    state.isPlaying.value = true;
    state.getAnalyserNode.mockReturnValue(null);
    mountViz();

    runFrame(100);
    expect(state.rafCallbacks.size).toBe(1);
  });

  it('stops the loop in Core shell without an analyser', () => {
    state.isPlaying.value = true;
    state.isCoreShell = true;
    state.getAnalyserNode.mockReturnValue(null);
    mountViz();

    runFrame(100);
    expect(state.rafCallbacks.size).toBe(0);
  });

  it('returns early when the canvas is gone', () => {
    state.isPlaying.value = true;
    mountViz();
    const callbacks = [...state.rafCallbacks.values()];
    state.rafCallbacks.clear();
    wrapper!.unmount();
    wrapper = null;

    expect(() => callbacks.forEach((callback) => callback(100))).not.toThrow();
  });

  it('falls back to 60 fps when the cap is zero', () => {
    state.isPlaying.value = true;
    state.vizCfg.fpsCap = 0;
    mountViz();

    runFrame(100);
    state.drawBars.mockClear();
    runFrame(110);
    expect(state.drawBars).not.toHaveBeenCalled();
    runFrame(120);
    expect(state.drawBars).toHaveBeenCalled();
  });

  it('resets the crossfade alpha after it fades out', () => {
    state.isPlaying.value = true;
    const wrapperRef = mountViz('bars');
    const alphas: number[] = [];
    state.drawSpectrum.mockImplementation(() => {
      alphas.push(state.ctx.globalAlpha);
    });

    runFrame(100);
    (wrapperRef.vm as unknown as { cycleStyle: () => void }).cycleStyle();
    for (let i = 1; i <= 13; i += 1) runFrame(100 + i * 100);

    expect(alphas.at(-1)).toBe(1);
    expect(state.drawSpectrum).toHaveBeenCalled();
  });

  it('grows the particle set when the quality target rises', () => {
    state.isPlaying.value = true;
    state.quality.value = { dprCap: 2, particleCount: 2 };
    mountViz('particles');
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    runFrame(100);
    expect(state.ctx.arc).toHaveBeenCalledTimes(2);

    state.quality.value = { dprCap: 2, particleCount: 5 };
    runFrame(200);
    expect(state.ctx.arc).toHaveBeenCalledTimes(7);
  });

  it('wraps particles around the canvas edges', () => {
    state.isPlaying.value = true;
    state.quality.value = { dprCap: 2, particleCount: 2 };
    mountViz('particles');
    vi.spyOn(Math, 'random').mockReturnValue(1);

    for (let i = 1; i <= 400; i += 1) runFrame(i * 100);

    expect(state.ctx.arc).toHaveBeenCalled();
    expect(state.ctx.clearRect).toHaveBeenCalled();

    vi.mocked(Math.random).mockReturnValue(0);
    for (let i = 401; i <= 900; i += 1) runFrame(i * 100);

    expect(state.ctx.arc).toHaveBeenCalled();
  });

  it('wraps particles back from the top and left edges', () => {
    state.isPlaying.value = true;
    state.quality.value = { dprCap: 2, particleCount: 2 };
    mountViz('particles');
    vi.spyOn(Math, 'random').mockReturnValue(0);

    for (let i = 1; i <= 400; i += 1) runFrame(i * 100);

    expect(state.ctx.arc).toHaveBeenCalled();
  });

  it('skips rendering for an unknown style', async () => {
    state.isPlaying.value = true;
    mountViz('bars');
    state.settings.playback.visualization.mode = 'bogus';
    await nextTick();

    runFrame(100);
    expect(state.drawBars).not.toHaveBeenCalled();
    expect(state.ctx.clearRect).toHaveBeenCalled();
  });
});

describe('styles and controls', () => {
  it('cycles styles and persists the mode', () => {
    const wrapperRef = mountViz('bars');

    (wrapperRef.vm as unknown as { cycleStyle: () => void }).cycleStyle();

    expect(state.settings.updatePlayback).toHaveBeenCalledWith({
      visualization: { mode: 'spectrum', smoothing: 0.8 }
    });
  });

  it('follows the settings mode watcher', async () => {
    mountViz('bars');
    state.settings.playback.visualization.mode = 'wave';
    await nextTick();
    const exposed = wrapper!.vm as unknown as { style: string };
    expect(exposed.style).toBe('wave');
  });

  it('applies smoothing immediately and on change', async () => {
    const wrapperRef = mountViz();
    const analyser = state.getAnalyserNode.mock.results[0].value;
    expect(analyser.smoothingTimeConstant).toBe(0.8);

    state.settings.playback.visualization.smoothing = 0.5;
    await nextTick();
    expect(analyser.smoothingTimeConstant).toBe(0.5);
    void wrapperRef;
  });

  it('starts and stops the loop with playback state', async () => {
    mountViz();
    state.isPlaying.value = true;
    await nextTick();
    expect(state.rafCallbacks.size).toBe(1);

    state.isPlaying.value = false;
    await nextTick();
    expect(state.cancelRaf).toHaveBeenCalled();
  });

  it('pauses on hidden document and resumes when visible', async () => {
    state.isPlaying.value = true;
    mountViz();
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(state.cancelRaf).toHaveBeenCalled();

    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(state.rafCallbacks.size).toBe(1);
  });

  it('does not repaint an empty frame twice in none mode', async () => {
    state.isPlaying.value = true;
    mountViz();
    const callback = [...state.rafCallbacks.values()][0];
    state.rafCallbacks.clear();

    state.settings.playback.visualization.mode = 'none';
    await nextTick();
    callback(100);
    state.ctx.clearRect.mockClear();
    callback(200);

    expect(state.ctx.clearRect).not.toHaveBeenCalled();
  });

  it('ignores a settings mode that already matches the current style', async () => {
    mountViz('bars');
    (wrapper!.vm as { style?: string }).style = 'wave';
    await nextTick();

    state.settings.playback.visualization.mode = 'wave';
    await nextTick();
    expect((wrapper!.vm as unknown as { style: string }).style).toBe('wave');
  });

  it('starts drawing when the style leaves none while playing', async () => {
    state.isPlaying.value = true;
    mountViz('none');
    expect(state.rafCallbacks.size).toBe(0);

    state.settings.playback.visualization.mode = 'wave';
    await nextTick();
    expect(state.rafCallbacks.size).toBe(1);
  });

  it('ignores visibility changes without a frame or playback', () => {
    mountViz();
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(state.cancelRaf).not.toHaveBeenCalled();

    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(state.rafCallbacks.size).toBe(0);
  });

  it('stops playback without a frame to cancel', async () => {
    state.isPlaying.value = true;
    mountViz();
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    state.isPlaying.value = false;
    await nextTick();
    expect(state.cancelRaf).toHaveBeenCalledTimes(1);
  });

  it('updates smoothing only when an analyser exists', async () => {
    state.getAnalyserNode.mockReturnValue(null);
    mountViz();

    state.settings.playback.visualization.smoothing = 0.4;
    await nextTick();
    expect(state.setVizActive).toHaveBeenCalledWith(true);
  });

  it('uses the default smoothing when settings omit it', () => {
    state.settings.playback.visualization.smoothing = undefined;
    const analyser = { frequencyBinCount: 4, smoothingTimeConstant: 0.2 };
    state.getAnalyserNode.mockReturnValue(analyser);
    mountViz();

    expect(analyser.smoothingTimeConstant).toBe(0.8);
  });

  it('shows the no-track overlay and hides it while playing', async () => {
    mountViz();
    expect(document.body.textContent).toContain('audioView.noTrackTitle');

    state.isPlaying.value = true;
    await nextTick();
    expect(document.body.textContent).not.toContain('audioView.noTrackTitle');
  });
});
